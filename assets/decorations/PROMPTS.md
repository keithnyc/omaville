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
