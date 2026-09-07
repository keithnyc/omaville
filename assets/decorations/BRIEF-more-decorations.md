# Brief: four more decorations

**For Codex/Astra. Self-contained — you should not need to read any other file
in this repo.** Generate four images, save them, stop. Claude adds the tile
types, costs, bonuses and lookup tables afterwards; none of that is art work
and none of it should be attempted here.

## Why

The city has exactly two decorations — a tree and a flowerbed — and they are
the only things a player can place purely to make a district look better. Two
of anything repeated across a large map stops reading as decoration and starts
reading as texture.

## Deliverables — and nothing else

- `assets/decorations/fountain.png`
- `assets/decorations/statue.png`
- `assets/decorations/hedge.png`
- `assets/decorations/bench.png`

**Do not** edit `CityView.qml`, `Model.js`, `decorationSpriteUrls`,
`decorationMetrics`, any test, or deploy anything.

## Format

Match `assets/decorations/tree.png` exactly — it is the reference for camera,
finish and scale:

- **256x256 RGBA, genuine alpha**, subject bottom-centred, trimmed so the
  painted bounds sit inside the canvas with even padding.
- **No ground slab, no grass tile, no path, no border, no checkerboard.** The
  game paints the terrain and the lot underneath.
- Tiny contact shadow only. No text, no people.
- Elevated near-overhead orthographic camera, warm crisp detailed 32-bit pixel
  art. Must read at 32px.
- These occupy a whole tile but should sit **comfortably inside** it, like the
  tree does — the recent flowerbed pass proved that smaller reads better than
  larger, since lots now also carry procedural shrubs and planters.

## Subjects

Shared direction, with the tree as the style and camera reference:

> Use case: stylized-concept. Production Omaville city-builder decoration
> sprite. Reference image is STYLE AND CAMERA ONLY. Match its elevated
> near-overhead orthographic camera, warm crisp detailed 32-bit pixel art, and
> tiny contact shadow. Single isolated object on genuine transparent alpha with
> even padding, no ground slab, no grass, no path, no border, no checkerboard,
> no text, no people. Readable at 32px.

Appended per subject:

- **fountain.png:** A small circular stone fountain — pale warm limestone basin
  with a low rim, a simple central tier, and clear turquoise water with a
  modest spout and a few ripples. Civic and tidy rather than ornate. Compact
  and clearly round.

- **statue.png:** A modest bronze statue of a standing figure on a square pale
  stone plinth, weathered green-blue patina against warm stone, no face detail
  needed at this size. Reads as a small civic monument, not a landmark. Taller
  than it is wide.

- **hedge.png:** A neat rectangular clipped hedge block in deep green with
  olive sunlit highlights along its top edge, low and wide, with a suggestion
  of dense foliage texture. Deliberately plain and repeatable — this is the
  one meant to be placed in runs along a boundary, so it should look right
  sitting beside a copy of itself on either side.

- **bench.png:** A warm timber park bench with dark iron legs, angled to face
  lower-left, with a small cast-iron lamp post beside it and a scatter of pale
  gravel under both. Quiet street furniture. Wider than it is tall.

Add whatever prompts actually produced the final images to
`assets/decorations/PROMPTS.md`.

## Done means

Four PNGs exist at the paths above with genuine alpha, each reading clearly at
32px against a plain green background, and nothing else in the repo changed.
