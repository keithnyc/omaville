# Decoration sprites

Generated with ImageGen using `assets/parks/p2.png` as the style reference.
Transparent 256x256 RGBA exports, trimmed and bottom-centered, alpha below 5%
removed. No baked lot; CityView supplies shared terrain.

## Tree

Production Omaville city-builder decoration sprite: a single beautiful leafy deciduous tree, chunky warm trunk with branching roots, rounded lush green canopy with olive sunlit clusters and deep teal shade, tiny flowers at base. Match the reference's crisp detailed 32-bit pixel-art style, elevated orthographic camera, compact one-tile scale. Reference is style only: remove bench, lamp, path, other trees. One isolated tree, NO ground slab or lot. Genuine transparent alpha background like the reference, tiny contact shadow only. No checkerboard, text, opaque background, people. Readable at 32px.

## Flowerbed — historical prompt (superseded September 6)

Production Omaville city-builder decoration sprite: a compact oval raised flowerbed edged in warm cream stones, abundant small pink, yellow, lavender and white flowers, lush low green leaves, one small decorative terracotta pot. Match the reference's crisp detailed 32-bit pixel-art style, elevated orthographic camera, compact one-tile scale. Reference is style only: no trees, bench, lamp or path. One isolated flowerbed, NO ground slab or lot. Genuine transparent alpha background like the reference, tiny contact shadow only. No checkerboard, text, opaque background, people. Readable at 32px.

## Flowerbed — corrected camera, September 6

Built-in imagegen with tree.png as the sole style/camera reference. Original
RGBA export retained in sources/flowers-overhead.png; final flowers.png is
256x256, trimmed and bottom-centred. Local normalization (authorized by Keith):

```bash
magick assets/decorations/sources/flowers-overhead.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize '256x256>' -gravity south -background none -extent 256x256 -strip -define png:color-type=6 assets/decorations/flowers.png
```

Final generation prompt:

Use case: stylized-concept. Production Omaville flowerbed game sprite. Input image is STYLE, LIGHTING AND CAMERA reference only: the existing tree. Generate one compact circular low flowerbed viewed from the SAME elevated near-overhead orthographic camera as the tree, looking down around 70 degrees. Bed is on horizontal ground: a broad near-circular oval, width only about 1.2 times its depth, NOT a thin diagonal diamond or tilted tray. Very low warm cream stone edging, mostly top surfaces visible, minimal vertical front wall. Dense low green foliage and distinct small pink, yellow, lavender flowers with a few cream flowers. Crisp warm detailed 32-bit pixel-art clusters matching tree; sunlight upper-left, cool teal leaf shadows. No tree, pot, grass square, pavement, backdrop, caption, or surrounding ground slab. Single isolated complete object on genuine transparent RGBA background, tiny contact shadow only. Centre horizontally and bottom align on square canvas, use most of canvas width with small clear margin. Readable at 32px. No painted checkerboard. Preserve clear calm outer silhouette.

CityView.decorationMetrics.B now matches T: scale1.08, baseline0.97.
The actual drawTile branch is exercised beside the tree by
`node tests/infrastructure-art.mjs --preview`, at large and 48px sizes.
Tests additionally pin equal scale/baseline and drawing at four zoom levels.

## Flowerbed — compact square footprint, September 7

Final: `assets/decorations/flowers.png`, 256x256 RGBA with genuine alpha.
Built-in imagegen; tree.png was style/camera reference and the previous flowers.png was the footprint-edit reference. Camera and palette retained; four straight sides replace the oval. Painted width capped at 174px (68% of canvas), horizontally centered and 8px below vertical center, with generous padding. Compared side by side with tree.png. No renderer, metrics, tests or deployment changes.

Generation prompt:

