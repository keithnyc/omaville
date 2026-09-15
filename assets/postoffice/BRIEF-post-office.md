# Brief: a post office, and an envelope

**For Codex/Astra. Self-contained — you should not need to read any other file
in this repo.** Generate two images, save them, stop. Claude writes the tile
type, the mail system, the animation and the wiring; none of that is art work.

**Do not** edit any `.qml`, `Model.js`, any table, any test, or deploy anything.

## Why

Omaville's named residents now write letters to the mayor — asking for a bench,
saying thank you, inviting you round on their birthday. The player builds a
post office to read them, and clicks it to open the mailbox. When there is
unread mail, a small envelope floats and bobs above the building with a few
sparkles around it (the bobbing and sparkles are animated in code).

It is the one building in the game that exists for the residents rather than
the economy, so it should look warm and a little bit charming — the friendliest
civic building on the map, not a sorting depot.

## Deliverables

- `assets/postoffice/post-office.png`
- `assets/postoffice/envelope.png`

Record the prompts you used in `assets/postoffice/PROMPTS.md`.

## `post-office.png` — the building

Match `assets/medical/h1.png` (a one-storey clinic) exactly for **camera,
finish and scale**. It is style and camera reference only — not a clinic.

- **256 x 256 RGBA, genuine transparent alpha.** Building bottom-centred,
  trimmed with even padding, entire structure visible.
- Elevated near-overhead orthographic camera, entrance facing lower-left, warm
  crisp detailed 32-bit pixel art. **Must read at 32px.**
- **No ground slab, no lawn, no pavement, no road, no lot border.** The game
  paints the lot underneath. Tiny contact shadow only.
- **No text, no lettering, no signs with words.** The game draws its own labels.
- No people, no vehicles, no background, no glow, no vignette, no checkerboard.

The building: a small one-storey town post office. Red brick walls, a
slate-grey or deep blue pitched roof, a cream stone doorway with a rounded
arch, two windows, and a bright red pillar-box (a round post box) standing
by the entrance. A small emblem over the door may be a simple envelope or
posthorn shape — a shape, not words. Slightly smaller and cosier than the
clinic, and clearly different in colour: red brick and red post box are what
make it read as "post" at 32px.

## `envelope.png` — the floating letter

- **128 x 128 RGBA, genuine transparent alpha**, envelope centred with even
  padding.
- A single closed paper envelope seen from the front, tilted about 10°, cream
  or off-white with a darker outline so it reads against both grass and
  rooftops, a V-shaped flap, and a small red wax seal or heart in the middle.
- Same pixel-art finish as the building. Must read at 20px.
- **No sparkles, no glow, no shadow, no motion lines** — the game adds sparkles
  and animation itself, and anything baked in would double up.
- No text.

## Done means

Both files exist at the exact paths above, are the stated sizes with real
alpha (fully transparent corners, no baked background), contain no text, and
`PROMPTS.md` records the prompts. Then stop.
