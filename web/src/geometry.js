// Spec -> solids, using manifold-3d. Units are mm, Z up, every body is built
// flat side down at z = 0 so it is already oriented for printing.
// Helpers consume (delete) their manifold inputs to keep WASM memory flat.

import { SCREWS } from './catalog.js';

let M; // manifold toplevel

export function initGeometry(wasm) {
  M = wasm;
  M.setup();
  M.setMinCircularEdgeLength(0.6);
  M.setMinCircularAngle(6);
}

const del = (...xs) => xs.forEach((x) => x && x.delete && x.delete());

function sub(a, ...bs) {
  bs = bs.filter(Boolean);
  if (!bs.length) return a;
  const cut = bs.length === 1 ? bs[0] : M.Manifold.union(bs);
  const r = a.subtract(cut);
  del(a, cut);
  if (bs.length > 1) del(...bs);
  return r;
}

function uni(list) {
  list = list.filter(Boolean);
  if (list.length === 1) return list[0];
  const r = M.Manifold.union(list);
  del(...list);
  return r;
}

function move(m, x = 0, y = 0, z = 0) {
  const r = m.translate([x, y, z]);
  del(m);
  return r;
}

function rot(m, x, y, z) {
  const r = m.rotate([x, y, z]);
  del(m);
  return r;
}

// Rounded rectangle cross-section, centred on the origin.
function rrect(w, d, r) {
  r = Math.max(0, Math.min(r, w / 2 - 0.01, d / 2 - 0.01));
  if (r < 0.05) return M.CrossSection.square([w, d], true);
  const core = M.CrossSection.square([w - 2 * r, d - 2 * r], true);
  const out = core.offset(r, 'Round');
  del(core);
  return out;
}

// Prism of a rounded rectangle from z0 to z1.
function slab(w, d, r, z0, z1) {
  const cs = rrect(w, d, r);
  const m = M.Manifold.extrude(cs, z1 - z0);
  del(cs);
  return move(m, 0, 0, z0);
}

// Frustum between two rounded rectangles (used for chamfers).
function frustum(w0, d0, r0, w1, d1, r1, z0, z1) {
  const eps = 0.01;
  const a = slab(w0, d0, r0, z0, z0 + eps);
  const b = slab(w1, d1, r1, z1 - eps, z1);
  const h = M.Manifold.hull([a, b]);
  del(a, b);
  return h;
}

function cyl(h, d, z0 = 0) {
  return move(M.Manifold.cylinder(h, d / 2, d / 2, 0, false), 0, 0, z0);
}

function box(x0, y0, z0, x1, y1, z1) {
  return move(M.Manifold.cube([x1 - x0, y1 - y0, z1 - z0], false), x0, y0, z0);
}

// ---------------------------------------------------------------- generators

function gridfinityBin(p) {
  const P = 42;
  const W = P * p.gx - 0.5, D = P * p.gy - 0.5;
  const H = 7 * p.units;
  const BASE = 4.75;
  const parts = [];
  for (let i = 0; i < p.gx; i++) {
    for (let j = 0; j < p.gy; j++) {
      const cx = (i - (p.gx - 1) / 2) * P, cy = (j - (p.gy - 1) / 2) * P;
      // Standard foot: 0.8 chamfer, 1.8 straight, 2.15 chamfer (total 4.75).
      const f = uni([
        frustum(35.6, 35.6, 0.8, 37.2, 37.2, 1.6, 0, 0.8),
        slab(37.2, 37.2, 1.6, 0.8, 2.6),
        frustum(37.2, 37.2, 1.6, 41.5, 41.5, 3.75, 2.6, BASE),
      ]);
      parts.push(move(f, cx, cy, 0));
    }
  }
  parts.push(slab(W, D, 3.75, BASE - 0.01, H));
  let body = uni(parts);

  const floorZ = BASE + p.floor;
  const iw = W - 2 * p.wall, id = D - 2 * p.wall;
  const cuts = [slab(iw, id, Math.max(0.6, 3.75 - p.wall), floorZ, H + 1)];

  if (p.magnets) {
    for (let i = 0; i < p.gx; i++) for (let j = 0; j < p.gy; j++) {
      const cx = (i - (p.gx - 1) / 2) * P, cy = (j - (p.gy - 1) / 2) * P;
      for (const sx of [-13, 13]) for (const sy of [-13, 13]) cuts.push(move(cyl(2.4, 6.5, -0.01), cx + sx, cy + sy, 0));
    }
  }
  body = sub(body, ...cuts);

  const walls = [];
  const topZ = H - 0.6;
  for (let k = 1; k <= p.dividersX; k++) {
    const x = -iw / 2 + (iw * k) / (p.dividersX + 1);
    walls.push(box(x - p.wall / 2, -id / 2 - 0.1, floorZ - 0.1, x + p.wall / 2, id / 2 + 0.1, topZ));
  }
  for (let k = 1; k <= p.dividersY; k++) {
    const y = -id / 2 + (id * k) / (p.dividersY + 1);
    walls.push(box(-iw / 2 - 0.1, y - p.wall / 2, floorZ - 0.1, iw / 2 + 0.1, y + p.wall / 2, topZ));
  }
  if (walls.length) body = uni([body, ...walls]);
  return body;
}

