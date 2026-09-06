# Transit sprites — 2026-09-06

Built-in imagegen; references: assets/schools/n1.png and assets/medical/h1.png.
Final paths: m1.png (Bus Depot), m2.png (Tram Line), m3.png (Transit Hub).
No mechanics or save changes. Keep drawTransit fallback and root-level flyout.

## Shared generation prompt

Use case: stylized-concept. Production Omaville game sprite. Input images are STYLE AND CAMERA references only. Match their crisp warm detailed 32-bit pixel art, elevated orthographic near-overhead camera, lower-left-facing front, compact single-tile silhouette readable at 32px. Cool slate-blue canopies, cream masonry, amber transit vehicles. ONE isolated complete facility, bottom-centred, square 256x256 RGBA PNG if possible. Genuine alpha transparency outside the object: NOT a painted checkerboard. No ground slab, surrounding road, people, lettering, logos, border, broad glow or broad cast shadow. Tiny contact shadow only. Keep whole facility visible with small margins. 

## Subjects

### m1.png

Tier 1 BUS DEPOT: modest neighborhood transit shelter with a small cream brick ticket kiosk under a slate-blue pitched canopy, one bench, one short kerbed boarding platform, and ONE stubby amber-yellow city bus with dark windows beside the canopy, facing lower-left. Clear simple bus silhouette, not a garage.

### m2.png

Tier 2 TRAM LINE: compact tram station, longer slate-blue canopy supported on slim cream posts, one slim amber-and-cream articulated tram on a short section of twin steel rails, rails running lower-left to upper-right. One overhead wire between two slender poles and visible pantograph on tram roof. Pale narrow boarding platform, no broad surrounding ground. Rails and wire distinguish it from a bus stop.

### m3.png

Tier 3 TRANSIT HUB: compact multi-modal interchange, two-storey cream masonry concourse with central clock gable and broad slate-blue butterfly canopy, TWO short bus bays holding amber buses facing lower-left, one short tram rail platform along its right side with amber tram. Dense but clearly readable and cohesive, not a sprawling diorama. All elements fit one square game tile. Distinct clock-hall silhouette.

## Status

Complete: all three sprites are 256x256 RGBA with genuine transparency, fitted
to 248px maximum and bottom-centred. Generated via built-in imagegen, then
locally cleaned with Keith's explicit permission after two generator passes
returned opaque checkerboards. `drafts/` preserves the input artwork.

Reproduce cleanup with `bash assets/transit/prepare.sh`. It removes bright
neutral checkerboard pixels, including enclosed canopy/rail gaps, then trims
and downsamples with alpha intact. This threshold is specific to these images;
do not apply to unrelated art without inspection. No generated/API fallback
or additional paid image calls were used for the cleanup.

Visually checked against green terrain and via actual production draw helpers
at 32/48px and larger. `node tests/infrastructure-art.mjs --preview` reproduces
that Qt preview without loading or changing a city save. Infrastructure tests
now cover 24 tiers, including transit map, preview, loading and disabled paths.
All 26 test scripts, qmllint and plugin validation pass.
