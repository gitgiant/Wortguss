import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Module from 'manifold-3d';
import wasmBinary from 'manifold-3d/manifold.wasm';
import { TYPES, PRESETS, MATERIALS, BED, FACES, EXTRA_SHAPES, SCREWS, SCREW_SHAPES, PATTERNS, EXTRAS_HELP, MIRRORS, FINISH } from './catalog.js';
import { loadFont } from './text.js';
import { svgToLogo } from './svg.js';
import fontBytes from '@fontsource/inter/files/inter-latin-700-normal.woff';
import { normalizeSpec, normalizePart, normalizeExtra, specFromPreset, slugify } from './spec.js';
import { initGeometry, buildSpec, estimate, resolveTools } from './geometry.js';
import { build3mf, layout, stlFiles } from './threemf.js';
import { zipSync, strToU8, strFromU8, deflateSync, inflateSync } from 'fflate';

const $ = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c);
  return el;
};
const fmt = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toFixed(d);

// ------------------------------------------------------------------ state
let projects = []; // [{id, name, versions:[{spec, note, at}], updatedAt}]
let project = null;
let spec = null; // working spec (may be ahead of the last version)
let dirtyNote = null; // pending manual edit note, committed after a pause
let bodies = [];
let tab = 'parts';
let caps = { db: null, user: null, sample: null, dictation: null, downloads: null };
let uid = null;

const LS_KEY = 'wortguss.projects.v1';
const MAX_VERSIONS = 40;

// ---------------------------------------------------------------- storage
// Signed-in viewers keep projects in the artifact database (private per person,
// so the same part opens on phone and desktop). Otherwise browser storage.
const store = {
  async load() {
    if (caps.db && uid) {
      try {
        const snap = await caps.db.collection(`data/users/${uid}/projects`).get();
        return snap.docs.map((d) => d.data()).filter((p) => p && Array.isArray(p.versions));
      } catch (e) { console.warn('db load', e); }
    }
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
  },
  async save(p) {
    p.updatedAt = Date.now();
    if (caps.db && uid) {
      try { await caps.db.doc(`data/users/${uid}/projects/${p.id}`).set(JSON.parse(JSON.stringify(p))); return; }
      catch (e) { console.warn('db save', e); }
    }
    try { localStorage.setItem(LS_KEY, JSON.stringify(projects)); } catch {}
  },
};

function newProject(s, note) {
  const p = { id: `${slugify(s.name)}-${Date.now().toString(36)}`, name: s.name, versions: [{ spec: s, note, at: Date.now() }] };
  projects.unshift(p);
  return p;
}

function commit(note) {
  clearTimeout(commit.t);
  dirtyNote = null;
  const last = project.versions[project.versions.length - 1];
  if (JSON.stringify(last.spec) === JSON.stringify(spec)) return;
  project.versions.push({ spec: structuredClone(spec), note, at: Date.now() });
  if (project.versions.length > MAX_VERSIONS) project.versions.splice(0, project.versions.length - MAX_VERSIONS);
  project.name = spec.name;
  store.save(project);
  renderProjects();
  if (tab === 'versions') renderPanel();
}

// Manual edits are grouped into one version after a short pause.
function editLater(note) {
  dirtyNote = dirtyNote && dirtyNote !== note ? 'Edited parameters' : note;
  clearTimeout(commit.t);
  commit.t = setTimeout(() => commit(dirtyNote), 1500);
}

function setSpec(s, { note, now = false, rerender = true } = {}) {
  spec = normalizeSpec(s);
  rebuild();
  if (note) now ? commit(note) : editLater(note);
  if (rerender) renderPanel();
}

// ------------------------------------------------------------------ viewer
let renderer, scene, camera, controls, group;
function initViewer() {
  const host = $('viewer');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  host.prepend(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 4 / 3, 1, 5000);
  camera.up.set(0, 0, 1);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.addEventListener('change', draw);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667066, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(120, -200, 300);
  scene.add(sun);
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(BED.x, BED.y), new THREE.MeshBasicMaterial({ color: cssColor('--bed'), transparent: true, opacity: 0.9 }));
  bed.position.set(BED.x / 2, BED.y / 2, -0.05);
  scene.add(bed);
  const grid = new THREE.GridHelper(BED.x, BED.x / 16, cssColor('--line'), cssColor('--line'));
  grid.rotation.x = Math.PI / 2;
  grid.position.set(BED.x / 2, BED.y / 2, 0);
  scene.add(grid);
  scene.userData.bed = bed; scene.userData.grid = grid;
  group = new THREE.Group();
  scene.add(group);
  new ResizeObserver(resize).observe(host);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
  new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  resize();
}
function cssColor(name) { return new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'); }
function retheme() {
  scene.userData.bed.material.color = cssColor('--bed');
  scene.userData.grid.material.color = cssColor('--line');
  draw();
}
function resize() {
  const host = $('viewer');
  const w = host.clientWidth, hh = host.clientHeight;
  renderer.setSize(w, hh, false);
  camera.aspect = w / hh;
  camera.updateProjectionMatrix();
  draw();
}
function draw() { renderer && renderer.render(scene, camera); }

let framedFor = null;
function showBodies() {
  for (const c of [...group.children]) { c.geometry.dispose(); c.material.dispose(); group.remove(c); }
  const offs = layout(bodies);
  const box = new THREE.Box3();
  const addMesh = (mesh, slot, off) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    const flat = g.toNonIndexed();
    g.dispose();
    flat.computeVertexNormals();
    const m = new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ color: spec.colors[slot - 1], roughness: 0.62, metalness: 0.02 }));
    m.position.set(...off);
    group.add(m);
    box.expandByObject(m);
  };
  bodies.forEach((b, i) => {
    addMesh(b.mesh, b.slot, offs[i]);
    for (const l of b.labels || []) addMesh(l.mesh, l.slot, offs[i]);
  });
  // Reframe when the overall size changes noticeably, not on every tweak.
  const size = box.getSize(new THREE.Vector3());
  const key = [project?.id, Math.round(size.x / 15), Math.round(size.y / 15), Math.round(size.z / 15)].join();
  if (!box.isEmpty() && key !== framedFor) {
    framedFor = key;
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(30, size.length() / 2);
    const dist = r / Math.sin((camera.fov * Math.PI) / 360) * 0.95;
    camera.position.set(c.x - dist * 0.45, c.y - dist * 0.75, c.z + dist * 0.5);
    controls.target.copy(c);
    controls.update();
  }
  draw();
}

