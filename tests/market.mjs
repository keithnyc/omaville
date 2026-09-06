// The market. A mature city accumulates surplus faster than it can spend it,
// and this is where that surplus can go — but only as a genuine trade-off:
// money in the market is money not available when the city needs it, and an
// over-committed mayor gets sold out at a distress price rather than merely
// missing an opportunity.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math, Number, String });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);
const size = M.GRID_SIZE;
const towns = M.makeNeighbors(size, 4242);
const stats = { jobsCommercial: 1800, jobsIndustrial: 1200, population: 7000 };

// --- prices are derived, never stored ------------------------------------
{
  // The whole reason for deriving rather than accumulating: the save stays
  // bounded, reloading cannot reroll the market to dodge a loss, and pricing
  // a year-200 city costs the same as pricing a new one.
  for (const t of [0, 1, 50, 5000]) {
    const a = M.townPrice(towns[0], t, stats, false);
    const b = M.townPrice(towns[0], t, stats, false);
    assert.equal(a, b, 'the same tick always prices the same');
    assert.ok(a >= M.MARKET_MIN_PRICE, 'and never falls through the floor');
    assert.ok(isFinite(a) && a < 5, 'nor runs away');
  }
  assert.notEqual(M.townPrice(towns[0], 10, stats, false),
    M.townPrice(towns[0], 11, stats, false), 'prices actually move tick to tick');
  assert.equal(M.townPrice(null, 5, stats, false), 0, 'a missing town is priced at nothing');

  // Different towns are genuinely different, not one curve relabelled.
  const atTen = towns.map(n => M.townPrice(n, 10, stats, false));
  assert.equal(new Set(atTen.map(p => p.toFixed(6))).size, towns.length,
    'every town has its own curve');

  // Temperament is a fixed characteristic, not a mood that drifts.
  for (const n of towns) {
    const first = M.townTemperament(n).key;
    for (const t of [0, 99, 4000]) assert.equal(M.townTemperament(n).key, first);
    assert.ok(M.MARKET_TEMPERAMENTS.some(x => x.key === first), 'and a known one');
  }
}

// --- a highway makes a town a bet on your own city ------------------------
{
  const town = towns[0];
  const at = c => M.townPrice(town, 60, { jobsCommercial: c, population: c * 3 }, true);
  assert.ok(at(3600) > at(1800) && at(1800) > at(0),
    'a connected town rises with your commerce');

  const flat = c => M.townPrice(town, 60, { jobsCommercial: c, population: c * 3 }, false);
  assert.equal(flat(0), flat(3600),
    'an unconnected town is untouched by your fortunes — that is the point of it');

  // Bounded both ways, so neither a boom nor a collapse can run away.
  const extreme = M.townPrice(town, 60, { jobsCommercial: 1e9, population: 1e9 }, true);
  assert.ok(extreme < at(3600) * 2, 'and the correlation is bounded');
  assert.ok(M.townPrice(town, 60, { jobsCommercial: 0, population: 0 }, true) > 0,
    'a ruined city does not price a neighbour at zero');
}

// --- quotes line up with the highways the city actually has ---------------
{
  const linked = [towns[1].name];
  const quotes = M.marketQuotes(towns, linked, 40, stats, {});
  assert.equal(quotes.length, towns.length, 'one listing per town');
  assert.equal(quotes.filter(q => q.connected).length, 1, 'and connection comes from the same list the trade bonus uses');
  for (const q of quotes) {
    assert.ok(q.name && q.temperament && q.price > 0, `${q.name} is displayable`);
    assert.ok(isFinite(q.previous), 'with a previous price for direction');
    assert.equal(q.units, 0);
    assert.equal(q.gain, 0, 'and no gain on nothing held');
  }
  assert.equal(M.marketQuotes([], [], 10, stats, {}).length, 0, 'no towns, no market');
  assert.equal(M.marketQuotes(undefined, undefined, 10, stats, undefined).length, 0);
}