function custom(p) {
  if (p.base === 'none') { const e = M.Manifold.cube([1, 1, 1]); const empty = e.subtract(e); del(e); return empty; }
  if (p.base === 'cylinder') return M.Manifold.cylinder(p.h, p.w / 2, p.w / 2, 0, false);
  return slab(p.w, p.d, p.radius, 0, p.h);
}

function enclosure(p, tol) {
  const W = p.w + 2 * p.wall, D = p.d + 2 * p.wall, H = p.h + p.floor;
  const innerR = Math.max(0.5, p.radius - p.wall);
  const cuts = [slab(p.w, p.d, innerR, p.floor, H + 1)];
  const boxM = sub(slab(W, D, p.radius, 0, H), ...cuts);
  const bodies = [{ name: 'box', mf: boxM, role: 'main' }];
  if (p.lid) {
    // Printed upside down: plate on the bed, lip pointing up.
    const lw = p.w - 2 * tol, ld = p.d - 2 * tol, ring = 1.6;
    const lip = sub(
      slab(lw, ld, innerR, p.lidThickness - 0.01, p.lidThickness + p.lipDepth),
      slab(lw - 2 * ring, ld - 2 * ring, Math.max(0.3, innerR - ring), p.lidThickness, p.lidThickness + p.lipDepth + 1),
    );
    const lid = uni([slab(W, D, p.radius, 0, p.lidThickness), lip]);
    bodies.push({ name: 'lid', mf: lid, slot: p.lidSlot, role: 'lid' });
  }
  return bodies;
}

function legoBrick(p, notches = 0) {
  const PITCH = 8, PLATE = 3.2, WALL = 1.2, TOP = 1.0;
  const W = p.nx * PITCH - 0.2, D = p.ny * PITCH - 0.2, H = p.plates * PLATE;
  let body = sub(box(-W / 2, -D / 2, 0, W / 2, D / 2, H), box(-W / 2 + WALL, -D / 2 + WALL, -1, W / 2 - WALL, D / 2 - WALL, H - TOP));
  const adds = [];
  const sx = (i) => (i - (p.nx - 1) / 2) * PITCH, sy = (j) => (j - (p.ny - 1) / 2) * PITCH;
  if (p.studs !== false) for (let i = 0; i < p.nx; i++) for (let j = 0; j < p.ny; j++) adds.push(move(cyl(1.7, p.studD), sx(i), sy(j), H - 0.01));
  const innerH = H - TOP + 0.01;
  if (p.nx > 1 && p.ny > 1) {
    for (let i = 0; i < p.nx - 1; i++) for (let j = 0; j < p.ny - 1; j++) {
      const t = sub(cyl(innerH, p.tubeOD), cyl(innerH + 2, 4.8, -1));
      adds.push(move(t, sx(i) + PITCH / 2, sy(j) + PITCH / 2, 0));
    }
  } else if (p.nx > 1 || p.ny > 1) {
    const n = Math.max(p.nx, p.ny) - 1;
    for (let k = 0; k < n; k++) {
      const x = p.nx > 1 ? sx(k) + PITCH / 2 : 0, y = p.ny > 1 ? sy(k) + PITCH / 2 : 0;
      adds.push(move(cyl(innerH, 3.2), x, y, 0));
    }
  }
  body = uni([body, ...adds]);
  if (notches > 0) {
    const cuts = [];
    for (let k = 0; k < notches; k++) {
      const x = -W / 2 + 2 + k * 1.6;
      cuts.push(box(x, -D / 2 - 1, H - 1.2, x + 0.8, -D / 2 + 0.5, H + 0.1));
    }
    body = sub(body, ...cuts);
  }
  return body;
}

