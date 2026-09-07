# Brief: a mourning notice, an empty strongbox, and four trades

**For Codex/Astra. Self-contained.** Generate six images, save them, stop.
Claude does the wiring; that is not art work.

Two groups, with **different specs**. Read both — the second group is not the
same as anything you have made for this project before.

---

# Group one: two more Gazette engravings

Same spec as the nine already in `assets/gazette/`. Reuse the approach in
`assets/gazette/PROMPTS.md`: **256 x 256 RGBA, pure black ink on genuine
transparent alpha**, nineteenth-century newspaper wood engraving, hatching and
stipple rather than flat fills or grey wash, rough printed line quality, no
frame, no border, no background, no text. Shown at about 46px, so a single
clear silhouette. `spot-fire.png` is the reference.

- **`assets/gazette/spot-mourning.png`** — a mourning wreath of dark leaves
  with a trailing crape ribbon, hung on a panelled front door. Sombre and
  domestic, not a graveyard. This runs above death notices for named residents,
  so it wants to read as *a house in mourning*, not as a monument.
- **`assets/gazette/spot-empty.png`** — a strongbox tipped on its side, lid
  open, empty, with a few coins spilled and settled beside it. This runs above
  "THE TREASURY IN THE RED", so it must read as *money gone*, clearly different
  at a glance from the existing `spot-money.png` stack of full coin piles.

---

# Group two: four trade vignettes — **LIGHT INK, NOT DARK**

These do **not** go on newsprint. They sit in the game's Residents panel, which
has a **dark background**, beside a named citizen. Black ink would be invisible
there.

So: **the same wood-engraving style, but inverted** — a white-line engraving,
as if printed in white ink. Light hatching on **genuine transparent alpha**, no
background of any kind. Think of a negative of the Gazette spots: the linework
that would have been black is now near-white (`#e8e4d6`-ish), and what would
have been empty paper is transparent.

Everything else matches: 256 x 256 RGBA, period engraving, hatching rather than
flat fill, no frame, no text, single clear subject, legible shrunk to ~40px.

Each is one worker, seen at their work, from about chest height:

- **`assets/trades/trade-works.png`** — a figure at a belt-driven machine in a
  workshop: a fitter or a moulder, sleeves rolled, one hand on the work. Heat
  and iron.
- **`assets/trades/trade-counter.png`** — a clerk at a tall sloped desk with a
  ledger open and a pen, or a shopkeeper behind a counter of drawers. Indoors,
  neat, paper.
- **`assets/trades/trade-street.png`** — a carter beside a loaded handcart or
  a horse's head, out in the open. Outdoor work, weather, hands.
- **`assets/trades/trade-retired.png`** — an older figure seated by a window
  with a stick or a cup, at rest. Dignified, not frail or comic.

**Faces should be indistinct** — turned, in shadow, or at a distance. These are
assigned to randomly generated names, so a strongly gendered or specific face
will contradict the name beside it. Read them as *the work*, not as a portrait.

## Done means

Six PNGs at the paths above — two black-on-transparent, four light-on-
transparent — no text in any of them, each legible at a fifth of its size on
its intended background, nothing else in the repo changed, and the prompts
appended to `assets/gazette/PROMPTS.md`.
