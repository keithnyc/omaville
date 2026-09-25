## Additional tier-3 variants and departure — September 7

Built-in imagegen. All finals 256x256 RGBA with genuine alpha. Buildings reference `assets/residential/r3c.png` and `assets/industrial/i3c.png` for camera and finish only. Painted bounds fitted within 240x240, aspect preserved, bottom-centered with 8px bottom margin. Buildings inspected at 48px on green. Departure uses pure black ink with binary alpha, 224px bounds and even margins. No QML, Model.js, tests, tables or deployment changes.

### spot-departure.png

Exact generation prompt:

Use case: historical-scene. Victorian newspaper wood engraving, pure black ink on genuine transparent alpha, rough printed hatching and stipple, no grey wash, no frame, no text or lettering anywhere. Square compact isolated spot illustration legible at 46px, centered with even margins. A family with backs turned beside a loaded handcart, luggage roped on, walking away from viewer at the edge of town. Clearly leaving home for good, subdued departure rather than arriving along a grand new road. Few clear figures and one cart silhouette, minimal town-edge suggestion, no broad landscape background. No white paper fill or checkerboard.
Generation source: `<imagegen-output>/exec-c3559d90-923b-4a47-b16e-5e05f18a2376.png`.

Export command (from omaville directory):

```bash
magick <imagegen-output>/exec-c3559d90-923b-4a47-b16e-5e05f18a2376.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 assets/gazette/spot-departure.png
```

# Gazette engraving prompts — September 7

Six assets generated with built-in imagegen. No reference images. No code, tests, layout or deployment changes.

Finals: `masthead.png` (1024x256) and `spot-fire.png`, `spot-election.png`, `spot-growth.png`, `spot-money.png`, `spot-civic.png` (256x256 each).

All final RGB values are pure black; alpha is binary (0 or 255). Transparent negative spaces include interiors, not just the outer background. Generated white fills were removed during local ink separation. Grayscale downsampling was thresholded at 55% to retain engraved marks without grey washes or soft alpha. Spot subjects fit 224x224 with even margins. Masthead painted bounds were reframed to 1000x160, deliberately compressed vertically for the wide masthead format, then placed with 88px clear above and 8px below. Previewed on cream; spots checked at quarter size.

## masthead.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including all negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling exclusively through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. 1024x256 wide horizontal masthead panorama of a small industrial-era city seen from across a river: rooftops, central church spire, a few smoking chimneys, low warehouses and a modest bridge. Restrained balanced composition, roughly symmetrical around center. City and water occupy ONLY LOWER TWO THIRDS; entire TOP THIRD empty transparent sky reserved for runtime newspaper title, no important details there. Broad low skyline, no looming tall building. Engraved river ripples underneath, no rectangular vignette boundary. Readable at 256x64.
Source: `<imagegen-output>/exec-fda8d8b7-840a-4d99-92d3-eeb121d72e8a.png`.

Exact export command:

```bash
magick <imagegen-output>/exec-fda8d8b7-840a-4d99-92d3-eeb121d72e8a.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize '1000x160!' -gravity south -background white -extent 1024x248 -gravity north -extent 1024x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 assets/gazette/masthead.png
```

## spot-fire.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including all negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling exclusively through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving: one building well alight with bold flame shapes breaking through the roof and a fire crew's ladder leaning against its facade. Dramatic but simple single clear silhouette; no surrounding city scene. Center subject with even generous padding. Reads clearly at 64x64; bold outer contours and sparse hatching, avoid dense miniature detail.
Source: `<imagegen-output>/exec-2cf0fd96-8711-44ef-afa0-7b798e5459cd.png`.

Exact export command:

```bash
magick <imagegen-output>/exec-2cf0fd96-8711-44ef-afa0-7b798e5459cd.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 assets/gazette/spot-fire.png
```

## spot-election.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including all negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling exclusively through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving: a ballot box with a single hand and short cuff posting a blank folded paper into its slot. Civic, slightly pompous. Box and paper completely unlettered, no emblem. Single simple clear silhouette, centered with even generous padding. Reads clearly at 64x64; bold outer contours and sparse hatching.
Source: `<imagegen-output>/exec-b3651e4f-4903-4818-8f15-b3236ec1e25c.png`.

Exact export command:

