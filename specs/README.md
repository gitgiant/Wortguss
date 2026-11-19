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
- 3MFs are written in Bambu Studio's project layout (meshes in `3D/Objects/`,
  `Metadata/model_settings.config` with each part's AMS slot). The embedded A1
  `project_settings.config` is switched off for now: Bambu Studio rejected it as an
  invalid configuration. `web/src/a1-profile.json` and `make-a1-profile.mjs` keep
  the flattened A1 presets for when that is fixed.

- `parts[].qty` (optional, 1–20) prints several copies of a part.

Part types in v1: `gridfinity_bin`, `enclosure`, `l_bracket`, `tool_holder`,
`lego_brick` (bricks, plates, tiles), `lego_technic_brick`, `lego_slope`,
`lego_round`, `lego_liftarm`, `lego_axle`, `lego_pin`, `lego_calibration`.

Lego fits to tune on your printer: stud Ø (clutch test), Technic hole Ø
(default 4.9 for a 4.8 pin), axle cross size (default 4.7).
