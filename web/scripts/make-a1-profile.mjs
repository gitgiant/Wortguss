// Flattens Bambu Studio's A1 system presets (printer, 0.20 mm Standard process,
// Bambu PLA Basic / PETG HF filaments) into src/a1-profile.json, which the 3MF
// writer turns into Metadata/project_settings.config. Bambu Studio only treats a
// 3MF as its own project when that config is present and names a Bambu printer.
// Usage: node scripts/make-a1-profile.mjs <BambuStudio checkout>/resources/profiles/BBL
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) { console.error('usage: make-a1-profile.mjs <path to resources/profiles/BBL>'); process.exit(1); }
const index = {};
for (const dir of ['machine', 'process', 'filament']) {
  for (const f of readdirSync(join(root, dir))) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(readFileSync(join(root, dir, f), 'utf8'));
    if (j.name) index[j.name] = j;
  }
}
const META = new Set(['type', 'name', 'inherits', 'from', 'instantiation', 'include', 'setting_id', 'filament_id', 'description', 'compatible_printers', 'compatible_printers_condition', 'compatible_prints', 'compatible_prints_condition', 'upward_compatible_machine', 'default_filament_profile', 'default_print_profile']);
function flat(name) {
  const p = index[name];
  if (!p) throw new Error(`profile not found: ${name}`);
  const out = p.inherits ? flat(p.inherits) : {};
  for (const inc of p.include || []) Object.assign(out, flat(inc));
  for (const [k, v] of Object.entries(p)) if (!META.has(k)) out[k] = v;
  return out;
}
const filamentId = (name) => { for (let n = name; n; n = index[n]?.inherits) if (index[n]?.filament_id) return index[n].filament_id; return ''; };
const PRINTER = 'Bambu Lab A1 0.4 nozzle', PROCESS = '0.20mm Standard @BBL A1';
const FIL = { PLA: 'Bambu PLA Basic @BBL A1', PETG: 'Bambu PETG HF @BBL A1' };
const out = {
  source: 'BambuStudio resources/profiles/BBL',
  printer: { name: PRINTER, ...flat(PRINTER) },
  process: { name: PROCESS, ...flat(PROCESS) },
  filaments: Object.fromEntries(Object.entries(FIL).map(([k, n]) => [k, { name: n, id: filamentId(n), settings: flat(n) }])),
};
writeFileSync(new URL('../src/a1-profile.json', import.meta.url), JSON.stringify(out));
console.log('printer keys', Object.keys(out.printer).length, 'process keys', Object.keys(out.process).length,
  Object.entries(out.filaments).map(([k, f]) => `${k} ${f.id} ${Object.keys(f.settings).length} keys`).join(', '));
