// The named residents.
//
// A city of four thousand people in which not one person exists is a
// spreadsheet. A dozen named citizens, each at an actual tile, turn "94% fire
// coverage" into a woman on Mill Road who cannot get anyone to come. The whole
// value depends on the complaint being true of *her* tile — a letters column
// that grumbles at random is worse than none, because the player will act on it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math, Number });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);
const size = M.GRID_SIZE;
const at = (x, y) => y * size + x;
// Deterministic, so a failure is reproducible rather than a one-in-ten flake.
const seeded = (seed = 1) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// A neighbourhood that is genuinely well served — every house inside every
// radius, checked rather than assumed. An almost-covered town would make the
// tests below pass or fail on which corner a resident happened to land in.
function town() {
  const g = M.emptyGrid(size);
  for (let x = 14; x <= 20; x++) {
    g[at(x, 12)] = '#0';
    for (let y = 13; y <= 18; y++) g[at(x, y)] = 'R2';
  }
  g[at(15, 11)] = 'E1'; g[at(16, 11)] = 'W1';
  g[at(17, 11)] = 'F1'; g[at(18, 11)] = 'S1';
  g[at(19, 11)] = 'N1'; g[at(20, 11)] = 'H1';
  return g;
}
// Coverage is a true circle, not a square — the first draft of this fixture
// looked well served and had corners 9.2 tiles from the firehouse.
const HOME = at(17, 15);
// Proves the fixture: nobody in it has anything to complain about.
{
  const g = town(), ctx0 = { grid: g, gridSize: size, utilities: M.findUtilities(g),
    funding: M.defaultFunding(), traffic: null, crimes: [], fires: [] };
  for (let x = 14; x <= 20; x++) for (let y = 13; y <= 18; y++)
    assert.equal(M.citizenGrievance(ctx0, at(x, y)), null,
      `the fixture town serves ${x},${y}`);
}
const context = (grid, over = {}) => Object.assign({
  grid, gridSize: size, utilities: M.findUtilities(grid), funding: M.defaultFunding(),
  traffic: null, crimes: [], fires: [], population: 3000, ageMinutes: 60,
  neighbors: [{ name: 'Oakhurst' }, { name: 'Aldermill' }], random: seeded()
}, over);

// --- addresses ------------------------------------------------------------
{
  assert.equal(M.streetName(size, at(14, 15)), M.streetName(size, at(14, 15)),
    'a tile keeps its address');
  assert.equal(M.streetName(size, at(14, 15)), M.streetName(size, at(16, 16)),
    'and shares it with the neighbours on the same block');
  const names = new Set();
  for (let y = 0; y < size; y += 3) for (let x = 0; x < size; x += 12)
    names.add(M.streetName(size, at(x, y)));
  assert.ok(names.size > 12, `the map has more than a handful of street names, got ${names.size}`);
  assert.ok(/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(M.streetName(size, at(3, 3))), 'and they read as streets');
}

// --- who exists, and where ------------------------------------------------
{
  const grid = town();
  const { citizens } = M.advanceCitizens([], context(grid));
  assert.ok(citizens.length > 0, 'somebody moved in');
  assert.equal(citizens.length, M.citizenTarget(3000));
  const seats = new Set();
  for (const c of citizens) {
    assert.equal(M.tileTypeOf(grid[c.i]), 'R', `${c.n} lives in a house`);
    assert.ok(M.tileLevelOf(grid[c.i]) > 0, 'a built one');
    assert.ok(!seats.has(c.i), 'and not on top of somebody else');
    seats.add(c.i);
    assert.ok(/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(c.n), `${c.n} has a name`);
  }
  assert.equal(new Set(citizens.map(c => c.n)).size, citizens.length, 'no two share a name');

  // Population governs how many there are, and there is a ceiling.
  assert.equal(M.citizenTarget(0), 0, 'an empty city has nobody to name');
  assert.ok(M.citizenTarget(600) < M.citizenTarget(3000));
  assert.equal(M.citizenTarget(500000), M.CITIZEN_MAX, 'and a cap');

  // An empty map cannot house anyone, however big the city claims to be.
  assert.equal(M.advanceCitizens([], context(M.emptyGrid(size))).citizens.length, 0);
}

