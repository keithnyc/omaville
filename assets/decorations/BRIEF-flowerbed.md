# Brief: reshape the flowerbed (second pass)

**For Codex/Astra. Self-contained — you should not need to read any other file
in this repo.** Regenerate one image, save it, stop. Claude handles any code,
metrics and tests afterwards.

## Deliverable — and nothing else

- `assets/decorations/flowers.png` (replacing the current file)

**Do not** edit `CityView.qml`, `decorationMetrics`, any test, or deploy
anything.

## What is wrong with the current one

Keith: it is **too big**, and should be **more square instead of oval**.

The **camera is already correct** — the previous pass fixed that, and the proof
is that `CityView.decorationMetrics` now has `B` matching `T` exactly
(`scale 1.08, baseline 0.97`) with no compensating nudge. So this pass is
**footprint and silhouette only**. Do not change the viewing angle.

One thing that changed since it was first drawn: lots now get procedural
shrubs, planters and doorsteps of their own, so the paid flowerbed shares its
tile with more clutter than it used to. Smaller and tighter reads better.

## Format

- **256x256 RGBA, genuine alpha**, subject bottom-centred, trimmed so the
  painted bounds sit inside the canvas with even padding.
- **No ground slab, no grass tile, no path, no border, no checkerboard.** The
  game paints the terrain underneath.
- Tiny contact shadow only. No text, people or other objects.
- Must read at 32px.

## Reference

`assets/decorations/tree.png` is the camera and finish reference — same
elevated near-overhead orthographic view, same warm crisp 32-bit pixel-art
style, same scale relationship to its tile. Compare the two side by side
before accepting the result.

## Prompt

> Use case: stylized-concept. Production Omaville city-builder decoration
> sprite. Reference image is STYLE AND CAMERA ONLY. A compact **square** raised
> flowerbed, noticeably **small within its frame** — a tidy planter box, not a
> wide oval border. Low warm cream stone edging on all four sides, squared
> corners, filled with dense small pink, yellow and lavender flowers over low
> green leaves. Match the reference's elevated near-overhead orthographic
> camera, warm crisp detailed 32-bit pixel art, and tiny contact shadow.
> Isolated object on genuine transparent alpha with generous even padding, no
> ground slab, no grass, no path, no border, no checkerboard, no text, no
> people. Readable at 32px.

Update `assets/decorations/PROMPTS.md` with whatever prompt actually produced
the final image.

## Done means

`flowers.png` is replaced, it is square-ish and clearly smaller in frame than
the previous version, and nothing else in the repo has changed.