```bash
magick <imagegen-output>/exec-b3651e4f-4903-4818-8f15-b3236ec1e25c.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 assets/gazette/spot-election.png
```

## spot-growth.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including all negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling exclusively through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving: scaffolding around one half-built masonry block with a simple timber hoist lifting a small load of bricks. Optimistic construction, single clear compact silhouette, not an expansive building site. Centered with even generous padding. Reads clearly at 64x64; bold outer contours, few large structural elements and sparse hatching. No signs.
Source: `<imagegen-output>/exec-9488c512-af4c-4672-bff1-7876f468201d.png`.

Exact export command:

```bash
magick <imagegen-output>/exec-9488c512-af4c-4672-bff1-7876f468201d.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 assets/gazette/spot-growth.png
```

## spot-money.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including all negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling exclusively through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving: a few stacks of large coins beside a closed ledger book with plain unlettered cover. Coins have simple rim hatching but absolutely no inscriptions, numbers or currency marks. Neutral mood suitable for good or bad financial news. Single clear compact silhouette, centered with even generous padding. Reads clearly at 64x64; bold outer contours and sparse hatching.
Source: `<imagegen-output>/exec-5d5ff7b2-78a0-4956-9645-85eca64f4e7a.png`.

Exact export command:

```bash
magick <imagegen-output>/exec-5d5ff7b2-78a0-4956-9645-85eca64f4e7a.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 assets/gazette/spot-money.png
```

## spot-civic.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including all negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling exclusively through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving: a modest town hall facade seen straight on, classical pediment, four columns, central doors and broad steps. Institutional and dignified. No clock, flag, lettering or plaque inscriptions. One simple square-ish centered silhouette with even generous padding. Reads clearly at 64x64; bold outer contours and sparse hatching, no surrounding street scene.
Source: `<imagegen-output>/exec-ea889532-e611-4033-bf67-241c22472445.png`.

Exact export command:

```bash
magick <imagegen-output>/exec-ea889532-e611-4033-bf67-241c22472445.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 assets/gazette/spot-civic.png
```

## Additional news-desk engravings — September 7

Built-in imagegen, referencing `spot-fire.png` and `spot-civic.png` for line weight and finish only. Finals: `spot-crime.png`, `spot-power.png`, `spot-road.png`, `spot-law.png`. Each is 256x256 RGBA, pure black RGB with binary alpha, subject fitted within 224x224 and centered. Same 55% ink separation as the first set; white fills and light checkerboard pixels removed rather than retained as paper. All four inspected at 46px against cream. No code, tests, desk mappings or deployment changes.

### spot-crime.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Reference images are LINE WEIGHT AND FINISH ONLY, not subjects. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving, single clear compact silhouette centered with even generous padding. Must read at 46px: bold outer contours, few large shapes, spare hatching rather than dense miniature detail. Subject: A Victorian night constable in a greatcoat and helmet holding a bullseye lantern beneath one simple street lamp. Uneasy, watchful, not violent. No weapon, no surrounding street scene, no opaque night sky; lantern light suggested with a few engraved rays, not a glow wash.

Generation source: `<imagegen-output>/exec-d3aefd35-1f91-4001-962f-d3aa4727366c.png`.

Exact export command:

```bash
magick <imagegen-output>/exec-d3aefd35-1f91-4001-962f-d3aa4727366c.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 assets/gazette/spot-crime.png
```

### spot-power.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Reference images are LINE WEIGHT AND FINISH ONLY, not subjects. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving, single clear compact silhouette centered with even generous padding. Must read at 46px: bold outer contours, few large shapes, spare hatching rather than dense miniature detail. Subject: Compact generating-station machinery dominated by one big belt-driven dynamo with a broad flywheel and visible belt, a small round pressure gauge and a boiler behind it. Gauge face has ticks and needle but NO numbers or lettering. Industrial machinery, no people, no room backdrop.

Generation source: `<imagegen-output>/exec-977daa10-e7ae-40bb-a927-5cc0afdf7398.png`.

Gauge correction prompt:

Use case: precise-object-edit. Keep this Victorian black wood engraving of dynamo, belt, flywheel and boiler unchanged, except remove ALL numerals and number-like marks from the round pressure gauge. Gauge face must contain ONLY a central pointer and a few simple straight radial tick marks, no digits or lettering of any kind. Preserve composition, hatching, proportions and all other machinery. Genuine transparent alpha background, black ink only, no white fill, no checkerboard, no text.

