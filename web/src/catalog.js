// Part-type catalogue: the single source of truth for parameters, defaults and
// limits. The page builds its forms from this, the spec normaliser clamps to it,
// and the Claude prompt describes it. Desktop (build123d) generators should
// implement the same types and parameter names.

export const SPEC_VERSION = 1;

export const MATERIALS = {
  PLA: { density: 1.24, tolerance: 0.2 },
  PETG: { density: 1.27, tolerance: 0.25 },
};

export const BED = { x: 256, y: 256, z: 256 }; // Bambu Lab A1

export const TYPES = {
  custom: {
    label: 'Custom part',
    blurb: 'Starts from a plain block, cylinder or nothing; build the rest with extras.',
    params: {
      base: { label: 'Start from', type: 'choice', options: ['box', 'cylinder', 'none'], default: 'box' },
      w: { label: 'Width', type: 'num', unit: 'mm', min: 1, max: 250, step: 0.5, default: 40 },
      d: { label: 'Depth', type: 'num', unit: 'mm', min: 1, max: 250, step: 0.5, default: 30 },
      h: { label: 'Height', type: 'num', unit: 'mm', min: 0.4, max: 250, step: 0.2, default: 10 },
      radius: { label: 'Corner radius', type: 'num', unit: 'mm', min: 0, max: 50, step: 0.5, default: 2 },
    },
  },
  gridfinity_bin: {
    label: 'Gridfinity bin',
    blurb: '42 mm grid, 7 mm height units, optional magnet pockets and dividers.',
    params: {
      gx: { label: 'Grid units X', type: 'int', min: 1, max: 6, default: 2 },
      gy: { label: 'Grid units Y', type: 'int', min: 1, max: 6, default: 1 },
      units: { label: 'Height units (7 mm)', type: 'int', min: 2, max: 20, default: 6 },
      wall: { label: 'Wall', type: 'num', unit: 'mm', min: 0.8, max: 4, step: 0.1, default: 1.2 },
      floor: { label: 'Floor above base', type: 'num', unit: 'mm', min: 0.6, max: 6, step: 0.1, default: 1.2 },
      dividersX: { label: 'Dividers across X', type: 'int', min: 0, max: 10, default: 0 },
      dividersY: { label: 'Dividers across Y', type: 'int', min: 0, max: 10, default: 0 },
      magnets: { label: 'Magnet pockets (6×2 mm)', type: 'bool', default: false },
    },
  },
  enclosure: {
    label: 'Enclosure with lid',
    blurb: 'Box sized by its inside dimensions, plus a press-fit lid printed as a second part.',
    params: {
      w: { label: 'Inside width', type: 'num', unit: 'mm', min: 10, max: 240, step: 0.5, default: 60 },
      d: { label: 'Inside depth', type: 'num', unit: 'mm', min: 10, max: 240, step: 0.5, default: 40 },
      h: { label: 'Inside height', type: 'num', unit: 'mm', min: 5, max: 240, step: 0.5, default: 25 },
      wall: { label: 'Wall', type: 'num', unit: 'mm', min: 1, max: 6, step: 0.1, default: 2 },
      floor: { label: 'Floor', type: 'num', unit: 'mm', min: 0.8, max: 6, step: 0.1, default: 2 },
      radius: { label: 'Corner radius', type: 'num', unit: 'mm', min: 0, max: 20, step: 0.5, default: 3 },
      lid: { label: 'Make lid', type: 'bool', default: true },
      lidSlot: { label: 'Lid AMS slot', type: 'int', min: 1, max: 4, default: 2 },
      lidThickness: { label: 'Lid thickness', type: 'num', unit: 'mm', min: 1, max: 6, step: 0.1, default: 2 },
      lipDepth: { label: 'Lid lip depth', type: 'num', unit: 'mm', min: 1, max: 10, step: 0.5, default: 3 },
    },
  },
  lego_brick: {
    label: 'Lego brick, plate or tile',
    blurb: '8 mm stud pitch, 3.2 mm plates. 1 plate high is a plate; turn studs off for a tile. Tune stud Ø with the clutch test.',
    params: {
      nx: { label: 'Studs X', type: 'int', min: 1, max: 16, default: 4 },
      ny: { label: 'Studs Y', type: 'int', min: 1, max: 16, default: 2 },
      plates: { label: 'Height in plates (3 = brick)', type: 'int', min: 1, max: 12, default: 3 },
      studD: { label: 'Stud Ø', type: 'num', unit: 'mm', min: 4.5, max: 5.1, step: 0.01, default: 4.8 },
      tubeOD: { label: 'Tube outer Ø', type: 'num', unit: 'mm', min: 6.2, max: 6.8, step: 0.01, default: 6.51 },
      studs: { label: 'Studs on top (off = tile)', type: 'bool', default: true },
    },
  },
  lego_technic_brick: {
    label: 'Technic brick with holes',
    blurb: '1×N brick with cross holes. Holes under the studs give N holes (1×2 with 2 holes); between the studs gives N−1.',
    params: {
      length: { label: 'Length (studs)', type: 'int', min: 1, max: 16, default: 2 },
      placement: { label: 'Hole position', type: 'choice', options: ['studs', 'between'], default: 'studs' },
      holeType: { label: 'Hole type', type: 'choice', options: ['pin', 'axle'], default: 'pin' },
      holeD: { label: 'Hole Ø', type: 'num', unit: 'mm', min: 4.6, max: 5.4, step: 0.05, default: 4.9 },
      studD: { label: 'Stud Ø', type: 'num', unit: 'mm', min: 4.5, max: 5.1, step: 0.01, default: 4.8 },
    },
  },
  lego_slope: {
    label: 'Lego slope',
    blurb: 'Sloped brick with studs on the back row. 2 rows deep is a 45° slope.',
    params: {
      nx: { label: 'Width (studs)', type: 'int', min: 1, max: 8, default: 2 },
      ny: { label: 'Depth (rows)', type: 'int', min: 2, max: 4, default: 2 },
      plates: { label: 'Height in plates', type: 'int', min: 2, max: 6, default: 3 },
      studD: { label: 'Stud Ø', type: 'num', unit: 'mm', min: 4.5, max: 5.1, step: 0.01, default: 4.8 },
    },
  },
  lego_round: {
    label: 'Lego round brick',
    blurb: '1×1 or 2×2 round brick. The 2×2 has an axle hole through the middle.',
    params: {
      size: { label: 'Size', type: 'choice', options: ['1x1', '2x2'], default: '2x2' },
      plates: { label: 'Height in plates', type: 'int', min: 1, max: 12, default: 3 },
      holeD: { label: 'Axle hole size', type: 'num', unit: 'mm', min: 4.6, max: 5.4, step: 0.05, default: 4.9 },
      studD: { label: 'Stud Ø', type: 'num', unit: 'mm', min: 4.5, max: 5.1, step: 0.01, default: 4.8 },
    },
  },
  lego_liftarm: {
    label: 'Technic liftarm',
    blurb: 'Studless beam, printed flat so the holes come out round.',
    params: {
      holes: { label: 'Holes', type: 'int', min: 2, max: 15, default: 5 },
      thin: { label: 'Thin (half thickness)', type: 'bool', default: false },
      holeType: { label: 'Hole type', type: 'choice', options: ['pin', 'axle'], default: 'pin' },
      axleEnds: { label: 'Axle holes at the ends', type: 'bool', default: false },
      holeD: { label: 'Hole Ø', type: 'num', unit: 'mm', min: 4.6, max: 5.4, step: 0.05, default: 4.9 },
    },
  },
  lego_axle: {
    label: 'Technic axle',
    blurb: 'Cross axle, printed lying on one arm.',
    params: {
      length: { label: 'Length (studs)', type: 'int', min: 2, max: 16, default: 4 },
      size: { label: 'Cross size', type: 'num', unit: 'mm', min: 4.4, max: 4.9, step: 0.05, default: 4.7 },
    },
  },
  lego_pin: {
    label: 'Technic pin',
    blurb: 'Two-stud pin with a centre collar, printed standing. Slots at the ends add friction.',
    params: {
      pinD: { label: 'Pin Ø', type: 'num', unit: 'mm', min: 4.5, max: 5.0, step: 0.05, default: 4.8 },
      slotted: { label: 'Friction slots', type: 'bool', default: true },
    },
  },
  lego_calibration: {
    label: 'Lego clutch calibration',
    blurb: 'A row of 2×2 plates with stepped stud Ø. Notches on one side count up from the smallest.',
    params: {
      from: { label: 'Smallest stud Ø', type: 'num', unit: 'mm', min: 4.5, max: 5.0, step: 0.01, default: 4.7 },
      step: { label: 'Step', type: 'num', unit: 'mm', min: 0.01, max: 0.1, step: 0.01, default: 0.05 },
      count: { label: 'Samples', type: 'int', min: 2, max: 8, default: 5 },
    },
  },
  l_bracket: {
    label: 'L bracket',
    blurb: 'Prints with the L profile flat on the bed for strong layers. M3 clearance holes by default.',
    params: {
      width: { label: 'Width', type: 'num', unit: 'mm', min: 5, max: 200, step: 0.5, default: 20 },
      legA: { label: 'Leg A length', type: 'num', unit: 'mm', min: 8, max: 200, step: 0.5, default: 40 },
      legB: { label: 'Leg B length', type: 'num', unit: 'mm', min: 8, max: 200, step: 0.5, default: 30 },
      thickness: { label: 'Thickness', type: 'num', unit: 'mm', min: 1.5, max: 15, step: 0.1, default: 4 },
      holeD: { label: 'Hole Ø', type: 'num', unit: 'mm', min: 0, max: 12, step: 0.1, default: 3.4 },
      holesA: { label: 'Holes in leg A', type: 'int', min: 0, max: 6, default: 2 },
      holesB: { label: 'Holes in leg B', type: 'int', min: 0, max: 6, default: 1 },
      gusset: { label: 'Gusset', type: 'num', unit: 'mm', min: 0, max: 60, step: 0.5, default: 8 },
    },
  },
  tool_holder: {
    label: 'Tool holder',
    blurb: 'A block with one hole per tool. Tools come from the saved tool library or inline sizes; clearance is added automatically.',
    params: {
      tools: { label: 'Tools', type: 'tools', default: ['screwdriver-small', 'screwdriver-large', 'hex-key-set'] },
      depth: { label: 'Hole depth', type: 'num', unit: 'mm', min: 5, max: 120, step: 1, default: 30 },
      gap: { label: 'Gap between holes', type: 'num', unit: 'mm', min: 1, max: 30, step: 0.5, default: 4 },
      wall: { label: 'Outer wall', type: 'num', unit: 'mm', min: 1.2, max: 10, step: 0.1, default: 3 },
      floor: { label: 'Floor', type: 'num', unit: 'mm', min: 0.8, max: 10, step: 0.1, default: 2 },
    },
  },
};

