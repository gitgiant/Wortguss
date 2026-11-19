// Spec normalisation: takes anything spec-shaped (from a person, from Claude,
// from storage) and returns a valid spec, clamped to the catalogue.
import { SPEC_VERSION, TYPES, MATERIALS, DEFAULT_COLORS, DEFAULT_TOOLS, PRESETS, FACES, EXTRA_SHAPES, SCREWS, SCREW_SHAPES, PATTERNS, MIRRORS, FINISH } from './catalog.js';

const HEX = /^#[0-9a-f]{6}$/i;

function clampParam(def, v) {
  if (def.type === 'bool') return typeof v === 'boolean' ? v : def.default;
  if (def.type === 'choice') return def.options.includes(v) ? v : def.default;
  if (def.type === 'tools') {
    if (!Array.isArray(v)) return def.default.slice();
    return v
      .map((t) => {
        if (typeof t === 'string') return t.trim().slice(0, 40);
        if (t && typeof t === 'object') {
          const o = { name: String(t.name || 'tool').slice(0, 40) };
          if (Number.isFinite(+t.d)) o.d = Math.min(200, Math.max(1, +t.d));
          else {
            o.w = Math.min(200, Math.max(1, +t.w || 10));
            o.t = Math.min(200, Math.max(1, +t.t || 5));
          }
          return o;
        }
        return null;
      })
      .filter(Boolean)
      .slice(0, 24);
  }
  let n = Number(v);
  if (!Number.isFinite(n)) n = def.default;
  n = Math.min(def.max, Math.max(def.min, n));
  if (def.type === 'int') n = Math.round(n);
  else n = Math.round(n * 1000) / 1000;
  return n;
}

const numIn = (def, v) => {
  let n = Number(v);
  if (!Number.isFinite(n)) n = def.default;
  n = Math.min(def.max, Math.max(def.min, n));
  return def.type === 'int' ? Math.round(n) : Math.round(n * 100) / 100;
};
const range = (v, lo, hi, d) => { const n = Number(v); return Math.round(Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : d)) * 100) / 100; };

export function normalizeExtra(e) {
  if (!e || typeof e !== 'object') return null;
  const shape = EXTRA_SHAPES[e.shape] ? e.shape : 'box';
  const def = EXTRA_SHAPES[shape];
  const out = {
    op: def.op || (e.op === 'add' ? 'add' : 'cut'),
    shape,
    face: FACES[e.face] ? e.face : 'top',
    u: range(e.u, -500, 500, 0),
    v: range(e.v, -500, 500, 0),
  };
  if (+e.rot) out.rot = range(e.rot, -360, 360, 0);
  for (const [k, fd] of Object.entries(def.fields)) {
    // Text: printable characters only, up to 6 lines of 40.
    out[k] = fd.type === 'text'
      ? String(e[k] ?? fd.default).replace(/\r/g, '').replace(/[^\x20-\x7E\u00A0-\u024F\n]/g, '').split('\n').slice(0, 6).map((l) => l.slice(0, 40)).join('\n') || fd.default
      : numIn(fd, e[k]);
  }
  if (MIRRORS[e.mirror] && e.mirror !== 'none') out.mirror = e.mirror;
  if (SCREW_SHAPES.has(shape)) out.size = SCREWS[e.size] ? e.size : 'M3';
  if (out.op === 'cut' && e.through) out.through = true;
  if (out.face === 'xyz') for (const k of ['x', 'y', 'z', 'rx', 'ry', 'rz']) out[k] = range(e[k], -500, 500, 0);
  const pt = PATTERNS[e.pattern?.type] && e.pattern.type !== 'none' ? e.pattern.type : null;
  if (pt) {
    out.pattern = { type: pt };
    for (const [k, fd] of Object.entries(PATTERNS[pt].fields)) out.pattern[k] = numIn(fd, e.pattern[k]);
  }
  return out;
}

