// Boats and ducks on the ambience layer. They are transient and moving, like
// the plane and the birds — not per-tile decoration — so the constraint that
// matters is that they only ever appear where there is water to be on.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const load = name => {
  const ctx = vm.createContext({ Math, Number, Date });
  vm.runInContext(
    fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8').replace('.pragma library', ''),
    ctx);
  return ctx;
};
const W = load('Waterfront.js');
const A = load('Ambience.js');

// --- routes ---------------------------------------------------------------
{
  const size = 16;
  const data = new Array(size * size).fill('_0');
  for (let x = 2; x < 12; x++) data[5 * size + x] = 'L0';
  for (let y = 3; y < 9; y++) data[y * size + 9] = 'L0';
  data[5 * size + 7] = '#1';   // a bridge partway along the river

  const runs = W.waterRuns(data, size);
  assert.ok(runs.length >= 2, 'a river and a channel are both routes');
  for (const r of runs) {
    const horizontal = r.y0 === r.y1;
    const span = horizontal ? Math.abs(r.x1 - r.x0) : Math.abs(r.y1 - r.y0);
    assert.ok(span >= 2, 'every route is long enough to travel along');
    assert.ok(horizontal || r.x0 === r.x1, 'and is a straight stretch');
  }
  // A boat drawn over a bridge deck would sail across the road, so bridges
  // break a run rather than counting as water.
  assert.ok(!runs.some(r => r.y0 === 5.5 && r.x0 < 7.5 && r.x1 > 7.5),
    'a bridge splits the river instead of being sailed over');

  assert.equal(W.waterRuns(new Array(size * size).fill('_0'), size).length, 0,
    'a dry map has no routes');
  // A puddle is not a route.
  const puddle = new Array(size * size).fill('_0');
  puddle[20] = 'L0'; puddle[21] = 'L0';
  assert.equal(W.waterRuns(puddle, size).length, 0, 'two tiles is not a stretch');
}

// --- water life only appears when there is water --------------------------
{
  const view = { x: 0, y: 0, width: 20, height: 20 };
  const runs = [{ x0: 2.5, y0: 5.5, x1: 11.5, y1: 5.5 }];

  const kindsOver = (waterRuns, cycles) => {
    let state = A.initialState();
    const seen = new Set();
    for (let i = 0; i < cycles; i++) {
      // Run the clock until something spawns, then clear it and go again.
      for (let step = 0; step < 4000 && state.objects.length === 0; step++)
        state = A.update(state, 100, view, waterRuns);
      for (const o of state.objects) seen.add(o.kind);
      state.objects = [];
    }
    return seen;
  };

  const dry = kindsOver([], 12);
  assert.ok(dry.size >= 3, 'an inland city still gets its sky life');
  assert.ok(!dry.has('boat') && !dry.has('ducks'),
    'but never a boat on a city with no water — it would have nowhere to be');

  const wet = kindsOver(runs, 20);
  assert.ok(wet.has('boat'), 'a city with a river gets boats');
  assert.ok(wet.has('ducks'), 'and ducks');
  assert.ok(wet.has('plane') && wet.has('birds'),
    'without crowding out the sky life it already had');
  assert.equal(A.update(A.initialState(), 100, view).objects.length, 0,
    'and omitting the routes entirely is safe');
}

// --- a boat travels along its water, slowly -------------------------------
{
  const runs = [{ x0: 2.5, y0: 5.5, x1: 11.5, y1: 5.5 }];
  const boat = A.createOnWater('boat', runs);
  assert.equal(boat.y0, 5.5, 'it stays in its lane');
  assert.equal(boat.y1, 5.5);
  assert.ok(Math.abs(boat.x1 - boat.x0) > 9, 'and crosses the whole stretch');
  // Entering and leaving off the ends, rather than appearing mid-water.
  assert.ok(Math.min(boat.x0, boat.x1) < 2.5 && Math.max(boat.x0, boat.x1) > 11.5,
    'starting and finishing off the ends of the run');

  const ducks = A.createOnWater('ducks', runs);
  assert.ok(ducks.duration > boat.duration, 'ducks paddle slower than a boat sails');
  assert.ok(boat.duration > 30, 'and a boat is a slow drift, not a jetski');

  // The pose interpolates along the route and fades in and out at the edges.
  const start = A.pose({ ...boat, age: 0 });
  const mid = A.pose({ ...boat, age: boat.duration / 2 });
  assert.ok(start.alpha < mid.alpha, 'fading in rather than popping into view');
  assert.equal(Math.round(mid.y), Math.round(boat.y0), 'and never leaves the water');
}

// --- water life must not be gated behind minutes of uninterrupted play -----
// The rotation used to start at birds every time, so the later kinds only
// appeared after several minutes — and a shell restart put it back to the
// beginning. Keith played for a while and concluded the boats were broken.
{
  const view = { x: 0, y: 0, width: 20, height: 20 };
  const runs = [{ x0: 2.5, y0: 5.5, x1: 11.5, y1: 5.5 }];
  const firsts = new Set();
  for (let trial = 0; trial < 60; trial++) {
    let state = A.initialState();
    for (let step = 0; step < 4000 && state.objects.length === 0; step++)
      state = A.update(state, 100, view, runs);
    if (state.objects.length) firsts.add(state.objects[0].kind);
  }
  assert.ok(firsts.size >= 3,
    `a fresh session can open with any kind, not always the same one (saw ${[...firsts].join(', ')})`);
  assert.ok([...firsts].some(k => k === 'boat' || k === 'ducks'),
    'including water life, so it is not gated behind the whole rotation');
}

console.log('PASS: water routes that skip bridges and puddles, boats and ducks that only ' +
  'appear where there is water, and a drift slow enough to read as a boat.');
