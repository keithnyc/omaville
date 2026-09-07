// Sprites are decoded at their file size, not their drawn size.
//
// Six tier-3 zone sprites arrived at 1254x1254 while the rest of the set was
// 256px. Nothing looked wrong — they are drawn at 32 to 64 pixels either way —
// but the tile canvas preloads every one of them at startup, so the plugin was
// holding 38MB of texture memory to draw houses the size of a fingernail. In a
// widget that lives in the bar and never restarts, that is not a rounding
// error.
//
// Downscaling them cost nothing visible and returned 36MB. This is the guard
// so the next batch of art cannot quietly undo it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url);
const view = fs.readFileSync(new URL('CityView.qml', root), 'utf8');
const story = fs.readFileSync(new URL('GazetteStory.qml', root), 'utf8');

// Every asset the running game can actually point an Image or drawImage at.
const referenced = new Set();
for (const source of [view, story])
  for (const m of source.matchAll(/Qt\.resolvedUrl\("(assets\/[^"]+\.png)"/g))
    referenced.add(m[1]);
// The ones built from a name at runtime rather than written out in full.
for (const kind of ['works', 'counter', 'street', 'retired'])
  referenced.add(`assets/trades/trade-${kind}.png`);
for (const spot of ['fire', 'election', 'growth', 'money', 'civic', 'crime',
  'power', 'road', 'law', 'mourning', 'empty'])
  referenced.add(`assets/gazette/spot-${spot}.png`);

assert.ok(referenced.size > 30, `expected the whole sprite set, found ${referenced.size}`);

function dimensions(file) {
  const d = fs.readFileSync(new URL(file, root));
  assert.equal(d.toString('latin1', 1, 4), 'PNG', `${file} is a PNG`);
  return { w: d.readUInt32BE(16), h: d.readUInt32BE(20), bytes: d.length };
}

// A tile is drawn at 64px at the very most; a masthead spans the card.
const CAP = { 'assets/gazette/masthead.png': 1024 };
const DEFAULT_CAP = 256;

let texture = 0;
const offenders = [];
for (const file of Array.from(referenced).sort()) {
  assert.ok(fs.existsSync(new URL(file, root)), `${file} is referenced but not on disk`);
  const { w, h } = dimensions(file);
  const cap = CAP[file] || DEFAULT_CAP;
  texture += w * h * 4;
  if (w > cap || h > cap) offenders.push(`${file} is ${w}x${h}, cap ${cap}`);
}
assert.deepEqual(offenders, [],
  `oversized sprites decode to far more memory than they draw:\n  ${offenders.join('\n  ')}`);

// The whole set, held at once, with room to grow. Tripping this means the art
// is worth a look rather than that the number needs raising.
const budgetMB = 24;
assert.ok(texture / 1e6 < budgetMB,
  `the sprite set decodes to ${(texture / 1e6).toFixed(1)}MB, over the ${budgetMB}MB budget`);

// Full-resolution originals are kept, but out of the way of the loader.
for (const dir of ['residential', 'commercial', 'industrial', 'decorations'])
  if (fs.existsSync(new URL(`assets/${dir}/sources`, root)))
    for (const f of fs.readdirSync(new URL(`assets/${dir}/sources`, root)))
      assert.ok(!referenced.has(`assets/${dir}/sources/${f}`),
        `${dir}/sources/${f} is an original and must not be the one that ships`);

// --- crop rectangles belong to a file at a size ---------------------------
// matureSpriteFrames holds source-pixel rectangles for six sprites. Resizing
// those files without remeasuring put every rectangle out of bounds and the
// canvas logged "drawImage(), index size error" on every repaint — which
// nothing but the journal would have told anybody.
{
  const table = view.slice(view.indexOf('matureSpriteFrames: ({'));
  const rows = Array.from(table.slice(0, table.indexOf('})'))
    .matchAll(/"([\w.]+)":\s*\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]/g));
  assert.equal(rows.length, 6, 'six mature variants are cropped while drawing');
  const dirs = { r: 'residential', c: 'commercial', i: 'industrial' };
  for (const [, file, x, y, w, h] of rows) {
    const asset = `assets/${dirs[file[0]]}/${file}`;
    assert.ok(fs.existsSync(new URL(asset, root)), `${asset} exists`);
    const size = dimensions(asset);
    assert.ok(+x + +w <= size.w && +y + +h <= size.h,
      `${file} is cropped to ${x},${y} ${w}x${h} but the file is ${size.w}x${size.h} ` +
      `— drawImage will log an index size error on every repaint`);
    assert.ok(+w > size.w * 0.4 && +h > size.h * 0.4,
      `${file}'s crop is suspiciously small for its file — was it remeasured?`);
  }
}

console.log(`PASS: ${referenced.size} sprites, none oversized, ` +
  `${(texture / 1e6).toFixed(1)}MB of texture for the whole set.`);
