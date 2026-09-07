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

// Variants behind a gate that is currently off are written into the file but
// unreachable at runtime, so they are not part of the set the game loads.
const extraVariants = /readonly property bool useExtraVariants: true/.test(view)
  ? [] : [/\/[rci]3[efgh]\.png$/];
for (const file of Array.from(referenced))
  if (extraVariants.some(p => p.test(file))) referenced.delete(file);

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

// Full-resolution originals are kept — they are the only copy of the artwork
// at that size — but they are held out of the loader's way in sources/ and
// drafts/ directories. Found by walking rather than by a list of directories,
// so the next batch's originals are covered wherever they are put.
{
  const held = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(new URL(dir, root), { withFileTypes: true })) {
      const at = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(at);
      else if (/\.(png|jpe?g)$/i.test(entry.name)
        && /\/(sources|drafts)\//.test(at)) held.push(at);
    }
  };
  walk('assets');
  assert.ok(held.length > 0, 'the originals are still kept somewhere');
  for (const file of held) {
    assert.ok(!referenced.has(file), `${file} is an original and must not be the one that ships`);
    // And they must be genuinely bigger than what ships, or they are not
    // originals — they are duplicates nobody will ever delete.
    const shipped = file.replace(/\/(sources|drafts)\//, '/');
    if (fs.existsSync(new URL(shipped, root))) {
      const a = dimensions(file), b = dimensions(shipped);
      assert.ok(a.w > b.w || a.h > b.h,
        `${file} is no larger than the ${b.w}x${b.h} that ships — it is a copy, not a source`);
    }
  }
}

// --- landing new art must not be able to skip a step ----------------------
// Four more of each tier-3 building are on order. Adding them takes three
// steps and any one of them silently half-works: the files have to exist, each
// needs a crop rectangle measured from the file it belongs to, and the flag
// has to be flipped. A sprite with no frame is stretched to the wrong aspect;
// a flag flipped early points the canvas at files that are not there.
{
  const on = /readonly property bool useExtraVariants: (true|false)/.exec(view);
  assert.ok(on, 'the gate exists');
  const claimed = on[1] === 'true';
  const extra = [];
  for (const [dir, letter] of [['residential', 'r'], ['commercial', 'c'], ['industrial', 'i']])
    for (const suffix of ['e', 'f', 'g', 'h'])
      extra.push(`assets/${dir}/${letter}3${suffix}.png`);
  const present = extra.filter(f => fs.existsSync(new URL(f, root)));

  if (!claimed) {
    assert.equal(present.length, 0,
      `${present.length} of ${extra.length} extra variants are on disk. Run ` +
      `\`node tools/measure-frames.mjs\`, paste the new rows into ` +
      `matureSpriteFrames, then set useExtraVariants: true.`);
  } else {
    assert.equal(present.length, extra.length,
      `useExtraVariants is on but ${extra.length - present.length} files are missing`);
    const table = view.slice(view.indexOf('matureSpriteFrames: ({'));
    for (const file of extra) {
      const name = path.basename(file);
      assert.ok(table.includes(`"${name}":`),
        `${name} has no crop frame — run tools/measure-frames.mjs and paste its row, ` +
        `or it will be drawn stretched to another sprite's aspect`);
      const size = dimensions(file);
      assert.ok(size.w <= 256 && size.h <= 256, `${name} is ${size.w}x${size.h}`);
    }
  }
}

// --- variety only helps if the picker actually spreads --------------------
// Doubling the sprites is pointless if the hash clusters, and worse than
// pointless if neighbouring lots keep landing on the same one — a terrace of
// identical houses is the exact thing this is meant to fix.
{
  const pick = new Function('choices', 'index', view
    .slice(view.indexOf('  function spriteSourceFor'))
    .match(/\{[\s\S]*?\n  \}/)[0]
    .replace('{', '')
    .replace(/\n  \}$/, '')
    .replace('levelSets[level - 1]', 'choices')
    .replace(/if \(level < 1[^\n]*\n/, '')
    + '\n');
  for (const n of [4, 8]) {
    const choices = Array.from({ length: n }, (_, i) => `v${i}`);
    const counts = {};
    let adjacentRepeats = 0;
    const size = 64;
    for (let i = 0; i < size * size; i++) {
      const got = pick(choices, i);
      counts[got] = (counts[got] || 0) + 1;
      if (i % size > 0 && pick(choices, i - 1) === got) adjacentRepeats++;
      if (i >= size && pick(choices, i - size) === got) adjacentRepeats++;
    }
    assert.equal(Object.keys(counts).length, n, `all ${n} variants get used`);
    const ideal = (size * size) / n;
    for (const [v, c] of Object.entries(counts))
      assert.ok(c > ideal * 0.85 && c < ideal * 1.15,
        `${v} appears ${c} times against an even share of ${ideal} — the hash clusters`);
    // Two neighbours matching is ~1/n by chance; anything much above that is
    // structure in the hash rather than luck.
    const pairs = 2 * size * (size - 1);
    assert.ok(adjacentRepeats / pairs < (1 / n) * 1.35,
      `${(100 * adjacentRepeats / pairs).toFixed(1)}% of neighbouring lots share a sprite ` +
      `with ${n} to choose from — the picker is putting terraces of clones together`);
  }
}

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
