# Mature neighborhood variants — 2026-09-06

Generated with the built-in imagegen tool using the imagegen skill. These add
two level-3 alternatives to each existing two-variant residential/commercial
family; old files, level-1/2 art, capacity, simulation and saves are unchanged.
Stable world-index hashing now selects among four mature alternatives.

Final assets:

- `residential/r3c.png`: brick apartments, charcoal mansard roof.
- `residential/r3d.png`: pale stucco courtyard apartments, warm brown roof.
- `commercial/c3c.png`: narrow limestone-and-teal offices, stepped roof.
- `commercial/c3d.png`: broad ochre department store, skylight and green awnings.

The native 1254px RGBA exports are preserved unchanged, including alpha.
`CityView.qml:matureSpriteFrames` selects the painted bounds at draw time;
`drawMatureVariant` uniformly fits them within 84% width / 88% height, with
a 94% baseline. This preserves natural silhouettes rather than stretching
square exports into the old residential aspect ratio. Existing spacing from
the earlier neighborhood pass remains intact.

## Prompt set

Shared generation prompt (reference: existing r3.png or c3a.png as appropriate):

> Use case: stylized-concept. Asset type: single production sprite for Omaville city-builder. Reference image is STYLE AND CAMERA reference only, not an edit target. Generate ONE new distinct mature building, warm detailed 32-bit pixel-art style, crisp readable clusters at small game size, matching the reference's orthographic near-overhead camera, front entrance facing lower-left, visible right wall, lighting upper-left. Genuine transparent alpha background, isolated cutout, no ground slab, grass lot, street, labels, text, border, checkerboard or cast shadow outside footprint. Tiny contact shadow only. Square canvas, whole building centered with 6 percent transparent padding. No other buildings.

Subjects appended to that prompt:

- **r3c:** FOUR STOREY red-brown brick apartment building, restrained dark warm brick walls with simple sandstone lintels rather than bright white bands, charcoal slate mansard roof with two small dormers, narrow blue-gray windows, modest dark iron balconies, welcoming lower-left stoop. Tall compact silhouette like reference but different architecture. Calm dark roof mass, not red. Clean broad surfaces, not excessive microdetail.
- **r3d:** Compact four-storey pale warm stucco courtyard apartments with an L-shaped footprint, recessed planted terrace in the inside corner, muted brown low hipped roof split into unequal wings, dark sage shutters and small recessed blue-gray windows. Quiet cream mass with brown roof, less red and striping. Single building, same camera and scale.
- **c3c:** Mature FOUR STOREY compact slender commercial office building, warm gray limestone walls with muted teal vertical recessed window bays, stepped flat charcoal rooftop with setback penthouse and single skylight. Ground-floor cafe entrance lower-left with restrained burgundy awning. Calm stone masses, vertical emphasis, not blue glass with cream stripes.
- **c3d:** Mature broad THREE STOREY corner department store, compact square footprint, muted ochre masonry, large calm charcoal flat roof with raised central rectangular glass skylight, arched dark teal upper windows, lower-left recessed entrance with dark forest-green awning, restrained copper cornice. No repeated blue/cream horizontal bands. Broader lower silhouette, same camera and polish.

Initial generations incorrectly painted checkerboards. Each was edited with
the built-in tool before integration using this extraction prompt:

> Background extraction for production game sprite. Remove the entire white/gray CHECKERBOARD background. Deliver a transparent PNG with REAL ALPHA CHANNEL, all pixels outside building alpha=0. Keep the building unchanged, no restyling. Whole isolated cutout, tiny contact shadow, no pattern or backdrop. Square canvas.

For c3c the cleanup also requested removal of the illegible awning lettering.
The resulting alpha was checked with ImageMagick identify; no opaque
checkerboard exports are referenced by the game.

## Validation

`node tests/mature-art.mjs` checks all variants, deterministic selection,
paths, proportions and tile bounds at five scales. Add `--preview` to render
the actual production functions using offscreen Qt and write a neighborhood
preview under a fresh `/tmp/omaville-mature-preview-*` directory. No city save
is loaded or modified by that preview. All 22 test scripts passed.
