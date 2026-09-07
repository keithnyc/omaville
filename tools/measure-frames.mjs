// Prints the matureSpriteFrames rows for a set of sprites.
//
// The tier-3 buildings are exported with transparent padding around them, and
// the drawing code crops to the painted area rather than trusting the file's
// edges — a sprite drawn to its full frame sits wrong in its lot. Those
// rectangles are source pixels, so they belong to a particular file at a
// particular size and cannot be guessed or carried over from a resize.
//
//   node tools/measure-frames.mjs assets/residential/r3e.png ...
//   node tools/measure-frames.mjs            # every tier-3 zone sprite
//
// Paste the output into CityView.qml's matureSpriteFrames.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

function paintedBounds(file) {
  const d = fs.readFileSync(file);
  let pos = 8, idat = [], w = 0, h = 0, colour = 0;
  while (pos < d.length) {
    const len = d.readUInt32BE(pos), type = d.toString('latin1', pos + 4, pos + 8);
    if (type === 'IHDR') { w = d.readUInt32BE(pos + 8); h = d.readUInt32BE(pos + 12); colour = d[pos + 17]; }
    else if (type === 'IDAT') idat.push(d.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  if (colour !== 6) throw new Error(`${file} is not RGBA`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  let prev = Buffer.alloc(stride), at = 0;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const filter = raw[at++];
    const line = Buffer.from(raw.subarray(at, at + stride));
    at += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? line[x - 4] : 0, b = prev[x], c = x >= 4 ? prev[x - 4] : 0;
      if (filter === 1) line[x] = (line[x] + a) & 255;
      else if (filter === 2) line[x] = (line[x] + b) & 255;
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    for (let x = 0; x < w; x++)
      if (line[x * 4 + 3] > 16) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    prev = line;
  }
  if (x1 < 0) throw new Error(`${file} is entirely transparent`);
  return { w, h, frame: [x0, y0, x1 - x0 + 1, y1 - y0 + 1] };
}

let files = process.argv.slice(2);
if (files.length === 0) {
  files = [];
  for (const [dir, letter] of [['residential', 'r'], ['commercial', 'c'], ['industrial', 'i']])
    for (const f of fs.readdirSync(`assets/${dir}`).sort())
      if (f.startsWith(letter + '3') && f.endsWith('.png')) files.push(`assets/${dir}/${f}`);
}

for (const file of files) {
  const { w, h, frame } = paintedBounds(file);
  const pad = frame[2] / w < 0.6 || frame[3] / h < 0.6 ? '   // a lot of padding — check the export' : '';
  console.log(`    "${path.basename(file)}": [${frame.join(', ')}],${pad}`);
  if (w > 256 || h > 256)
    console.error(`  !! ${file} is ${w}x${h}; the game draws these at 32-64px and holds them all in memory`);
}
