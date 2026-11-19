// Spec normalisation: takes anything spec-shaped (from a person, from Claude,
// from storage) and returns a valid spec, clamped to the catalogue.
import { SPEC_VERSION, TYPES, MATERIALS, DEFAULT_COLORS, DEFAULT_TOOLS, PRESETS } from './catalog.js';

const HEX = /^#[0-9a-f]{6}$/i;

function clampParam(def, v) {
  if (def.type === 'bool') return typeof v === 'boolean' ? v : def.default;
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

export function normalizePart(p, i) {
  const type = TYPES[p?.type] ? p.type : 'gridfinity_bin';
  const defs = TYPES[type].params;
  const params = {};
  for (const [k, def] of Object.entries(defs)) params[k] = clampParam(def, p?.params?.[k]);
  const id = String(p?.id || `part${i + 1}`).replace(/[^\w-]/g, '').slice(0, 32) || `part${i + 1}`;
  const slot = Math.min(4, Math.max(1, Math.round(+p?.slot || 1)));
  return { id, type, slot, params };
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
