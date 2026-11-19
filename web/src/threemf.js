// 3MF writer: a plain core-spec 3MF, the same shape Fusion or PrusaSlicer export
// and Bambu Studio imports as a third-party file. One object per body, laid out
// on the A1 plate, coloured by its AMS slot through a basematerials group.
// (A Bambu-project-style file was tried and Bambu Studio rejected it.)
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

// Binary STL of one body at its own origin (Bambu Studio arranges on import).
export function buildStl(body) {
  const P = body.mesh.positions, I = body.mesh.indices, n = I.length / 3;
  const dv = new DataView(new ArrayBuffer(84 + n * 50));
  const head = `Wortguss ${body.name}`.slice(0, 79);
  for (let k = 0; k < head.length; k++) dv.setUint8(k, head.charCodeAt(k) & 0x7f);
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < n; t++) {
    const a = I[3 * t] * 3, b = I[3 * t + 1] * 3, c = I[3 * t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const v of [nx / l, ny / l, nz / l]) { dv.setFloat32(o, v, true); o += 4; }
    for (const i of [a, b, c]) for (let k = 0; k < 3; k++) { dv.setFloat32(o, P[i + k], true); o += 4; }
    o += 2;
  }
  return new Uint8Array(dv.buffer);
}

const fileSafe = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'part';

export const stlName = (b) => `${fileSafe(b.name)}-slot${b.slot}.stl`;

// One STL per body, named with its AMS slot, so they import as separate objects.
export function stlFiles(bodies) {
  const out = {};
  for (const b of bodies) out[stlName(b)] = buildStl(b);
  return out;
}

export function build3mf(spec, bodies) {
  const offsets = layout(bodies);
  let objects = '', items = '';
  bodies.forEach((b, i) => {
    const id = i + 2; // 1 is the basematerials group
    const { positions: P, indices: I } = b.mesh;
    const v = [], t = [];
    for (let k = 0; k < P.length; k += 3) v.push(`<vertex x="${f(P[k])}" y="${f(P[k + 1])}" z="${f(P[k + 2])}"/>`);
    for (let k = 0; k < I.length; k += 3) t.push(`<triangle v1="${I[k]}" v2="${I[k + 1]}" v3="${I[k + 2]}"/>`);
    objects += `<object id="${id}" name="${esc(b.name)}" type="model" pid="1" pindex="${b.slot - 1}"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object>\n`;
    const [dx, dy, dz] = offsets[i];
    items += `<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${f(dx)} ${f(dy)} ${f(dz)}"/>`;
  });
  const mats = spec.colors.map((c, i) => `<base name="AMS slot ${i + 1}" displaycolor="${c.toUpperCase()}FF"/>`).join('');
  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`),
    '3D/3dmodel.model': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${esc(spec.name)}</metadata>
<metadata name="Application">Wortguss</metadata>
<resources>
<basematerials id="1">${mats}</basematerials>
${objects}</resources>
<build>${items}</build>
</model>
`),
  };
  return zipSync(files, { level: 6, mtime: new Date('2020-01-01T00:00:00Z') }); // fixed time: same spec -> same bytes
}
