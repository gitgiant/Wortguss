// Every extra shape on every face of every part type: must build a closed solid,
// adds must add volume and cuts must remove it.
import { buildSpec } from '../src/geometry.js';
import { setup } from './setup.mjs';
import { normalizeSpec } from '../src/spec.js';
import { readFileSync } from 'node:fs';
import { TYPES, FACES, EXTRA_SHAPES } from '../src/catalog.js';

await setup();
const vol = (spec) => buildSpec(spec).reduce((s, b) => s + b.volume, 0);
let checks = 0, fails = [];
for (const type of Object.keys(TYPES)) {
  const base = normalizeSpec({ parts: [{ type, params: type === 'enclosure' ? { w: 60, d: 40, h: 25 } : {} }] });
  const v0 = vol(base);
  for (const face of Object.keys(FACES)) {
    for (const [shape, def] of Object.entries(EXTRA_SHAPES)) {
      for (const op of def.op ? [def.op] : ['add', 'cut']) {
        if (type === 'lego_calibration' || type === 'tool_holder') if (face !== 'top' && face !== 'front') continue; // keep it quick
        // Small features near the face centre, so they land on material.
        const e = { op, shape, face, w: 4, h: 3, d: 3, depth: 1.5, od: 5, len: 4, size: 'M2', x: 0, y: 0, z: 2 };
        if (shape === 'magnet') Object.assign(e, { d: 3, depth: 1 });
        const spec = normalizeSpec({ ...base, parts: [{ ...base.parts[0], extras: [e] }] });
        let v;
        try { v = vol(spec); } catch (err) { fails.push(`${type}/${face}/${shape}/${op}: threw ${err.message}`); continue; }
        checks++;
        // A post placed by XYZ inside solid material can remove more (its hole) than it adds.
        const embeddedPost = face === 'xyz' && (shape === 'standoff' || shape === 'insert_post');
        const ok = embeddedPost || (op === 'add' ? v > v0 - 1e-6 : v < v0 + 1e-6);
        if (!ok) fails.push(`${type}/${face}/${shape}/${op}: volume ${v0.toFixed(1)} -> ${v.toFixed(1)}`);
      }
    }
  }
}
// Patterns multiply the effect.
const pat = (pattern) => normalizeSpec({ parts: [{ type: 'enclosure', extras: [{ op: 'add', shape: 'standoff', face: 'floor', size: 'M2.5', depth: 5, pattern }] }] });
const one = vol(pat(undefined)), four = vol(pat({ type: 'grid', nx: 2, ny: 2, dx: 30, dy: 20 })), six = vol(pat({ type: 'circle', n: 6, radius: 12 }));
const base = vol(normalizeSpec({ parts: [{ type: 'enclosure' }] }));
const each = one - base;
if (Math.abs((four - base) - 4 * each) > 0.5) fails.push(`grid of 4 standoffs: ${four - base} vs 4 x ${each}`);
if (Math.abs((six - base) - 6 * each) > 0.5) fails.push(`circle of 6 standoffs: ${six - base} vs 6 x ${each}`);
// Every fill pattern opens a sensible share of its area (catches cells dropped by winding).
const plate = { type: 'custom', params: { w: 70, d: 50, h: 3, radius: 3 } };
const pv0 = vol(normalizeSpec({ parts: [plate] }));
for (const kind of EXTRA_SHAPES.fill.fields.kind.options) {
  const v = vol(normalizeSpec({ parts: [{ ...plate, extras: [{ op: 'cut', shape: 'fill', face: 'top', kind, w: 60, h: 40, cell: 6, wall: 1.2, depth: 1.5 }] }] }));
  const open = (pv0 - v) / (60 * 40 * 1.5);
  const lo = kind === 'truchet' || kind === 'girih' ? 0.1 : 0.3; // line and star patterns are sparser
  if (!(open > lo && open < 0.9)) fails.push(`fill ${kind}: opens ${(open * 100).toFixed(0)}% of its area`);
}
// A stored SVG logo (square with a hole, circle, half disc) extrudes to its area.
const logo = readFileSync(new URL('./logo-sample.txt', import.meta.url), 'utf8');
const lv = vol(normalizeSpec({ parts: [{ ...plate, extras: [{ op: 'add', shape: 'svg', face: 'top', logo, w: 110, depth: 1 }] }] })) - pv0;
const expected = 40 * 40 - 20 * 20 + Math.PI * 18 * 18 + (Math.PI * 100) / 2; // logo units = mm at width 110
if (Math.abs(lv - expected) / expected > 0.03) fails.push(`svg logo area ${lv.toFixed(0)} vs ${expected.toFixed(0)}`);
console.log(`${checks} extra placements built`);
if (fails.length) { console.error(fails.length + ' problems:\n' + fails.slice(0, 40).join('\n')); process.exit(1); }
console.log('all adds add, all cuts cut, patterns repeat');