// ------------------------------------------------------------------- build
let buildTimer;
function rebuild() {
  clearTimeout(buildTimer);
  $('busy').hidden = false;
  buildTimer = setTimeout(() => {
    try { bodies = buildSpec(spec); }
    catch (e) { console.error(e); bodies = []; reply(`Could not build this shape: ${e.message || e}. Try other values.`, true); }
    $('busy').hidden = true;
    showBodies();
    renderStats();
  }, 60);
}

function renderStats() {
  const offs = layout(bodies);
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const tooBig = [];
  bodies.forEach((b, i) => {
    const s = b.bbox.max.map((v, k) => v - b.bbox.min[k]);
    if (s[0] > BED.x || s[1] > BED.y || s[2] > BED.z) tooBig.push(b.name);
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], b.bbox.min[k] + offs[i][k]); max[k] = Math.max(max[k], b.bbox.max[k] + offs[i][k]); }
  });
  const size = bodies.length ? max.map((v, k) => v - min[k]) : [0, 0, 0];
  const plateOver = size[0] > BED.x || size[1] > BED.y;
  const est = estimate(bodies, MATERIALS[spec.material].density);
  const stat = (label, val, warn) => h('div', { class: `stat${warn ? ' warn' : ''}` }, h('small', { text: label }), h('b', { text: val, title: val }));
  $('stats').replaceChildren(
    stat('Plate footprint', `${fmt(size[0], 0)}×${fmt(size[1], 0)}×${fmt(size[2], 0)}`),
    stat('Fits A1 bed', tooBig.length ? `No: ${tooBig.join(', ')}` : plateOver ? 'Split plates' : 'Yes', tooBig.length || plateOver),
    stat(`${spec.material} (est.)`, `~${fmt(est.grams, 0)} g`),
    stat('Print time (est.)', est.hours < 1 ? `~${Math.max(5, Math.round(est.hours * 60 / 5) * 5)} min` : `~${fmt(est.hours, 1)} h`),
  );
  renderHosted();
  $('vbadge').textContent = `A1 plate · ${bodies.length} bod${bodies.length === 1 ? 'y' : 'ies'}`;
}

// Two builds share this code (esbuild defines __TARGET__):
//  - 'artifact': the Claude page (ask Claude, dictation, synced history). claude.ai
//    refuses .3mf/.stl downloads, so it hands the part to the site in the link.
//  - 'pages': the GitHub Pages site, which saves .3mf/.stl files directly.
const TARGET = typeof __TARGET__ === 'string' ? __TARGET__ : 'artifact';
const SITE = 'https://gitgiant.github.io/Wortguss/';
const CLAUDE_PAGE = 'https://claude.ai/artifact/6hQVHc7pSVEbJwVpVt41Si';

const b64url = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64url = (t) => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
export const encodePart = () => b64url(deflateSync(strToU8(JSON.stringify({ id: project.id, spec })), { level: 9 }));
const decodePart = (t) => JSON.parse(strFromU8(inflateSync(unb64url(t))));

function downloadBlob(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function renderHosted() {
  const ex = $('exports');
  const base = slugify(spec.name);
  if (TARGET === 'pages') {
    const stls = Object.entries(stlFiles(bodies));
    ex.replaceChildren(
      h('button', { class: 'btn primary', type: 'button', id: 'dl3mf', text: 'Download 3MF', onclick: () => {
        downloadBlob(`${base}.3mf`, build3mf(spec, bodies), 'model/3mf');
        $('exportNote').textContent = `Saved ${base}.3mf. Open it in Bambu Studio.`;
      } }),
      ...stls.map(([fn, data], i) => h('button', { class: 'btn', type: 'button', id: `dlStl${i}`, text: stls.length === 1 ? 'Download STL' : `STL: ${bodies[i].name}`, onclick: () => {
        downloadBlob(fn, data, 'model/stl');
        $('exportNote').textContent = `Saved ${fn}. The AMS slot is in the file name.`;
      } })),
      h('button', { class: 'btn', type: 'button', id: 'dlZip', text: 'Download zip', onclick: save }),
    );
    if (!$('exportNote').textContent) $('exportNote').textContent = 'Each button saves one file. The zip holds them all plus the spec.';
  } else {
    ex.replaceChildren(
      h('a', { class: 'btn primary', id: 'openSite', href: `${SITE}#s=${encodePart()}`, target: '_blank', rel: 'noopener', text: 'Open on GitHub to download' }),
      h('button', { class: 'btn', type: 'button', id: 'dlZip', text: 'Download zip', onclick: save }),
    );
    if (!$('exportNote').textContent) $('exportNote').textContent = 'Opens this part on the Wortguss site, where Download 3MF and Download STL save the files directly.';
  }
}

// ------------------------------------------------------------------ panels
function renderProjects() {
  const sel = $('projectSel');
  sel.replaceChildren(...projects.map((p) => h('option', { value: p.id, selected: p === project, text: p.name })));
}

function renderPanel() {
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  const panel = $('panel');
  const fn = { parts: partsPanel, colour: colourPanel, tools: toolsPanel, versions: versionsPanel, spec: specPanel }[tab];
  panel.replaceChildren(...[].concat(fn()));
}

// The New / Rename panel sits right under the header so it is visible on a phone.
let topMode = null; // null | 'new' | 'rename'
function renderTop() {
  const host = $('topPanel');
  host.hidden = !topMode;
  if (!topMode) { host.replaceChildren(); return; }
  const close = () => { topMode = null; renderTop(); };
  const cancel = h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: close });
  if (topMode === 'new') {
    host.replaceChildren(h('div', { class: 'card' },
      h('h3', { text: 'Start a new part from' }),
      h('div', { class: 'presets' }, PRESETS.map((p) => h('button', {
        class: 'btn', type: 'button', text: p.name,
        onclick: () => {
          if (dirtyNote) commit(dirtyNote);
          const s = specFromPreset(p.key);
          project = newProject(s, `Started from ${p.name}`);
          store.save(project);
          close();
          tab = 'parts';
          openProject(project);
          reply(`Started “${p.name}”. Tap Rename to give it your own name.`);
        },
      }))),
      h('div', {}, cancel)));
  } else {
    const input = h('input', { type: 'text', id: 'renameInput', value: spec.name, maxlength: 80, 'aria-label': 'Part name', enterkeyhint: 'done' });
    const save = () => {
      const name = input.value.trim();
      if (name && name !== spec.name) { setSpec({ ...spec, name }, { note: `Renamed to ${name}`, now: true }); reply(`Renamed to “${name}”.`); }
      close();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') close(); });
    host.replaceChildren(h('div', { class: 'card' },
      h('h3', { text: 'Rename this part' }),
      h('div', { class: 'namerow' }, input, h('button', { class: 'btn primary', type: 'button', text: 'Save', onclick: save }), cancel)));
    input.focus();
    input.select();
  }
  host.scrollIntoView({ block: 'nearest' });
}