// ------------------------------------------------------------ Lego Technic
const PITCH = 8;

// Hole cutter along +Z from z=0 to L, centred on x=y=0.
// Pin holes get the 6.2 mm counterbore at both faces when `cb` is set.
function holeCutter(type, d, L, cb) {
  if (type === 'axle') {
    const arm = 1.8 + (d - 4.8);
    const a = M.CrossSection.square([d, arm], true), b = M.CrossSection.square([arm, d], true);
    const cs = M.CrossSection.union(a, b);
    del(a, b);
    const m = M.Manifold.extrude(cs, L + 2);
    del(cs);
    return move(m, 0, 0, -1);
  }
  const parts = [cyl(L + 2, d, -1)];
  if (cb) parts.push(cyl(1.8, 6.3, -1), cyl(1.8, 6.3, L - 0.8));
  return uni(parts);
}

// Same cutter, running along +Y from y=-L/2 to L/2 at (x, z).
function holeAlongY(type, d, L, cb, x, z) {
  return move(rot(holeCutter(type, d, L, cb), -90, 0, 0), x, -L / 2, z);
}

function legoTechnic(p) {
  const n = p.length, D = 7.8, Z = 5.8;
  let body = legoBrick({ nx: n, ny: 1, plates: 3, studD: p.studD, tubeOD: 6.51, studs: true });
  const between = p.placement === 'between' && n > 1;
  const xs = between ? Array.from({ length: n - 1 }, (_, i) => (i - (n - 2) / 2) * PITCH) : Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * PITCH);
  // Solid bosses around each hole (bottom at z≈2, clear of a 1.7 mm stud below).
  body = uni([body, ...xs.map((x) => move(rot(cyl(D, 7.6), -90, 0, 0), x, -D / 2, Z))]);
  return sub(body, ...xs.map((x) => holeAlongY(p.holeType, p.holeD, D, p.holeType === 'pin', x, Z)));
}

function legoSlope(p) {
  const W = p.nx * PITCH - 0.2, D = p.ny * PITCH - 0.2, H = p.plates * 3.2, WALL = 1.2;
  const lip = Math.min(1.6, H - 1);
  const yb = D / 2 - (PITCH - 0.1);
  // Side profile in (y, z); extruded along X.
  const prof = [[-D / 2, 0], [D / 2, 0], [D / 2, H], [yb, H], [-D / 2, lip]];
  const toX = (cs, w) => {
    const m = M.Manifold.extrude(cs, w);
    del(cs);
    // (x=y, y=z, z=along) -> (along, y, z)
    return move(rot(m, 90, 0, 90), -w / 2, 0, 0);
  };
  const outerCs = () => new M.CrossSection([prof]);
  const outer = toX(outerCs(), W);
  const o = outerCs();
  const inset = o.offset(-WALL, 'Miter');
  const base = M.CrossSection.square([D - 2 * WALL, 1.3 + 1], false).translate([-(D - 2 * WALL) / 2, -1]);
  const cavCs = M.CrossSection.union(inset, base);
  del(o, inset, base);
  let body = sub(outer, toX(cavCs, W - 2 * WALL));

  const studs = [];
  const sx = (i) => (i - (p.nx - 1) / 2) * PITCH;
  for (let i = 0; i < p.nx; i++) studs.push(move(cyl(1.7, p.studD), sx(i), D / 2 - 3.9, H - 0.01));
  // Underside clutch: tubes (or pins on 1-wide slopes) between rows, trimmed to the outer shape.
  const under = [];
  for (let j = 1; j < p.ny; j++) {
    const y = -D / 2 + j * PITCH - 0.1;
    if (p.nx > 1) for (let i = 0; i < p.nx - 1; i++) under.push(move(sub(cyl(H - 1, 6.51), cyl(H + 1, 4.8, -1)), sx(i) + PITCH / 2, y, 0));
    else under.push(move(cyl(H - 1, 3.2), 0, y, 0));
  }
  if (under.length) {
    const u = uni(under);
    const clip = toX(outerCs(), W);
    under.length = 0;
    under.push(u.intersect(clip));
    del(u, clip);
  }
  return uni([body, ...studs, ...under]);
}

