// 2D tilings and surface functions for fill and texture extras. Pure JS: polygons
// are arrays of [x, y] in mm, centred on the origin, covering a w × h area (plus a margin;
// the caller clips to the area).

export function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const regular = (cx, cy, r, n, a0 = 0) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(a0 + (2 * Math.PI * i) / n), cy + r * Math.sin(a0 + (2 * Math.PI * i) / n)]);

// Keeps patterns from exploding on tiny cells: at most ~maxCells cells.
export function fitCell(w, h, cell, maxCells = 2500) {
  return Math.max(cell, Math.sqrt(((w + 2 * cell) * (h + 2 * cell)) / maxCells));
}

// Clip a convex polygon by the half-plane a·x + b·y <= c (Sutherland–Hodgman).
function clipHalf(poly, a, b, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const fp = a * p[0] + b * p[1] - c, fq = a * q[0] + b * q[1] - c;
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const t = fp / (fp - fq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
  }
  return out;
}

// Cell polygons for a tiling. Returns { polys, lines } — lines: polygons are already
// the drawn strokes (truchet), not cells to be inset.
export function tiling(kind, w, h, cell, seed) {
  const X = w / 2 + cell, Y = h / 2 + cell;
  const polys = [];
  const rand = rng(seed + 1);
  if (kind === 'hex') {
    const dy = (cell * Math.sqrt(3)) / 2, R = cell / Math.sqrt(3);
    for (let j = -Math.ceil(Y / dy); j <= Math.ceil(Y / dy); j++)
      for (let i = -Math.ceil(X / cell) - 1; i <= Math.ceil(X / cell) + 1; i++) polys.push(regular(i * cell + (j & 1 ? cell / 2 : 0), j * dy, R, 6, Math.PI / 6));
  } else if (kind === 'triangle') {
    const th = (cell * Math.sqrt(3)) / 2;
    for (let j = -Math.ceil(Y / th); j <= Math.ceil(Y / th); j++)
      for (let i = -Math.ceil(X / cell) - 1; i <= Math.ceil(X / cell) + 1; i++) {
        const x = i * cell + (j & 1 ? cell / 2 : 0), y = j * th;
        polys.push([[x, y], [x + cell, y], [x + cell / 2, y + th]]);
        polys.push([[x + cell / 2, y + th], [x + cell, y], [x + 1.5 * cell, y + th]]);
      }
  } else if (kind === 'diamond') {
    for (let j = -Math.ceil(Y / cell) * 2; j <= Math.ceil(Y / cell) * 2; j++)
      for (let i = -Math.ceil(X / cell); i <= Math.ceil(X / cell); i++) polys.push(regular(i * cell + (j & 1 ? cell / 2 : 0), (j * cell) / 2, cell / 2, 4));
  } else if (kind === 'square' || kind === 'brick') {
    const cw = kind === 'brick' ? 2 * cell : cell;
    for (let j = -Math.ceil(Y / cell); j <= Math.ceil(Y / cell); j++)
      for (let i = -Math.ceil(X / cw) - 1; i <= Math.ceil(X / cw) + 1; i++) {
        const x = i * cw + (kind === 'brick' && j & 1 ? cw / 2 : 0), y = j * cell;
        polys.push([[x - cw / 2, y - cell / 2], [x + cw / 2, y - cell / 2], [x + cw / 2, y + cell / 2], [x - cw / 2, y + cell / 2]]);
      }
  } else if (kind === 'voronoi') {
    const n = Math.max(3, Math.round((4 * X * Y) / (cell * cell)));
    const pts = Array.from({ length: n }, () => [(rand() * 2 - 1) * X, (rand() * 2 - 1) * Y]);
    for (let i = 0; i < n; i++) {
      let poly = [[-X, -Y], [X, -Y], [X, Y], [-X, Y]];
      const [px, py] = pts[i];
      for (let j = 0; j < n && poly.length; j++) {
        if (j === i) continue;
        const [qx, qy] = pts[j];
        if (Math.abs(qx - px) > 3 * cell || Math.abs(qy - py) > 3 * cell) continue; // far points can't bound this cell
        // Keep the side closer to p: (q - p)·x <= (|q|² - |p|²) / 2
        poly = clipHalf(poly, qx - px, qy - py, (qx * qx + qy * qy - px * px - py * py) / 2);
      }
      if (poly.length > 2) polys.push(poly);
    }
  } else if (kind === 'girih') {
    // 8-pointed stars on a square grid; the material between them forms crosses.
    const R = cell / 2, r = R * 0.62;
    for (let j = -Math.ceil(Y / cell); j <= Math.ceil(Y / cell); j++)
      for (let i = -Math.ceil(X / cell); i <= Math.ceil(X / cell); i++) {
        const star = [];
        for (let k = 0; k < 16; k++) { const a = (Math.PI * k) / 8 + Math.PI / 8, rr = k % 2 ? r : R; star.push([i * cell + rr * Math.cos(a), j * cell + rr * Math.sin(a)]); }
        polys.push(star);
      }
  } else if (kind === 'penrose') {
    return { polys: penrose(Math.hypot(X, Y), cell), lines: false };
  } else if (kind === 'truchet') {
    return { polys: [], lines: true, arcs: truchetArcs(X, Y, cell, rand) };
  }
  return { polys, lines: false };
}

