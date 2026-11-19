// Builds every preset, checks each body is a closed solid that fits the A1 bed,
// and writes 3MF files to test/out/ for opening in Bambu Studio.
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildSpec, estimate } from '../src/geometry.js';
import { setup } from './setup.mjs';
import { specFromPreset } from '../src/spec.js';
import { PRESETS, BED } from '../src/catalog.js';
import { build3mf } from '../src/threemf.js';

await setup();
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
let fail = 0;
for (const p of PRESETS) {
  const spec = specFromPreset(p.key);
  const t = performance.now();
  const bodies = buildSpec(spec);
  const ms = Math.round(performance.now() - t);
  for (const b of bodies) {
    const size = b.bbox.max.map((v, i) => v - b.bbox.min[i]);
    const ok = b.volume > 0 && b.mesh.indices.length > 0 && Math.abs(b.bbox.min[2]) < 1e-6 && size[0] <= BED.x && size[1] <= BED.y;
    if (!ok) fail++;
    console.log(`${ok ? 'ok ' : 'BAD'} ${p.key.padEnd(10)} ${b.name.padEnd(16)} slot ${b.slot}  ${size.map((v) => v.toFixed(1)).join(' x ')} mm  ${(b.volume / 1000).toFixed(1)} cm3`);
  }
  const est = estimate(bodies, 1.24);
  const zip = build3mf(spec, bodies);
  writeFileSync(new URL(`./out/${p.key}.3mf`, import.meta.url), zip);
  console.log(`   ${ms} ms, ~${est.grams.toFixed(0)} g, ~${est.hours.toFixed(1)} h, 3mf ${(zip.length / 1024).toFixed(0)} KB`);
}
if (fail) { console.error(`${fail} bad bodies`); process.exit(1); }
