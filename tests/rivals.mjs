// The towns at the map edge, as rivals rather than as a price ticker.
//
// Three things had to be true at once for this to be worth building: their
// populations are fed by what this city loses, a highway is no longer free
// money, and a stake in a town pays out when that town is winning. The last
// one is the point of the whole feature — the market gamble is uncomfortable
// only because the town you profit from is the one that took your residents.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math, Number });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);
const size = M.GRID_SIZE;
const towns = () => M.seedNeighborPopulations([
  { edge: 'north', name: 'Oakhurst', index: 32 },
  { edge: 'east', name: 'Aldermill', index: 3199 },
  { edge: 'south', name: 'Pinecrest', index: 4056 },
  { edge: 'west', name: 'Eastvale', index: 2880 }
]);
const by = (list, name) => list.find(t => t.name === name);

// --- established places, not empty fields ---------------------------------
{
  const fresh = M.makeNeighbors(size, 7);
  assert.equal(fresh.length, 4);
  for (const t of fresh) assert.equal(t.pop, M.NEIGHBOR_START_POP, 'a new map starts them level');

  // A save written before the towns had populations must not wake up with four
  // ghost towns of zero people.
  const old = M.seedNeighborPopulations([{ edge: 'north', name: 'Oakhurst', index: 32 }]);
  assert.equal(old[0].pop, M.NEIGHBOR_START_POP);
  assert.equal(old[0].name, 'Oakhurst', 'and keeps everything else it had');
  assert.equal(old[0].index, 32);
  for (const bad of [{ pop: 0 }, { pop: -5 }, { pop: NaN }, { pop: 'x' }, {}])
    assert.equal(M.neighborPopulation(bad), M.NEIGHBOR_START_POP, 'nonsense reads as a normal town');
}

// --- they live their own lives, and eat what this city drops ---------------
{
  // Nothing lost: they still grow, so a town is alive even when this city is
  // doing nothing at all.
  const quiet = M.advanceNeighbors(towns(), { lost: 0, population: 2000 }).neighbors;
  for (const t of quiet) assert.ok(t.pop > M.NEIGHBOR_START_POP, 'towns grow on their own');

  // People this city sheds turn up next door — but not all of them, because
  // people leave regions, not just cities.
  const shed = M.advanceNeighbors(towns(), { lost: 400, population: 2000 }).neighbors;
  const gained = shed.reduce((t, x) => t + x.pop, 0) - quiet.reduce((t, x) => t + x.pop, 0);
  assert.ok(gained > 0, 'a city losing people feeds its neighbours');
  assert.ok(gained < 400, 'but not every leaver moves next door');

  // A town you have a road to takes more of them than one you do not.
  const linked = M.advanceNeighbors(towns(),
    { lost: 400, population: 2000, connectedNames: ['Oakhurst'] }).neighbors;
  assert.ok(by(linked, 'Oakhurst').pop > by(linked, 'Pinecrest').pop,
    'leaving is easier down a road that exists');
  assert.equal(by(linked, 'Pinecrest').pop, by(linked, 'Eastvale').pop,
    'and the unconnected ones share the rest evenly');
}

// --- being overtaken --------------------------------------------------------
{
  // The crossing usually happens because this city shrank, not because the
  // town grew. Testing only "did they rise past us" missed every case that
  // matters, which is exactly what the first version did.
  let list = towns(), pop = 2000, crossings = [];
  for (let m = 0; m < 60; m++) {
    const lost = m > 4 ? 45 : 0;
    const step = M.advanceNeighbors(list,
      { lost, population: pop - lost, previousPopulation: pop, connectedNames: ['Oakhurst'] });
    for (const name of step.overtook) crossings.push({ name, month: m });
    list = step.neighbors;
    pop -= lost;
  }
  assert.ok(crossings.length > 0, 'a city in decline is eventually passed');
  assert.equal(new Set(crossings.map(c => c.name)).size, crossings.length,
    'and each town says so exactly once, not every month afterwards');
  assert.equal(crossings[0].name, 'Oakhurst', 'the connected one gets there first');

  // A city that is simply bigger is never told it has been overtaken.
  const strong = M.advanceNeighbors(towns(),
    { lost: 0, population: 50000, previousPopulation: 50000 });
  assert.equal(strong.overtook.length, 0);
}

// --- a highway is no longer free money ------------------------------------
{
  const list = towns();
  const big = [{ name: 'Oakhurst', index: 32, pop: 6000 }];

  // Only what you are joined to presses on you: a rival you have no road to
  // is somebody else's problem.
  const none = M.rivalPressure([], 2000);
  assert.equal(none.commercialDemand, 1);
  assert.equal(none.residentialDemand, 1);
  assert.equal(M.rivalPressure(null, 2000).commercialDemand, 1);

  // And only once it has grown to a real share of your size.
  const small = M.rivalPressure([{ name: 'Oakhurst', index: 32, pop: 200 }], 2000);
  assert.equal(small.commercialDemand, 1, 'a village next door is not competition');

  const heavy = M.rivalPressure(big, 2000);
  assert.ok(heavy.commercialDemand < 1, 'a bigger town takes custom');
  assert.ok(heavy.residentialDemand < 1, 'and people');
  assert.ok(heavy.commercialDemand < heavy.residentialDemand,
    'shops feel it first — you can shop there without moving there');
  assert.ok(heavy.commercialDemand > 0.4, 'but it is never ruinous');
  // Bounded, so four enormous neighbours cannot drive demand to nothing.
  const swarm = M.rivalPressure(list.map(t => ({ ...t, pop: 500000 })), 100);
  assert.ok(swarm.commercialDemand > 0.2, `demand has a floor, got ${swarm.commercialDemand}`);
  assert.ok(Number.isFinite(swarm.residentialDemand));
  assert.equal(M.rivalPressure(big, 0).commercialDemand < 1, true, 'and an empty city survives it');

  // Shaped like ordinance effects, so it folds into the month's policy with
  // everything else rather than being a special case downstream.
  assert.deepEqual(Object.keys(heavy).sort(), Object.keys(M.ordinanceEffects([])).sort());
}

