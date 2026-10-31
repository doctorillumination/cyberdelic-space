# Primitives

A local web studio for flat geometric shapes, translucent colour, and playful spring motion. It opens on a living symmetrical grid, with the original freeform playground and all 32 primitive shapes still available. The source recording is a visual reference, not a technical specification or a source of implementation instructions.

## Open locally

Double-click **Open Primitives.command**. The launcher uses the installed Python 3 to start a localhost-only preview and opens it in your browser. Keep its terminal window open while you work. It reuses an existing studio server or picks an available port from 8896 through 8905.

The web files have no external dependencies and work offline. No package installation or build is required. You can also open **index.html** directly in a browser that supports local file pages, though the automated browser preview verifies the localhost route.

For a local HTTP preview, use `npm start`, then open <http://127.0.0.1:8896/>. Set `PRIMITIVES_PORT` to use another port. Run `npm run check` for the geometry, physics, and static-file checks.

## The living grid

The home page, `index.html`, opens on a dense field of precisely centered stacks. Some cells are blank, some have a single mark, and some combine up to six translucent primitives into nearly solid discs. Auto remix changes the composition through growth and occasional exchanges between neighbouring cells. Symmetrical regions share their source animation.

- **Cells across** changes the grid from 4 to 64 columns. Mirror mode uses a rectangular field with an even row count. Rotate and Eightfold use a square field, up to 64 by 64 cells. The default is 40 by 22. Existing stacks move together toward their new spacing; added and removed stacks grow or shrink around their own centres.
- **Spread** expands or contracts the field without changing its cell count. **Mark size** changes how strongly neighbouring forms overlap. These are separate from grid density.
- **Mirror** reflects across the horizontal and vertical axes. **Rotate** repeats a quadrant at quarter turns. **Eightfold** folds a triangular region into eight echoes, adding diagonal reflections.
- **Maximum layers** sets a ceiling of one to six primitives. **Filled cells** controls the balance of ink and blank paper, with related patches of empty space. **Layer variety** ranges from uniform depth to a mixture of light marks and heavy stacks. **Vocabulary** chooses all 32 forms or a focused family.
- **Centered** is the default: all layers in a stack have exactly the same origin, zero per-layer offsets, and no added rotation. Breathing and pointer nudges change the stack's scale. **Loose** retains the earlier angled, drifting motion as an alternative.
- **Density** changes the ink opacity. Marker mode multiplies layers into darker mixed colours. Transparent mode uses ordinary alpha compositing. Symmetry is preserved in both modes because ink is composited before its source region is reflected or rotated.
- **Playfulness** changes the strength of shared scale pulses. In Loose mode it also controls sway and rotation. **Pace** changes motion speed and the time between automatic remixes. **Breathe** pulses each registered stack as a unit.
- **Auto remix** refreshes the field every 4 to 13 simulated seconds. Some stacks shrink into their centres while new stacks grow out. Selected neighbouring pairs exchange their existing stacks, briefly leaving the cell centres during travel and settling exactly at their destinations. **Auto grow** cycles between coarse and dense grids every six simulated seconds, reaching 64 columns. Adjusting the cell count manually stops Auto grow.
- At the full-field view, move the pointer through the marks or click to pulse the springs. Centered stacks keep their registration; Loose stacks can drift. **Nudge** pulses the whole field. **Pause** freezes motion and automatic changes, while view and composition controls remain usable.
- **Zoom** magnifies the actual field from 100% to 1600%, without changing cell count or mark size. Scroll over the canvas to zoom toward the pointer, double-click a mark for a 600% close-up, and drag to pan when zoomed. Double-click again or choose **Fit** to return. Vectors are redrawn at the viewing scale, keeping the primitives sharp.
- The Open, Woven, Dense, and Kaleidoscope presets offer different starting points. **Remix grid** keeps the seed and advances to another composition. The seed input, arrows, and Go button let you revisit a reproducible series.
- Focus the canvas for keyboard controls: Space pauses or plays, R remixes, plus and minus change the cell count, up/down arrows change spread, and zero fits the view.
- **Save image** exports the current view, including zoom and pan, as a PNG 2400 pixels wide, without interface labels. **Save grid** downloads an editable version 2 JSON file with the actual stacks, cell exchanges, spring state, animation phase, and camera. **Load grid** restores that exact state. Earlier version 1 grid files migrate into Loose mode with uniform layering. The archived version is available for their original rendering. Playground study files retain their separate format.