// Penrose P3 (rhombus) tiling by Robinson-triangle subdivision; rhombi have edge ~cell.
function penrose(R, cell) {
  const phi = (1 + Math.sqrt(5)) / 2;
  let tris = [];
  for (let i = 0; i < 10; i++) {
    let b = [R * Math.cos(((2 * i - 1) * Math.PI) / 10), R * Math.sin(((2 * i - 1) * Math.PI) / 10)];
    let c = [R * Math.cos(((2 * i + 1) * Math.PI) / 10), R * Math.sin(((2 * i + 1) * Math.PI) / 10)];
    if (i % 2 === 0) [b, c] = [c, b];
    tris.push([0, [0, 0], b, c]);
  }
  const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  let edge = R;
  while (edge / phi > cell && tris.length < 20000) {
    const next = [];
    for (const [col, A, B, C] of tris) {
      if (col === 0) { const P = lerp(A, B, 1 / phi); next.push([0, C, P, B], [1, P, C, A]); }
      else { const Q = lerp(B, A, 1 / phi), Rr = lerp(B, C, 1 / phi); next.push([1, Rr, C, A], [1, Q, Rr, B], [0, Rr, Q, A]); }
    }
    tris = next;
    edge /= phi;
  }
  // Pair triangles across their shared B–C edge into rhombi.
  const key = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const byEdge = new Map();
  for (const t of tris) { const k = [key(t[2]), key(t[3])].sort().join('|'); (byEdge.get(k) || byEdge.set(k, []).get(k)).push(t); }
  const polys = [];
  for (const ts of byEdge.values()) {
    if (ts.length === 2) polys.push([ts[0][1], ts[0][2], ts[1][1], ts[0][3]]);
    else polys.push([ts[0][1], ts[0][2], ts[0][3]]);
  }
  return polys;
}

// Truchet: each square cell gets two quarter-circle arcs joining edge midpoints.
function truchetArcs(X, Y, cell, rand) {
  const arcs = [];
  for (let j = -Math.ceil(Y / cell); j <= Math.ceil(Y / cell); j++)
    for (let i = -Math.ceil(X / cell); i <= Math.ceil(X / cell); i++) {
      const x0 = i * cell - cell / 2, y0 = j * cell - cell / 2;
      const flip = rand() < 0.5;
      // Arc centres at two opposite corners, radius cell/2, each spanning 90°.
      const corners = flip ? [[x0, y0, 0], [x0 + cell, y0 + cell, Math.PI]] : [[x0 + cell, y0, Math.PI / 2], [x0, y0 + cell, -Math.PI / 2]];
      for (const [cx, cy, a0] of corners) arcs.push({ cx, cy, r: cell / 2, a0, a1: a0 + Math.PI / 2 });
    }
  return arcs;
}

// A stroke of width wall along an arc, as a polygon.
export function arcBand({ cx, cy, r, a0, a1 }, wall, segs = 10) {
  const out = [], inn = [];
  for (let k = 0; k <= segs; k++) {
    const a = a0 + ((a1 - a0) * k) / segs;
    out.push([cx + (r + wall / 2) * Math.cos(a), cy + (r + wall / 2) * Math.sin(a)]);
    inn.push([cx + (r - wall / 2) * Math.cos(a), cy + (r - wall / 2) * Math.sin(a)]);
  }
  return [...out, ...inn.reverse()];
}

