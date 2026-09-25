## Additional tier-3 variants and departure — September 7

Built-in imagegen. All finals 256x256 RGBA with genuine alpha. Buildings reference `assets/residential/r3c.png` and `assets/industrial/i3c.png` for camera and finish only. Painted bounds fitted within 240x240, aspect preserved, bottom-centered with 8px bottom margin. Buildings inspected at 48px on green. Departure uses pure black ink with binary alpha, 224px bounds and even margins. No QML, Model.js, tests, tables or deployment changes.

### i3e.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville tier-3 city building sprite. Reference images are CAMERA AND PIXEL-ART FINISH ONLY, not building shape. Match elevated near-overhead orthographic view, front facing lower-left, warm crisp detailed 32-bit pixel art with clear chunky forms readable at 48px. Single complete isolated building on genuine transparent RGBA alpha, square canvas, even small transparent margins. No background, checkerboard, grass tile, ground slab, road, border, text, signage letters, people or vehicles. Tiny contact shadow only. A small forecourt or yard is implied by sparse freestanding details, never a painted ground rectangle. Strong distinctive silhouette rather than recolor. Olive and rust industrial: a Victorian gasholder, big CIRCULAR cylindrical tank surrounded by an open skeletal iron frame of upright columns and circular lattice rings. Dominant round silhouette, no conventional factory block.
Generation source: `<imagegen-output>/exec-16fe319f-381f-4455-bb7c-b6d3f7ef682c.png`.

Export command (from omaville directory):

```bash
magick <imagegen-output>/exec-16fe319f-381f-4455-bb7c-b6d3f7ef682c.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 240x240 -gravity south -background none -extent 256x248 -gravity north -extent 256x256 -strip -define png:color-type=6 assets/industrial/i3e.png
```

### i3f.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville tier-3 city building sprite. Reference images are CAMERA AND PIXEL-ART FINISH ONLY, not building shape. Match elevated near-overhead orthographic view, front facing lower-left, warm crisp detailed 32-bit pixel art with clear chunky forms readable at 48px. Single complete isolated building on genuine transparent RGBA alpha, square canvas, even small transparent margins. No background, checkerboard, grass tile, ground slab, road, border, text, signage letters, people or vehicles. Tiny contact shadow only. A small forecourt or yard is implied by sparse freestanding details, never a painted ground rectangle. Strong distinctive silhouette rather than recolor. Olive and rust industrial: a LONG narrow industrial shed with repeated sawtooth north-light roof, cool glazed vertical roof strips, one-story elongated horizontal footprint, a few loading doors. No tall chimney.
Generation source: `<imagegen-output>/exec-f9f48c3c-2f8a-4766-b534-c739806b5ffd.png`.

Export command (from omaville directory):

```bash
magick <imagegen-output>/exec-f9f48c3c-2f8a-4766-b534-c739806b5ffd.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 240x240 -gravity south -background none -extent 256x248 -gravity north -extent 256x256 -strip -define png:color-type=6 assets/industrial/i3f.png
```

### i3g.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville tier-3 city building sprite. Reference images are CAMERA AND PIXEL-ART FINISH ONLY, not building shape. Match elevated near-overhead orthographic view, front facing lower-left, warm crisp detailed 32-bit pixel art with clear chunky forms readable at 48px. Single complete isolated building on genuine transparent RGBA alpha, square canvas, even small transparent margins. No background, checkerboard, grass tile, ground slab, road, border, text, signage letters, people or vehicles. Tiny contact shadow only. A small forecourt or yard is implied by sparse freestanding details, never a painted ground rectangle. Strong distinctive silhouette rather than recolor. Olive and rust industrial: a compact bottling works with a clearly elevated WATER TOWER on top, cylindrical tank on four steel supports above compact brick factory, small pipes and bottling-loading bays, no tall chimney.
Generation source: `<imagegen-output>/exec-c5a98df3-c032-4015-aee5-32c453b3adbd.png`.

Export command (from omaville directory):

```bash
magick <imagegen-output>/exec-c5a98df3-c032-4015-aee5-32c453b3adbd.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 240x240 -gravity south -background none -extent 256x248 -gravity north -extent 256x256 -strip -define png:color-type=6 assets/industrial/i3g.png
```

### i3h.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville tier-3 city building sprite. Reference images are CAMERA AND PIXEL-ART FINISH ONLY, not building shape. Match elevated near-overhead orthographic view, front facing lower-left, warm crisp detailed 32-bit pixel art with clear chunky forms readable at 48px. Single complete isolated building on genuine transparent RGBA alpha, square canvas, even small transparent margins. No background, checkerboard, grass tile, ground slab, road, border, text, signage letters, people or vehicles. Tiny contact shadow only. A small forecourt or yard is implied by sparse freestanding details, never a painted ground rectangle. Strong distinctive silhouette rather than recolor. Olive and rust industrial: a U-shaped industrial YARD, low buildings around THREE sides of a clearly OPEN center, sparse stacked steel and timber material inside, open toward lower-left. Hardstanding area must remain transparent for game terrain, no paving slab. Low hollow-centered silhouette.
Generation source: `<imagegen-output>/exec-3b015438-50d9-4586-9533-95ddd49db127.png`.

