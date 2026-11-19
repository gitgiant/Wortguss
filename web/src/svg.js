// SVG logo import: turns an uploaded .svg into the compact logo string stored in a
// spec (see decodeLogo in patterns.js). Filled shapes only; strokes are ignored.

// Path data -> subpaths (arrays of [x, y]), curves and arcs flattened.
export function parsePathD(d) {
  const toks = String(d).match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, qx = 0, qy = 0;
  const subs = [];
  let cur = null;
  const num = () => parseFloat(toks[i++]);
  const isNum = () => i < toks.length && !/^[a-zA-Z]$/.test(toks[i]);
  const line = (nx, ny) => { cur.push([nx, ny]); x = nx; y = ny; };
  const N = 10;
  while (i < toks.length) {
    if (/^[a-zA-Z]$/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') { if (cur) { subs.push(cur); x = sx; y = sy; cur = null; } continue; }
    if (!isNum()) { i++; continue; }
    if (C === 'M') {
      if (cur && cur.length > 1) subs.push(cur);
      x = ox + num(); y = oy + num(); sx = x; sy = y; cur = [[x, y]];
      cmd = rel ? 'l' : 'L';
    } else {
      if (!cur) cur = [[x, y]];
      if (C === 'L') line(ox + num(), oy + num());
      else if (C === 'H') line(ox + num(), y);
      else if (C === 'V') line(x, oy + num());
      else if (C === 'C' || C === 'S') {
        let x1, y1;
        if (C === 'C') { x1 = ox + num(); y1 = oy + num(); } else { x1 = 2 * x - cx; y1 = 2 * y - cy; }
        const x2 = ox + num(), y2 = oy + num(), ex = ox + num(), ey = oy + num();
        const x0 = x, y0 = y;
        for (let k = 1; k <= N; k++) { const t = k / N, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, e = t ** 3; cur.push([a * x0 + b * x1 + c * x2 + e * ex, a * y0 + b * y1 + c * y2 + e * ey]); }
        cx = x2; cy = y2; x = ex; y = ey; continue;
      } else if (C === 'Q' || C === 'T') {
        let x1, y1;
        if (C === 'Q') { x1 = ox + num(); y1 = oy + num(); } else { x1 = 2 * x - qx; y1 = 2 * y - qy; }
        const ex = ox + num(), ey = oy + num(), x0 = x, y0 = y;
        for (let k = 1; k <= N; k++) { const t = k / N, a = (1 - t) ** 2, b = 2 * (1 - t) * t, c = t * t; cur.push([a * x0 + b * x1 + c * ex, a * y0 + b * y1 + c * ey]); }
        qx = x1; qy = y1; x = ex; y = ey; continue;
      } else if (C === 'A') {
        const rx0 = Math.abs(num()), ry0 = Math.abs(num()), phi = (num() * Math.PI) / 180, large = num(), sweep = num(), ex = ox + num(), ey = oy + num();
        arcPoints(x, y, rx0, ry0, phi, large, sweep, ex, ey).forEach((p) => cur.push(p));
        x = ex; y = ey;
      } else { i++; }
    }
    cx = x; cy = y; qx = x; qy = y;
  }
  if (cur && cur.length > 2) subs.push(cur);
  return subs.filter((s) => s.length > 2);
}

// SVG endpoint arc -> points (SVG spec F.6.5).
function arcPoints(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  if (!rx || !ry) return [[x2, y2]];
  const cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const co = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 12)));
  const out = [];
  for (let k = 1; k <= n; k++) {
    const t = t1 + (dt * k) / n;
    out.push([cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp]);
  }
  return out;
}

function shapePoints(el) {
  const g = (a) => parseFloat(el.getAttribute(a) || '0');
  switch (el.tagName.toLowerCase()) {
    case 'path': return parsePathD(el.getAttribute('d') || '');
    case 'rect': { const x = g('x'), y = g('y'), w = g('width'), h = g('height'); return w && h ? [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]] : []; }
    case 'circle': case 'ellipse': {
      const cx = g('cx'), cy = g('cy'), rx = el.tagName === 'circle' ? g('r') : g('rx'), ry = el.tagName === 'circle' ? g('r') : g('ry');
      return rx && ry ? [Array.from({ length: 48 }, (_, k) => [cx + rx * Math.cos((k * Math.PI) / 24), cy + ry * Math.sin((k * Math.PI) / 24)])] : [];
    }
    case 'polygon': { const n = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number); const pts = []; for (let k = 0; k + 1 < n.length; k += 2) pts.push([n[k], n[k + 1]]); return pts.length > 2 ? [pts] : []; }
    default: return [];
  }
}

// Browser only: renders the SVG off-screen to read each shape's full transform.
export function svgToLogo(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.querySelector('svg');
  if (!root || doc.querySelector('parsererror')) throw new Error('That file is not a readable SVG.');
  root.querySelectorAll('script, foreignObject').forEach((n) => n.remove());
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:1000px;opacity:0;pointer-events:none';
  const svg = document.importNode(root, true);
  host.append(svg);
  document.body.append(host);
  try {
    const rootM = svg.getScreenCTM()?.inverse();
    const paths = [];
    for (const el of svg.querySelectorAll('path, rect, circle, ellipse, polygon')) {
      if (el.closest('defs, clipPath, mask, symbol')) continue;
      const cs = getComputedStyle(el);
      if (cs.fill === 'none' || cs.display === 'none' || cs.visibility === 'hidden') continue;
      const m = rootM && el.getScreenCTM() ? rootM.multiply(el.getScreenCTM()) : null;
      const pt = ([x, y]) => (m ? [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f] : [x, y]);
      const contours = shapePoints(el).map((c) => c.map(pt));
      if (contours.length) paths.push({ rule: cs.fillRule === 'evenodd' ? 'E' : 'N', contours });
    }
    if (!paths.length) throw new Error('No filled shapes found. Logos made of strokes need converting to filled paths first.');
    // Normalise: longest side 1000, y up.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of paths) for (const c of p.contours) for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const s = 1000 / Math.max(x1 - x0, y1 - y0);
    const W = Math.round((x1 - x0) * s), H = Math.round((y1 - y0) * s);
    const encode = (minStep, digits) => [`${W},${H}`, ...paths.map((p) => `${p.rule}:` + p.contours.map((c) => {
      const out = [];
      let last = null;
      for (const [x, y] of c) {
        const q = [(x - x0) * s, (y1 - y) * s];
        if (last && Math.hypot(q[0] - last[0], q[1] - last[1]) < minStep) continue;
        out.push(q); last = q;
      }
      return out.length > 2 ? out.map(([a, b]) => `${a.toFixed(digits)},${b.toFixed(digits)}`).join(' ') : '';
    }).filter(Boolean).join(';'))].join('\n');
    // Fit in ~50 KB by coarsening.
    for (const [step, dig] of [[0.5, 1], [1.5, 0], [3, 0], [6, 0], [12, 0]]) {
      const out = encode(step, dig);
      if (out.length <= 50000) return out;
    }
    throw new Error('That logo is too detailed. Simplify it, or export with fewer points.');
  } finally {
    host.remove();
  }
}