function legoRound(p) {
  const H = p.plates * 3.2;
  if (p.size === '1x1') {
    const body = sub(cyl(H, 7.8), cyl(H - 1 + 1, 4.9, -1));
    return uni([body, move(cyl(1.7, p.studD), 0, 0, H - 0.01)]);
  }
  const Dm = 15.8;
  let body = sub(cyl(H, Dm), cyl(H - 1 + 1, Dm - 2.4, -1));
  body = uni([body, cyl(H - 0.5, 6.51)]);
  const studs = [];
  for (const x of [-4, 4]) for (const y of [-4, 4]) studs.push(move(cyl(1.7, p.studD), x, y, H - 0.01));
  body = uni([body, ...studs]);
  return sub(body, holeCutter('axle', p.holeD, H + 2, false));
}

function legoLiftarm(p) {
  const n = p.holes, T = p.thin ? 3.8 : 7.8, L = (n - 1) * PITCH;
  const c1 = M.CrossSection.circle(3.6), c2 = M.CrossSection.circle(3.6).translate([L, 0]);
  const cs = M.CrossSection.hull([c1, c2]);
  del(c1, c2);
  let body = move(M.Manifold.extrude(cs, T), -L / 2, 0, 0);
  del(cs);
  const cuts = [];
  for (let i = 0; i < n; i++) {
    const type = p.axleEnds && (i === 0 || i === n - 1) ? 'axle' : p.holeType;
    cuts.push(move(holeCutter(type, p.holeD, T, type === 'pin' && !p.thin), -L / 2 + i * PITCH, 0, 0));
  }
  return sub(body, ...cuts);
}

function legoAxle(p) {
  const L = p.length * PITCH - 0.2, s = p.size, arm = 1.8;
  const a = M.CrossSection.square([s, arm], true), b = M.CrossSection.square([arm, s], true);
  const cs = M.CrossSection.union(a, b);
  del(a, b);
  const m = M.Manifold.extrude(cs, L);
  del(cs);
  // Lie it along X, resting on one arm.
  return move(rot(m, 0, 90, 0), -L / 2, 0, s / 2);
}

function legoPin(p) {
  const L = 15.8, half = 7.5;
  let body = uni([cyl(L, p.pinD), cyl(0.8, 5.6, half)]);
  if (p.slotted) body = sub(body, box(-0.45, -4, -1, 0.45, 4, 4.5), box(-0.45, -4, L - 4.5, 0.45, 4, L + 1));
  return body;
}

function legoCalibration(p) {
  const bodies = [];
  for (let k = 0; k < p.count; k++) {
    const d = Math.round((p.from + k * p.step) * 100) / 100;
    bodies.push({ name: `stud ${d.toFixed(2)}`, mf: legoBrick({ nx: 2, ny: 2, plates: 1, studD: d, tubeOD: 6.51 }, k + 1) });
  }
  return bodies;
}

function lBracket(p) {
  const { legA: A, legB: B, thickness: t, width: w } = p;
  const g = Math.min(p.gusset, A - t - 0.5, B - t - 0.5);
  const pts = [[0, 0], [A, 0], [A, t], [t + Math.max(0, g), t], [t, t + Math.max(0, g)], [t, B], [0, B]];
  const cs = new M.CrossSection([pts]);
  let m = M.Manifold.extrude(cs, w);
  del(cs);
  if (p.holeD > 0) {
    const cuts = [];
    const start = t + Math.max(0, g) + p.holeD;
    for (let i = 0; i < p.holesA; i++) {
      const x = start + ((A - start) * (i + 0.5)) / p.holesA;
      // Leg A is the strip 0 <= y <= t; hole runs along Y.
      const c = rot(M.Manifold.cylinder(t + 2, p.holeD / 2, p.holeD / 2, 0, false), -90, 0, 0);
      cuts.push(move(c, x, -1, w / 2));
    }
    for (let i = 0; i < p.holesB; i++) {
      const y = start + ((B - start) * (i + 0.5)) / p.holesB;
      const c = rot(M.Manifold.cylinder(t + 2, p.holeD / 2, p.holeD / 2, 0, false), 0, 90, 0);
      cuts.push(move(c, -1, y, w / 2));
    }
    m = sub(m, ...cuts);
  }
  return m;
}

