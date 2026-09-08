# Brief: a bandstand, an arbour, and a footbridge

**For Codex/Astra. Self-contained.** Generate three images, save them, stop.
Claude writes the tile types, costs and tables; that is not art work.

**A note on scope:** this is a small batch on purpose. A new footpath tile is
being added to the game, but the path surface itself is drawn procedurally in
code, the same way the roads are — that is the house style for anything long
and connected, and it lets a path meet another path at any angle without
sixteen separate corner sprites. So the art here is the things that stand *on*
a promenade, not the promenade.

## Why

Players are building car-free districts — a ring of road with an interior of
apartment blocks, trees, fountains and water, and no way to walk through it.
Footpaths will fix the getting-around. What those districts then want is
somewhere to be going: the things a Victorian public garden actually had.

## Deliverables

- `assets/decorations/bandstand.png`
- `assets/decorations/arbour.png`
- `assets/paths/footbridge.png`

**Do not** edit any `.qml`, `Model.js`, any table, any test, or deploy.

## The two decorations

Match `assets/decorations/fountain.png` exactly — it is the reference for
camera, finish and scale.

- **256 x 256 RGBA, genuine alpha**, subject bottom-centred, trimmed with even
  padding. Not larger than 256: these are drawn at 32 to 64 pixels and every
  sprite is held in memory for the life of the process.
- **No ground slab, no grass, no path, no border.** The game paints the terrain
  and the lot underneath.
- Tiny contact shadow only. No text, no people.
- Elevated near-overhead orthographic camera, warm crisp detailed 32-bit pixel
  art. Must read at 32px.
- Sits comfortably **inside** its tile, like the fountain does.

**`bandstand.png`** — an octagonal cast-iron bandstand: ornamental columns, a
scalloped roof with a finial, a low balustrade, three or four steps up. Painted
dark green and cream. This is the centrepiece of a public garden and should
look like the most deliberate thing on the block.

**`arbour.png`** — a timber pergola or arbour: a run of posts with cross-beams,
climbing roses or wisteria over the top, a bench visible beneath. Lower and
wider than the bandstand, and softer — greenery is doing half the work.

## The footbridge

`assets/paths/footbridge.png` — **this one is different, read carefully.**

Where a footpath crosses water the game needs a small bridge. It is drawn on
the water tile itself, so unlike the decorations it must **fill its tile edge
to edge along one axis**: the deck runs the full width of the image, left edge
to right edge, with no padding on those two sides, so that two of them laid
next to each other form a continuous crossing.

- 256 x 256 RGBA, same camera and finish as the decorations.
- A simple timber footbridge: plank deck, light handrails both sides, no
  roadway markings, no vehicles. Narrow — clearly for people on foot, about a
  third to a half the width of the tile, centred, running **left to right**.
- The deck must reach both the left and right edges exactly. Above and below
  the deck is transparent — the game paints the water.
- No bank, no shore, no ground: water is drawn underneath by the game.

## Done means

Three PNGs at the paths above, all 256 x 256 RGBA with genuine alpha, the two
decorations bottom-centred with padding and the footbridge running edge to edge
left-right, nothing else in the repo changed, prompts appended to
`assets/decorations/PROMPTS.md`.
