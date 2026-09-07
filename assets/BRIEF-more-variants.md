# Brief: twelve more tier-3 buildings, and one departure

**For Codex/Astra. Self-contained.** Generate thirteen images, save them, stop.
Claude wires them into the sprite tables; that is not art work.

## Why

A mature city is almost entirely tier 3. Measured on a real 138-year-old save:
147 tier-3 houses, 135 tier-3 works, 97 tier-3 shopfronts — and only **four
sprites each**, so every building appears about thirty-five times. From a
distance the map reads as a repeating pattern rather than a city.

Four more of each takes that to eight, roughly halving it. That is the single
most visible improvement available to the map right now.

## Deliverables

Four more of each, continuing the existing lettering:

- `assets/residential/r3e.png`, `r3f.png`, `r3g.png`, `r3h.png`
- `assets/commercial/c3e.png`, `c3f.png`, `c3g.png`, `c3h.png`
- `assets/industrial/i3e.png`, `i3f.png`, `i3g.png`, `i3h.png`

Plus one Gazette engraving:

- `assets/gazette/spot-departure.png`

**Do not** edit any `.qml`, `Model.js`, any test, or deploy anything.

## Format for the twelve buildings — read this part carefully

Match `assets/residential/r3c.png` and `assets/industrial/i3c.png` exactly.
They are the reference for camera, finish and framing.

- **256 x 256 RGBA, genuine alpha.** Not larger. The previous batch arrived at
  1254 x 1254 and had to be downscaled — the game draws these at 32 to 64
  pixels and holds every one in memory, so a big file costs a great deal and
  buys nothing.
- Elevated near-overhead orthographic camera, identical angle to the existing
  tier-3 sprites. Warm, crisp, detailed 32-bit pixel art.
- The building sits within the frame with its own small yard or forecourt, and
  **no ground slab, no grass tile, no road, no border, no checkerboard** — the
  game paints the terrain underneath.
- Tiny contact shadow only. No text, no signage lettering, no people.
- Must still read as its own building at 48px.

## What actually needs to differ

Not colour. **Silhouette.** Four recolours of the same block would not fix
anything, because at 48px what the eye picks up is outline and roofline. Each
new one should be a shape the set does not already have:

**Residential (`r3e`–`r3h`)** — the existing four are detached and near-square
apartment blocks. Give the street some range: a long narrow **terrace row**
seen end-on; an **L-shaped corner block** wrapping a corner; a **tall thin
tenement**, noticeably taller than it is wide, with a flat roof; and a **wide
low mansion block** with a central pediment and wings.

**Commercial (`c3e`–`c3h`)** — a **corner department store** with a rounded
corner and a domed turret; an **arcade** with a long glazed barrel roof; a
narrow **hotel** with a canopy and many small windows; and a **market hall**,
wide and low with a clerestory ridge.

**Industrial (`i3e`–`i3h`)** — a **gasholder**, a big circular frame, quite
unlike anything currently in the set; a **long shed** with a sawtooth north-
light roof; a **bottling works**, compact with a water tower on top; and a
**yard** — low buildings around three sides of an open hardstanding with
stacked material in it.

Keep the existing palettes: warm terracotta and cream for residential, cooler
blue-greys for commercial, olive and rust for industrial.

## The Gazette engraving

Same spec as the eleven in `assets/gazette/` — 256 x 256, **pure black ink on
transparent**, nineteenth-century wood engraving, hatching not flat fill, no
frame, no text. `spot-fire.png` is the reference.

- **`spot-departure.png`** — a family beside a loaded handcart at the edge of
  town, luggage roped on, backs turned, walking away from the viewer. This runs
  above notices that a named resident has left the city for good, so it wants
  to read as *leaving* — clearly not the same as `spot-road.png`, which is the
  open road arriving somewhere and runs above good news.

## Done means

Thirteen PNGs at the paths above, all 256 x 256 RGBA with genuine alpha, the
twelve buildings sharing one camera and each having a silhouette the set does
not already have, nothing else in the repo changed, prompts appended to the
relevant PROMPTS.md.
