# Wortguss spec format (v1)

One JSON file per part. The phone artifact and the desktop (build123d) path both
read and write this format, so a part started on the phone can be rebuilt in full
CAD later. Units are millimetres.

```json
{
  "wortguss": 1,
  "name": "Sensor enclosure",
  "material": "PLA",          // PLA | PETG
  "tolerance": 0.2,           // clearance for mating parts (lid lips, tool holes)
  "colors": ["#f2f2ef", "#d64933", "#2b2d42", "#2a9d8f"],  // AMS slots 1-4
  "tools": { "screwdriver-small": { "d": 6 }, "hex-key-set": { "w": 22, "t": 9 } },
  "parts": [
    { "id": "box", "type": "enclosure", "slot": 3, "params": { "w": 60, "d": 40, "h": 25, "lidSlot": 2 } }
  ]
}
```

- `parts[].type` and its `params` are defined in `web/src/catalog.js`, with
  defaults and limits. Missing params take the default and out-of-range values
  are clamped, so a partial spec is valid.
- A part can produce several bodies: `enclosure` makes a box and a lid, and
  `lego_calibration` makes one plate per stud diameter. Each body is its own
  object in the 3MF, with the AMS slot set as its Bambu Studio extruder.
- `tools` is the saved tool library. `tool_holder` refers to tools by name, or
  takes inline `{ "name", "d" }` / `{ "name", "w", "t" }` objects.
- Every exported 3MF carries its spec at `Metadata/wortguss.spec.json`.
- 3MFs are plain core-spec files (one object per part, colour per AMS slot via
  basematerials), like Fusion or PrusaSlicer exports. A Bambu-project-style file
  was rejected by Bambu Studio; `web/src/a1-profile.json` and
  `make-a1-profile.mjs` keep the flattened A1 presets in case that is revisited.

- `parts[].qty` (optional, 1–20) prints several copies of a part.
- `parts[].extras` (optional) adds or cuts features on a named face of any part:
  basic shapes (box, cylinder/cone, sphere, slot, hex), mounting holes (screw hole,
  countersunk, nut trap, keyhole), hardware (PCB standoff, heat-set insert post,
  magnet pocket), with row/grid/circle patterns. Full field list: `EXTRAS_HELP`
  in `web/src/catalog.js`. Example: four M2.5 standoffs on an enclosure floor:
  `{"op":"add","shape":"standoff","face":"floor","size":"M2.5","depth":5,"pattern":{"type":"grid","nx":2,"ny":2,"dx":58,"dy":49}}`.
- Extras also include `text` (Inter Bold, cap height `size`): `cut` engraves, `add`
  raises it; a raised label with its own `slot` prints in that AMS colour (the 3MF
  colours its triangles; the STLs include a separate `-label-slotN.stl`).
  `mirror: lr|ud|both` adds mirrored copies across the face centre lines.
- Phase 3 extras: `tube`, `gusset`, `rib`, `snap_clip`; `fill` pattern areas
  (hex, triangle, diamond, square, brick, voronoi, girih, truchet, penrose) for
  vents or raised patterns; `texture` relief (noise, bumps, wood, waves, knurl);
  `gyroid` lattice blocks; `svg` logos (uploaded on the page, stored as compact
  contours in `logo`, ≤ 50 KB).
- `parts[].finish: {type: round|chamfer, r, edges: both|top|bottom}` rounds or
  chamfers the outer top/bottom edges.
- The `custom` part type starts from a block, cylinder or nothing; build it with extras.
- Old enclosure `cableHole` / `cutouts` params are converted to extras on load.

Part types in v1: `custom`, `gridfinity_bin`, `enclosure`, `l_bracket`, `tool_holder`,
`lego_brick` (bricks, plates, tiles), `lego_technic_brick`, `lego_slope`,
`lego_round`, `lego_liftarm`, `lego_axle`, `lego_pin`, `lego_calibration`.

Lego fits to tune on your printer: stud Ø (clutch test), Technic hole Ø
(default 4.9 for a 4.8 pin), axle cross size (default 4.7).