export function resolveTools(list, library) {
  return list.map((t) => {
    if (typeof t === 'string') {
      const lib = library[t];
      return lib ? { name: t, ...lib } : { name: t, d: 8, missing: true };
    }
    return t;
  });
}

function toolHolder(p, tol, library) {
  const tools = resolveTools(p.tools, library);
  if (!tools.length) tools.push({ name: 'tool', d: 8 });
  const sizes = tools.map((t) => (t.d ? [t.d + 2 * tol, t.d + 2 * tol] : [t.w + 2 * tol, t.t + 2 * tol]));
  const W = sizes.reduce((s, [x]) => s + x, 0) + p.gap * (tools.length - 1) + 2 * p.wall;
  const D = Math.max(...sizes.map(([, y]) => y)) + 2 * p.wall;
  const H = p.depth + p.floor;
  const cuts = [];
  let x = -W / 2 + p.wall;
  tools.forEach((t, i) => {
    const [sx, sy] = sizes[i];
    if (t.d) cuts.push(move(cyl(p.depth + 1, sx), x + sx / 2, 0, p.floor));
    else cuts.push(move(slab(sx, sy, 0.6, p.floor, H + 1), x + sx / 2, 0, 0));
    x += sx + p.gap;
  });
  return sub(slab(W, D, 2, 0, H), ...cuts);
}

// ------------------------------------------------------------------ extras
// A face frame: origin (face centre), unit vectors u (right), v (up / towards back),
// n (out of the material), the body it belongs to, and the material thickness there.
const V = (x, y, z) => [x, y, z];
const frame = (o, u, v, n, role, thick) => ({ o, u, v, n, role, thick });

function bboxFrames(mf, role) {
  const { min, max } = mf.boundingBox();
  const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const sx = max[0] - min[0], sy = max[1] - min[1], sz = max[2] - min[2];
  return {
    top: frame(V(c[0], c[1], max[2]), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), role, sz),
    bottom: frame(V(c[0], c[1], min[2]), V(1, 0, 0), V(0, 1, 0), V(0, 0, -1), role, sz),
    front: frame(V(c[0], min[1], c[2]), V(1, 0, 0), V(0, 0, 1), V(0, -1, 0), role, sy),
    back: frame(V(c[0], max[1], c[2]), V(-1, 0, 0), V(0, 0, 1), V(0, 1, 0), role, sy),
    left: frame(V(min[0], c[1], c[2]), V(0, -1, 0), V(0, 0, 1), V(-1, 0, 0), role, sx),
    right: frame(V(max[0], c[1], c[2]), V(0, 1, 0), V(0, 0, 1), V(1, 0, 0), role, sx),
  };
}

// Inside faces of a hollow part: cavity w × d from floorZ to topZ, wall thickness.
function cavityFrames(w, d, floorZ, topZ, wall, floorThick) {
  const zc = (floorZ + topZ) / 2;
  return {
    floor: frame(V(0, 0, floorZ), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 'main', floorThick),
    inner_front: frame(V(0, -d / 2, zc), V(1, 0, 0), V(0, 0, 1), V(0, 1, 0), 'main', wall),
    inner_back: frame(V(0, d / 2, zc), V(-1, 0, 0), V(0, 0, 1), V(0, -1, 0), 'main', wall),
    inner_left: frame(V(-w / 2, 0, zc), V(0, -1, 0), V(0, 0, 1), V(1, 0, 0), 'main', wall),
    inner_right: frame(V(w / 2, 0, zc), V(0, 1, 0), V(0, 0, 1), V(-1, 0, 0), 'main', wall),
  };
}

