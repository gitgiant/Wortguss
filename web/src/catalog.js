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
      cableHole: { label: 'Cable hole Ø (0 = none)', type: 'num', unit: 'mm', min: 0, max: 30, step: 0.5, default: 0 },
    },
  },
  lego_brick: {
    label: 'Lego-compatible brick',
    blurb: '8 mm stud pitch, 3.2 mm plates. Tune stud Ø with the calibration print.',
    params: {
      nx: { label: 'Studs X', type: 'int', min: 1, max: 16, default: 4 },
      ny: { label: 'Studs Y', type: 'int', min: 1, max: 16, default: 2 },
      plates: { label: 'Height in plates (3 = brick)', type: 'int', min: 1, max: 12, default: 3 },
      studD: { label: 'Stud Ø', type: 'num', unit: 'mm', min: 4.5, max: 5.1, step: 0.01, default: 4.8 },
      tubeOD: { label: 'Tube outer Ø', type: 'num', unit: 'mm', min: 6.2, max: 6.8, step: 0.01, default: 6.51 },
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
    parts: [{ id: 'box', type: 'enclosure', slot: 3, params: { w: 60, d: 40, h: 25, lidSlot: 2, cableHole: 6 } }],
  },
  {
    key: 'lego',
    name: 'Brick 2×4',
    parts: [{ id: 'brick', type: 'lego_brick', slot: 2, params: { nx: 4, ny: 2, plates: 3 } }],
  },
  {
    key: 'lego-cal',
    name: 'Lego clutch test',
    parts: [{ id: 'cal', type: 'lego_calibration', slot: 1, params: {} }],
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