// --- the complaint has to be true of their own tile -----------------------
{
  const grid = town();
  const home = HOME;
  const base = context(grid);
  assert.equal(M.citizenGrievance(base, home), null, 'a well-served house has nothing to say');

  const cases = [
    ['fire-now', context(grid, { fires: [{ index: at(18, 16) }] })],
    ['crime', context(grid, { crimes: [{ index: at(18, 16), ticks: 1 }] })],
    ['traffic', context(grid, { traffic: { lotCongestion: { [home]: 1.5 } } })]
  ];
  for (const [key, ctx] of cases)
    assert.equal(M.citizenGrievance(ctx, home).key, key, `${key} is noticed`);

  // Distance matters: the same fire two streets away is not their problem.
  assert.equal(M.citizenGrievance(context(grid, { fires: [{ index: at(14, 13) }] }), home), null,
    'a fire across town is not a complaint about your own street');

  // Industry behind the house.
  const works = town();
  for (let x = 14; x <= 20; x++) works[at(x, 21)] = 'I2';
  assert.equal(M.citizenGrievance(context(works), at(17, 18)).key, 'industry');

  // Missing services, each in turn.
  for (const [tile, key] of [['F1', 'fire'], ['E1', 'power'], ['W1', 'water'],
    ['S1', 'police'], ['H1', 'medical'], ['N1', 'schools']]) {
    const missing = town();
    for (let i = 0; i < missing.length; i++) if (missing[i] === tile) missing[i] = '_0';
    assert.equal(M.citizenGrievance(context(missing), home).key, key,
      `a house with no ${key} says so`);
  }

  // Ranked the way a person would rank them: safety, then services, then
  // pleasantness. A burning building outranks a distant school.
  const everything = town();
  for (let i = 0; i < everything.length; i++) if (everything[i] === 'N1') everything[i] = '_0';
  for (let x = 14; x <= 20; x++) everything[at(x, 21)] = 'I2';
  assert.equal(M.citizenGrievance(context(everything, {
    fires: [{ index: at(18, 16) }], crimes: [{ index: at(18, 16), ticks: 1 }]
  }), home).key, 'fire-now', 'the fire outranks everything else');
  // Judged at a house that is actually beside the works — the nuisance radius
  // is 3, and the same complaint is correctly absent four streets away.
  assert.equal(M.citizenGrievance(context(everything), at(17, 18)).key, 'industry',
    'and industry outranks a distant school');
  assert.equal(M.citizenGrievance(context(everything), at(17, 13)).key, 'schools',
    'while a house out of range of the works has only the school to complain about');
}

// --- patience, and leaving ------------------------------------------------
{
  const grid = town();
  const start = M.advanceCitizens([], context(grid)).citizens;
  assert.ok(start.every(c => c.p === M.CITIZEN_PATIENCE), 'people arrive content');

  // Nothing wrong: patience holds rather than drifting down.
  let people = start;
  for (let m = 0; m < 5; m++) people = M.advanceCitizens(people, context(grid)).citizens;
  assert.ok(people.every(c => c.p === M.CITIZEN_PATIENCE), 'a good street keeps its residents');

  // A crime wave over the whole neighbourhood, never dealt with.
  const wave = { crimes: [{ index: at(17, 15), ticks: 1 }] };
  let left = [], living = start;
  for (let m = 0; m < M.CITIZEN_PATIENCE + 1; m++) {
    const step = M.advanceCitizens(living, context(grid, wave));
    living = step.citizens;
    left = left.concat(step.departures);
  }
  assert.ok(left.length > 0, 'people eventually give up and go');
  assert.ok(left.every(d => d.reason === 'crime'), 'and the reason is the thing that drove them out');
  assert.ok(left.every(d => ['Oakhurst', 'Aldermill'].includes(d.to)),
    'to a town that actually exists');
  assert.ok(left.every(d => /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(d.street)), 'from a named street');

  // Nobody leaves before their patience runs out — a problem the player is
  // already fixing must not cost them a resident.
  let quick = start;
  for (let m = 0; m < M.CITIZEN_PATIENCE - 1; m++) {
    const step = M.advanceCitizens(quick, context(grid, wave));
    assert.equal(step.departures.length, 0, `nobody leaves in month ${m + 1}`);
    quick = step.citizens;
  }

  // And patience recovers, so fixing it in time genuinely saves them.
  let saved = start;
  for (let m = 0; m < M.CITIZEN_PATIENCE - 1; m++)
    saved = M.advanceCitizens(saved, context(grid, wave)).citizens;
  for (let m = 0; m < 10; m++) {
    const step = M.advanceCitizens(saved, context(grid));
    assert.equal(step.departures.length, 0, 'fixing the problem stops the exodus');
    saved = step.citizens;
  }
  assert.ok(saved.every(c => c.p === M.CITIZEN_PATIENCE), 'and they settle again');
}

// --- a house that stops existing ------------------------------------------
{
  const grid = town();
  const people = M.advanceCitizens([], context(grid)).citizens;
  const razed = grid.slice();
  for (const c of people) razed[c.i] = '_0';
  const step = M.advanceCitizens(people, context(razed, { population: 0 }));
  assert.equal(step.departures.length, people.length, 'a bulldozed street loses its residents');
  assert.ok(step.departures.every(d => d.reason === 'gone'), 'with no complaint to make');
  assert.equal(step.citizens.length, 0);
}

