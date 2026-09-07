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