// Saved tool library: measured sizes for reuse in holders.
// Round tools take `d`; rectangular ones take `w` × `t`.
export const DEFAULT_TOOLS = {
  'screwdriver-small': { d: 6.0, note: 'Shaft-side grip, measured at widest' },
  'screwdriver-large': { d: 9.5 },
  'hex-key-set': { w: 22, t: 9 },
  'flush-cutters': { w: 18, t: 10 },
  'caliper-jaw': { w: 16, t: 4 },
};

export const DEFAULT_COLORS = ['#f2f2ef', '#d64933', '#2b2d42', '#2a9d8f'];

export const PRESETS = [
  {
    key: 'gridfinity',
    name: 'Gridfinity bin 2×1',
    parts: [{ id: 'bin', type: 'gridfinity_bin', slot: 1, params: { gx: 2, gy: 1, units: 6, dividersX: 1 } }],
  },
  {
    key: 'enclosure',
    name: 'Sensor enclosure',
    parts: [{ id: 'box', type: 'enclosure', slot: 3, params: { w: 60, d: 40, h: 25, lidSlot: 2 }, extras: [
      { op: 'cut', shape: 'slot', face: 'front', w: 9.5, h: 3.8, v: -5.5, through: true },
      { op: 'cut', shape: 'cylinder', face: 'back', d: 6, v: -3.5, through: true },
      { op: 'add', shape: 'standoff', face: 'floor', size: 'M2.5', depth: 5, pattern: { type: 'grid', nx: 2, ny: 2, dx: 48, dy: 28 } },
    ] }],
  },
  {
    key: 'lego',
    name: 'Brick 2×4',
    parts: [{ id: 'brick', type: 'lego_brick', slot: 2, params: { nx: 4, ny: 2, plates: 3 } }],
  },
  {
    key: 'technic-1x2',
    name: 'Technic brick 1×2, 2 holes',
    parts: [{ id: 'technic', type: 'lego_technic_brick', slot: 2, params: { length: 2, placement: 'studs' } }],
  },
  {
    key: 'lego-kit',
    name: 'Lego part kit',
    parts: [
      { id: 'brick2x4', type: 'lego_brick', slot: 2, params: { nx: 4, ny: 2, plates: 3 } },
      { id: 'brick2x2', type: 'lego_brick', slot: 2, params: { nx: 2, ny: 2, plates: 3 } },
      { id: 'plate2x4', type: 'lego_brick', slot: 3, params: { nx: 4, ny: 2, plates: 1 } },
      { id: 'tile2x2', type: 'lego_brick', slot: 1, params: { nx: 2, ny: 2, plates: 1, studs: false } },
      { id: 'technic1x2', type: 'lego_technic_brick', slot: 3, params: { length: 2, placement: 'studs' } },
      { id: 'technic1x4', type: 'lego_technic_brick', slot: 3, params: { length: 4, placement: 'between' } },
      { id: 'slope2x2', type: 'lego_slope', slot: 2, params: { nx: 2, ny: 2 } },
      { id: 'round2x2', type: 'lego_round', slot: 4, params: { size: '2x2' } },
      { id: 'liftarm5', type: 'lego_liftarm', slot: 4, params: { holes: 5, axleEnds: true } },
      { id: 'axle4', type: 'lego_axle', slot: 1, params: { length: 4 } },
      { id: 'pin', type: 'lego_pin', slot: 1, qty: 4, params: {} },
    ],
  },
  {
    key: 'lego-cal',
    name: 'Lego clutch test',
    parts: [{ id: 'cal', type: 'lego_calibration', slot: 1, params: {} }],
  },
  {
    key: 'custom',
    name: 'Wall plate',
    parts: [{ id: 'plate', type: 'custom', slot: 1, params: { base: 'box', w: 80, d: 50, h: 4, radius: 4 }, extras: [
      { op: 'cut', shape: 'countersunk', face: 'top', size: 'M4', through: true, pattern: { type: 'row', n: 2, dx: 60 } },
      { op: 'add', shape: 'cylinder', face: 'top', d: 12, depth: 20, v: 5 },
      { op: 'cut', shape: 'hex', face: 'top', d: 8, depth: 15, v: 5 },
    ] }],
  },
  {
    key: 'bracket',
    name: 'Shelf bracket',
    parts: [{ id: 'bracket', type: 'l_bracket', slot: 3, params: {} }],
  },
  {
    key: 'tools',
    name: 'Bench tool holder',
    parts: [{ id: 'holder', type: 'tool_holder', slot: 4, params: {} }],
  },
];