// ---------------------------------------------------------------- textures
function valueNoise(rand) {
  const N = 256, perm = Array.from({ length: N }, (_, i) => i), val = Array.from({ length: N }, () => rand());
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const h = (x, y) => val[perm[(perm[x & 255] + y) & 255]];
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = s(x - xi), fy = s(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

// Height function in [0, 1] for a texture kind; x, y in mm.
export function textureFn(kind, scale, seed) {
  const n = valueNoise(rng(seed + 7));
  const fbm = (x, y) => (n(x, y) * 0.57 + n(2 * x + 13, 2 * y + 7) * 0.29 + n(4 * x + 5, 4 * y + 31) * 0.14);
  const frac = (t) => t - Math.floor(t);
  switch (kind) {
    case 'bumps': return (x, y) => { const u = frac(x / scale) - 0.5, v = frac(y / scale) - 0.5; return Math.max(0, 1 - 4 * (u * u + v * v)); };
    case 'wood': return (x, y) => { const d = Math.hypot(x * 0.15, y + 3 * scale) / scale + 1.2 * fbm(x / (3 * scale), y / (3 * scale)); return 0.5 + 0.5 * Math.cos(2 * Math.PI * d); };
    case 'waves': return (x, y) => 0.5 + 0.5 * Math.sin(2 * Math.PI * (x / scale + 0.4 * fbm(x / (2 * scale), y / (2 * scale))));
    case 'knurl': return (x, y) => 1 - 2 * Math.max(Math.abs(frac((x + y) / scale) - 0.5), Math.abs(frac((x - y) / scale) - 0.5));
    default: return (x, y) => fbm(x / scale, y / scale);
  }
}

// Closed mesh between bottom(x, y) and top(x, y) over a w × h grid (top >= bottom).
export function heightfieldMesh(w, h, res, top, bottom) {
  const nx = Math.max(1, Math.ceil(w / res)), ny = Math.max(1, Math.ceil(h / res));
  const V = (nx + 1) * (ny + 1);
  const pos = new Float32Array(V * 2 * 3);
  const id = (i, j, b) => b * V + j * (nx + 1) + i;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const x = -w / 2 + (w * i) / nx, y = -h / 2 + (h * j) / ny;
    pos.set([x, y, top(x, y)], id(i, j, 0) * 3);
    pos.set([x, y, bottom(x, y)], id(i, j, 1) * 3);
  }
  const t = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = id(i, j, 0), b = id(i + 1, j, 0), c = id(i + 1, j + 1, 0), d = id(i, j + 1, 0);
    t.push(a, b, c, a, c, d);
    const A = id(i, j, 1), B = id(i + 1, j, 1), C = id(i + 1, j + 1, 1), D = id(i, j + 1, 1);
    t.push(A, C, B, A, D, C);
  }
  for (let i = 0; i < nx; i++) {
    // front (−y) and back (+y)
    let a = id(i, 0, 0), b = id(i + 1, 0, 0), A = id(i, 0, 1), B = id(i + 1, 0, 1);
    t.push(A, B, b, A, b, a);
    a = id(i, ny, 0); b = id(i + 1, ny, 0); A = id(i, ny, 1); B = id(i + 1, ny, 1);
    t.push(B, A, a, B, a, b);
  }
  for (let j = 0; j < ny; j++) {
    // left (−x) and right (+x)
    let p = id(0, j, 0), q = id(0, j + 1, 0), P = id(0, j, 1), Q = id(0, j + 1, 1);
    t.push(Q, P, p, Q, p, q);
    p = id(nx, j, 0); q = id(nx, j + 1, 0); P = id(nx, j, 1); Q = id(nx, j + 1, 1);
    t.push(P, Q, q, P, q, p);
  }
  return { positions: pos, indices: new Uint32Array(t) };
}

// ------------------------------------------------------------------ SVG logo
// Stored format: first line "W,H" (logo box, max side 1000), then one line per
// path: "N:" or "E:" (fill rule) and contours "x,y x,y;x,y ...". y is up.
export function decodeLogo(logo) {
  const lines = String(logo || '').split('\n').filter(Boolean);
  if (lines.length < 2) return null;
  const [W, H] = lines[0].split(',').map(Number);
  const paths = lines.slice(1).map((ln) => ({
    rule: ln[0] === 'E' ? 'EvenOdd' : 'NonZero',
    contours: ln.slice(2).split(';').map((c) => c.trim().split(' ').map((p) => p.split(',').map(Number))).filter((c) => c.length > 2),
  }));
  return { W, H, paths };
}