Use case: stylized-concept. Production Omaville city-builder decoration sprite. Input image 1 (tree) is STYLE AND CAMERA ONLY; image 2 is the existing flowerbed whose camera, flower palette and finish must stay unchanged. Regenerate its footprint and shape only. A compact SQUARE raised flowerbed, noticeably SMALL within its frame — a tidy low planter box, not a wide oval border. Four straight sides and squared corners, top footprint square rather than circular or oval. Low warm cream stone edging on all four sides, filled with dense small pink, yellow and lavender flowers over low green leaves. Match the existing flowerbed's elevated near-overhead orthographic camera and the tree's warm crisp detailed 32-bit pixel art and tiny contact shadow. Keep vertical edging very low. Isolated object on genuine transparent RGBA alpha with generous roughly even padding: painted object occupies about 68 percent of square canvas width, centered horizontally and very slightly below center. No ground slab, grass, path, outer frame border, checkerboard, text, people or other objects. Readable at 32px.

Transparency finishing prompt (applied to the generated draft):

Use case: background-extraction. Production sprite finishing. Remove the entire white and gray CHECKERBOARD background from this image. Output a PNG with a REAL TRANSPARENT ALPHA CHANNEL: all background pixels alpha=0, not a rendered transparency pattern. Preserve the depicted object's shape, camera, colors, pixel-art finish and details exactly, including pale flowers or metal highlights. No backdrop, no checkerboard, no ground slab. Keep only the isolated object and tiny contact shadow. Center the complete object on a square transparent canvas with about 6 percent clear padding around its painted bounds. Do not redesign the subject.

Final local format normalization, preserving aspect ratio:

```bash
magick INPUT.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 174x174 -gravity center -background none -extent 256x240 -gravity south -extent 256x256 -strip -define png:color-type=6 assets/decorations/flowers.png
```

Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-4cabd619-a1ee-4c4d-84a6-a63d7073c271.png`.
Transparency-finished source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-f3fe5cac-0f88-4e0f-94d9-6c3741f793ee.png`.

## Four additional decorations — September 7

Built-in imagegen, with `assets/decorations/tree.png` as the sole style/camera reference. Finals: `fountain.png`, `statue.png`, `hedge.png`, `bench.png` in this directory. All are 256x256 RGBA with genuine alpha, aspect-preserving painted bounds fitted within 200x200 pixels, centered horizontally and 8px below vertical center with generous padding. Inspected together at 32px on plain green. No QML, Model.js, tables, tests or deployment changes.

Shared local export normalization (INPUT is the final generation source, OUTPUT the named PNG):

```bash
magick INPUT.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 200x200 -gravity center -background none -extent 256x240 -gravity south -extent 256x256 -strip -define png:color-type=6 OUTPUT.png
```

### fountain.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville city-builder decoration sprite. Reference image is STYLE AND CAMERA ONLY. Match its elevated near-overhead orthographic camera, warm crisp detailed 32-bit pixel art, and tiny contact shadow. Single isolated object on genuine transparent RGBA alpha with even padding, no ground slab, no grass, no path, no border, no checkerboard, no text, no living people. Readable at 32px with clean chunky color clusters. Square canvas; complete compact subject sits comfortably inside frame, horizontally centered, slightly below center with generous transparent margins. Subject: A small circular stone fountain — pale warm limestone basin with a low rim, a simple central tier, and clear turquoise water with a modest spout and a few ripples. Civic and tidy rather than ornate. Compact and clearly round.

Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-f12cecf6-4796-45e6-a41e-be5cd1e1d539.png`.

### statue.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville city-builder decoration sprite. Reference image is STYLE AND CAMERA ONLY. Match its elevated near-overhead orthographic camera, warm crisp detailed 32-bit pixel art, and tiny contact shadow. Single isolated object on genuine transparent RGBA alpha with even padding, no ground slab, no grass, no path, no border, no checkerboard, no text, no living people. Readable at 32px with clean chunky color clusters. Square canvas; complete compact subject sits comfortably inside frame, horizontally centered, slightly below center with generous transparent margins. Subject: A modest bronze statue of a standing figure on a square pale stone plinth, weathered green-blue patina against warm stone, no face detail needed at this size. Reads as a small civic monument, not a landmark. Taller than it is wide. The figure is clearly a bronze sculpture, not a living person.

Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-2fd49ce7-c5f2-412b-b314-58114fae08ae.png`.