function partFrames(part, list) {
  const main = list.find((b) => b.role === 'main') || list[0];
  const p = part.params;
  // A custom part's faces are its block's faces (also when it starts from nothing).
  const f = part.type === 'custom' ? bboxFrames(M.Manifold.cube([p.w, p.base === 'cylinder' ? p.w : p.d, p.h], false).translate([-p.w / 2, -(p.base === 'cylinder' ? p.w : p.d) / 2, 0]), 'main') : bboxFrames(main.mf, main.role || 'main');
  if (part.type === 'enclosure') {
    // Walls and floor are thin: "through" cuts only that wall.
    for (const k of ['front', 'back', 'left', 'right']) f[k].thick = p.wall;
    f.bottom.thick = p.floor;
    Object.assign(f, cavityFrames(p.w, p.d, p.floor, p.h + p.floor, p.wall, p.floor));
    if (list.some((b) => b.role === 'lid')) {
      // The lid prints upside down (flipped about X): seen from above on the closed box,
      // u = +X and "towards the back" = −Y in print coordinates.
      f.lid_top = frame(V(0, 0, 0), V(1, 0, 0), V(0, -1, 0), V(0, 0, -1), 'lid', p.lidThickness + p.lipDepth);
      f.lid_under = frame(V(0, 0, p.lidThickness), V(1, 0, 0), V(0, -1, 0), V(0, 0, 1), 'lid', p.lidThickness);
    }
  } else if (part.type === 'gridfinity_bin') {
    const W = 42 * p.gx - 0.5, D = 42 * p.gy - 0.5;
    for (const k of ['front', 'back', 'left', 'right']) f[k].thick = p.wall;
    Object.assign(f, cavityFrames(W - 2 * p.wall, D - 2 * p.wall, 4.75 + p.floor, 7 * p.units, p.wall, 4.75 + p.floor));
  }
  // Faces a part doesn't have fall back to the nearest outside face.
  const alias = { floor: 'top', inner_front: 'front', inner_back: 'back', inner_left: 'left', inner_right: 'right', lid_top: 'top', lid_under: 'bottom' };
  return (name) => f[name] || f[alias[name]] || f.top;
}

// Profiles in the face plane (x = u, y = v), centred on the origin.
const circle = (d, segs) => M.CrossSection.circle(d / 2, segs || 0);
const hexagon = (af) => M.CrossSection.circle(af / 2 / Math.cos(Math.PI / 6), 6);
function prism(cs, z0, z1) {
  const m = M.Manifold.extrude(cs, z1 - z0);
  del(cs);
  return move(m, 0, 0, z0);
}
function cone(d0, d1, z0, z1) {
  return move(M.Manifold.cylinder(z1 - z0, d0 / 2, d1 / 2, 0, false), 0, 0, z0);
}