Correction source: `<imagegen-output>/exec-aba2a342-a667-4e08-94df-4255ac10560f.png`.

Background extraction prompt (the gauge correction introduced a dark backdrop):

Use case: background-extraction. Extract the black-ink machinery engraving from this image. Remove ALL the dark black/gray background and halo outside the machinery and inside the open flywheel gaps. Actual transparent RGBA alpha outside subject, no background at all. Preserve the BLACK ink outlines and hatching of the boiler, gauge, dynamo, belt and wheel. Keep the gauge with tick marks only, no digits. This is BLACK ink to print on light paper, NOT white ink on black. No black backdrop, no gradient, no glow, no checkerboard. Center complete artwork with clear even padding on a square canvas.

Final generation source: `<imagegen-output>/exec-ada95a6a-8c8f-4859-ba90-67b4e8fe6d01.png`.

Exact export command:

```bash
magick <imagegen-output>/exec-ada95a6a-8c8f-4859-ba90-67b4e8fe6d01.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 assets/gazette/spot-power.png
```

### spot-road.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Reference images are LINE WEIGHT AND FINISH ONLY, not subjects. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving, single clear compact silhouette centered with even generous padding. Must read at 46px: bold outer contours, few large shapes, spare hatching rather than dense miniature detail. Subject: A new turnpike road receding away toward a distant small town silhouette and the horizon, with one plain unlettered milepost prominent in foreground and a tiny cart traveling away. Read as departure and connection to another town. Strong converging road edges, sparse engraved verge marks; open transparent sky, no enclosing landscape rectangle.

Generation source: `<imagegen-output>/exec-a2aaec47-7d78-4723-86c0-d433d30b6974.png`.

Exact export command:

```bash
magick <imagegen-output>/exec-a2aaec47-7d78-4723-86c0-d433d30b6974.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 assets/gazette/spot-road.png
```

### spot-law.png

Exact generation prompt:

Use case: historical-scene. Production illustration for a fictional Victorian city newspaper. Reference images are LINE WEIGHT AND FINISH ONLY, not subjects. Authentic nineteenth-century broadsheet WOOD ENGRAVING, slightly rough imperfect press-printed ink line quality. PURE BLACK INK ONLY on genuine TRANSPARENT ALPHA, including negative spaces inside subject: no white fill, no paper background, no checkerboard. Modeling through crisp hatching, cross-hatching and stipple; no grey washes, soft shading, gradients, color or pixel art. No text whatsoever, no letters, numbers, captions, signatures, frames, borders or drop shadows. Square spot engraving, single clear compact silhouette centered with even generous padding. Must read at 46px: bold outer contours, few large shapes, spare hatching rather than dense miniature detail. Subject: One proclamation sheet nailed to a simple upright wooden notice board on a short post, curled paper corners and a round wax seal at bottom. The paper is COMPLETELY BLANK: no words, letters, pseudo-writing or rows of text-like lines. Only sparse hatching at curls and edges to show paper form. Clearly a public notice, not a courtroom. No gavel or scales.

Generation source: `<imagegen-output>/exec-b9b00b90-520c-4a9a-b699-252a1f02bb2a.png`.

Exact export command:

```bash
magick <imagegen-output>/exec-b9b00b90-520c-4a9a-b699-252a1f02bb2a.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 assets/gazette/spot-law.png
```

## Mourning, empty treasury, and Residents trades — September 7

Built-in imagegen. Gazette pair uses `spot-fire.png` as finish reference; trades generated without reference images. No code, tests or deployment changes.

All six finals are 256x256 RGBA, painted bounds fitted within 224x224 and centered, with binary alpha. Gazette pair is pure #000000 ink; trades are exclusively #e8e4d6 ink. Generation returned conventional dark hatching with pale interior fills for the trade scenes despite the light-ink request, so local ink separation removes the pale fills and recolors the dark engraved marks to #e8e4d6. This produces the requested negative engraving, not an opaque pale cutout or black background. Same 55% threshold export as earlier spots. Inspected Gazette pair at 46px on cream and trades at 40px on #1e1e2e. No text in the images.

### assets/gazette/spot-mourning.png

Exact generation prompt:

