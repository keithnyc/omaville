# commercial sprite prompts

## Additional tier-3 variants and departure — September 7

Built-in imagegen. All finals 256x256 RGBA with genuine alpha. Buildings reference `assets/residential/r3c.png` and `assets/industrial/i3c.png` for camera and finish only. Painted bounds fitted within 240x240, aspect preserved, bottom-centered with 8px bottom margin. Buildings inspected at 48px on green. Departure uses pure black ink with binary alpha, 224px bounds and even margins. No QML, Model.js, tests, tables or deployment changes.

### c3e.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville tier-3 city building sprite. Reference images are CAMERA AND PIXEL-ART FINISH ONLY, not building shape. Match elevated near-overhead orthographic view, front facing lower-left, warm crisp detailed 32-bit pixel art with clear chunky forms readable at 48px. Single complete isolated building on genuine transparent RGBA alpha, square canvas, even small transparent margins. No background, checkerboard, grass tile, ground slab, road, border, text, signage letters, people or vehicles. Tiny contact shadow only. A small forecourt or yard is implied by sparse freestanding details, never a painted ground rectangle. Strong distinctive silhouette rather than recolor. Cool blue-grey commercial: a corner department store with a rounded corner and domed turret, three-story curved shopfront and broad display windows, distinctive rounded roofline, no lettering.
Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-e82a940f-cdd2-4473-a8a9-a3273e90722e.png`.

Exact transparency finishing prompt:

Use case: background-extraction. Production game sprite. Remove the entire white/gray CHECKERBOARD backdrop, including open yard spaces and gaps between freestanding objects. Deliver genuine transparent RGBA alpha, all background pixels alpha=0, not a rendered transparency pattern. Preserve building silhouette, camera, palette and crisp pixel-art details exactly. No redesign, no ground slab, no cast shadow beyond tiny contact shadows, no text. Complete subject centered on square transparent canvas.

Transparent source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-45e80ef5-575c-4be6-bc4b-f3011ce5caa2.png`.

Export command (from omaville directory):

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-45e80ef5-575c-4be6-bc4b-f3011ce5caa2.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 240x240 -gravity south -background none -extent 256x248 -gravity north -extent 256x256 -strip -define png:color-type=6 assets/commercial/c3e.png
```

### c3f.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville tier-3 city building sprite. Reference images are CAMERA AND PIXEL-ART FINISH ONLY, not building shape. Match elevated near-overhead orthographic view, front facing lower-left, warm crisp detailed 32-bit pixel art with clear chunky forms readable at 48px. Single complete isolated building on genuine transparent RGBA alpha, square canvas, even small transparent margins. No background, checkerboard, grass tile, ground slab, road, border, text, signage letters, people or vehicles. Tiny contact shadow only. A small forecourt or yard is implied by sparse freestanding details, never a painted ground rectangle. Strong distinctive silhouette rather than recolor. Cool blue-grey commercial: a long shopping arcade dominated by a glazed BARREL roof, curved glass vault and a large arched entrance facing lower-left, narrow elongated silhouette.
Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-4652b705-b973-466d-95b8-d8e91182d5c1.png`.

Export command (from omaville directory):

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-4652b705-b973-466d-95b8-d8e91182d5c1.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 240x240 -gravity south -background none -extent 256x248 -gravity north -extent 256x256 -strip -define png:color-type=6 assets/commercial/c3f.png
```

### c3g.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville tier-3 city building sprite. Reference images are CAMERA AND PIXEL-ART FINISH ONLY, not building shape. Match elevated near-overhead orthographic view, front facing lower-left, warm crisp detailed 32-bit pixel art with clear chunky forms readable at 48px. Single complete isolated building on genuine transparent RGBA alpha, square canvas, even small transparent margins. No background, checkerboard, grass tile, ground slab, road, border, text, signage letters, people or vehicles. Tiny contact shadow only. A small forecourt or yard is implied by sparse freestanding details, never a painted ground rectangle. Strong distinctive silhouette rather than recolor. Cool blue-grey commercial: a narrow tall hotel with a projecting entrance canopy and many small windows, six stories, slim high roofline, no lettering or signs.
Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-d5c167fe-9e1e-44c4-b298-50410932239c.png`.

Export command (from omaville directory):

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-d5c167fe-9e1e-44c4-b298-50410932239c.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 240x240 -gravity south -background none -extent 256x248 -gravity north -extent 256x256 -strip -define png:color-type=6 assets/commercial/c3g.png
```

### c3h.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville tier-3 city building sprite. Reference images are CAMERA AND PIXEL-ART FINISH ONLY, not building shape. Match elevated near-overhead orthographic view, front facing lower-left, warm crisp detailed 32-bit pixel art with clear chunky forms readable at 48px. Single complete isolated building on genuine transparent RGBA alpha, square canvas, even small transparent margins. No background, checkerboard, grass tile, ground slab, road, border, text, signage letters, people or vehicles. Tiny contact shadow only. A small forecourt or yard is implied by sparse freestanding details, never a painted ground rectangle. Strong distinctive silhouette rather than recolor. Cool blue-grey commercial: a wide LOW market hall with a raised clerestory ridge, broad pitched roof and repeated large ground-level market arches, strong horizontal silhouette.
Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-bc61e264-29e8-4153-8384-e0928a0afb07.png`.

Exact transparency finishing prompt:

Use case: background-extraction. Production game sprite. Remove the entire white/gray CHECKERBOARD backdrop, including open yard spaces and gaps between freestanding objects. Deliver genuine transparent RGBA alpha, all background pixels alpha=0, not a rendered transparency pattern. Preserve building silhouette, camera, palette and crisp pixel-art details exactly. No redesign, no ground slab, no cast shadow beyond tiny contact shadows, no text. Complete subject centered on square transparent canvas.

Transparent source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-c6093de7-a0a7-433a-a997-08df0dd23275.png`.

Export command (from omaville directory):

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-c6093de7-a0a7-433a-a997-08df0dd23275.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 240x240 -gravity south -background none -extent 256x248 -gravity north -extent 256x256 -strip -define png:color-type=6 assets/commercial/c3h.png
```

