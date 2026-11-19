// Text outlines from a bundled font (Inter Bold), as polygons in mm for extrusion.
import opentype from 'opentype.js';

let font = null;
export function loadFont(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  font = opentype.parse(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
}
export const fontReady = () => !!font;

// Flatten one line into closed contours. Font units have y up; we keep y up.
function lineContours(str, fontSize) {
  const path = font.getPath(str, 0, 0, fontSize); // y down
  const contours = [];
  let cur = null, x = 0, y = 0;
  const steps = 8;
  for (const c of path.commands) {
    if (c.type === 'M') { if (cur && cur.length > 2) contours.push(cur); cur = [[c.x, -c.y]]; x = c.x; y = c.y; }
    else if (c.type === 'L') { cur.push([c.x, -c.y]); x = c.x; y = c.y; }
    else if (c.type === 'Q') {
      for (let i = 1; i <= steps; i++) { const t = i / steps, a = (1 - t) ** 2, b = 2 * (1 - t) * t, d = t * t; cur.push([a * x + b * c.x1 + d * c.x, -(a * y + b * c.y1 + d * c.y)]); }
      x = c.x; y = c.y;
    } else if (c.type === 'C') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, d = 3 * (1 - t) * t * t, e = t ** 3;
        cur.push([a * x + b * c.x1 + d * c.x2 + e * c.x, -(a * y + b * c.y1 + d * c.y2 + e * c.y)]);
      }
      x = c.x; y = c.y;
    } else if (c.type === 'Z') { if (cur && cur.length > 2) contours.push(cur); cur = null; }
  }
  if (cur && cur.length > 2) contours.push(cur);
  return contours;
}

// Contours for (possibly multi-line) text, cap height `size` mm, centred on the origin.
export function textContours(text, size) {
  if (!font) throw new Error('font not loaded');
  const capUnits = font.tables.os2?.sCapHeight || font.unitsPerEm * 0.7;
  const fontSize = (size * font.unitsPerEm) / capUnits;
  const lines = String(text).split('\n').slice(0, 6);
  const lineGap = size * 1.6;
  const all = [];
  lines.forEach((ln, i) => {
    const cs = lineContours(ln, fontSize);
    if (!cs.length) return;
    let minX = Infinity, maxX = -Infinity;
    for (const c of cs) for (const [px] of c) { minX = Math.min(minX, px); maxX = Math.max(maxX, px); }
    const dx = -(minX + maxX) / 2;
    // Line i's baseline, so the block of lines is centred on y = 0 (cap height centred).
    const dy = ((lines.length - 1) / 2 - i) * lineGap - size / 2;
    for (const c of cs) all.push(c.map(([px, py]) => [px + dx, py + dy]));
  });
  return all;
}