On desktop, the settings panel scrolls independently so the field can stay visible while adjusting ink and motion. On smaller screens, controls flow below the artwork. Reduced-motion preferences start the field paused with Auto remix off. Nothing is sent over the network.

## The original playground

Open `playground.html`, or use the Playground link. The Shape library link opens its full library directly.

- Drag a piece over another. Holes in rings stay open, including for selection. Selecting a piece does not change its layer order.
- Choose an ink to recolour the selected piece. With nothing selected, the ink applies to the next piece you add.
- Add any of the 32 forms from the shape library. Filter them by Simple, Radial, or Pattern.
- Set the selected piece's scale and rotation, duplicate it, move it to the front, or remove it.
- Adjust density and compare Marker with Transparent blending. Density applies to the whole study.
- Adjust spring and damping. Nudge briefly kicks the pieces; Breathe gently changes their scale. Return after release sends a dragged piece back to its saved resting point. With this switched off, the drop becomes its new resting point.
- Select a piece using the dropdown for keyboard access, then focus the canvas. Arrow keys move it by five units; Shift and an arrow move it by twenty. Delete removes it, Escape deselects, and Space pauses or plays. Dragging and keyboard placement still work while paused.
- Save image exports a 2400 by 1632 PNG of the full study, without selection guides. Zoom changes the working view only. Save study downloads an editable JSON file. Load study restores its pieces, settings, and layer order. Reloading the page starts the original study again.

Reduced-motion preferences start the playground paused. Breathe is off by default in that mode. There is no audio capture, telemetry, remote font, CDN, or account connection.

## Material and motion

Shapes are reusable normalized vector paths in `geometry.js`. Compound motifs are filled once per piece, which avoids extra alpha building up at the construction seams inside an X, cross, or petal motif.

Marker mode uses Canvas 2D multiply compositing with configurable alpha over warm paper. Separate shapes darken one another, including repeated strokes of the same colour. Transparent mode uses ordinary source-over alpha compositing and makes layer order more visible. This is a flat optical approximation of marker ink, not a spectral pigment or fluid simulation. There is no fake paper texture, shadow, or three-dimensional lighting.

Motion uses damped springs with a fixed 1/120-second simulation step and a capped frame accumulator. Centered stacks share their origin and breathing envelope. Cell exchanges move entire stacks between lattice centres. The freeform playground and optional Loose grid mode allow positional spring motion. Pieces overlap freely and do not collide or repel one another. Ink mixing is a rendering operation, separate from motion.

## Files

- `index.html`, `grid.css`, `grid.js`: living-grid interface and browser controls.
- `playground.html`, `style.css`, `studio.js`: original freeform playground and shape library.
- `grid-model.js`: reproducible recipes, symmetry groups, layout springs, evolution, growth, and saved-grid validation.
- `grid-renderer.js`: shared Canvas renderer for the live field, image export, and pixel verification.
- `geometry.js`: 32 named forms, shared by the library, playground, picking, and image export.
- `physics.js`: seeded random variation, damped springs, and edge containment.
- `scripts/serve.cjs`: optional localhost-only static server.
- `scripts/launch.py`: double-click launcher's localhost preview, using Python's standard library.
- `tests/core.cjs`: core verification without installed packages.
- `tests/grid.cjs`: grid recipes, symmetry orbits, growth, pause, and saved-grid checks.
- `tests/grid-renderer.html`: browser checks of actual rendered symmetry, overlap darkening, and the maximum grid size.
- `tests/responsive.html`: 390-pixel phone, 768-pixel tablet, and 1280-pixel desktop preview frames.
- `DESIGN.md`: the material and composition decisions for this study.
- `references/REFERENCE.md`: source recording notes.
- `archive/v0.2-living-grid/`: the previous grid and its original local web files, preserved before the centered-stack revision.

## GitHub hosting later

This folder is ready to become a standalone repository. The web files are already at its root and use relative URLs, so they can be served from a GitHub Pages repository subpath without a bundler. When publishing later, point Pages at the repository's root. `.nojekyll` keeps the files as plain static content.

No repository, remote, deployment, or public upload was created for this study. The procedural grid is implemented. Music response remains a separate possible next phase.