// ------------------------------------------------------------------ extras
// Features added to or cut from any part, placed on a named face.
// u = right as you look at the face from outside (top/bottom/floor/lid: seen from above),
// v = up on walls, towards the back on top/bottom/floor/lid faces. Offsets are from the
// face's centre. Adds grow out of the face; cuts sink into it (or go through).
export const FACES = {
  top: 'Top', bottom: 'Bottom', front: 'Front', back: 'Back', left: 'Left', right: 'Right',
  floor: 'Inside floor', inner_front: 'Inside front wall', inner_back: 'Inside back wall',
  inner_left: 'Inside left wall', inner_right: 'Inside right wall',
  lid_top: 'Lid top', lid_under: 'Lid underside', xyz: 'Free position (XYZ)',
};

// Metric hardware, mm. clear = clearance hole, tap = hole a screw cuts its own thread in,
// insert = heat-set insert hole (CNC Kitchen / Ruthex style), nut = across flats, cb = head.
export const SCREWS = {
  M2: { clear: 2.4, tap: 1.8, insert: 3.2, insertDepth: 4, nut: 4.0, nutH: 1.6, head: 4.0, cs: 4.2 },
  'M2.5': { clear: 2.9, tap: 2.2, insert: 3.6, insertDepth: 4.5, nut: 5.0, nutH: 2.0, head: 4.7, cs: 5.0 },
  M3: { clear: 3.4, tap: 2.6, insert: 4.0, insertDepth: 5.7, nut: 5.5, nutH: 2.4, head: 5.7, cs: 6.3 },
  M4: { clear: 4.5, tap: 3.4, insert: 5.6, insertDepth: 8.1, nut: 7.0, nutH: 3.2, head: 7.2, cs: 8.4 },
  M5: { clear: 5.5, tap: 4.2, insert: 6.4, insertDepth: 9.5, nut: 8.0, nutH: 4.0, head: 8.7, cs: 10.4 },
};