### hedge.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville city-builder decoration sprite. Reference image is STYLE AND CAMERA ONLY. Match its elevated near-overhead orthographic camera, warm crisp detailed 32-bit pixel art, and tiny contact shadow. Single isolated object on genuine transparent RGBA alpha with even padding, no ground slab, no grass, no path, no border, no checkerboard, no text, no living people. Readable at 32px with clean chunky color clusters. Square canvas; complete compact subject sits comfortably inside frame, horizontally centered, slightly below center with generous transparent margins. Subject: A neat rectangular clipped hedge block in deep green with olive sunlit highlights along its top edge, low and wide, with a suggestion of dense foliage texture. Deliberately plain and repeatable — meant to be placed in runs along a boundary, so it should look right sitting beside a copy of itself on either side. Straight horizontal long axis and square clipped ends, no pot, no flowers.

Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-1e8e089f-de0b-4d65-9e98-7ff8ea8361b9.png`.

### bench.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville city-builder decoration sprite. Reference image is STYLE AND CAMERA ONLY. Match its elevated near-overhead orthographic camera, warm crisp detailed 32-bit pixel art, and tiny contact shadow. Single isolated object on genuine transparent RGBA alpha with even padding, no ground slab, no grass, no path, no border, no checkerboard, no text, no living people. Readable at 32px with clean chunky color clusters. Square canvas; complete compact subject sits comfortably inside frame, horizontally centered, slightly below center with generous transparent margins. Subject: A warm timber park bench with dark iron legs, angled to face lower-left, with a small cast-iron lamp post beside it and a scatter of pale gravel under both. Quiet street furniture. Wider than it is tall. Lamp post modest and short so combined silhouette stays wide. Gravel is only a few isolated pale pebbles, NOT a solid ground patch or slab.

Generation source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-277effa8-66ea-4965-9980-1e47f1c1ad40.png`.

The initial bench draft had an opaque checkerboard. Exact transparency finishing prompt:

Use case: background-extraction. Remove the entire white and grey CHECKERBOARD background from this production sprite. Deliver actual transparent RGBA alpha, every background pixel alpha=0, not a depicted transparency pattern. Preserve the warm timber bench, dark iron legs, small lamp and scattered individual pale gravel stones exactly in their current design, camera, colors and crisp pixel-art finish. Transparent holes between bench slats and under armrests. Keep only tiny contact shadows at feet, no broad grey shadow or ground patch, no backdrop, no text. Complete isolated sprite centered with even padding on square transparent canvas.

Final transparent source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-eee897bf-794e-4129-9b7c-8b362f38c386.png`.

## Promenade structures — September 7

Built-in imagegen using `assets/decorations/fountain.png` as camera, finish and scale reference. Finals: `assets/decorations/bandstand.png`, `assets/decorations/arbour.png`, `assets/paths/footbridge.png`. All 256x256 RGBA, genuine alpha. Decorations fit 200x200 painted bounds with even padding and an 8px downward center bias, matching the fountain export. Checked at 32px on green. Bridge is deliberately NOT padded horizontally: full-width generated deck trimmed, resized to 256x144 then vertically centered on 256x256. Deck itself is about one third of tile height, rails bring total bounds to 144px. Inspected three copies side by side over blue; continuous left-right crossing, transparent above/below. No code, tables, tests or deployment changes.

### bandstand.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville sprite, warm crisp detailed 32-bit pixel art, elevated near-overhead orthographic camera matching reference fountain. Reference is CAMERA, FINISH AND SCALE ONLY. Genuine transparent RGBA alpha, no backdrop or checkerboard, no text, people, ground slab, grass, path or outer border, tiny contact shadow only. Clear forms readable at 32px. An octagonal Victorian cast-iron bandstand, ornamental columns, scalloped roof with finial, low balustrade and three steps up, painted dark green and cream. Deliberate public garden centerpiece. Complete isolated structure including its own raised stage but no surrounding ground. Square canvas with generous even padding, horizontally centered and slightly below center, comfortably inside tile.

Source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-a8b31d7e-fff3-4d9c-9689-08912bb63573.png`.