Use case: historical-scene. Production Victorian nineteenth-century newspaper WOOD ENGRAVING. Slightly rough press-printed hatching, cross-hatching and stipple, not vector-clean, no grey washes, gradients, pixel art or flat silhouette fills. Square isolated compact composition centered with generous even padding, bold simplified shapes readable at 40-46 pixels. No text, lettering, numerals, signature, border, frame or background. Pure BLACK ink on genuine TRANSPARENT ALPHA; all negative spaces transparent, including interior spaces that would be paper. Reference image is engraved finish only. Subject: A mourning wreath of dark leaves with long trailing crape ribbon hung prominently on a modest panelled front door. Wreath and ribbon large enough to recognize at thumbnail size. Sombre domestic house in mourning, not a cemetery or monument. No gravestone, cross, inscription or flowers obscuring the wreath.

Generation source: `<imagegen-output>/exec-15aed41b-c654-4ee4-bcee-bd450fbd3bd5.png`.

Exact export command:

```bash
magick <imagegen-output>/exec-15aed41b-c654-4ee4-bcee-bd450fbd3bd5.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 assets/gazette/spot-mourning.png
```

### assets/gazette/spot-empty.png

Exact generation prompt:

Use case: historical-scene. Production Victorian nineteenth-century newspaper WOOD ENGRAVING. Slightly rough press-printed hatching, cross-hatching and stipple, not vector-clean, no grey washes, gradients, pixel art or flat silhouette fills. Square isolated compact composition centered with generous even padding, bold simplified shapes readable at 40-46 pixels. No text, lettering, numerals, signature, border, frame or background. Pure BLACK ink on genuine TRANSPARENT ALPHA; all negative spaces transparent, including interior spaces that would be paper. Reference image is engraved finish only. Subject: An iron strongbox tipped on its side, lid wide open revealing a visibly EMPTY interior, only three small coins spilled and settled beside it. Strong diagonal tipped box silhouette and conspicuous open lid. Reads as money gone, no piles or stacks of coins, no treasure, no inscriptions.

Generation source: `<imagegen-output>/exec-5424ec83-ddd0-4a03-8176-3301836debd2.png`.

Exact export command:

```bash
magick <imagegen-output>/exec-5424ec83-ddd0-4a03-8176-3301836debd2.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill black -colorize 100 -strip -define png:color-type=6 assets/gazette/spot-empty.png
```

### assets/trades/trade-works.png

Exact generation prompt:

Use case: historical-scene. Production Victorian nineteenth-century newspaper WOOD ENGRAVING. Slightly rough press-printed hatching, cross-hatching and stipple, not vector-clean, no grey washes, gradients, pixel art or flat silhouette fills. Square isolated compact composition centered with generous even padding, bold simplified shapes readable at 40-46 pixels. No text, lettering, numerals, signature, border, frame or background. WHITE-LINE engraving for a dark UI panel: only near-white warm ivory #e8e4d6 hatching and contours on genuine TRANSPARENT ALPHA. Inverted newspaper engraving, what would be black ink is now light ivory and empty paper is transparent. No black ink, no opaque black background, no white paper fill, no checkerboard. One worker seen at work from a chest-height viewpoint, compact waist-up or seated vignette. Face indistinct and turned away, no identifiable facial features or strongly gendered portrait cues, emphasize the work not identity. Subject: A fitter or moulder in plain work clothes with sleeves rolled, one hand on the work at a compact belt-driven workshop machine. One broad flywheel, workbench and a few clear machine forms, heat and iron suggested by engraved texture. No crowded workshop backdrop.

Generation source: `<imagegen-output>/exec-1ec4771f-c2eb-44cc-8dde-e8543c30ab07.png`.

Exact export command:

```bash
magick <imagegen-output>/exec-1ec4771f-c2eb-44cc-8dde-e8543c30ab07.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill '#e8e4d6' -colorize 100 -strip -define png:color-type=6 assets/trades/trade-works.png
```

### assets/trades/trade-counter.png

Exact generation prompt:

