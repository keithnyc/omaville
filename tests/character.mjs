// What the city is known for.
//
// A reputation the player never picks — it is read off what they actually
// built. The whole value is that it bites: if "a mill town" were only a label
// then how you build would still be nothing but a route to population. So most
// of this file is about the effects reaching the simulation, and about the
// city not being handed a character it has not earned.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math, Number });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);
const size = M.GRID_SIZE;

// Cities built to be characteristic, laid out as a player would.
function city({ homes = 0, shops = 0, works = 0, parks = 0, trees = 0, level = 3 }) {
  const g = M.emptyGrid(size);
  let at = 0;
  const put = (tile, n) => { for (let i = 0; i < n; i++) g[at++] = tile; };
  put('R' + level, homes); put('C' + level, shops); put('I' + level, works);
  put('P2', parks); put('T0', trees);
  return M.summarize(g);
}

// --- a city too small, or too plain, is not given a character -------------
{
  assert.equal(M.cityCharacterKey(M.summarize(M.emptyGrid(size))), 'mixed', 'an empty map');
  assert.equal(M.cityCharacterKey(city({ homes: 4, works: 4 })), 'mixed',
    'a hamlet has not built anything characteristic yet');
  assert.ok(M.CHARACTER_MIN_POP > 0);
  const balanced = city({ homes: 40, shops: 26, works: 14 });
  assert.ok(balanced.population >= M.CHARACTER_MIN_POP, 'big enough to qualify');
  assert.equal(M.cityCharacterKey(balanced), 'mixed',
    'and a city with no one trade in charge stays a mixed town');
  assert.equal(M.cityCharacter(balanced).effects.happiness, 0, 'which costs and gives nothing');
  for (const key of Object.keys(M.cityCharacter(balanced).effects))
    if (key !== 'happiness')
      assert.equal(M.cityCharacter(balanced).effects[key], 1, `${key} is neutral`);
}

// --- every character is reachable, and by the right city ------------------
{
  const cases = [
    ['mill', city({ homes: 40, shops: 4, works: 30 })],
    ['company', city({ homes: 14, shops: 40, works: 6 })],
    ['commuter', city({ homes: 60, shops: 4, works: 1 })],
    ['garden', city({ homes: 30, shops: 20, works: 2, parks: 20, trees: 40 })],
    // A market town needs enough shopwork that people genuinely work here.
    // With too few jobs for the population the truer description is a commuter
    // suburb, whatever kind of work the handful of jobs happens to be — which
    // is why commuter is tested before market.
    ['market', city({ homes: 20, shops: 30, works: 2 })]
  ];
  for (const [key, stats] of cases) {
    assert.equal(M.cityCharacterKey(stats), key,
      `that city should read as ${key}, not ${M.cityCharacterKey(stats)}`);
  }
  const reached = new Set(cases.map(c => c[0]).concat(['mixed']));
  for (const key of Object.keys(M.CITY_CHARACTERS))
    assert.ok(reached.has(key), `${key} is a character no city can actually become`);
  for (const key of Object.keys(M.CITY_CHARACTERS)) {
    const def = M.CITY_CHARACTERS[key];
    assert.ok(def.name && def.blurb, `${key} is displayable`);
    assert.ok(def.blurb.length > 20, `${key} says something about living there`);
  }
  // The order is the design, not an accident.
  const both = city({ homes: 16, shops: 4, works: 30 });
  const m = M.characterMeasures(both);
  assert.ok(m.industrialShare >= 0.5 && m.jobsPerResident >= 1.15, 'this city qualifies as both');
  assert.equal(M.cityCharacterKey(both), 'mill',
    'half industrial and short of workers is a mill town first');

  // A leafy town with few jobs also qualifies as both, and the greenery wins
  // because it is the part the player chose one tile at a time.
  const leafy = city({ homes: 30, shops: 20, works: 2, parks: 20, trees: 40 });
  const lm = M.characterMeasures(leafy);
  assert.ok(lm.greenPerHome >= 1.2 && lm.jobsPerResident <= 0.45, 'this city qualifies as both');
  assert.equal(M.cityCharacterKey(leafy), 'garden');
  // Strip the parks and planting out and the same shape of town is exactly
  // what a commuter suburb is.
  assert.equal(M.cityCharacterKey(city({ homes: 30, shops: 20, works: 2 })), 'commuter',
    'a bedroom community with no parks has earned no better description');
  // Same trades, fewer houses: now people actually work here.
  assert.equal(M.cityCharacterKey(city({ homes: 14, shops: 20, works: 2 })), 'market');
}

