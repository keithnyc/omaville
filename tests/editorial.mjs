// The leader column: the one part of the paper that has an opinion, and the
// opinion is about the mayor.
//
// Two things must hold or the feature is dishonest. It may only accuse the
// player of things that are actually true of their city — a paper that
// grumbles at random is worse than none, because they will act on it. And the
// press subsidy must genuinely cost them: buying warm coverage has to buy
// silence, not merely a different tone, or it is a happiness bonus with no
// price attached.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math, Number });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);

// A city with nothing whatever wrong with it.
const wellRun = {
  outOfOffice: false, spare: 0, largerNeighbor: '', unserved: 0, treasury: 1000,
  debt: 0, net: 50, departures: 0, jammed: 0, taxRatePercent: 10,
  character: 'mixed', happiness: 70, tick: 3, bought: false
};
const about = over => M.editorial(Object.assign({}, wellRun, over));

// --- it only says true things ---------------------------------------------
{
  // Every leader must be reachable, or it is prose nobody will ever read.
  const triggers = {
    office: { outOfOffice: true },
    folly: { spare: 8 },
    overtaken: { largerNeighbor: 'Oakhurst' },
    unserved: { unserved: 340, treasury: 321453 },
    debt: { debt: 4000, net: -80 },
    flight: { departures: 3 },
    'unserved-plain': { unserved: 120 },
    traffic: { jammed: 0.3 },
    tax: { taxRatePercent: 18 },
    air: { character: 'mill', happiness: 52 }
  };
  for (const piece of M.EDITORIALS) {
    assert.ok(triggers[piece.key], `${piece.key} has no city that produces it`);
    assert.equal(about(triggers[piece.key]).key, piece.key,
      `${piece.key} should be the leader for that city`);
    assert.ok(piece.headline === piece.headline.toUpperCase(), 'headlines are set in caps');
    assert.ok(piece.weight > 0);
  }
  // And a city with none of those problems is never accused of any of them.
  const calm = about({});
  assert.equal(calm.key, 'praise', `a well-run city was accused of ${calm.key}`);
  assert.ok(calm.body.length > 60, 'even the praise is written');

  // The specific numbers it quotes are the city's own.
  assert.ok(about({ spare: 8 }).body.includes('8'), 'it counts the buildings it is complaining about');
  assert.ok(about({ largerNeighbor: 'Oakhurst' }).body.startsWith('Oakhurst'), 'and names the town');
  assert.ok(about({ unserved: 340, treasury: 321453 }).body.includes('$321,453'),
    'and quotes the treasury it says is hoarded');
  assert.ok(about({ taxRatePercent: 18 }).body.includes('18'), 'and the rate it objects to');
}

// --- the worst problem leads ----------------------------------------------
{
  // A city with everything wrong at once leads on being out of office, then on
  // the folly, and so down. The order is the paper's judgement of what matters.
  const everything = { outOfOffice: true, spare: 8, largerNeighbor: 'Oakhurst',
    unserved: 900, treasury: 90000, debt: 5000, net: -200, departures: 4,
    jammed: 0.4, taxRatePercent: 22, character: 'mill', happiness: 20 };
  assert.equal(about(everything).key, 'office');
  assert.equal(about(Object.assign({}, everything, { outOfOffice: false })).key, 'folly');

  // The two coverage leaders do not compete: the sharper one needs a full
  // treasury, and without one the plainer version runs instead.
  assert.equal(about({ unserved: 900, treasury: 90000 }).key, 'unserved');
  assert.equal(about({ unserved: 900, treasury: 50 }).key, 'unserved-plain',
    'a city that cannot afford the service is not accused of hoarding');
  // Debt is only a scandal if the city cannot pay its way.
  assert.equal(about({ debt: 5000, net: 400 }).key, 'praise',
    'borrowing while solvent is not news');
}

// --- buying the paper buys silence ----------------------------------------
{
  const press = M.ordinance('press');
  assert.ok(press, 'there is an ordinance for it');
  assert.ok(press.effects.happiness > 0, 'warm coverage genuinely lifts the mood');
  assert.ok(press.rate > 0, 'and it is paid for per resident like any other');
  assert.ok(/stops writing/i.test(press.blurb), 'and the blurb warns what it costs');

  const disaster = { spare: 8, largerNeighbor: 'Oakhurst', unserved: 4000,
    treasury: 200000, debt: 9000, net: -400, departures: 6, jammed: 0.6,
    taxRatePercent: 25, character: 'mill', happiness: 15 };
  const bought = about(Object.assign({}, disaster, { bought: true }));
  assert.equal(bought.key, 'bought');
  assert.equal(bought.bought, true);
  // The point: not one of those problems reaches the reader.
  for (const word of ['spare', 'Oakhurst', 'residents', 'owes', 'households', 'per cent'])
    assert.ok(!bought.body.includes(word), `a bought paper must not mention ${word}`);

  // And it is the same silence whether the city is on fire or immaculate,
  // which is what makes the subsidy worth what it costs.
  assert.equal(about({ bought: true }).headline, bought.headline);
  assert.equal(about({ bought: true }).body, bought.body);
  assert.notEqual(bought.headline, about(disaster).headline,
    'an honest paper would have said something else entirely');
}

// --- it is stable, and safe on nonsense -----------------------------------
{
  const twice = [about({ spare: 4 }), about({ spare: 4 })];
  assert.equal(twice[0].headline, twice[1].headline, 'the same city gets the same leader');
  assert.equal(twice[0].body, twice[1].body);

  for (const bad of [undefined, null, {}]) {
    const piece = M.editorial(bad);
    assert.ok(piece && piece.headline && piece.body, 'a leader is always printable');
    assert.equal(piece.bought, false);
  }
  // Praise rotates so a permanently well-run city is not stuck on one line.
  const heads = new Set();
  for (let t = 0; t < 8; t++) heads.add(about({ tick: t }).headline);
  assert.ok(heads.size > 1, 'the praise varies');
}

console.log('PASS: a leader that can only accuse the player of what is true, leading on the ' +
  'worst of it, and a press subsidy that buys warm coverage by buying silence.');