Use case: historical-scene. Production Victorian nineteenth-century newspaper WOOD ENGRAVING. Slightly rough press-printed hatching, cross-hatching and stipple, not vector-clean, no grey washes, gradients, pixel art or flat silhouette fills. Square isolated compact composition centered with generous even padding, bold simplified shapes readable at 40-46 pixels. No text, lettering, numerals, signature, border, frame or background. WHITE-LINE engraving for a dark UI panel: only near-white warm ivory #e8e4d6 hatching and contours on genuine TRANSPARENT ALPHA. Inverted newspaper engraving, what would be black ink is now light ivory and empty paper is transparent. No black ink, no opaque black background, no white paper fill, no checkerboard. One worker seen at work from a chest-height viewpoint, compact waist-up or seated vignette. Face indistinct and turned away, no identifiable facial features or strongly gendered portrait cues, emphasize the work not identity. Subject: A neat clerk at a tall sloped desk, open ledger and pen in hand. Figure turned three-quarters away, attention on the work. Ledger pages blank except page-edge hatching, absolutely no handwriting or pseudo-text. Compact indoors working vignette, no room background.

Generation source: `<imagegen-output>/exec-c983da2a-1ace-42b7-85e0-1eda8d7db03b.png`.

Exact export command:

```bash
magick <imagegen-output>/exec-c983da2a-1ace-42b7-85e0-1eda8d7db03b.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill '#e8e4d6' -colorize 100 -strip -define png:color-type=6 assets/trades/trade-counter.png
```

### assets/trades/trade-street.png

Exact generation prompt:

Use case: historical-scene. Production Victorian nineteenth-century newspaper WOOD ENGRAVING. Slightly rough press-printed hatching, cross-hatching and stipple, not vector-clean, no grey washes, gradients, pixel art or flat silhouette fills. Square isolated compact composition centered with generous even padding, bold simplified shapes readable at 40-46 pixels. No text, lettering, numerals, signature, border, frame or background. WHITE-LINE engraving for a dark UI panel: only near-white warm ivory #e8e4d6 hatching and contours on genuine TRANSPARENT ALPHA. Inverted newspaper engraving, what would be black ink is now light ivory and empty paper is transparent. No black ink, no opaque black background, no white paper fill, no checkerboard. One worker seen at work from a chest-height viewpoint, compact waist-up or seated vignette. Face indistinct and turned away, no identifiable facial features or strongly gendered portrait cues, emphasize the work not identity. Subject: A carter beside a loaded handcart, hands resting on its handles, plain weathered outdoor work clothes. One prominent cart wheel and a few bundled loads. Head turned away, outdoor labor and sturdy hands, no surrounding landscape.

Generation source: `<imagegen-output>/exec-89c0c941-a5f9-4c3f-8bba-e66e4a65ba3b.png`.

Exact export command:

```bash
magick <imagegen-output>/exec-89c0c941-a5f9-4c3f-8bba-e66e4a65ba3b.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill '#e8e4d6' -colorize 100 -strip -define png:color-type=6 assets/trades/trade-street.png
```

### assets/trades/trade-retired.png

Exact generation prompt:

Use case: historical-scene. Production Victorian nineteenth-century newspaper WOOD ENGRAVING. Slightly rough press-printed hatching, cross-hatching and stipple, not vector-clean, no grey washes, gradients, pixel art or flat silhouette fills. Square isolated compact composition centered with generous even padding, bold simplified shapes readable at 40-46 pixels. No text, lettering, numerals, signature, border, frame or background. WHITE-LINE engraving for a dark UI panel: only near-white warm ivory #e8e4d6 hatching and contours on genuine TRANSPARENT ALPHA. Inverted newspaper engraving, what would be black ink is now light ivory and empty paper is transparent. No black ink, no opaque black background, no white paper fill, no checkerboard. One worker seen at work from a chest-height viewpoint, compact waist-up or seated vignette. Face indistinct and turned away, no identifiable facial features or strongly gendered portrait cues, emphasize the work not identity. Subject: An older figure seated comfortably beside a small suggestion of a window, holding a cup, a walking stick resting beside the chair. Dignified and at rest, not frail or comic. Face turned toward the window and indistinct. Simple compact seated silhouette, no room backdrop.

Generation source: `<imagegen-output>/exec-9cba4e7d-3481-4b4d-922d-08d29b852caf.png`.

Exact export command:

```bash
magick <imagegen-output>/exec-9cba4e7d-3481-4b4d-922d-08d29b852caf.png -background white -alpha remove -alpha off -colorspace gray -fuzz 8% -trim +repage -filter Lanczos -resize 224x224 -gravity center -background white -extent 256x256 -threshold 55% -transparent white -fill '#e8e4d6' -colorize 100 -strip -define png:color-type=6 assets/trades/trade-retired.png
```
