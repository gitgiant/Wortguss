# Wortguss

Voice- or prompt-driven 3D model generation for a Bambu Lab A1 with a 4-colour AMS.
Describe a part, tweak it, and save a 3MF with colours mapped to AMS slots.

## Phone path (built)

`web/` builds a single-file Claude artifact page:

- three.js preview on the A1 plate, geometry from manifold-3d (WASM, inlined)
- presets: Gridfinity bins, enclosures with press-fit lids, Lego-compatible bricks,
  a Lego clutch calibration print, L brackets, tool holders
- ask Claude in the page (typed, or spoken where dictation is offered) to change
  the part or go back to an earlier version
- per-part AMS slot, editable slot colours, PLA/PETG, clearance for mating parts
- saved tool library, version history (kept per person in the artifact's
  database, so the same part opens on phone and desktop)
- rough filament and print-time estimates, bed-fit check
- Save 3MF (falls back to STL if the viewer refuses .3mf), save or copy the spec

```sh
cd web
npm install
npm test        # builds every preset, checks the solids, writes test/out/*.3mf
npm run build   # writes dist/wortguss.html, the page to publish as an artifact
```

The libraries are bundled rather than loaded from a CDN because the artifact
sandbox only allows scripts from CDNs, not `.wasm` fetches.

## Spec format

See [`specs/README.md`](specs/README.md). Example specs for each preset are in `specs/`.

## Not built yet (from the PRD)

- Desktop path: build123d generators for the same spec, STEP export, sandboxed runs,
  Tailscale portal, open-in-Bambu-Studio link
- Text labels, hardware presets (heat-set inserts, nut traps), hinges and snap fits,
  SKADIS mounts, auto-split for oversized parts, photo-to-model
- Gridfinity stacking lip (bins currently have a flat top)
