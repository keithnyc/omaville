# Mature industrial variant prompts

## September 7 — i3c and i3d

Generated with built-in imagegen using `assets/industrial/i3a.png` as STYLE AND CAMERA reference only. Final files are genuine-alpha RGBA, native 1254x1254 square generation canvases, copied without resizing or recropping. No code, sprite-frame metadata, tests or deployment changes. Claude handles painted-bounds measurement and wiring. Padding is generation-native and not uniform; do not assume fixed 6% crop coordinates.

## i3c — saw-tooth machine hall

Final: `assets/industrial/i3c.png`.

Generation prompt:

Use case: stylized-concept. Production Omaville city-builder mature industrial building sprite. Input image is STYLE AND CAMERA reference only, not the subject to copy. Match its elevated near-overhead orthographic view, front facing lower-left, warm crisp detailed 32-bit pixel art, cool blue-grey industrial palette with warm amber and rust accents. Must read clearly at 32px with distinct large masses and clean silhouette. Single complete isolated building on square canvas at native generation resolution. Genuine transparent RGBA alpha background, roughly 6 percent transparent padding around the painted bounds, roughly even framing. No ground slab, grass, road, checkerboard, cast shadow beyond a tiny contact shadow, text, signage lettering, people or vehicles. Do not add a tall red-and-white striped chimney. Subject: Mature heavy-industry works dominated by a broad low-pitched saw-tooth roof over a wide machine hall, its north-facing glazing catching a cool highlight. One squat brick-and-steel flue rather than a tall chimney, an external steel stair to a roof gantry, stacked steel plate and two small loading doors along the lower-left face. Wide horizontal silhouette, muted slate and weathered brick with amber rust accents.

Transparency finishing prompt (the first draft had a baked checkerboard):

Use case: background-extraction. Production sprite finishing. Remove the entire white and gray CHECKERBOARD background from this image. Output a PNG with a REAL TRANSPARENT ALPHA CHANNEL: all background pixels alpha=0, not a rendered transparency pattern. Preserve the depicted object's shape, camera, colors, pixel-art finish and details exactly, including pale flowers or metal highlights. No backdrop, no checkerboard, no ground slab. Keep only the isolated object and tiny contact shadow. Center the complete object on a square transparent canvas with about 6 percent clear padding around its painted bounds. Do not redesign the subject.

Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-c76d41e9-023a-4aab-9caa-4664d092bafb.png`.
Final source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-88de75c9-e526-47f4-91ef-82f064f2a843.png`.

## i3d — bulk-handling depot

Final: `assets/industrial/i3d.png`.

Generation prompt (direct genuine-alpha output; no extraction pass):

Use case: stylized-concept. Production Omaville city-builder mature industrial building sprite. Input image is STYLE AND CAMERA reference only, not the subject to copy. Match its elevated near-overhead orthographic view, front facing lower-left, warm crisp detailed 32-bit pixel art, cool blue-grey industrial palette with warm amber and rust accents. Must read clearly at 32px with distinct large masses and clean silhouette. Single complete isolated building on square canvas at native generation resolution. Genuine transparent RGBA alpha background, roughly 6 percent transparent padding around the painted bounds, roughly even framing. No ground slab, grass, road, checkerboard, cast shadow beyond a tiny contact shadow, text, signage lettering, people or vehicles. Do not add a tall red-and-white striped chimney. Subject: Mature bulk-handling depot: a tall windowless corrugated silo block in pale grey-green joined by an enclosed conveyor bridge to a lower steel transfer shed, with a small control cabin at the lower-left corner and a handful of dark ducting runs. Vertical mass on one side, low mass on the other, clearly asymmetric. No chimney at all.

Final source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-840f7750-0ce7-4c39-b3d3-33d63e51b44d.png`.

