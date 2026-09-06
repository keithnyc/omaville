#!/usr/bin/env bash
# Explicitly approved local cleanup of these three neutral-checkerboard drafts.
# Not a general background remover: inspect other artwork before reusing.
set -euo pipefail
cd "$(dirname "$0")"
for tier in 1 2 3; do
  magick "drafts/m${tier}.png" -alpha on -channel A \
    -fx 'min(r,min(g,b))>0.80 && max(r,max(g,b))-min(r,min(g,b))<0.07 ? 0 : 1' \
    +channel -trim +repage -filter Lanczos -resize '248x248>' \
    -gravity south -background none -extent 256x256 -strip \
    -define png:color-type=6 "m${tier}.png"
done