function slotPicker(current, onPick, label) {
  return h('div', { class: 'slots', role: 'group', 'aria-label': label }, [1, 2, 3, 4].map((s) => h('button', {
    class: 'slot', type: 'button', style: `background:${spec.colors[s - 1]}`, 'aria-pressed': String(s === current), 'aria-label': `AMS slot ${s}`,
    onclick: () => onPick(s),
  }, h('span', { text: String(s) }))));
}

function field(def, value, onChange, idBase) {
  const id = `f-${idBase}`;
  if (def.type === 'bool') {
    return h('div', { class: 'field check' },
      h('input', { type: 'checkbox', id, checked: value, onchange: (e) => onChange(e.target.checked) }),
      h('label', { for: id, text: def.label }));
  }
  if (def.type === 'choice') {
    return h('div', { class: 'field' },
      h('label', { for: id, text: def.label }),
      h('select', { id, onchange: (e) => onChange(e.target.value) }, def.options.map((o) => h('option', { value: o, selected: o === value, text: o }))));
  }
  if (def.type === 'tools') {
    const names = Object.keys(spec.tools);
    const on = new Set(value.filter((t) => typeof t === 'string'));
    return h('div', { class: 'field', style: 'grid-column: 1 / -1' },
      h('label', { text: `${def.label} (from the tool library)` }),
      h('div', { class: 'chips' }, names.map((n) => h('button', {
        type: 'button', class: `chip${on.has(n) ? ' on' : ''}`, text: n, 'aria-pressed': String(on.has(n)),
        onclick: () => onChange(on.has(n) ? value.filter((t) => t !== n) : [...value, n]),
      })), value.filter((t) => typeof t !== 'string').map((t) => h('span', { class: 'chip on', text: `${t.name} (inline)` }))));
  }
  return h('div', { class: 'field' },
    h('label', { for: id, text: def.unit ? `${def.label} (${def.unit})` : def.label }),
    h('input', {
      type: 'number', id, value, min: def.min, max: def.max, step: def.step || 1, inputmode: def.type === 'int' ? 'numeric' : 'decimal',
      onchange: (e) => onChange(e.target.value),
    }));
}

// Faces each part type really has (others fall back to the nearest outside face).
function facesFor(part) {
  const outer = ['top', 'bottom', 'front', 'back', 'left', 'right'];
  const inner = ['floor', 'inner_front', 'inner_back', 'inner_left', 'inner_right'];
  if (part.type === 'enclosure') return [...outer, ...inner, ...(part.params.lid ? ['lid_top', 'lid_under'] : []), 'xyz'];
  if (part.type === 'gridfinity_bin') return [...outer, ...inner, 'xyz'];
  return [...outer, 'xyz'];
}