// Field sets per shape. `op` fixed means the shape is always that op.
const N = (label, min, max, def, step = 0.1) => ({ label, type: 'num', unit: 'mm', min, max, default: def, step });
export const EXTRA_SHAPES = {
  box: { label: 'Box', fields: { w: N('Width', 0.4, 250, 10), h: N('Height', 0.4, 250, 10), r: N('Corner radius', 0, 50, 0.5), depth: N('Depth', 0.2, 250, 5) } },
  cylinder: { label: 'Cylinder / cone', fields: { d: N('Ø', 0.4, 250, 6), d2: N('Top Ø (0 = same)', 0, 250, 0), depth: N('Depth', 0.2, 250, 5) } },
  sphere: { label: 'Sphere / dome', fields: { d: N('Ø', 0.4, 250, 10) } },
  slot: { label: 'Slot (rounded ends)', fields: { w: N('Length', 0.4, 250, 9.5), h: N('Width', 0.4, 250, 3.8), depth: N('Depth', 0.2, 250, 5) } },
  hex: { label: 'Hex prism', fields: { d: N('Across flats', 0.4, 250, 5.5), depth: N('Depth', 0.2, 250, 3) } },
  standoff: { label: 'PCB standoff', op: 'add', fields: { od: N('Outer Ø', 2, 30, 5.5), depth: N('Height', 1, 100, 5) } },
  insert_post: { label: 'Heat-set insert post', op: 'add', fields: { od: N('Outer Ø (0 = auto)', 0, 30, 0), depth: N('Height', 2, 100, 8) } },
  screw_hole: { label: 'Screw hole (counterbored)', op: 'cut', fields: { cb: N('Counterbore depth (0 = none)', 0, 50, 3), depth: N('Depth', 0.5, 250, 5) } },
  countersunk: { label: 'Countersunk screw hole', op: 'cut', fields: { depth: N('Depth', 0.5, 250, 5) } },
  nut_trap: { label: 'Nut trap', op: 'cut', fields: { depth: N('Screw hole depth', 0.5, 250, 5) } },
  keyhole: { label: 'Keyhole (hang on a screw)', op: 'cut', fields: { len: N('Slot length', 2, 50, 8), depth: N('Depth', 0.5, 250, 3) } },
  magnet: { label: 'Magnet pocket', op: 'cut', fields: { d: N('Magnet Ø', 1, 50, 6), depth: N('Magnet height', 0.5, 50, 2) } },
};
export const SCREW_SHAPES = new Set(['standoff', 'insert_post', 'screw_hole', 'countersunk', 'nut_trap', 'keyhole']);

