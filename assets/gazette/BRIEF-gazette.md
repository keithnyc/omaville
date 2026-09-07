# Brief: The City Gazette

**For Codex/Astra. Self-contained — you should not need to read any other file
in this repo.** Generate six images, save them, stop. Claude writes the
headline generator, the layout and the wiring; none of that is art work and
none of it should be attempted here.

## Why

Omaville is an idle game: the city grows while nobody is watching, and the
player's reward for coming back is a number that went up. The Gazette is the
other kind of reward — a periodic front page that says what *happened*.
Elections, fires, crime waves, a highway opening to a neighbouring town, the
year the treasury went red. The data already exists in the city log; what it
lacks is a face.

It has to look like newsprint, not like the rest of the game. Everything else
in Omaville is warm 32-bit pixel art seen from above. This is the one screen
that should look like a physical object from inside the world — ink pressed
into cheap paper.

## Deliverables — and nothing else

- `assets/gazette/masthead.png`
- `assets/gazette/spot-fire.png`
- `assets/gazette/spot-election.png`
- `assets/gazette/spot-growth.png`
- `assets/gazette/spot-money.png`
- `assets/gazette/spot-civic.png`

**Do not** edit any `.qml`, `Model.js`, any test, or deploy anything. Do not
add a title, a city name, a date or any other text to any image — every word
on the page is generated at runtime from the player's actual city, and their
city is not called what you would guess.

## The look, for all six

**Nineteenth-century newspaper woodcut / wood engraving.** Think the
illustrations in a Victorian broadsheet: pure black ink on nothing, built from
hatching, cross-hatching and stipple rather than flat fills or grey washes. No
colour at all. No anti-aliased soft grey shading — where a midtone is needed
it should come from the density of black lines, the way an engraving actually
works.

- **Black only** (`#000000` and near-black), on **genuine transparent alpha**.
  The page paints its own cream paper behind these, so any baked-in background
  will show as a grey rectangle and be rejected.
- Slightly rough, imperfect line quality — this is meant to look printed on a
  press with ink spread, not vector-clean.
- No frames, borders, drop shadows, or decorative boxes around the subjects.

## 1. `masthead.png` — 1024 x 256

A wide engraved panorama of a small industrial-era city skyline, seen from
across a river: rooftops, a church spire or clock tower, a few chimneys with
smoke, some low warehouses, maybe a bridge. Horizontal composition, symmetrical
enough that it reads with text centred above it.

The city should sit in the **lower two thirds**, with sky (empty transparency,
or the faintest hatching) above, because the newspaper's title is drawn over
the top of this at runtime. Nothing important in the top third.

This is the one image that carries the whole conceit — if it looks like a real
masthead engraving, the page works.

## 2-6. The five spot illustrations — 256 x 256 each

Small square engravings that sit beside a story, roughly 64px on screen, so
they must read when shrunk to a quarter size. **Keep them simple and
high-contrast** — a single clear silhouette with hatching inside it, not a
detailed scene. Square-ish composition, subject centred with even padding.

- **`spot-fire.png`** — a building well alight, flames breaking through a roof,
  a fire crew's ladder or a horse-drawn pump in the foreground. Drama.
- **`spot-election.png`** — a ballot box with a hand posting a paper into it,
  or a rosette and a rolled-up result. Civic, slightly pompous.
- **`spot-growth.png`** — new construction: scaffolding around a half-built
  block, a crane or a hoist, a bricklayer. Optimistic.
- **`spot-money.png`** — a stack of coins and a ledger, or a hand on a market
  ticker. Should work for both good news and bad.
- **`spot-civic.png`** — a town hall or council chamber facade with steps and
  columns, seen straight on. Institutional.

## Done means

Six PNGs at the paths above, black-on-transparent, no text anywhere in them,
each still legible at a quarter of its size against a cream background, and
nothing else in the repo changed. Record the prompts that produced them in
`assets/gazette/PROMPTS.md`.