// One feature in its face's local frame (z = 0 on the face, +z out of the material).
// Returns { add: [manifolds], cut: [manifolds] }.
function featureLocal(e, thick, tol) {
  const S = SCREWS[e.size] || SCREWS.M3;
  const sink = e.through ? thick + 0.5 : e.depth; // how far cuts go into the material
  const cutZ = [-sink, 0.3]; // overshoot slightly past the surface
  const add = [], cut = [];
  const put = (m) => (e.op === 'add' ? add : cut).push(m);
  const span = e.op === 'add' ? [-0.01, e.depth] : cutZ;
  switch (e.shape) {
    case 'box': put(prism(rrect(e.w, e.h, e.r), ...span)); break;
    case 'slot': put(prism(rrect(e.w, e.h, Math.min(e.w, e.h) / 2 - 0.001), ...span)); break;
    case 'cylinder': {
      const d1 = e.d2 > 0 ? e.d2 : e.d;
      put(e.op === 'add' ? cone(e.d, d1, ...span) : cone(d1, e.d, ...span));
      break;
    }
    case 'hex': put(prism(hexagon(e.d + (e.op === 'cut' ? tol : 0)), ...span)); break;
    case 'sphere': put(M.Manifold.sphere(e.d / 2, 0)); break;
    case 'magnet': cut.push(prism(circle(e.d + 2 * tol), -e.depth, 0.3)); break;
    case 'standoff': {
      add.push(cone(e.od, e.od, -0.01, e.depth));
      cut.push(cone(S.tap, S.tap, Math.max(0.6, e.depth - 8), e.depth + 0.3));
      break;
    }
    case 'insert_post': {
      const od = e.od > 0 ? e.od : S.insert + 3.2;
      add.push(cone(od, od, -0.01, e.depth));
      cut.push(cone(S.insert, S.insert, Math.max(0.6, e.depth - S.insertDepth - 0.5), e.depth + 0.3));
      break;
    }
    case 'screw_hole': {
      cut.push(cone(S.clear, S.clear, -(e.through ? thick + 0.5 : e.depth), 0.3));
      if (e.cb > 0) cut.push(cone(S.head + 0.8, S.head + 0.8, -e.cb, 0.3));
      break;
    }
    case 'countersunk': {
      cut.push(cone(S.clear, S.clear, -(e.through ? thick + 0.5 : e.depth), 0.3));
      const h = (S.cs - S.clear) / 2; // 90° head
      cut.push(cone(S.clear, S.cs + 0.4, -h, 0), cone(S.cs + 0.4, S.cs + 0.4, 0, 0.3));
      break;
    }
    case 'nut_trap': {
      cut.push(cone(S.clear, S.clear, -(e.through ? thick + 0.5 : e.depth), 0.3));
      cut.push(prism(hexagon(S.nut + 2 * tol), -(S.nutH + 0.3), 0.3));
      break;
    }
    case 'keyhole': {
      // Screw head goes in the round hole, then slides up the slot.
      const z0 = e.through ? -(thick + 0.5) : -e.depth;
      cut.push(prism(circle(S.head + 1), z0, 0.3));
      cut.push(move(prism(M.CrossSection.square([S.clear, e.len], false).translate([-S.clear / 2, 0]), z0, 0.3), 0, 0, 0));
      cut.push(move(cone(S.clear, S.clear, z0, 0.3), 0, e.len, 0));
      break;
    }
  }
  return { add, cut };
}

// Pattern offsets in the face plane, centred on (0, 0).
function patternOffsets(pt) {
  if (!pt) return [[0, 0]];
  const out = [];
  if (pt.type === 'row') for (let i = 0; i < pt.n; i++) out.push([(i - (pt.n - 1) / 2) * pt.dx, 0]);
  else if (pt.type === 'grid') for (let i = 0; i < pt.nx; i++) for (let j = 0; j < pt.ny; j++) out.push([(i - (pt.nx - 1) / 2) * pt.dx, (j - (pt.ny - 1) / 2) * pt.dy]);
  else if (pt.type === 'circle') for (let i = 0; i < pt.n; i++) { const a = (2 * Math.PI * i) / pt.n; out.push([pt.radius * Math.cos(a), pt.radius * Math.sin(a)]); }
  return out.length ? out : [[0, 0]];
}

function transformTo(m, fr, du, dv) {
  const [u, v, n, o] = [fr.u, fr.v, fr.n, fr.o];
  const t = [o[0] + u[0] * du + v[0] * dv, o[1] + u[1] * du + v[1] * dv, o[2] + u[2] * du + v[2] * dv];
  const r = m.transform([u[0], u[1], u[2], 0, v[0], v[1], v[2], 0, n[0], n[1], n[2], 0, t[0], t[1], t[2], 1]);
  del(m);
  return r;
}

function xyzFrame(e) {
  // Rotations in degrees about X, then Y, then Z, applied to the +Z-pointing feature.
  const rad = (d) => (d * Math.PI) / 180;
  const rotv = (p) => {
    let [x, y, z] = p;
    let c = Math.cos(rad(e.rx)), s = Math.sin(rad(e.rx));
    [y, z] = [y * c - z * s, y * s + z * c];
    c = Math.cos(rad(e.ry)); s = Math.sin(rad(e.ry));
    [x, z] = [x * c + z * s, -x * s + z * c];
    c = Math.cos(rad(e.rz)); s = Math.sin(rad(e.rz));
    [x, y] = [x * c - y * s, x * s + y * c];
    return [x, y, z];
  };
  return frame(V(e.x, e.y, e.z), rotv([1, 0, 0]), rotv([0, 1, 0]), rotv([0, 0, 1]), 'main', 1000);
}

