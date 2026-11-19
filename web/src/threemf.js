// 3MF writer: one object per body, laid out on the A1 plate, with a colour
// per body (core 3MF basematerials) and the AMS slot written as the Bambu
// Studio "extruder" in Metadata/model_settings.config.
import { zipSync, strToU8 } from 'fflate';
import { BED } from './catalog.js';

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

export function build3mf(spec, bodies) {
  const offsets = layout(bodies);
  const colorOf = (slot) => (spec.colors[slot - 1] || '#ffffff').toUpperCase() + 'FF';
  let objects = '';
  let items = '';
  let settings = '';
  bodies.forEach((b, i) => {
    const id = i + 2; // 1 is the basematerials group
    const { positions: P, indices: I } = b.mesh;
    const v = [];
    for (let k = 0; k < P.length; k += 3) v.push(`<vertex x="${f(P[k])}" y="${f(P[k + 1])}" z="${f(P[k + 2])}"/>`);
    const t = [];
    for (let k = 0; k < I.length; k += 3) t.push(`<triangle v1="${I[k]}" v2="${I[k + 1]}" v3="${I[k + 2]}"/>`);
    objects += `<object id="${id}" name="${esc(b.name)}" type="model" pid="1" pindex="${b.slot - 1}"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object>`;
    const [dx, dy, dz] = offsets[i];
    items += `<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${f(dx)} ${f(dy)} ${f(dz)}" printable="1"/>`;
    settings += `<object id="${id}"><metadata key="name" value="${esc(b.name)}"/><metadata key="extruder" value="${b.slot}"/><part id="1" subtype="normal_part"><metadata key="name" value="${esc(b.name)}"/><metadata key="extruder" value="${b.slot}"/></part></object>`;
  });
  const mats = [1, 2, 3, 4].map((s) => `<base name="AMS slot ${s}" displaycolor="${colorOf(s)}"/>`).join('');
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${esc(spec.name)}</metadata>
<metadata name="Designer">Wortguss</metadata>
<metadata name="Application">Wortguss</metadata>
<resources><basematerials id="1">${mats}</basematerials>${objects}</resources>
<build>${items}</build>
</model>`;
  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="text/xml"/><Default Extension="json" ContentType="application/json"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`),
    '3D/3dmodel.model': strToU8(model),
    'Metadata/model_settings.config': strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<config>${settings}</config>`),
    // The editable source travels with the print file.
    'Metadata/wortguss.spec.json': strToU8(JSON.stringify(spec, null, 2)),
  };
  return zipSync(files, { level: 6 });
}