const QUICK = [
  ['USB-C', { op: 'cut', shape: 'slot', face: 'front', w: 9.5, h: 3.8, through: true }],
  ['Round hole', { op: 'cut', shape: 'cylinder', face: 'front', d: 6, through: true }],
  ['Rectangle', { op: 'cut', shape: 'box', face: 'front', w: 12, h: 6, r: 0.5, through: true }],
  ['4 standoffs', { op: 'add', shape: 'standoff', face: 'floor', size: 'M2.5', depth: 5, pattern: { type: 'grid', nx: 2, ny: 2, dx: 30, dy: 20 } }],
  ['Insert post', { op: 'add', shape: 'insert_post', face: 'floor', size: 'M3', depth: 8 }],
  ['Screw hole', { op: 'cut', shape: 'screw_hole', face: 'bottom', size: 'M3', cb: 3, through: true }],
  ['Countersunk', { op: 'cut', shape: 'countersunk', face: 'top', size: 'M3', through: true }],
  ['Nut trap', { op: 'cut', shape: 'nut_trap', face: 'bottom', size: 'M3', through: true }],
  ['Keyhole', { op: 'cut', shape: 'keyhole', face: 'back', size: 'M4', through: true }],
  ['Magnet', { op: 'cut', shape: 'magnet', face: 'bottom', d: 6, depth: 2 }],
  ['Hex vents', { op: 'cut', shape: 'fill', face: 'top', kind: 'hex', w: 30, h: 20, cell: 6, wall: 1.2, through: true }],
  ['Pattern area', { op: 'add', shape: 'fill', face: 'top', kind: 'voronoi', w: 30, h: 20, cell: 6, wall: 1.2, depth: 0.8 }],
  ['Grip texture', { op: 'add', shape: 'texture', face: 'top', kind: 'knurl', w: 30, h: 20, amp: 0.6, scale: 3 }],
  ['Gyroid block', { op: 'add', shape: 'gyroid', face: 'top', w: 30, h: 30, depth: 10, cell: 8, wall: 0.9 }],
  ['Gusset', { op: 'add', shape: 'gusset', face: 'floor', w: 2, h: 10, depth: 10 }],
  ['Rib', { op: 'add', shape: 'rib', face: 'floor', w: 30, h: 1.6, depth: 4 }],
  ['Tube', { op: 'add', shape: 'tube', face: 'top', od: 10, id: 6, depth: 10 }],
  ['Snap clip', { op: 'add', shape: 'snap_clip', face: 'top' }],
  ['Logo (SVG)', { op: 'cut', shape: 'svg', face: 'top', w: 30, depth: 0.8 }],
  ['Engraved text', { op: 'cut', shape: 'text', face: 'top', text: 'Label', size: 6, depth: 0.6 }],
  ['Raised text', { op: 'add', shape: 'text', face: 'top', text: 'Label', size: 6, depth: 0.6, slot: 2 }],
  ['Block', { op: 'add', shape: 'box', face: 'top', w: 10, h: 10, depth: 5 }],
];

function extrasEditor(part, pi, onChange) {
  const list = part.extras || [];
  const faces = facesFor(part);
  const setAt = (i, patch) => onChange(list.map((e, j) => (j === i ? normalizeExtra({ ...e, ...patch }) : e)));
  const sel = (id, opts, value, on, label) => h('select', { id, 'aria-label': label, onchange: (ev) => on(ev.target.value) },
    Object.entries(opts).map(([k, l]) => h('option', { value: k, selected: k === value, text: l })));
  const numF = (id, def, value, on) => h('div', { class: 'field' },
    h('label', { for: id, text: def.unit ? `${def.label} (${def.unit})` : def.label }),
    h('input', { type: 'number', id, value, min: def.min, max: def.max, step: def.step || 1, inputmode: 'decimal', onchange: (ev) => on(+ev.target.value) }));
  const rows = list.map((e, i) => {
    const id = (k) => `x-${pi}-${i}-${k}`;
    const def = EXTRA_SHAPES[e.shape];
    const pt = e.pattern?.type || 'none';
    return h('div', { class: 'extra' },
      h('div', { class: 'extra-head' },
        def.op ? h('span', { class: 'chip on', text: def.op }) : sel(id('op'), { add: 'Add', cut: 'Cut' }, e.op, (v) => setAt(i, { op: v }), 'Add or cut'),
        sel(id('shape'), Object.fromEntries(Object.entries(EXTRA_SHAPES).map(([k, d]) => [k, d.label])), e.shape, (v) => setAt(i, { shape: v }), 'Shape'),
        h('span', { class: 'note-line', text: 'on' }),
        sel(id('face'), Object.fromEntries(faces.map((f) => [f, FACES[f]])), e.face, (v) => setAt(i, { face: v }), 'Face'),
        h('button', { class: 'btn', type: 'button', text: 'Remove', onclick: () => onChange(list.filter((_, j) => j !== i)) })),
      h('div', { class: 'fields' },
        SCREW_SHAPES.has(e.shape) ? h('div', { class: 'field' }, h('label', { for: id('size'), text: 'Screw' }),
          sel(id('size'), Object.fromEntries(Object.keys(SCREWS).map((k) => [k, k])), e.size, (v) => setAt(i, { size: v }), 'Screw size')) : null,
        Object.entries(def.fields).map(([k, fd]) => {
          if (k === 'depth' && e.through) return null;
          if (fd.type === 'choice') return h('div', { class: 'field' }, h('label', { for: id(k), text: fd.label }),
            sel(id(k), Object.fromEntries(fd.options.map((o) => [o, o])), e[k], (v) => setAt(i, { [k]: v }), fd.label));
          if (fd.type === 'svg') {
            const pick = h('input', { type: 'file', accept: '.svg,image/svg+xml', id: id(k), hidden: true, onchange: async (ev) => {
              const f = ev.target.files?.[0];
              if (!f) return;
              try { setAt(i, { logo: svgToLogo(await f.text()) }); reply(`Loaded ${f.name}.`); }
              catch (err) { reply(err.message || 'Could not read that SVG.', true); }
            } });
            return h('div', { class: 'field', style: 'grid-column: 1 / -1' }, h('label', { text: 'Logo file' }),
              h('div', { class: 'askrow' }, pick, h('button', { class: 'btn', type: 'button', text: e.logo ? 'Replace SVG…' : 'Upload SVG…', onclick: () => pick.click() }),
                h('span', { class: 'note-line', text: e.logo ? `${(e.logo.length / 1024).toFixed(1)} KB stored with the part` : 'Filled shapes are used; strokes are ignored.' })));
          }
          if (fd.type === 'text') return h('div', { class: 'field', style: 'grid-column: 1 / -1' }, h('label', { for: id(k), text: 'Text (new line = second line)' }),
            h('textarea', { id: id(k), rows: 2, class: 'textin', onchange: (ev) => setAt(i, { [k]: ev.target.value }) }, e[k]));
          if (k === 'slot') return e.op === 'add' ? h('div', { class: 'field' }, h('label', { text: 'Colour (AMS slot)' }),
            h('div', { class: 'slots' }, [0, 1, 2, 3, 4].map((sl) => h('button', { type: 'button', class: 'slot', 'aria-pressed': String((e.slot || 0) === sl), 'aria-label': sl ? `AMS slot ${sl}` : 'Same as part',
              style: `background:${sl ? spec.colors[sl - 1] : 'var(--surface)'}`, onclick: () => setAt(i, { slot: sl }) }, h('span', { text: sl ? String(sl) : 'part' }))))) : null;
          return numF(id(k), fd, e[k], (v) => setAt(i, { [k]: v }));
        }),
        e.face === 'xyz'
          ? ['x', 'y', 'z', 'rx', 'ry', 'rz'].map((k) => numF(id(k), { label: k.startsWith('r') ? `Rotate ${k[1].toUpperCase()} (°)` : k.toUpperCase(), min: -500, max: 500, step: k.startsWith('r') ? 15 : 0.5, unit: k.startsWith('r') ? '' : 'mm' }, e[k], (v) => setAt(i, { [k]: v })))
          : [numF(id('u'), { label: 'Right of centre', unit: 'mm', min: -500, max: 500, step: 0.5 }, e.u, (v) => setAt(i, { u: v })),
             numF(id('v'), { label: ['top', 'bottom', 'floor', 'lid_top', 'lid_under'].includes(e.face) ? 'Towards back' : 'Above centre', unit: 'mm', min: -500, max: 500, step: 0.5 }, e.v, (v) => setAt(i, { v: v })),
             numF(id('rot'), { label: 'Rotate (°)', min: -360, max: 360, step: 15 }, e.rot || 0, (v) => setAt(i, { rot: v }))],
        e.op === 'cut' ? h('div', { class: 'field check' }, h('input', { type: 'checkbox', id: id('through'), checked: !!e.through, onchange: (ev) => setAt(i, { through: ev.target.checked }) }), h('label', { for: id('through'), text: 'Cut all the way through' })) : null,
        e.face !== 'xyz' ? h('div', { class: 'field' }, h('label', { for: id('mirror'), text: 'Mirror copy' }),
          sel(id('mirror'), MIRRORS, e.mirror || 'none', (v) => setAt(i, { mirror: v }), 'Mirror')) : null,
        h('div', { class: 'field' }, h('label', { for: id('pattern'), text: 'Repeat' }),
          sel(id('pattern'), Object.fromEntries(Object.entries(PATTERNS).map(([k, d]) => [k, d.label])), pt, (v) => setAt(i, { pattern: v === 'none' ? undefined : { type: v } }), 'Pattern')),
        pt !== 'none' ? Object.entries(PATTERNS[pt].fields).map(([k, fd]) => numF(id(`p${k}`), fd, e.pattern[k], (v) => setAt(i, { pattern: { ...e.pattern, [k]: v } }))) : null,
      ));
  });
  return h('div', { class: 'field', style: 'grid-column: 1 / -1' },
    h('label', { text: 'Extras: features added or cut on a face' }),
    ...rows,
    h('p', { class: 'note-line', text: 'Positions are from the face centre in mm, as you look at that face from outside (top, bottom, floor and lid: seen from above). Adds grow out of the face; cuts sink in.' }),
    h('div', { class: 'chips' }, QUICK.map(([label, e]) => h('button', { class: 'chip', type: 'button', text: `+ ${label}`,
      onclick: () => onChange([...list, normalizeExtra(faces.includes(e.face) ? e : { ...e, face: e.face === 'floor' ? 'top' : e.face })]) }))));
}

