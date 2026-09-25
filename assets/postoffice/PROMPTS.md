# Post office and unread-mail art

Generated 2026-09-15 with the built-in image generation tool. Art-only handoff; no code, tables, tests or deployment changed.

## post-office.png

256x256 RGBA, genuine transparent alpha. Subject fitted to 224x224, bottom-centred with 12px bottom padding, deliberately slightly smaller than the clinic. Style/camera reference: `../medical/h1.png`.

### Generation prompt (verbatim)

```text
Use case: stylized-concept
Asset type: Omaville town-building game sprite, final delivery 256x256 RGBA.
Input image: clinic reference for camera, crisp pixel-art finish and scale ONLY. Create a different building, not a clinic.
Primary request: a small cosy one-storey town post office, the friendliest civic building in town. Red brick walls, deep slate-blue pitched roof, cream stone doorway with a rounded arch, two windows, and a bright red cylindrical pillar-box standing beside the entrance. A tiny simple envelope-shaped emblem above the door, absolutely no lettering.
Camera: match reference elevated near-overhead orthographic view exactly, entrance facing lower-left. Warm detailed 32-bit pixel art with crisp controlled pixel clusters, readable silhouette at 32px. Smaller and cosier than the reference clinic. Red brick and red postbox remain unmistakable at tiny size.
Composition: entire structure visible, bottom-centred on square canvas with even clear padding. Tiny contact shadow only.
Background: genuine transparent alpha, including gaps around the pillar-box. No ground slab, no lawn, no pavement, no road, no lot border. No people, vehicles, text, words, labels, background, glow, vignette or checkerboard.
```

Initial source: `<imagegen-output>/exec-901a0bc8-dfc8-4d9a-be8b-42f262c3e633.png`

The initial generation baked in a checkerboard and added a third window. The following edit produced the final source:

```text
Use case: background-extraction
Edit this post-office sprite for production. Remove the entire white and gray checkerboard backdrop and replace it with genuine transparent RGBA alpha: every background pixel alpha=0, including gaps between the building, steps, planters and pillar-box. Do not render a transparency pattern. Preserve the building camera, silhouette, colors, roof, doorway, red pillar-box and crisp pixel-art finish exactly. One small correction: remove the extra window and its windowbox on the right side wall, replacing that area with matching red brick; retain the two front windows flanking the entrance. No other redesign, no ground slab, no text, no glow, no added shadows. Whole building visible on a transparent square canvas.
```

Final source: `<imagegen-output>/exec-5e303500-6103-4a18-9e27-00c242004888.png`

## envelope.png

128x128 RGBA, genuine transparent alpha. Subject fitted to 112x112 and centred. No reference image used.

### Generation prompt (verbatim)

```text
Use case: stylized-concept
Asset type: Omaville floating unread-mail sprite, final delivery 128x128 RGBA.
Primary request: one single closed cream/off-white paper envelope, seen directly from the front and tilted about 10 degrees. Strong darker warm-brown outline readable on grass and dark rooftops, a clear V-shaped closed flap, and one small red wax seal in the middle.
Style: warm crisp detailed 32-bit pixel art, simple clean pixel clusters, restrained shading, strong readable shape at 20 pixels. Not a photo or smooth vector.
Composition: envelope centred with even transparent padding, whole envelope visible. Genuine transparent alpha background.
Strictly no text, lettering, sparkles, glow, shadow, motion lines, scenery, backdrop or checkerboard. Animation and sparkles are added separately by the game.
```

Source: `<imagegen-output>/exec-9e75bfb0-6b3f-4303-963c-f9b9381e0df1.png`

## Export commands

Run from the omarchy-help directory. Alpha cleanup removes very faint edge noise before trimming; generated alpha is otherwise preserved.

```bash
magick '<imagegen-output>/exec-5e303500-6103-4a18-9e27-00c242004888.png' -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 224x224 -gravity south -background none -extent 256x244 -gravity north -extent 256x256 -strip -define png:color-type=6 omaville/assets/postoffice/post-office.png
magick '<imagegen-output>/exec-9e75bfb0-6b3f-4303-963c-f9b9381e0df1.png' -channel A -threshold 5% +channel -trim +repage -filter Lanczos -resize 112x112 -gravity center -background none -extent 128x128 -strip -define png:color-type=6 omaville/assets/postoffice/envelope.png
```

## Asset checks

Both final dimensions verified; RGBA and all four corners fully transparent. Inspected post office at 32px and envelope at 20px on grass-green backgrounds. No text, baked backdrop, lot slab or animation effects. Claude handles wiring and gameplay verification.

