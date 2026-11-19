// Writes each preset as a spec file in specs/ (the shared format both paths use).
import { writeFileSync } from 'node:fs';
import { PRESETS } from '../src/catalog.js';
import { specFromPreset, slugify } from '../src/spec.js';
for (const p of PRESETS) {
  const s = specFromPreset(p.key);
  writeFileSync(new URL(`../../specs/${slugify(s.name)}.json`, import.meta.url), JSON.stringify(s, null, 2) + '\n');
}