function partsPanel() {
  const out = [];
  spec.parts.forEach((part, i) => {
    const t = TYPES[part.type];
    const update = (fnc, note) => { const s = structuredClone(spec); fnc(s.parts[i]); setSpec(s, { note }); };
    const missing = part.type === 'tool_holder' ? resolveTools(part.params.tools, spec.tools).filter((x) => x.missing).map((x) => x.name) : [];
    out.push(h('div', { class: 'card' },
      h('h3', {}, t.label, h('span', { class: 'id', text: part.id })),
      h('p', { text: t.blurb }),
      missing.length ? h('p', { class: 'reply err', text: `Not in the tool library: ${missing.join(', ')}. Using 8 mm until you add them.` }) : null,
      h('div', { class: 'field' }, h('label', { text: 'AMS slot' }),
        slotPicker(part.slot, (s) => update((p) => { p.slot = s; }, `${part.id}: AMS slot ${s}`), `AMS slot for ${part.id}`)),
      h('div', { class: 'fields' },
        field({ label: 'Quantity', type: 'int', min: 1, max: 20 }, part.qty || 1, (v) => update((p) => { p.qty = +v; }, `${part.id}: quantity`), `${i}-qty`),
        Object.entries(t.params).map(([k, def]) =>
        field(def, part.params[k], (v) => update((p) => { p.params[k] = v; }, `${part.id}: ${def.label.toLowerCase()}`), `${i}-${k}`))),
      h('div', { class: 'fields' }, Object.entries(FINISH).map(([k, def]) => (k !== 'type' && !part.finish ? null
        : field(def, (part.finish || { type: 'sharp' })[k] ?? def.default, (v) => update((p) => { p.finish = { ...(p.finish || { r: 1, edges: 'both' }), [k]: v }; }, `${part.id}: edges`), `${i}-fin-${k}`)))),
      extrasEditor(part, i, (extras) => update((p) => { p.extras = extras; }, `${part.id}: extras`)),
      spec.parts.length > 1 ? h('div', {}, h('button', { class: 'btn', type: 'button', text: `Remove ${part.id}`, onclick: () => {
        const s = structuredClone(spec); s.parts.splice(i, 1); setSpec(s, { note: `Removed ${part.id}`, now: true });
      } })) : null,
    ));
  });
  const addSel = h('select', { id: 'addType', 'aria-label': 'Part type to add' }, Object.entries(TYPES).map(([k, t]) => h('option', { value: k, text: t.label })));
  out.push(h('div', { class: 'card' }, h('h3', { text: 'Add a part to this print' }),
    h('div', { class: 'askrow' }, addSel, h('button', { class: 'btn', type: 'button', text: 'Add', onclick: () => {
      const s = structuredClone(spec);
      s.parts.push(normalizePart({ id: addSel.value.split('_')[0], type: addSel.value, slot: 1 }, s.parts.length));
      setSpec(s, { note: `Added ${TYPES[addSel.value].label.toLowerCase()}`, now: true });
    } }))));
  return out;
}

