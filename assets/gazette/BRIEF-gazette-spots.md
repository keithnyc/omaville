# Brief: four more Gazette engravings

**For Codex/Astra. Self-contained.** Generate four images, save them, stop.
Claude maps them to the news desks afterwards; that is not art work.

## Why

The Gazette has five engravings and twelve news desks, so several desks share
a picture — a crime wave, a power failure and a new ordinance all currently
run under the town hall. These four give the desks that appear most often
their own image.

## Deliverables — and nothing else

- `assets/gazette/spot-crime.png`
- `assets/gazette/spot-power.png`
- `assets/gazette/spot-road.png`
- `assets/gazette/spot-law.png`

**Do not** edit any `.qml`, `Model.js`, any test, or deploy anything. No text
in any image — every word on the page is generated from the player's own city.

## Format — identical to the five you just made

Reuse the exact approach recorded in `assets/gazette/PROMPTS.md`. To restate
it: **256 x 256 RGBA, pure black ink on genuine transparent alpha**,
nineteenth-century newspaper wood engraving, hatching and stipple rather than
flat fills or grey wash, slightly rough printed line quality, no frame, no
border, no background. Single clear silhouette with hatching inside it —
these are shown at about 46px, so they must survive being shrunk to a fifth.

`spot-fire.png` and `spot-civic.png` are the reference for weight and finish.

## The four

- **`spot-crime.png`** — a night constable with a bullseye lantern under a
  street lamp, or a figure in a greatcoat disappearing round a corner. Uneasy,
  not violent.
- **`spot-power.png`** — the inside of a generating station: a big belt-driven
  dynamo, a pressure gauge, a boiler. Industrial machinery, no people needed.
- **`spot-road.png`** — a new road or turnpike running out of town toward the
  horizon, with a milepost in the foreground and maybe a cart on it. Should
  read as *departure* — this is the picture for a highway opening to a
  neighbouring town.
- **`spot-law.png`** — a printed proclamation nailed to a board or post, its
  corners curling, seal at the bottom. This is the picture for an ordinance
  being passed, so it should read as a notice rather than a courtroom.

## Done means

Four PNGs at the paths above, black-on-transparent, no text, each legible at a
fifth of its size on cream, nothing else in the repo changed, and the prompts
appended to `assets/gazette/PROMPTS.md`.