// --- combining effects ----------------------------------------------------
{
  const neutral = M.neutralEffects();
  const doubled = M.combineEffects(neutral, { residentialDemand: 1.2, happiness: 5 });
  assert.equal(doubled.residentialDemand, 1.2, 'multipliers multiply');
  assert.equal(doubled.happiness, 5, 'and happiness adds');
  assert.equal(doubled.commercialDemand, 1, 'untouched levers stay neutral');

  const twice = M.combineEffects({ residentialDemand: 1.2, happiness: 5 },
    { residentialDemand: 1.5, happiness: -2 });
  assert.ok(Math.abs(twice.residentialDemand - 1.8) < 1e-9);
  assert.equal(twice.happiness, 3);

  // Combining with nothing changes nothing — which is what makes it safe to
  // fold a character into a policy on every tick.
  const ord = M.ordinanceEffects(['recycling', 'tolls']);
  const same = M.combineEffects(ord, M.neutralEffects());
  for (const key of Object.keys(ord))
    assert.ok(Math.abs(same[key] - ord[key]) < 1e-9, `${key} survives an empty combine`);
  // And it is the same shape ordinances produce, so everything downstream can
  // read it without learning anything new.
  assert.deepEqual(Object.keys(neutral).sort(), Object.keys(ord).sort());
}

// --- the effects actually reach the simulation ----------------------------
{
  const mill = city({ homes: 40, shops: 4, works: 30 });
  const plain = M.ordinanceEffects([]);
  const withMill = M.combineEffects(plain, M.cityCharacter(mill).effects);
  assert.ok(M.computeDemand(mill, 0, withMill).I > M.computeDemand(mill, 0, plain).I,
    'a mill town grows industry faster than the same city would without the reputation');
  assert.ok(M.computeDemand(mill, 0, withMill).R < M.computeDemand(mill, 0, plain).R,
    'and is a less appealing place to move to');

  const garden = city({ homes: 30, shops: 20, works: 2, parks: 20, trees: 40 });
  const withGarden = M.combineEffects(plain, M.cityCharacter(garden).effects);
  assert.ok(M.computeDemand(garden, 0, withGarden).R > M.computeDemand(garden, 0, plain).R,
    'a garden city draws residents');
  assert.ok(M.computeDemand(garden, 0, withGarden).I < M.computeDemand(garden, 0, plain).I,
    'and industry will not come');

  // Through the real tick, not just the formula: the character on the result
  // is the one the month was actually run under.
  const grid = M.emptyGrid(size);
  let at = 0;
  for (let i = 0; i < 40; i++) grid[at++] = 'R3';
  for (let i = 0; i < 4; i++) grid[at++] = 'C3';
  for (let i = 0; i < 30; i++) grid[at++] = 'I3';
  const result = M.advanceCity(grid, size, 10, 0, 1, M.defaultFunding(), [], []);
  assert.equal(result.character.key, 'mill', 'the tick reports what the city is');
  assert.ok(result.character.effects.happiness < 0, 'and a mill town is a worse place to live');
}

// --- a reputation is not an ordinance -------------------------------------
// A mill town's sour air is not something the player enacted. Folding it into
// the ordinances row would send them to the Budget to look for a policy that
// is not there.
{
  const stats = city({ homes: 40, shops: 4, works: 30 });
  const rows = M.moodBreakdown(10, stats, 0, 0, M.cityCharacter(stats).effects.happiness);
  const character = rows.find(r => r.key === 'character');
  const ordinances = rows.find(r => r.key === 'ordinances');
  assert.ok(character, 'the kind of city has its own line');
  assert.ok(character.amount < 0, 'and it is costing this city something');
  assert.equal(ordinances.amount, 0, 'while no ordinance is blamed for it');
  assert.ok(character.label && character.fix, 'it explains itself');
  assert.ok(!/ordinance/i.test(character.fix), 'and does not point at the Budget');

  // A city with a pleasant character is never reported as a drag.
  const nice = city({ homes: 30, shops: 20, works: 2, parks: 20, trees: 40 });
  assert.ok(M.cityCharacter(nice).effects.happiness > 0, 'a garden city is nicer to live in');
  assert.equal(M.moodBreakdown(10, nice, 0, 0,
    M.cityCharacter(nice).effects.happiness).find(r => r.key === 'character').amount, 0,
    'and good news never appears in a list of what is dragging the mood down');

  // Old callers passing four arguments still work.
  assert.equal(M.moodBreakdown(10, stats, 0, 0).find(r => r.key === 'character').amount, 0);
}

console.log('PASS: a reputation read off what was built, never handed to a city that has not ' +
  'earned it, reaching demand and happiness through the same effects ordinances use, and ' +
  'reported as its own thing rather than as a policy nobody passed.');
