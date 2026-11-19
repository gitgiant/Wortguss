// Spec -> solids, using manifold-3d. Units are mm, Z up, every body is built
// flat side down at z = 0 so it is already oriented for printing.
// Helpers consume (delete) their manifold inputs to keep WASM memory flat.

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

function enclosure(p, tol) {
  const W = p.w + 2 * p.wall, D = p.d + 2 * p.wall, H = p.h + p.floor;
  const innerR = Math.max(0.5, p.radius - p.wall);
  const cuts = [slab(p.w, p.d, innerR, p.floor, H + 1)];
  if (p.cableHole > 0) {
    const zc = p.floor + Math.min(p.h / 2, p.cableHole / 2 + 2);
    const c = rot(M.Manifold.cylinder(p.wall + 2, p.cableHole / 2, p.cableHole / 2, 0, false), -90, 0, 0);
    // Through the front wall (−Y side).
    cuts.push(move(c, 0, -D / 2 - 1, zc));
  }
  const boxM = sub(slab(W, D, p.radius, 0, H), ...cuts);
  const bodies = [{ name: 'box', mf: boxM }];
  if (p.lid) {
    // Printed upside down: plate on the bed, lip pointing up.
    const lw = p.w - 2 * tol, ld = p.d - 2 * tol, ring = 1.6;
    const lip = sub(
      slab(lw, ld, innerR, p.lidThickness - 0.01, p.lidThickness + p.lipDepth),
      slab(lw - 2 * ring, ld - 2 * ring, Math.max(0.3, innerR - ring), p.lidThickness, p.lidThickness + p.lipDepth + 1),
    );
    const lid = uni([slab(W, D, p.radius, 0, p.lidThickness), lip]);
    bodies.push({ name: 'lid', mf: lid, slot: p.lidSlot });
  }
  return bodies;
}

function legoBrick(p, notches = 0) {
  const PITCH = 8, PLATE = 3.2, WALL = 1.2, TOP = 1.0;
  const W = p.nx * PITCH - 0.2, D = p.ny * PITCH - 0.2, H = p.plates * PLATE;
  let body = sub(box(-W / 2, -D / 2, 0, W / 2, D / 2, H), box(-W / 2 + WALL, -D / 2 + WALL, -1, W / 2 - WALL, D / 2 - WALL, H - TOP));
  const adds = [];
  const sx = (i) => (i - (p.nx - 1) / 2) * PITCH, sy = (j) => (j - (p.ny - 1) / 2) * PITCH;
  for (let i = 0; i < p.nx; i++) for (let j = 0; j < p.ny; j++) adds.push(move(cyl(1.7, p.studD), sx(i), sy(j), H - 0.01));
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

// ------------------------------------------------------------------- build

// Returns bodies: [{ partId, name, slot, mesh: {positions, indices}, bbox, volume, area }]
export function buildSpec(spec) {
  const out = [];
  for (const part of spec.parts) {
    let res;
    const p = part.params;
    switch (part.type) {
      case 'gridfinity_bin': res = gridfinityBin(p); break;
      case 'enclosure': res = enclosure(p, spec.tolerance); break;
      case 'lego_brick': res = legoBrick(p); break;
      case 'lego_calibration': res = legoCalibration(p); break;
      case 'l_bracket': res = lBracket(p); break;
      case 'tool_holder': res = toolHolder(p, spec.tolerance, spec.tools); break;
      default: continue;
    }
    const list = Array.isArray(res) ? res : [{ name: part.id, mf: res }];
    for (const b of list) {
      const name = list.length > 1 ? `${part.id} ${b.name}` : part.id;
      out.push({ partId: part.id, name, slot: b.slot || part.slot, ...extract(b.mf) });
      del(b.mf);
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
