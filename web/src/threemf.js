// 3MF writer in Bambu Studio's project layout, so Bambu Studio opens it as a
// project (not "geometry only"): one object per body, each mesh in
// 3D/Objects/, the AMS slot as the object's extruder, one plate, and a full
// A1 project config (printer, process, four filaments with the AMS colours).
// Layout mirrors the exporter in BambuStudio src/libslic3r/Format/bbs_3mf.cpp.
import { zipSync, strToU8 } from 'fflate';
import { BED } from './catalog.js';
import A1 from './a1-profile.json' with { type: 'json' };

// Bambu Studio treats a 3MF as its own only when Application starts with this.
const APP = 'BambuStudio-02.00.00.00';
const CORE = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
const PROD = 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06';
const BBS = 'http://schemas.bambulab.com/package/2021';

const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
const f = (n) => (Math.round(n * 10000) / 10000).toString();

// Pack bodies into rows that fit the plate width, centred on the plate.
export function layout(bodies, gap = 6) {
  const maxW = BED.x - 10;
  const rows = [];
  let row = null;
  bodies.forEach((b, i) => {
    const w = b.bbox.max[0] - b.bbox.min[0], d = b.bbox.max[1] - b.bbox.min[1];
    if (!row || (row.items.length && row.w + gap + w > maxW)) rows.push((row = { items: [], w: 0, d: 0 }));
    row.w += (row.items.length ? gap : 0) + w;
    row.d = Math.max(row.d, d);
    row.items.push({ i, w });
  });
  const totalD = rows.reduce((s, r) => s + r.d, 0) + gap * Math.max(0, rows.length - 1);
  const out = [];
  let top = BED.y / 2 + totalD / 2;
  for (const r of rows) {
    const yc = top - r.d / 2;
    let x = BED.x / 2 - r.w / 2;
    for (const { i, w } of r.items) {
      const b = bodies[i];
      out[i] = [x - b.bbox.min[0], yc - (b.bbox.min[1] + b.bbox.max[1]) / 2, -b.bbox.min[2]];
      x += w + gap;
    }
    top -= r.d + gap;
  }
  return out;
}

// Deterministic UUIDs (same spec -> same bytes).
const uuid = (kind, n) => `${kind.toString(16).padStart(8, '0')}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export function projectSettings(spec) {
  const fil = A1.filaments[spec.material] || A1.filaments.PLA;
  const { name: printerName, ...printer } = A1.printer;
  const { name: processName, ...process } = A1.process;
  const cfg = { ...printer, ...process };
  for (const [k, v] of Object.entries(fil.settings)) cfg[k] = Array.isArray(v) ? [].concat(v, v, v, v) : v;
  Object.assign(cfg, {
    from: 'project',
    name: 'project_settings',
    printer_settings_id: printerName,
    print_settings_id: processName,
    filament_settings_id: [fil.name, fil.name, fil.name, fil.name],
    filament_ids: [fil.id, fil.id, fil.id, fil.id],
    filament_colour: spec.colors.map((c) => c.toUpperCase()),
    inherits: '',
  });
  return cfg;
}

export function build3mf(spec, bodies) {
  const offsets = layout(bodies);
  const files = {};
  let objects = '', items = '', settings = '', instances = '', rels = '';
  bodies.forEach((b, i) => {
    const sub = 2 * i + 1, main = 2 * i + 2, path = `/3D/Objects/object_${i + 1}.model`;
    const { positions: P, indices: I } = b.mesh;
    const v = [], t = [];
    for (let k = 0; k < P.length; k += 3) v.push(`<vertex x="${f(P[k])}" y="${f(P[k + 1])}" z="${f(P[k + 2])}"/>`);
    for (let k = 0; k < I.length; k += 3) t.push(`<triangle v1="${I[k]}" v2="${I[k + 1]}" v3="${I[k + 2]}"/>`);
    files[path.slice(1)] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="${CORE}" xmlns:BambuStudio="${BBS}" xmlns:p="${PROD}" requiredextensions="p">
<metadata name="BambuStudio:3mfVersion">1</metadata>
<resources><object id="${sub}" p:UUID="${uuid(1, sub)}" type="model"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object></resources>
<build/>
</model>`);
    rels += `<Relationship Target="${path}" Id="rel-${i + 1}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>`;
    objects += `<object id="${main}" p:UUID="${uuid(2, main)}" type="model"><components><component p:path="${path}" objectid="${sub}" p:UUID="${uuid(3, sub)}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></components></object>`;
    const [dx, dy, dz] = offsets[i];
    items += `<item objectid="${main}" p:UUID="${uuid(4, main)}" transform="1 0 0 0 1 0 0 0 1 ${f(dx)} ${f(dy)} ${f(dz)}"/>`;
    const name = esc(b.name);
    settings += `  <object id="${main}">
    <metadata key="name" value="${name}"/>
    <metadata key="extruder" value="${b.slot}"/>
    <part id="${sub}" subtype="normal_part">
      <metadata key="name" value="${name}"/>
      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
      <metadata key="extruder" value="${b.slot}"/>
    </part>
  </object>
`;
    instances += `    <model_instance>
      <metadata key="object_id" value="${main}"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="${100 + i}"/>
    </model_instance>
`;
  });
  files['3D/3dmodel.model'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="${CORE}" xmlns:BambuStudio="${BBS}" xmlns:p="${PROD}" requiredextensions="p">
<metadata name="Application">${APP}</metadata>
<metadata name="BambuStudio:3mfVersion">1</metadata>
<metadata name="Title">${esc(spec.name)}</metadata>
<metadata name="Designer">Wortguss</metadata>
<resources>${objects}</resources>
<build p:UUID="${uuid(5, 1)}">${items}</build>
</model>`);
  files['3D/_rels/3dmodel.model.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`);
  files['Metadata/model_settings.config'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<config>
${settings}  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value=""/>
    <metadata key="locked" value="false"/>
${instances}  </plate>
</config>
`);
  files['Metadata/project_settings.config'] = strToU8(JSON.stringify(projectSettings(spec), null, 4));
  // The editable source travels with the print file.
  files['Metadata/wortguss.spec.json'] = strToU8(JSON.stringify(spec, null, 2));
  files['[Content_Types].xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="config" ContentType="text/xml"/><Default Extension="json" ContentType="application/json"/></Types>`);
  files['_rels/.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`);
  return zipSync(files, { level: 6, mtime: new Date('2020-01-01T00:00:00Z') }); // fixed time: same spec -> same bytes
}