Export command (from omaville):

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-a8b31d7e-fff3-4d9c-9689-08912bb63573.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 200x200 -gravity center -background none -extent 256x240 -gravity south -extent 256x256 -strip -define png:color-type=6 assets/decorations/bandstand.png
```

### arbour.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville sprite, warm crisp detailed 32-bit pixel art, elevated near-overhead orthographic camera matching reference fountain. Reference is CAMERA, FINISH AND SCALE ONLY. Genuine transparent RGBA alpha, no backdrop or checkerboard, no text, people, ground slab, grass, path or outer border, tiny contact shadow only. Clear forms readable at 32px. A timber pergola arbour: a short run of posts with open cross-beams, climbing wisteria and roses over the top, a bench clearly visible beneath. Low and wide, soft green foliage and lavender flowers doing half the work. Complete isolated structure with transparent floor and gaps. Square canvas with generous even padding, horizontally centered and slightly below center, comfortably inside tile.

Source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-3201030f-f439-4529-8182-b737e7b1f43a.png`.

Export command (from omaville):

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-3201030f-f439-4529-8182-b737e7b1f43a.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 200x200 -gravity center -background none -extent 256x240 -gravity south -extent 256x256 -strip -define png:color-type=6 assets/decorations/arbour.png
```

### footbridge.png

Exact generation prompt:

Use case: stylized-concept. Production Omaville sprite, warm crisp detailed 32-bit pixel art, elevated near-overhead orthographic camera matching reference fountain. Reference is CAMERA, FINISH AND SCALE ONLY. Genuine transparent RGBA alpha, no backdrop or checkerboard, no text, people, ground slab, grass, path or outer border, tiny contact shadow only. Clear forms readable at 32px. Tileable horizontal TIMBER FOOTBRIDGE segment on square canvas. CRITICAL GEOMETRY: flat straight plank deck runs horizontally from EXACT LEFT IMAGE EDGE to EXACT RIGHT IMAGE EDGE at same height. NOT diagonal, NOT perspective-vanishing, NOT arched, NO end caps or end posts. Deck and continuous light handrails above and below continue past both image edges, like a cropped middle section of a longer bridge. This must join seamlessly with an identical copy on either side. Near-overhead view looking down onto planks, slight front thickness matching elevated reference camera, but horizontal axis aligned to image x. Deck occupies middle 40 percent of canvas height; slim handrails along the two long sides. Entire space above and below bridge transparent. Warm timber planks across narrow deck, simple repeating rail posts. No bank, water, shore, ground, road markings or vehicles. Square 256x256 target.

Source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-30753ac8-6397-4458-a7ca-13830742c1c2.png`.

Exact transparency finishing prompt:

Use case: background-extraction. Remove ONLY the entire white and gray checkerboard backdrop from this horizontal footbridge sprite, including gaps under handrails. Genuine transparent RGBA alpha. Preserve pixel art, timber colors and exact straight horizontal geometry. Deck and rails MUST continue to BOTH left and right image edges without any transparent side padding, same y levels at both edges. Keep square canvas, no reframing, no perspective changes, no arch, no end posts. Transparent above and below bridge. No water, ground, text or backdrop.

Transparent source: `/home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-763e78eb-dac2-4881-b31b-e75841e95ef3.png`.

Export command (from omaville):

```bash
magick /home/keith/.codex/generated_images/01a06da5-f528-7f60-9899-17d3d2253752/exec-763e78eb-dac2-4881-b31b-e75841e95ef3.png -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize '256x144!' -gravity center -background none -extent 256x256 -strip -define png:color-type=6 assets/paths/footbridge.png
```
