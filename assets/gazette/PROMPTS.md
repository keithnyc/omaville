# Gazette engraving prompts — September 7

Six assets generated with built-in imagegen. No reference images. No code, tests, layout or deployment changes.

Finals: `masthead.png` (1024x256) and `spot-fire.png`, `spot-election.png`, `spot-growth.png`, `spot-money.png`, `spot-civic.png` (256x256 each).

All final RGB values are pure black; alpha is binary (0 or 255). Transparent negative spaces include interiors, not just the outer background. Generated white fills were removed during local ink separation. Grayscale downsampling was thresholded at 55% to retain engraved marks without grey washes or soft alpha. Spot subjects fit 224x224 with even margins. Masthead painted bounds were reframed to 1000x160, deliberately compressed vertically for the wide masthead format, then placed with 88px clear above and 8px below. Previewed on cream; spots checked at quarter size.

## masthead.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including all negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling exclusively through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. 1024x256 wide horizontal masthead panorama of a small industrial-era city seen from across a river: rooftops, central church spire, a few smoking chimneys, low warehouses and a modest bridge. Restrained balanced composition, roughly symmetrical around center. City and water occupy ONLY LOWER TWO THIRDS; entire TOP THIRD empty transparent sky reserved for runtime newspaper title, no important details there. Broad low skyline, no looming tall building. Engraved river ripples underneath, no rectangular vignette boundary. Readable at 256x64.
Source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-fda8d8b7-840a-4d99-92d3-eeb121d72e8a.png`.

Exact export command:

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-fda8d8b7-840a-4d99-92d3-eeb121d72e8a.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize '1000x160!' -gravity south -background white -extent 1024x248 -gravity north -extent 1024x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 /home/keith/omarchy-help/omaville/assets/gazette/masthead.png
```

## spot-fire.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including all negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling exclusively through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving: one building well alight with bold flame shapes breaking through the roof and a fire crew's ladder leaning against its facade. Dramatic but simple single clear silhouette; no surrounding city scene. Center subject with even generous padding. Reads clearly at 64x64; bold outer contours and sparse hatching, avoid dense miniature detail.
Source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-2cf0fd96-8711-44ef-afa0-7b798e5459cd.png`.

Exact export command:

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-2cf0fd96-8711-44ef-afa0-7b798e5459cd.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 /home/keith/omarchy-help/omaville/assets/gazette/spot-fire.png
```

## spot-election.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including all negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling exclusively through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving: a ballot box with a single hand and short cuff posting a blank folded paper into its slot. Civic, slightly pompous. Box and paper completely unlettered, no emblem. Single simple clear silhouette, centered with even generous padding. Reads clearly at 64x64; bold outer contours and sparse hatching.
Source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-b3651e4f-4903-4818-8f15-b3236ec1e25c.png`.

Exact export command:

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-b3651e4f-4903-4818-8f15-b3236ec1e25c.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 /home/keith/omarchy-help/omaville/assets/gazette/spot-election.png
```

## spot-growth.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including all negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling exclusively through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving: scaffolding around one half-built masonry block with a simple timber hoist lifting a small load of bricks. Optimistic construction, single clear compact silhouette, not an expansive building site. Centered with even generous padding. Reads clearly at 64x64; bold outer contours, few large structural elements and sparse hatching. No signs.
Source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-9488c512-af4c-4672-bff1-7876f468201d.png`.

Exact export command:

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-9488c512-af4c-4672-bff1-7876f468201d.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 /home/keith/omarchy-help/omaville/assets/gazette/spot-growth.png
```

## spot-money.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including all negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling exclusively through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving: a few stacks of large coins beside a closed ledger book with plain unlettered cover. Coins have simple rim hatching but absolutely no inscriptions, numbers or currency marks. Neutral mood suitable for good or bad financial news. Single clear compact silhouette, centered with even generous padding. Reads clearly at 64x64; bold outer contours and sparse hatching.
Source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-5d5ff7b2-78a0-4956-9645-85eca64f4e7a.png`.

Exact export command:

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-5d5ff7b2-78a0-4956-9645-85eca64f4e7a.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 /home/keith/omarchy-help/omaville/assets/gazette/spot-money.png
```

## spot-civic.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including all negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling exclusively through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving: a modest town hall facade seen straight on, classical pediment, four columns, central doors and broad steps. Institutional and dignified. No clock, flag, lettering or plaque inscriptions. One simple square-ish centered silhouette with even generous padding. Reads clearly at 64x64; bold outer contours and sparse hatching, no surrounding street scene.
Source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-ea889532-e611-4033-bf67-241c22472445.png`.

Exact export command:

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-ea889532-e611-4033-bf67-241c22472445.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 /home/keith/omarchy-help/omaville/assets/gazette/spot-civic.png
```

