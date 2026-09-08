# residential sprite prompts

## Additional tier-3 variants and departure — September 7

Built-in imagegen. All finals 256x256 RGBA with genuine alpha. Buildings reference `assets/residential/r3c.png` and `assets/industrial/i3c.png` for camera and finish only. Painted bounds fitted within 240x240, aspect preserved, bottom-centered with 8px bottom margin. Buildings inspected at 48px on green. Departure uses pure black ink with binary alpha, 224px bounds and even margins. No QML, Model.js, tests, tables or deployment changes.

### r3e.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville tier-3 city building sprite. Reference images are CAMERA AND PIXEL-ART FINISH ONLY, not building shape. Match elevated near-overhead orthographic view, front facing lower-left, warm crisp detailed 32-bit pixel art with clear chunky forms readable at 48px. Single complete isolated building on genuine transparent RGBA alpha, square canvas, even small transparent margins. No background, checkerboard, grass tile, ground slab, road, border, text, signage letters, people or vehicles. Tiny contact shadow only. A small forecourt or yard is implied by sparse freestanding details, never a painted ground rectangle. Strong distinctive silhouette rather than recolor. Warm terracotta and cream residential: a long NARROW attached terrace row seen end-on, receding away from lower-left frontage; three-story homes with repeated pitched roofs and chimneys, unmistakably elongated depth, not square apartment block.
Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-2bdc5b56-fffc-42fc-ac75-5c98e723a5a0.png`.

Exact transparency finishing prompt:

Use case: background-extraction. Production game sprite. Remove the entire white/gray CHECKERBOARD backdrop, including open yard spaces and gaps between freestanding objects. Deliver genuine transparent RGBA alpha, all background pixels alpha=0, not a rendered transparency pattern. Preserve building silhouette, camera, palette and crisp pixel-art details exactly. No redesign, no ground slab, no cast shadow beyond tiny contact shadows, no text. Complete subject centered on square transparent canvas.

Transparent source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-099a1ab8-412b-41dd-8031-e39ef238b1d0.png`.

Export command (from omaville directory):

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-099a1ab8-412b-41dd-8031-e39ef238b1d0.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 240x240 -gravity south -background none -extent 256x248 -gravity north -extent 256x256 -strip -define png:color-type=6 assets/residential/r3e.png
```

### r3f.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville tier-3 city building sprite. Reference images are CAMERA AND PIXEL-ART FINISH ONLY, not building shape. Match elevated near-overhead orthographic view, front facing lower-left, warm crisp detailed 32-bit pixel art with clear chunky forms readable at 48px. Single complete isolated building on genuine transparent RGBA alpha, square canvas, even small transparent margins. No background, checkerboard, grass tile, ground slab, road, border, text, signage letters, people or vehicles. Tiny contact shadow only. A small forecourt or yard is implied by sparse freestanding details, never a painted ground rectangle. Strong distinctive silhouette rather than recolor. Warm terracotta and cream residential: an L-shaped four-story corner apartment block wrapping an open corner courtyard, two perpendicular wings, obvious deep concave notch and L-shaped roofline.
Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-8b583ce2-95f4-41e8-9617-15e91dc556c0.png`.

Export command (from omaville directory):

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-8b583ce2-95f4-41e8-9617-15e91dc556c0.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 240x240 -gravity south -background none -extent 256x248 -gravity north -extent 256x256 -strip -define png:color-type=6 assets/residential/r3f.png
```

### r3g.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville tier-3 city building sprite. Reference images are CAMERA AND PIXEL-ART FINISH ONLY, not building shape. Match elevated near-overhead orthographic view, front facing lower-left, warm crisp detailed 32-bit pixel art with clear chunky forms readable at 48px. Single complete isolated building on genuine transparent RGBA alpha, square canvas, even small transparent margins. No background, checkerboard, grass tile, ground slab, road, border, text, signage letters, people or vehicles. Tiny contact shadow only. A small forecourt or yard is implied by sparse freestanding details, never a painted ground rectangle. Strong distinctive silhouette rather than recolor. Warm terracotta and cream residential: a tall THIN six-story tenement noticeably taller than wide, narrow footprint, flat parapet roof, slim vertical silhouette, many small windows.
Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-ab0bf5f5-b158-4538-9049-194b2eb695c5.png`.

Export command (from omaville directory):

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-ab0bf5f5-b158-4538-9049-194b2eb695c5.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 240x240 -gravity south -background none -extent 256x248 -gravity north -extent 256x256 -strip -define png:color-type=6 assets/residential/r3g.png
```

### r3h.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville tier-3 city building sprite. Reference images are CAMERA AND PIXEL-ART FINISH ONLY, not building shape. Match elevated near-overhead orthographic view, front facing lower-left, warm crisp detailed 32-bit pixel art with clear chunky forms readable at 48px. Single complete isolated building on genuine transparent RGBA alpha, square canvas, even small transparent margins. No background, checkerboard, grass tile, ground slab, road, border, text, signage letters, people or vehicles. Tiny contact shadow only. A small forecourt or yard is implied by sparse freestanding details, never a painted ground rectangle. Strong distinctive silhouette rather than recolor. Warm terracotta and cream residential: a WIDE LOW mansion block with a central triangular pediment and two spreading symmetrical wings, two stories and low hipped roofs, horizontal silhouette.
Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-9d73e869-5d14-4e5b-91d1-283bdb10be93.png`.

Export command (from omaville directory):

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-9d73e869-5d14-4e5b-91d1-283bdb10be93.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 240x240 -gravity south -background none -extent 256x248 -gravity north -extent 256x256 -strip -define png:color-type=6 assets/residential/r3h.png
```

