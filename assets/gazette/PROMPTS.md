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

## Additional news-desk engravings — September 7

Built-in imagegen, referencing `spot-fire.png` and `spot-civic.png` for line weight and finish only. Finals: `spot-crime.png`, `spot-power.png`, `spot-road.png`, `spot-law.png`. Each is 256x256 RGBA, pure black RGB with binary alpha, subject fitted within 224x224 and centered. Same 55% ink separation as the first set; white fills and light checkerboard pixels removed rather than retained as paper. All four inspected at 46px against cream. No code, tests, desk mappings or deployment changes.

### spot-crime.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Reference images are LINE WEIGHT AND FINISH ONLY, not subjects. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving, single clear compact silhouette centered with even generous padding. Must read at 46px: bold outer contours, few large shapes, spare hatching rather than dense miniature detail. Subject: A Victorian night constable in a greatcoat and helmet holding a bullseye lantern beneath one simple street lamp. Uneasy, watchful, not violent. No weapon, no surrounding street scene, no opaque night sky; lantern light suggested with a few engraved rays, not a glow wash.

Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-d3aefd35-1f91-4001-962f-d3aa4727366c.png`.

Exact export command:

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-d3aefd35-1f91-4001-962f-d3aa4727366c.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 /home/keith/omarchy-help/omaville/assets/gazette/spot-crime.png
```

### spot-power.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Reference images are LINE WEIGHT AND FINISH ONLY, not subjects. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving, single clear compact silhouette centered with even generous padding. Must read at 46px: bold outer contours, few large shapes, spare hatching rather than dense miniature detail. Subject: Compact generating-station machinery dominated by one big belt-driven dynamo with a broad flywheel and visible belt, a small round pressure gauge and a boiler behind it. Gauge face has ticks and needle but NO numbers or lettering. Industrial machinery, no people, no room backdrop.

Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-977daa10-e7ae-40bb-a927-5cc0afdf7398.png`.

Gauge correction prompt:

Use case: precise-object-edit. Keep this Victorian black wood engraving of dynamo, belt, flywheel and boiler unchanged, except remove ALL numerals and number-like marks from the round pressure gauge. Gauge face must contain ONLY a central pointer and a few simple straight radial tick marks, no digits or lettering of any kind. Preserve composition, hatching, proportions and all other machinery. Genuine transparent alpha background, black ink only, no white fill, no checkerboard, no text.

Correction source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-aba2a342-a667-4e08-94df-4255ac10560f.png`.

Background extraction prompt (the gauge correction introduced a dark backdrop):

Use case: background-extraction. Extract the black-ink machinery engraving from this image. Remove ALL the dark black/gray background and halo outside the machinery and inside the open flywheel gaps. Actual transparent RGBA alpha outside subject, no background at all. Preserve the BLACK ink outlines and hatching of the boiler, gauge, dynamo, belt and wheel. Keep the gauge with tick marks only, no digits. This is BLACK ink to print on light paper, NOT white ink on black. No black backdrop, no gradient, no glow, no checkerboard. Center complete artwork with clear even padding on a square canvas.

Final generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-ada95a6a-8c8f-4859-ba90-67b4e8fe6d01.png`.

Exact export command:

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-ada95a6a-8c8f-4859-ba90-67b4e8fe6d01.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 /home/keith/omarchy-help/omaville/assets/gazette/spot-power.png
```

### spot-road.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Reference images are LINE WEIGHT AND FINISH ONLY, not subjects. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving, single clear compact silhouette centered with even generous padding. Must read at 46px: bold outer contours, few large shapes, spare hatching rather than dense miniature detail. Subject: A new turnpike road receding away toward a distant small town silhouette and the horizon, with one plain unlettered milepost prominent in foreground and a tiny cart traveling away. Read as departure and connection to another town. Strong converging road edges, sparse engraved verge marks; open transparent sky, no enclosing landscape rectangle.

Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-a2aaec47-7d78-4723-86c0-d433d30b6974.png`.

Exact export command:

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-a2aaec47-7d78-4723-86c0-d433d30b6974.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 /home/keith/omarchy-help/omaville/assets/gazette/spot-road.png
```

### spot-law.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Reference images are LINE WEIGHT AND FINISH ONLY, not subjects. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving, single clear compact silhouette centered with even generous padding. Must read at 46px: bold outer contours, few large shapes, spare hatching rather than dense miniature detail. Subject: One proclamation sheet nailed to a simple upright wooden notice board on a short post, curled paper corners and a round wax seal at bottom. The paper is COMPLETELY BLANK: no words, letters, pseudo-writing or rows of text-like lines. Only sparse hatching at curls and edges to show paper form. Clearly a public notice, not a courtroom. No gavel or scales.

Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-b9b00b90-520c-4a9a-b699-252a1f02bb2a.png`.

Exact export command:

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-b9b00b90-520c-4a9a-b699-252a1f02bb2a.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 /home/keith/omarchy-help/omaville/assets/gazette/spot-law.png
```