function colourPanel() {
  return [
    h('div', { class: 'card' },
      h('h3', { text: 'AMS slots' }),
      h('p', { text: 'Match these to the filament loaded in your AMS. Each part prints from the slot chosen on its card.' }),
      h('div', { class: 'ams' }, spec.colors.map((c, i) => h('label', { for: `ams-${i}` }, `Slot ${i + 1}`,
        h('input', { type: 'color', id: `ams-${i}`, value: c, onchange: (e) => { const s = structuredClone(spec); s.colors[i] = e.target.value; setSpec(s, { note: `Slot ${i + 1} colour` }); } }))))),
    h('div', { class: 'card' },
      h('h3', { text: 'Fit and material' }),
      h('div', { class: 'fields' },
        h('div', { class: 'field' }, h('label', { for: 'f-name', text: 'Part name' }),
          h('input', { type: 'text', id: 'f-name', value: spec.name, onchange: (e) => setSpec({ ...spec, name: e.target.value }, { note: 'Renamed', now: true }) })),
        h('div', { class: 'field' }, h('label', { for: 'f-mat', text: 'Material' }),
          h('select', { id: 'f-mat', onchange: (e) => setSpec({ ...spec, material: e.target.value, tolerance: MATERIALS[e.target.value].tolerance }, { note: `Material ${e.target.value}` }) },
            Object.keys(MATERIALS).map((m) => h('option', { value: m, selected: m === spec.material, text: m })))),
        h('div', { class: 'field' }, h('label', { for: 'f-tol', text: 'Clearance on mating parts (mm)' }),
          h('input', { type: 'number', id: 'f-tol', value: spec.tolerance, min: 0, max: 1, step: 0.05, onchange: (e) => setSpec({ ...spec, tolerance: e.target.value }, { note: 'Clearance' }) })),
      ),
      h('p', { text: 'Clearance is applied to lid lips and tool holes. Print the Lego clutch test to tune stud Ø for your A1.' })),
  ];
}

function toolsPanel() {
  const rows = Object.entries(spec.tools);
  const setTool = (name, patch) => {
    const s = structuredClone(spec);
    if (patch === null) delete s.tools[name];
    else s.tools[name] = { ...s.tools[name], ...patch };
    setSpec(s, { note: `Tool library: ${name}` });
  };
  const num = (v) => (v === '' ? undefined : +v);
  return h('div', { class: 'card' },
    h('h3', { text: 'Saved tool library' }),
    h('p', { text: 'Caliper measurements of your tools. Round tools take a diameter; flat ones take width × thickness. Holders add the clearance from Colour & fit.' }),
    h('div', { class: 'scroll' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Tool', 'Ø mm', 'W mm', 'T mm', ''].map((t) => h('th', { text: t })))),
      h('tbody', {}, rows.map(([n, t], i) => h('tr', {},
        h('td', { text: n }),
        h('td', {}, h('input', { id: `t-d-${i}`, type: 'number', step: 0.1, value: t.d ?? '', 'aria-label': `${n} diameter`, onchange: (e) => setTool(n, num(e.target.value) ? { d: num(e.target.value), w: undefined, t: undefined } : { d: undefined }) })),
        h('td', {}, h('input', { id: `t-w-${i}`, type: 'number', step: 0.1, value: t.w ?? '', 'aria-label': `${n} width`, onchange: (e) => setTool(n, { w: num(e.target.value), d: undefined, t: t.t ?? 5 }) })),
        h('td', {}, h('input', { id: `t-t-${i}`, type: 'number', step: 0.1, value: t.t ?? '', 'aria-label': `${n} thickness`, onchange: (e) => setTool(n, { t: num(e.target.value), d: undefined, w: t.w ?? 10 }) })),
        h('td', {}, h('button', { class: 'btn', type: 'button', text: 'Remove', onclick: () => setTool(n, null) })),
      ))))),
    (() => {
      const nameIn = h('input', { type: 'text', id: 't-new', placeholder: 'e.g. soldering-iron', 'aria-label': 'New tool name' });
      const dIn = h('input', { type: 'number', id: 't-new-d', step: 0.1, placeholder: 'Ø mm', 'aria-label': 'New tool diameter' });
      return h('div', { class: 'askrow' }, h('div', { class: 'field', style: 'flex:2' }, nameIn), h('div', { class: 'field', style: 'flex:1' }, dIn),
        h('button', { class: 'btn', type: 'button', text: 'Add tool', onclick: () => {
          const n = slugify(nameIn.value); if (!nameIn.value.trim()) return;
          setTool(n, { d: +dIn.value || 8 });
        } }));
    })(),
  );
}