// Older specs: enclosure cableHole / cutouts become cut extras.
function legacyExtras(type, params) {
  if (type !== 'enclosure' || !params) return [];
  const floor = Number(params.floor ?? 2), H = Number(params.h ?? 25) + floor;
  const out = [];
  if (+params.cableHole > 0) out.push({ op: 'cut', shape: 'cylinder', face: 'front', d: +params.cableHole, through: true, v: floor + Math.min(+params.h / 2 || 12.5, +params.cableHole / 2 + 2) - H / 2 });
  for (const c of Array.isArray(params.cutouts) ? params.cutouts : []) {
    const shape = c.shape === 'round' ? 'cylinder' : c.shape === 'slot' ? 'slot' : 'box';
    const lid = c.side === 'lid';
    out.push({ op: 'cut', shape, face: lid ? 'lid_top' : c.side, w: c.w, h: c.h, d: c.w, r: 0.5, through: true, u: c.x, v: lid ? c.z : floor + (+c.z || 0) - H / 2 });
  }
  return out;
}

export function normalizePart(p, i) {
  const type = TYPES[p?.type] ? p.type : 'gridfinity_bin';
  const defs = TYPES[type].params;
  const params = {};
  for (const [k, def] of Object.entries(defs)) params[k] = clampParam(def, p?.params?.[k]);
  const id = String(p?.id || `part${i + 1}`).replace(/[^\w-]/g, '').slice(0, 32) || `part${i + 1}`;
  const slot = Math.min(4, Math.max(1, Math.round(+p?.slot || 1)));
  const qty = Math.min(20, Math.max(1, Math.round(+p?.qty || 1)));
  const raw = [...legacyExtras(type, p?.params), ...(Array.isArray(p?.extras) ? p.extras : [])];
  const extras = raw.slice(0, 40).map(normalizeExtra).filter(Boolean);
  const out = { id, type, slot };
  if (qty > 1) out.qty = qty;
  out.params = params;
  if (extras.length) out.extras = extras;
  const ft = FINISH.type.options.includes(p?.finish?.type) ? p.finish.type : 'sharp';
  if (ft !== 'sharp') out.finish = { type: ft, r: numIn(FINISH.r, p.finish.r), edges: FINISH.edges.options.includes(p.finish.edges) ? p.finish.edges : 'both' };
  return out;
}

export function normalizeSpec(s) {
  const material = MATERIALS[s?.material] ? s.material : 'PLA';
  let tolerance = Number(s?.tolerance);
  if (!Number.isFinite(tolerance)) tolerance = MATERIALS[material].tolerance;
  tolerance = Math.min(1, Math.max(0, Math.round(tolerance * 100) / 100));
  const colors = DEFAULT_COLORS.map((c, i) => (HEX.test(s?.colors?.[i]) ? s.colors[i].toLowerCase() : c));
  const tools = {};
  const srcTools = s?.tools && typeof s.tools === 'object' ? s.tools : DEFAULT_TOOLS;
  for (const [k, t] of Object.entries(srcTools).slice(0, 64)) {
    const key = String(k).replace(/[^\w-]/g, '').slice(0, 40);
    if (!key || !t) continue;
    if (Number.isFinite(+t.d)) tools[key] = { d: Math.min(200, Math.max(1, +t.d)) };
    else if (Number.isFinite(+t.w)) tools[key] = { w: Math.min(200, Math.max(1, +t.w)), t: Math.min(200, Math.max(1, +t.t || 5)) };
    else continue;
    if (t.note) tools[key].note = String(t.note).slice(0, 80);
  }
  let parts = Array.isArray(s?.parts) ? s.parts.slice(0, 12).map(normalizePart) : [];
  if (!parts.length) parts = [normalizePart({ type: 'gridfinity_bin' }, 0)];
  // unique ids
  const seen = new Set();
  for (const p of parts) {
    let id = p.id, n = 2;
    while (seen.has(id)) id = `${p.id}${n++}`;
    p.id = id;
    seen.add(id);
  }
  return {
    wortguss: SPEC_VERSION,
    name: String(s?.name || 'Untitled part').slice(0, 80),
    material,
    tolerance,
    colors,
    tools,
    parts,
  };
}

export function specFromPreset(key) {
  const p = PRESETS.find((x) => x.key === key) || PRESETS[0];
  return normalizeSpec({ name: p.name, parts: structuredClone(p.parts) });
}

export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'part';
}