function applyExtras(part, list, tol) {
  const faceOf = partFrames(part, list);
  const perBody = new Map(); // role -> {add, cut}
  for (const e of part.extras) {
    const fr = e.face === 'xyz' ? xyzFrame(e) : faceOf(e.face);
    const rot = e.rot || 0;
    for (const [pu, pv] of patternOffsets(e.pattern)) {
      const { add, cut } = featureLocal(e, fr.thick, tol);
      const place = (m) => transformTo(rot ? rot_(m, rot) : m, fr, e.u + pu, e.v + pv);
      const slot = perBody.get(fr.role) || { add: [], cut: [] };
      slot.add.push(...add.map(place));
      slot.cut.push(...cut.map(place));
      perBody.set(fr.role, slot);
    }
  }
  for (const [role, ops] of perBody) {
    // Extras go on the body with that role; parts without roles (several loose
    // bodies, like the clutch test) take them on their first body.
    const b = list.find((x) => x.role === role) || (role === 'main' ? list[0] : null);
    if (!b) { del(...ops.add, ...ops.cut); continue; }
    let m = b.mf;
    if (ops.add.length) m = uni([m, ...ops.add]);
    if (ops.cut.length) m = sub(m, ...ops.cut);
    b.mf = m;
  }
}
const rot_ = (m, deg) => rot(m, 0, 0, deg);

// ------------------------------------------------------------------- build

// Returns bodies: [{ partId, name, slot, mesh: {positions, indices}, bbox, volume, area }]
export function buildSpec(spec) {
  const out = [];
  for (const part of spec.parts) {
    let res;
    const p = part.params;
    switch (part.type) {
      case 'custom': res = custom(p); break;
      case 'gridfinity_bin': res = gridfinityBin(p); break;
      case 'enclosure': res = enclosure(p, spec.tolerance); break;
      case 'lego_brick': res = legoBrick(p); break;
      case 'lego_calibration': res = legoCalibration(p); break;
      case 'l_bracket': res = lBracket(p); break;
      case 'tool_holder': res = toolHolder(p, spec.tolerance, spec.tools); break;
      case 'lego_technic_brick': res = legoTechnic(p); break;
      case 'lego_slope': res = legoSlope(p); break;
      case 'lego_round': res = legoRound(p); break;
      case 'lego_liftarm': res = legoLiftarm(p); break;
      case 'lego_axle': res = legoAxle(p); break;
      case 'lego_pin': res = legoPin(p); break;
      default: continue;
    }
    const list = Array.isArray(res) ? res : [{ name: part.id, mf: res, role: 'main' }];
    if (part.extras?.length) applyExtras(part, list, spec.tolerance);
    const qty = part.qty || 1;
    for (const b of list) {
      const name = list.length > 1 && b.name !== part.id ? `${part.id} ${b.name}` : part.id;
      const data = extract(b.mf);
      del(b.mf);
      if (!data.mesh.indices.length) continue; // e.g. a custom part with nothing added yet
      for (let k = 0; k < qty; k++) out.push({ partId: part.id, name: qty > 1 ? `${name} #${k + 1}` : name, slot: b.slot || part.slot, ...data });
    }
  }
  return out;
}

function extract(mf) {
  const mesh = mf.getMesh();
  const np = mesh.numProp;
  const nv = mesh.vertProperties.length / np;
  const positions = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    positions[i * 3] = mesh.vertProperties[i * np];
    positions[i * 3 + 1] = mesh.vertProperties[i * np + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * np + 2];
  }
  const bb = mf.boundingBox();
  return {
    mesh: { positions, indices: new Uint32Array(mesh.triVerts) },
    bbox: { min: [...bb.min], max: [...bb.max] },
    volume: mf.volume(),
    area: mf.surfaceArea(),
  };
}

// Rough A1 estimate: two 0.4 mm perimeters + 15 % infill, ~22 g/h at standard speed.
export function estimate(bodies, density) {
  let grams = 0;
  for (const b of bodies) {
    const shellMm3 = Math.min(b.volume, b.area * 0.8);
    const mm3 = shellMm3 + 0.15 * Math.max(0, b.volume - shellMm3);
    grams += (mm3 / 1000) * density;
  }
  const hours = grams / 22 + 0.1 * bodies.length;
  return { grams, hours };
}