function versionsPanel() {
  const vs = project.versions;
  return h('div', { class: 'card' },
    h('h3', { text: 'Version history' }),
    h('p', { text: 'Every change is kept. Restoring copies an old version to the top, so nothing is lost. You can also ask “go back to version 2”.' }),
    h('div', { class: 'vers' }, vs.map((v, i) => ({ v, i })).reverse().map(({ v, i }) => h('div', { class: `ver${i === vs.length - 1 ? ' cur' : ''}` },
      h('span', { class: 'n', text: `v${i + 1}` }),
      h('div', { class: 'note' }, v.note || 'Change', h('span', { class: 'when', text: new Date(v.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) })),
      i === vs.length - 1 ? h('span', { class: 'note-line', text: 'current' }) : h('button', { class: 'btn', type: 'button', text: 'Restore', onclick: () => restore(i) }),
    ))));
}

function restore(i) {
  const v = project.versions[i];
  if (!v) return false;
  setSpec(structuredClone(v.spec), { note: `Restored v${i + 1}`, now: true });
  return true;
}

function specPanel() {
  const ta = h('textarea', { class: 'code', id: 'specText', spellcheck: 'false', 'aria-label': 'Spec JSON' });
  ta.value = JSON.stringify(spec, null, 2);
  const msg = h('div', { class: 'reply' });
  return h('div', { class: 'card' },
    h('h3', { text: 'Shared model spec' }),
    h('p', { text: 'The same JSON drives the desktop build123d path. Commit it to the Wortguss repo under specs/ to rebuild the part in full CAD.' }),
    ta, msg,
    h('div', { class: 'exports' }, h('button', { class: 'btn primary', type: 'button', text: 'Apply', onclick: () => {
      try { setSpec(JSON.parse(ta.value), { note: 'Edited spec', now: true }); }
      catch (e) { msg.className = 'reply err'; msg.textContent = `That isn't valid JSON: ${e.message}`; }
    } })));
}

// ------------------------------------------------------------- Ask Claude
function reply(text, err = false) { const r = $('reply'); r.textContent = text; r.className = `reply${err ? ' err' : ''}`; }

function catalogText() {
  return Object.entries(TYPES).map(([k, t]) => `- ${k} (${t.label}): ${t.blurb}\n` + Object.entries(t.params).map(([pk, d]) =>
    `    ${pk}: ${d.type}${d.unit ? ' ' + d.unit : ''}${d.min != null ? ` [${d.min}..${d.max}]` : ''} default ${JSON.stringify(d.default)} — ${d.label}${d.help ? `: ${d.help}` : ''}`).join('\n')).join('\n');
}

let askCtl = null;
async function ask(text) {
  text = text.trim();
  if (!text) return;
  if (!caps.sample) { reply('Asking Claude is not available in this view. Use the part settings below, or ask in your Claude chat.', true); return; }
  askCtl?.abort();
  askCtl = new AbortController();
  $('askBtn').disabled = true;
  reply('Thinking…');
  const est = estimate(bodies, MATERIALS[spec.material].density);
  const prompt = `You edit 3D-printable part specs for a Bambu Lab A1 (256 mm cube bed, 4-slot AMS). Units are mm.
The spec JSON has: name, material (${Object.keys(MATERIALS).join('|')}), tolerance (clearance for mating parts), colors (4 hex colours = AMS slots 1-4), tools (tool library: name -> {d} or {w,t}, mm), parts (list of {id, type, slot 1-4, optional qty 1-20 for copies, params}). A request for a kit or several pieces becomes several parts.

Part types and their params:
${catalogText()}

${EXTRAS_HELP}

Current spec:
${JSON.stringify(spec)}

Current build: ${bodies.map((b) => `${b.name} ${b.bbox.max.map((v, k) => fmt(v - b.bbox.min[k])).join('x')} mm`).join('; ')}. Estimated ${fmt(est.grams, 0)} g, ${fmt(est.hours, 1)} h.

Version history (1-based): ${project.versions.map((v, i) => `v${i + 1}: ${v.note}`).join('; ')}

Request: ${text}

Answer with one JSON object and nothing else, in one of these forms:
{"action":"update","summary":"<one short sentence saying what changed>","spec":<the complete new spec>}
{"action":"revert","version":<number>,"summary":"<one short sentence>"}
{"action":"answer","summary":"<a short answer when the request is a question and nothing should change>"}
Rules: keep everything the request does not mention unchanged; only use the part types and params listed; stay inside the ranges; map colour words to hex and set the AMS slot colour and the part's slot; when a request needs something a part's params cannot do, use extras (or a "custom" part) and say in summary which extras you added; only use action "answer" when even extras cannot do it.`;
  try {
    const res = await caps.sample.json(prompt, { signal: askCtl.signal, modelTier: 'default' });
    if (res?.action === 'revert') {
      if (!restore((+res.version || 0) - 1)) throw { message: `There is no version ${res.version}.` };
      reply(res.summary || `Restored version ${res.version}.`);
    } else if (res?.action === 'update' && res.spec) {
      setSpec(res.spec, { note: res.summary || text, now: true });
      reply(res.summary || 'Updated.');
    } else {
      reply(res?.summary || 'No change.');
    }
    $('askInput').value = '';
  } catch (e) {
    if (e?.name === 'AbortError' || e?.code === 'aborted') return;
    const m = { not_granted: 'Claude access was declined for this page. Use the settings below instead.', rate_limited: 'Too many requests just now. Wait a moment and send again.', invalid_json: 'Claude answered in a form the page could not read. Send again, or rephrase.' }[e?.code];
    reply(m || `Could not apply that: ${e?.message || e}`, true);
  } finally { $('askBtn').disabled = false; }
}

// ---------------------------------------------------------------- dictation
function initDictation(d) {
  const btn = $('micBtn');
  btn.hidden = false;
  let base = '';
  const input = $('askInput');
  d.onPartial(({ text }) => { input.value = (base + ' ' + text).trim(); });
  d.onFinal(({ text }) => { base = (base + ' ' + text).trim(); input.value = base; });
  d.onState(({ state }) => {
    const on = state === 'listening' || state === 'starting';
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? 'Stop' : 'Speak';
  });
  btn.addEventListener('click', () => {
    if (d.active()) { d.stop().catch(() => {}); return; }
    base = input.value.trim();
    d.start().catch((e) => { if (e?.code === 'not_granted') btn.hidden = true; else reply('The microphone did not start. Type the request instead.', true); });
  });
}