// --- a long game must not end beside a town of billions -------------------
{
  // Half a percent a month, compounding, is invisible for an hour and absurd
  // over an evening: the drift alone reached ten figures inside a day of play.
  // That is not a cosmetic number — pressure is measured against how much
  // bigger than you a town is, so every connected town pinned at the maximum
  // and stayed there, which is what a player saw as an RCI meter stuck in the
  // negative no matter what they built.
  let list = towns();
  for (let m = 0; m < 6000; m++)
    list = M.advanceNeighbors(list, { lost: 0, population: 5000 }).neighbors;
  for (const t of list)
    assert.ok(t.pop <= M.NEIGHBOR_CAP, `${t.name} levels off, got ${t.pop}`);
  assert.ok(by(list, 'Oakhurst').pop > M.NEIGHBOR_START_POP * 4,
    'having grown a great deal on the way there');

  // Which is what makes outgrowing them worth anything: pass them and the
  // pressure lifts, instead of chasing a number that always wins.
  assert.equal(M.rivalPressure(list, M.NEIGHBOR_CAP * 2).commercialDemand, 1,
    'outgrow your rivals and the competition stops');

  // A save written while the drift still compounded is repaired on load
  // rather than left permanently unwinnable.
  const ruined = M.seedNeighborPopulations([
    { edge: 'north', name: 'Oakhurst', index: 32, pop: 17e9 }]);
  assert.equal(ruined[0].pop, M.NEIGHBOR_CAP, 'a runaway town settles back to a real one');
}

// --- and the meter still says something ------------------------------------
{
  // The city that prompted this: eight thousand people, everything working,
  // and all three zones reading negative with nothing to do about it.
  const stats = { population: 8850, jobsCommercial: 2472, jobsIndustrial: 5328,
    decorationPoints: 300, resCount: 590 };
  const percent = (key, value) => {
    const range = M.DEMAND_RANGE[key];
    return (value - range.min) / (range.max - range.min) * 200 - 100;
  };
  const demandWith = towns => M.computeDemand(stats, towns.length,
    M.combineEffects(M.ordinanceEffects([]), M.rivalPressure(towns, stats.population)));

  const runaway = demandWith(towns().map(t => ({ ...t, pop: 17e9 })));
  assert.ok(percent('R', runaway.R) < 50 && percent('C', runaway.C) < 0,
    'the old behaviour: four runaway towns flatten housing and shops alike');

  const settled = demandWith(towns().map(t => ({ ...t, pop: M.NEIGHBOR_CAP })));
  assert.ok(percent('R', settled.R) > 0, 'with towns of a real size, housing is wanted');
  assert.ok(percent('C', settled.C) > 0, 'and so are shops');
  // Industry is not: this city has more factory jobs than it has residents,
  // and the meter telling it to stop is the meter working.
  assert.ok(percent('I', settled.I) < 0, 'a city of factories is told to stop building them');
}

// --- the loop that makes the gamble uncomfortable -------------------------
// Your residents leave for Oakhurst; Oakhurst grows; Oakhurst is worth more.
// A stake in it therefore pays out exactly when you are losing.
{
  const small = { edge: 'north', name: 'Oakhurst', index: 32, pop: M.NEIGHBOR_START_POP };
  const grown = { edge: 'north', name: 'Oakhurst', index: 32, pop: 2200 };
  assert.ok(M.townSizeFactor(grown) > M.townSizeFactor(small),
    'a town that has taken your people is worth more');
  const stats = { population: 2000, jobsCommercial: 400, jobsIndustrial: 200 };
  assert.ok(M.townPrice(grown, 40, stats, true) > M.townPrice(small, 40, stats, true),
    'and its share price says so');
  // Bounded at both ends, so a runaway neighbour cannot make the market absurd.
  assert.ok(M.townSizeFactor({ pop: 10000000 }) < 2);
  assert.ok(M.townSizeFactor({ pop: 1 }) > 0);
  assert.ok(M.townPrice({ index: 32, pop: 1 }, 3, stats, false) >= M.MARKET_MIN_PRICE);
}

// --- through the real tick ------------------------------------------------
{
  const grid = M.emptyGrid(size);
  let at = 0;
  for (let i = 0; i < 30; i++) grid[at++] = 'R3';
  for (let i = 0; i < 20; i++) grid[at++] = 'C3';
  const result = M.advanceCity(grid, size, 10, 0, 1, M.defaultFunding(), towns(), []);
  assert.ok(result.rivals, 'the tick reports the pressure it ran under');
  assert.equal(result.rivals.commercialDemand, 1,
    'with no highway open, the towns are somebody elses problem');
  assert.equal(result.connectedNeighbors.length, 0);
}

console.log('PASS: towns with populations fed by what this city loses, pressure only from the ' +
  'ones you have a road to and only once they are a real size, bounded so it is never ruinous, ' +
  'and a share price that rises with the town that took your residents.');
