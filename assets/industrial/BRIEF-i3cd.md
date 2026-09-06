# Brief: two more mature industrial variants (i3c, i3d)

**For Codex/Astra. Self-contained — you should not need to read any other file
in this repo to do this.** Generate two images, save them, stop. Claude will
handle the wiring, the sprite frames, the tests and the deployment.

## Why

Residential and commercial each have four level-3 variants; industry has two
(`i3a`, `i3b`). In a district of a dozen factories that repetition is the most
visible weakness in the city — far more noticeable than any per-lot detail.
Two more variants brings industry level with the other zones.

## Deliverables — and nothing else

- `assets/industrial/i3c.png`
- `assets/industrial/i3d.png`

**Do not** edit `CityView.qml`, `matureSpriteFrames`, any test, or deploy
anything. Adding these files is the whole job.

## Format

Match the four existing mature variants (`residential/r3c.png`,
`residential/r3d.png`, `commercial/c3c.png`, `commercial/c3d.png`), **not** the
older 256x256 sprites:

- **Square canvas at native generation resolution** (the existing four are
  1254x1254). Do not downscale or re-crop to 256.
- **Genuine transparent alpha**, subject isolated, roughly 6% transparent
  padding around the painted bounds.
- **No ground slab, no grass, no road, no checkerboard, no cast shadow beyond
  a tiny contact shadow.** The game paints the terrain and now paints an
  industrial yard under the building.
- No text, signage lettering, people or vehicles.

Claude computes each file's painted bounds and adds the `matureSpriteFrames`
entry, so exact framing within the canvas does not matter as long as the alpha
is genuine and the padding is roughly even.

## Camera and style

`assets/industrial/i3a.png` is the style and camera reference. Match its
elevated near-overhead orthographic view, front facing lower-left, warm crisp
detailed 32-bit pixel art, and its cool blue-grey industrial palette with warm
amber and rust accents. Must read clearly at 32px.

The existing two are both blue-roofed process plants with stacks and silos, so
the point of these two is to differ in **silhouette and industry**, not just in
detail. Avoid another tall red-and-white striped chimney.

## Subjects

Prompt for each, appended to the shared direction above:

- **i3c:** Mature heavy-industry works dominated by a broad low-pitched
  saw-tooth roof over a wide machine hall, its north-facing glazing catching a
  cool highlight. One squat brick-and-steel flue rather than a tall chimney, an
  external steel stair to a roof gantry, stacked steel plate and two small
  loading doors along the lower-left face. Wide horizontal silhouette, muted
  slate and weathered brick with amber rust accents.

- **i3d:** Mature bulk-handling depot: a tall windowless corrugated silo block
  in pale grey-green joined by an enclosed conveyor bridge to a lower steel
  transfer shed, with a small control cabin at the lower-left corner and a
  handful of dark ducting runs. Vertical mass on one side, low mass on the
  other, clearly asymmetric. No chimney at all.

## Done means

Both PNGs exist at the paths above with genuine alpha, and nothing else in the
repo has changed. Tell Keith and hand back.