// ---------------------------------------------------------------- downloads
async function save() {
  const note = $('exportNote');
  if (TARGET === 'pages') {
    const base = slugify(spec.name);
    const files = { [`${base}.3mf`]: build3mf(spec, bodies), ...stlFiles(bodies), [`${base}.json`]: strToU8(JSON.stringify(spec, null, 2)) };
    downloadBlob(`${base}.zip`, zipSync(files, { level: 6 }), 'application/zip');
    note.textContent = `Saved ${base}.zip with the 3MF, STLs and spec.`;
    return;
  }
  if (!caps.downloads) { note.textContent = 'Saving files is not available in this view. Open the page on claude.ai to download.'; return; }
  const base = slugify(spec.name);
  try {
    // The viewer refuses .3mf/.stl downloads, so they go in one flat zip, with the spec.
    const stls = stlFiles(bodies);
    const files = { [`${base}.3mf`]: build3mf(spec, bodies), ...stls, [`${base}.json`]: strToU8(JSON.stringify(spec, null, 2)) };
    await caps.downloads.save({ filename: `${base}.zip`, data: zipSync(files, { level: 6 }) });
    const n = Object.keys(stls).length;
    note.textContent = `Saved ${base}.zip: ${base}.3mf, ${n} STL file${n > 1 ? 's' : ''} (AMS slot in each name) and ${base}.json, the spec.`;
  } catch (e) {
    note.textContent = e?.code === 'declined' ? 'Save cancelled.' : `Could not save: ${e?.message || e}`;
  }
}

// -------------------------------------------------------------------- boot
function openProject(p) {
  project = p;
  spec = normalizeSpec(structuredClone(p.versions[p.versions.length - 1].spec));
  framedFor = null;
  renderProjects();
  renderPanel();
  rebuild();
}

// A part handed over from the Claude page in the link: #s=<deflated JSON>.
function importFromHash() {
  const m = /^#s=([\w-]+)$/.exec(location.hash);
  if (!m) return null;
  try { history.replaceState(null, '', location.pathname + location.search); } catch {}
  try {
    const { id, spec: s } = decodePart(m[1]);
    const clean = normalizeSpec(s);
    let p = projects.find((x) => x.id === id);
    if (p) {
      const last = p.versions[p.versions.length - 1].spec;
      if (JSON.stringify(last) !== JSON.stringify(clean)) p.versions.push({ spec: clean, note: 'From Claude', at: Date.now() });
      p.name = clean.name;
    } else {
      p = { id: String(id || slugify(clean.name)).slice(0, 80), name: clean.name, versions: [{ spec: clean, note: 'From Claude', at: Date.now() }] };
      projects.unshift(p);
    }
    store.save(p);
    return p;
  } catch (e) {
    console.warn('bad part link', e);
    return null;
  }
}

async function boot() {
  initViewer();
  initGeometry(await Module({ wasmBinary }));
  loadFont(fontBytes);

  // Start right away from local data; capabilities light up when they answer.
  projects = await store.load();
  const imported = importFromHash();
  if (!projects.length) newProject(specFromPreset('gridfinity'), 'Example: Gridfinity bin');
  openProject(imported || projects[0]);
  if (TARGET === 'pages') {
    $('askForm').querySelector('.askrow').replaceWith(h('div', { class: 'reply' }, 'To describe a change, use ',
      h('a', { href: CLAUDE_PAGE, target: '_blank', rel: 'noopener', text: 'Wortguss in Claude' }),
      ', then tap “Open on GitHub to download”. Or edit the part settings here.'));
  }

  $('projectSel').addEventListener('change', (e) => { if (dirtyNote) commit(dirtyNote); openProject(projects.find((p) => p.id === e.target.value)); });
  $('newBtn').addEventListener('click', () => { topMode = topMode === 'new' ? null : 'new'; renderTop(); });
  $('renameBtn').addEventListener('click', () => { topMode = topMode === 'rename' ? null : 'rename'; renderTop(); });
  for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => { tab = b.dataset.tab; renderPanel(); });
  $('askForm').addEventListener('submit', (e) => { e.preventDefault(); ask($('askInput').value); });
  $('askInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask($('askInput').value); } });
  window.addEventListener('pagehide', () => { if (dirtyNote) commit(dirtyNote); });

  if (TARGET === 'pages') return;
  const use = (n) => (window.claude?.use ? window.claude.use(n).catch(() => null) : Promise.resolve(null));
  use('sample').then((s) => { caps.sample = s; if (!s) $('askInput').placeholder = 'Asking Claude is not available here. Use the settings below.'; });
  use('dictation').then((d) => { caps.dictation = d; if (d) initDictation(d); });
  use('downloads').then((d) => { caps.downloads = d; });
  const [db, user] = await Promise.all([use('db'), use('user')]);
  if (db && user) {
    try {
      uid = await user.id();
      caps.db = db;
      const remote = await store.load();
      if (remote.length) {
        const local = projects;
        projects = remote.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        // Keep any local-only projects by copying them up once.
        for (const p of local) if (!projects.some((r) => r.id === p.id) && p.versions.length > 1) { projects.push(p); store.save(p); }
        openProject(projects[0]);
      } else {
        for (const p of projects) store.save(p);
      }
    } catch (e) { console.warn('db unavailable', e); caps.db = null; }
  }
}

boot().catch((e) => { console.error(e); reply(`The geometry engine did not load: ${e.message || e}`, true); });
