// Builds prints/<name>.3mf for every specs/<name>.json, so each spec has a
// hosted 3MF in the repo. Run by CI on push; also `npm run prints` locally.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { buildSpec } from '../src/geometry.js';
import { setup } from '../test/setup.mjs';
import { normalizeSpec } from '../src/spec.js';
import { build3mf, stlFiles } from '../src/threemf.js';

const root = new URL('../../', import.meta.url);
const specsDir = new URL('specs/', root), outDir = new URL('prints/', root);
await setup();
mkdirSync(outDir, { recursive: true });
const keep = new Set();
for (const f of readdirSync(specsDir).filter((f) => f.endsWith('.json')).sort()) {
  const name = f.replace(/\.json$/, '');
  const spec = normalizeSpec(JSON.parse(readFileSync(new URL(f, specsDir), 'utf8')));
  const bodies = buildSpec(spec);
  writeFileSync(new URL(`${name}.3mf`, outDir), build3mf(spec, bodies));
  keep.add(`${name}.3mf`);
  // STL fallback: prints/<name>-stl/<part>-slot<N>.stl
  const dir = new URL(`${name}-stl/`, outDir);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  for (const [fn, data] of Object.entries(stlFiles(bodies))) writeFileSync(new URL(fn, dir), data);
  keep.add(`${name}-stl`);
  console.log(`prints/${name}.3mf  ${bodies.length} bodies`);
}
// Drop 3MFs whose spec was removed.
for (const f of readdirSync(outDir)) if (!keep.has(f)) rmSync(new URL(f, outDir), { recursive: true, force: true });