export const PATTERNS = {
  none: { label: 'Single' },
  row: { label: 'Row', fields: { n: { label: 'Count', type: 'int', min: 1, max: 50, default: 3 }, dx: N('Spacing', 0.5, 250, 10) } },
  grid: { label: 'Grid', fields: { nx: { label: 'Columns', type: 'int', min: 1, max: 30, default: 2 }, ny: { label: 'Rows', type: 'int', min: 1, max: 30, default: 2 }, dx: N('Column spacing', 0.5, 250, 20), dy: N('Row spacing', 0.5, 250, 20) } },
  circle: { label: 'Circle', fields: { n: { label: 'Count', type: 'int', min: 2, max: 60, default: 6 }, radius: N('Radius', 0.5, 125, 15) } },
};

export const EXTRAS_HELP = `Every part may have "extras": a list of features added to or cut from it. Each extra:
{op: add|cut, shape, face, u, v, rot, through, size, pattern, ...shape fields}
- face: ${Object.keys(FACES).join('|')}. Inside faces exist on enclosure and gridfinity_bin; lid faces on enclosures with a lid. For face xyz give x, y, z (mm from the centre of the part's footprint at bed level) and rx, ry, rz (degrees); the feature then points up (+Z).
- u, v: offset from the face centre in mm. u = right as you look at the face from outside (on top, bottom, floor and lid faces: seen from above, u = right, v = towards the back). On walls v = up. rot: degrees about the face normal.
- add grows out of the face by depth; cut sinks into it by depth, or through:true cuts through that wall/floor/lid.
- shapes and their fields: ${Object.entries(EXTRA_SHAPES).map(([k, s]) => `${k}${s.op ? ` (always ${s.op})` : ''} {${Object.keys(s.fields).join(', ')}}`).join('; ')}.
- size: ${Object.keys(SCREWS).join('|')} for ${[...SCREW_SHAPES].join(', ')} (standoff takes a self-tapping screw, insert_post a heat-set insert).
- pattern: {type: none|row|grid|circle, n, dx (row); nx, ny, dx, dy (grid); n, radius (circle)}, centred on u, v. e.g. 4 PCB standoffs on a 58x49 grid: {op:'add', shape:'standoff', face:'floor', size:'M2.5', pattern:{type:'grid', nx:2, ny:2, dx:58, dy:49}}.
- USB-C port: {op:'cut', shape:'slot', face:'front', w:9.5, h:3.8, through:true, v: <height>}.`;