Exact transparency finishing prompt:

Use case: background-extraction. Production game sprite. Remove the entire white/gray CHECKERBOARD backdrop, including open yard spaces and gaps between freestanding objects. Deliver genuine transparent RGBA alpha, all background pixels alpha=0, not a rendered transparency pattern. Preserve building silhouette, camera, palette and crisp pixel-art details exactly. No redesign, no ground slab, no cast shadow beyond tiny contact shadows, no text. Complete subject centered on square transparent canvas.

Transparent source: `<imagegen-output>/exec-21f807f0-5f9e-4993-8239-56463567b182.png`.

Export command (from omaville directory):

```bash
magick <imagegen-output>/exec-21f807f0-5f9e-4993-8239-56463567b182.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 240x240 -gravity south -background none -extent 256x248 -gravity north -extent 256x256 -strip -define png:color-type=6 assets/industrial/i3h.png
```

# Mature industrial variant prompts

## September 7 — i3c and i3d

Generated with built-in imagegen using `assets/industrial/i3a.png` as STYLE AND CAMERA reference only. Final files are genuine-alpha RGBA, native 1254x1254 square generation canvases, copied without resizing or recropping. No code, sprite-frame metadata, tests or deployment changes. Claude handles painted-bounds measurement and wiring. Padding is generation-native and not uniform; do not assume fixed 6% crop coordinates.

## i3c — saw-tooth machine hall

Final: `assets/industrial/i3c.png`.

Generation prompt:

Use case: stylized-concept. Production Omaville city-builder mature industrial building sprite. Input image is STYLE AND CAMERA reference only, not the subject to copy. Match its elevated near-overhead orthographic view, front facing lower-left, warm crisp detailed 32-bit pixel art, cool blue-grey industrial palette with warm amber and rust accents. Must read clearly at 32px with distinct large masses and clean silhouette. Single complete isolated building on square canvas at native generation resolution. Genuine transparent RGBA alpha background, roughly 6 percent transparent padding around the painted bounds, roughly even framing. No ground slab, grass, road, checkerboard, cast shadow beyond a tiny contact shadow, text, signage lettering, people or vehicles. Do not add a tall red-and-white striped chimney. Subject: Mature heavy-industry works dominated by a broad low-pitched saw-tooth roof over a wide machine hall, its north-facing glazing catching a cool highlight. One squat brick-and-steel flue rather than a tall chimney, an external steel stair to a roof gantry, stacked steel plate and two small loading doors along the lower-left face. Wide horizontal silhouette, muted slate and weathered brick with amber rust accents.

Transparency finishing prompt (the first draft had a baked checkerboard):

Use case: background-extraction. Production sprite finishing. Remove the entire white and gray CHECKERBOARD background from this image. Output a PNG with a REAL TRANSPARENT ALPHA CHANNEL: all background pixels alpha=0, not a rendered transparency pattern. Preserve the depicted object's shape, camera, colors, pixel-art finish and details exactly, including pale flowers or metal highlights. No backdrop, no checkerboard, no ground slab. Keep only the isolated object and tiny contact shadow. Center the complete object on a square transparent canvas with about 6 percent clear padding around its painted bounds. Do not redesign the subject.

Generation source: `<imagegen-output>/exec-c76d41e9-023a-4aab-9caa-4664d092bafb.png`.
Final source: `<imagegen-output>/exec-88de75c9-e526-47f4-91ef-82f064f2a843.png`.

## i3d — bulk-handling depot

Final: `assets/industrial/i3d.png`.

Generation prompt (direct genuine-alpha output; no extraction pass):

Use case: stylized-concept. Production Omaville city-builder mature industrial building sprite. Input image is STYLE AND CAMERA reference only, not the subject to copy. Match its elevated near-overhead orthographic view, front facing lower-left, warm crisp detailed 32-bit pixel art, cool blue-grey industrial palette with warm amber and rust accents. Must read clearly at 32px with distinct large masses and clean silhouette. Single complete isolated building on square canvas at native generation resolution. Genuine transparent RGBA alpha background, roughly 6 percent transparent padding around the painted bounds, roughly even framing. No ground slab, grass, road, checkerboard, cast shadow beyond a tiny contact shadow, text, signage lettering, people or vehicles. Do not add a tall red-and-white striped chimney. Subject: Mature bulk-handling depot: a tall windowless corrugated silo block in pale grey-green joined by an enclosed conveyor bridge to a lower steel transfer shed, with a small control cabin at the lower-left corner and a handful of dark ducting runs. Vertical mass on one side, low mass on the other, clearly asymmetric. No chimney at all.

Final source: `<imagegen-output>/exec-840f7750-0ce7-4c39-b3d3-33d63e51b44d.png`.