// --- the letters column ---------------------------------------------------
{
  // Hand-placed, so the column is exact rather than depending on where a dozen
  // randomly-settled residents happened to land.
  // Every service kept, so each resident's worst problem is genuinely their
  // own. Removing the police station instead gave the whole town the same
  // complaint and drowned out everything local.
  const grid = town();
  for (let x = 14; x <= 20; x++) grid[at(x, 21)] = 'I2';
  const ctx = context(grid, {
    crimes: [{ index: at(15, 13), ticks: 1 }],
    fires: [{ index: at(20, 14) }],
    traffic: { lotCongestion: { [at(17, 16)]: 1.6 } }
  });
  const cast = [
    ['Ada Pike', at(20, 13)],    // beside the fire
    ['Cyril Rooke', at(15, 14)], // inside the crime wave
    ['Vera Chalk', at(17, 16)],  // on the jammed block
    ['Percy Gaunt', at(17, 18)], // backing onto the works
    ['Nora Quill', at(18, 17)]   // nothing wrong at all
  ].map(([n, i]) => ({ n, i, s: 0, p: M.CITIZEN_PATIENCE }));

  for (const [person, expected] of [[cast[0], 'fire-now'], [cast[1], 'crime'],
    [cast[2], 'traffic'], [cast[3], 'industry']])
    assert.equal(M.citizenGrievance(ctx, person.i).key, expected,
      `${person.n} complains about the thing wrong outside their own door`);
  assert.equal(M.citizenGrievance(ctx, cast[4].i), null,
    'and the one with nothing wrong has no complaint');

  const letters = M.citizenLetters(cast, ctx, 4);
  assert.equal(letters.length, 4, 'a full column');
  const kinds = letters.map(l => l.grievance);
  assert.equal(new Set(kinds).size, kinds.length,
    'one letter per complaint — two near-identical letters tell the player one thing, not two');
  // Angriest first: the column leads on what is actually worst in the city.
  assert.ok(['fire-now', 'crime'].includes(kinds[0]), `led on ${kinds[0]}`);
  assert.ok(kinds.indexOf('industry') > kinds.indexOf('traffic'),
    'and a nuisance ranks below a street nobody can get out of');
  assert.ok(!kinds.includes(''), 'a full column of complaints has no room for flattery');

  // Room for one more, and the contented resident gets it.
  const roomier = M.citizenLetters(cast, ctx, 5);
  assert.equal(roomier.length, 5);
  assert.equal(roomier[4].grievance, '', 'the happy one runs last, once');
  assert.equal(roomier[4].name, 'Nora Quill');

  for (const l of letters) {
    assert.ok(l.name && l.street && l.text, `${l.name} is printable`);
    assert.ok(!l.text.includes('$STREET'), 'no unfilled placeholder reaches the page');
    assert.ok(l.text.length > 40, 'a letter is a letter, not a label');
    assert.equal(l.street, M.streetName(size, cast.find(c => c.n === l.name).i),
      'signed with their own address');
  }
  // Every complaint the model can raise must have something to say.
  for (const key of Object.keys(M.CITIZEN_COMPLAINTS))
    assert.ok(M.CITIZEN_COMPLAINTS[key].length > 40, `${key} has a letter written for it`);

  // A well-run city still hears back, but only once, and kindly.
  const happy = context(town());
  const content = M.citizenLetters(M.advanceCitizens([], happy).citizens, happy, 4);
  assert.equal(content.length, 1, 'three residents agreeing the trees are nice is wallpaper');
  assert.equal(content[0].grievance, '', 'and it is a contented letter');
  assert.equal(M.citizenLetters([], happy, 3).length, 0, 'no residents, no column');
}

// --- it does not disturb what it is given ---------------------------------
{
  const grid = town();
  const people = M.advanceCitizens([], context(grid)).citizens;
  const before = JSON.stringify(people);
  M.advanceCitizens(people, context(grid, { crimes: [{ index: at(17, 15), ticks: 1 }] }));
  assert.equal(JSON.stringify(people), before, 'the previous list is left alone');
  const gridBefore = JSON.stringify(grid);
  M.advanceCitizens(people, context(grid));
  assert.equal(JSON.stringify(grid), gridBefore, 'and so is the map');
  assert.equal(M.advanceCitizens(null, context(grid)).citizens.length > 0, true,
    'a city that has never had named residents gets some');
}

console.log('PASS: named residents at real addresses, complaints that are true of their own ' +
  'tile and ranked as a person would rank them, patience that recovers when the problem is ' +
  'fixed, and a letters column that says something different in every letter.');