// --- buying and selling ---------------------------------------------------
{
  const id = towns[0].name;
  const price = 1.25;
  const bought = M.buyUnits({}, id, price, 1000);
  assert.equal(bought.cash, -1000, 'the treasury pays the full amount');
  assert.ok(bought.units > 0 && bought.units < 1000 / price,
    'and commission means you get fewer units than the raw price suggests');
  assert.equal(bought.holdings[id].cost, 1000, 'cost basis is what you actually spent');

  assert.equal(M.buyUnits({}, id, 0, 100), null, 'cannot buy at no price');
  assert.equal(M.buyUnits({}, id, 1, 0), null, 'nor spend nothing');
  assert.equal(M.buyUnits({}, id, 1, -50), null, 'nor a negative amount');

  // A round trip at an unchanged price must lose money, or churning is free.
  const sold = M.sellUnits(bought.holdings, id, price, 1);
  assert.ok(sold.cash < 1000, 'a flat round trip loses the commission');
  assert.ok(sold.cash > 950, 'but the commission is a cost, not a haircut');
  assert.equal(sold.holdings[id], undefined, 'selling out removes the holding entirely');

  // Selling half leaves an honest basis behind.
  const half = M.sellUnits(bought.holdings, id, price, 0.5);
  assert.ok(Math.abs(half.holdings[id].units - bought.units / 2) < 1e-9);
  assert.ok(Math.abs(half.holdings[id].cost - 500) < 1e-9, 'cost basis halves with the position');

  assert.equal(M.sellUnits({}, id, price, 1), null, 'cannot sell what you do not hold');
  assert.equal(M.sellUnits(bought.holdings, id, price, 0), null, 'nor sell none of it');

  // Gains are reported against what was paid.
  const held = { [id]: { units: 100, cost: 100 } };
  const up = M.marketQuotes(towns, [], 40, stats, held).find(q => q.id === id);
  assert.ok(Math.abs(up.value - 100 * up.price) < 1e-9);
  assert.ok(Math.abs(up.gain - (up.value - 100)) < 1e-9, 'gain is value minus cost');
  assert.ok(Math.abs(M.portfolioValue(towns, [], 40, stats, held) - up.value) < 1e-9);
  assert.equal(M.portfolioCost(held), 100);
  assert.equal(M.portfolioCost({}), 0);
  assert.equal(M.portfolioCost(undefined), 0);
}

// --- the teeth: a city that cannot pay is sold out at a discount ----------
{
  const id = towns[0].name, other = towns[1].name;
  const holdings = { [id]: { units: 400, cost: 400 }, [other]: { units: 200, cost: 200 } };
  const before = M.portfolioValue(towns, [], 40, stats, holdings);

  const small = M.liquidateFor(holdings, towns, [], 40, stats, 50);
  assert.ok(small.raised >= 50 * 0.999, 'raises what the city needed');
  assert.ok(small.raised < before, 'without dumping the whole portfolio');
  assert.ok(small.sold.length >= 1, 'and says which town was sold');
  assert.ok(M.portfolioValue(towns, [], 40, stats, small.holdings) < before,
    'the position really shrank');

  // The discount is the punishment: covering a gap costs more than the gap.
  const cost = before - M.portfolioValue(towns, [], 40, stats, small.holdings);
  assert.ok(cost > small.raised,
    'selling under duress destroys more value than it raises');

  // Asked for more than exists, it sells everything and stops.
  const wiped = M.liquidateFor(holdings, towns, [], 40, stats, 1e9);
  assert.ok(M.portfolioValue(towns, [], 40, stats, wiped.holdings) < before * 0.01,
    'a big enough shortfall clears the portfolio');
  assert.ok(wiped.raised < before, 'and still raises less than the paper value');
  assert.ok(M.MARKET_DISTRESS > 0 && M.MARKET_DISTRESS < 0.5, 'a real but survivable penalty');

  assert.deepEqual({ ...M.liquidateFor({}, towns, [], 40, stats, 100).holdings }, {},
    'nothing to sell is not an error');
}

// --- holdings survive the save -------------------------------------------
{
  const id = towns[0].name;
  const holdings = M.buyUnits({}, id, 1.3, 2500).holdings;
  const round = JSON.parse(JSON.stringify(holdings));
  assert.ok(Math.abs(round[id].units - holdings[id].units) < 1e-9);
  assert.equal(round[id].cost, holdings[id].cost);
  assert.ok(JSON.stringify(holdings).length < 400,
    'and the whole portfolio is a few hundred bytes against a 64KB read cap');
}

console.log('PASS: derived prices that cannot be rerolled, per-town temperament, highways ' +
  'that make a neighbour a bet on your own city, commission on both sides, and a ' +
  'distress sale that destroys more than it raises.');
