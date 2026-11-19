// Builds prints/<name>.3mf for every specs/<name>.json, so each spec has a
// hosted 3MF in the repo. Run by CI on push; also `npm run prints` locally.
import Module from 'manifold-3d';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { initGeometry, buildSpec } from '../src/geometry.js';
import { normalizeSpec } from '../src/spec.js';
import { build3mf } from '../src/threemf.js';

const root = new URL('../../', import.meta.url);
const specsDir = new URL('specs/', root), outDir = new URL('prints/', root);
initGeometry(await Module());
mkdirSync(outDir, { recursive: true });
const keep = new Set();
for (const f of readdirSync(specsDir).filter((f) => f.endsWith('.json')).sort()) {
  const name = f.replace(/\.json$/, '');
  const spec = normalizeSpec(JSON.parse(readFileSync(new URL(f, specsDir), 'utf8')));
  const bodies = buildSpec(spec);
  writeFileSync(new URL(`${name}.3mf`, outDir), build3mf(spec, bodies));
  keep.add(`${name}.3mf`);
  console.log(`prints/${name}.3mf  ${bodies.length} bodies`);
}
// Drop 3MFs whose spec was removed.
for (const f of readdirSync(outDir)) if (f.endsWith('.3mf') && !keep.has(f)) rmSync(new URL(f, outDir));
