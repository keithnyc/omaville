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
  // Roads every third row, so every house is genuinely on one. The first
  // draft put a single road at the top and houses six rows deep behind it:
  // most of them had no road access at all, which means no address and, in
  // the real sim, no growth either.
  for (let x = 14; x <= 20; x++) {
    for (const y of [12, 15, 18]) g[at(x, y)] = '#0';
    for (const y of HOUSE_ROWS) g[at(x, y)] = 'R2';
  }
  g[at(15, 11)] = 'E1'; g[at(16, 11)] = 'W1';
  g[at(17, 11)] = 'F1'; g[at(18, 11)] = 'S1';
  g[at(19, 11)] = 'N1'; g[at(20, 11)] = 'H1';
  return g;
}
// Coverage is a true circle, not a square — the first draft of this fixture
// looked well served and had corners 9.2 tiles from the firehouse.
const HOUSE_ROWS = [13, 14, 16, 17];
const HOME = at(17, 16);
// Proves the fixture: nobody in it has anything to complain about.
{
  const g = town(), ctx0 = { grid: g, gridSize: size, utilities: M.findUtilities(g),
    funding: M.defaultFunding(), traffic: null, crimes: [], fires: [] };
  for (let x = 14; x <= 20; x++) for (const y of HOUSE_ROWS) {
    assert.equal(M.citizenGrievance(ctx0, at(x, y)), null,
      `the fixture town serves ${x},${y}`);
    assert.notEqual(M.streetOf(g, size, at(x, y)), 'the outskirts',
      `and ${x},${y} is actually on a road`);
  }
}
const context = (grid, over = {}) => Object.assign({
  grid, gridSize: size, utilities: M.findUtilities(grid), funding: M.defaultFunding(),
  traffic: null, crimes: [], fires: [], population: 3000, ageMinutes: 60,
  neighbors: [{ name: 'Oakhurst' }, { name: 'Aldermill' }], random: seeded()
}, over);

// --- addresses are roads --------------------------------------------------
// A street used to be a band of the grid, which meant a resident could
// complain about Beacon Street and there was no Beacon Street to go and look
// at. An address is now the road the house is actually served by.
{
  const g = M.emptyGrid(size);
  for (let x = 10; x < 30; x++) g[at(x, 15)] = '#0';
  for (let y = 8; y < 24; y++) g[at(25, y)] = '#0';
  g[at(12, 16)] = 'R2'; g[at(13, 16)] = 'R2'; g[at(26, 12)] = 'R2';

  const home = M.streetOf(g, size, at(12, 16));
  assert.ok(/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(home), `${home} reads as a street`);
  assert.equal(M.streetOf(g, size, at(13, 16)), home, 'next door is the same street');
  assert.notEqual(M.streetOf(g, size, at(26, 12)), home,
    'a house on a different road has a different address');

  // The property that matters: extending a road must not rename it. A letter
  // written in March has to still be about somewhere that exists in June.
  const longer = g.slice();
  for (let x = 30; x < 50; x++) longer[at(x, 15)] = '#0';
  for (let x = 2; x < 10; x++) longer[at(x, 15)] = '#0';
  assert.equal(M.streetOf(longer, size, at(12, 16)), home,
    'the street keeps its name when the road is extended at either end');

  // A house with no road at all is honest about it, which is also a hint
  // about why its resident is unhappy.
  const bare = M.emptyGrid(size);
  bare[at(30, 30)] = 'R2';
  assert.equal(M.streetOf(bare, size, at(30, 30)), 'the outskirts');

  // A crossroads belongs to whichever road runs further through it: the long
  // one is the street, the short one is the turning off it.
  assert.equal(M.roadStreet(g, size, at(25, 15)).axis, 'ew',
    'the 20-tile road wins over the 16-tile one');
  assert.equal(M.roadStreet(g, size, at(25, 15)).name, home);
  assert.equal(M.roadStreet(g, size, at(12, 16)), null, 'a house is not a road');

  // And the map can list them, longest first, skipping stubs too short to name.
  const runs = M.streetRuns(g, size);
  assert.ok(runs.length >= 2, `found ${runs.length} streets`);
  assert.ok(runs[0].length >= runs[runs.length - 1].length, 'longest first');
  for (const r of runs) {
    assert.ok(r.length >= M.STREET_MIN_LENGTH, 'a driveway is not a street');
    assert.ok(r.name && r.axis && Number.isFinite(r.from) && Number.isFinite(r.to));
  }
  assert.equal(new Set(runs.map(r => r.axis + ':' + r.from + ':' + r.to)).size, runs.length,
    'each run is listed once, not once per tile');
  assert.equal(M.streetRuns(M.emptyGrid(size), size).length, 0, 'no roads, no streets');
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
  for (let x = 14; x <= 20; x++) works[at(x, 20)] = 'I2';
  assert.equal(M.citizenGrievance(context(works), at(17, 17)).key, 'industry');

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
  for (let x = 14; x <= 20; x++) everything[at(x, 20)] = 'I2';
  assert.equal(M.citizenGrievance(context(everything, {
    fires: [{ index: at(18, 16) }], crimes: [{ index: at(18, 16), ticks: 1 }]
  }), home).key, 'fire-now', 'the fire outranks everything else');
  // Judged at a house that is actually beside the works — the nuisance radius
  // is 3, and the same complaint is correctly absent four streets away.
  assert.equal(M.citizenGrievance(context(everything), at(17, 17)).key, 'industry',
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
  for (let x = 14; x <= 20; x++) grid[at(x, 20)] = 'I2';
  const ctx = context(grid, {
    crimes: [{ index: at(15, 13), ticks: 1 }],
    fires: [{ index: at(20, 14) }],
    traffic: { lotCongestion: { [at(17, 16)]: 1.6 } }
  });
  const cast = [
    ['Ada Pike', at(20, 13)],    // beside the fire
    ['Cyril Rooke', at(15, 14)], // inside the crime wave
    ['Vera Chalk', at(17, 16)],  // on the jammed block
    ['Percy Gaunt', at(17, 17)], // backing onto the works
    ['Nora Quill', at(14, 16)]   // nothing wrong at all
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
    assert.equal(l.street, M.streetOf(grid, size, cast.find(c => c.n === l.name).i),
      'signed with their own address');
    assert.equal(l.index, cast.find(c => c.n === l.name).i,
      'and carries the tile, so the map can be asked to go there');
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

// --- the address reaches the map ------------------------------------------
// Naming a street is only worth doing if the player can be taken to it.
{
  const view = fs.readFileSync(new URL('../CityView.qml', import.meta.url), 'utf8');
  assert.ok(/function goToTile\(index\)/.test(view), 'the map can be sent to a tile');
  assert.ok(/root\.goToTile\(modelData\.index\)/.test(view),
    'and a letter in the Gazette sends it there');
  assert.ok(/root\.gazetteOpen = false\s*\n\s*root\.goToTile/.test(view),
    'closing the paper first, so the map it just moved is actually visible');
  assert.ok(/highlightIndex/.test(view), 'and marks where it landed');
  assert.ok(/function drawStreetNames/.test(view), 'street names are drawn on the map');
  assert.ok(/Model\.streetRuns\(root\.grid/.test(view), 'from the runs the model finds');
  // About a millisecond per grid change on a mature city, which is 5% of the
  // whole per-tile cost of a road drag — so it is gated on the zoom that can
  // actually draw the labels, and zoomed out it does not touch the grid.
  assert.ok(/readonly property var streetRuns: root\.effectiveCellSize >= root\.streetLabelZoom/
    .test(view), 'street runs are only computed at a zoom that can show them');
  assert.ok(/if \(cellSize < root\.streetLabelZoom\) return/.test(view),
    'and the renderer uses the same threshold, so the two cannot drift');

  // The backing stroke behind a street name must use round joins. At the
  // default miter, a thick stroke shoots black shards several pixels clear of
  // every sharp corner in the type — a "W" is the worst of them.
  const labelFn = view.slice(view.indexOf('function drawStreetNames'),
    view.indexOf('function drawNeighbors'));
  assert.ok(/strokeText/.test(labelFn), 'the label is stroked before it is filled');
  assert.ok(/lineJoin = "round"/.test(labelFn) && /lineCap = "round"/.test(labelFn),
    'with round joins, or the outline grows miter spikes');
  assert.ok(labelFn.indexOf('lineJoin') < labelFn.indexOf('strokeText'),
    'and set before the stroke, not after it');
}


// --- lives, and ends ------------------------------------------------------
// The reason for naming anybody. An idle game has one thing no other game has:
// it has genuinely been running since Year 94, and somebody has genuinely
// lived on Mill Road the whole time. None of that means anything until the
// city can be asked who they are and told when they are gone.
{
  const grid = town();
  const ctx = context(grid, { ageMinutes: 1200 });
  const people = M.advanceCitizens([], ctx).citizens;

  // Arrivals are adults with a life already behind them, not newborns.
  for (const c of people) {
    const age = M.citizenAgeYears(c, 1200);
    assert.ok(age >= M.CITIZEN_ARRIVAL_AGE_MIN && age <= M.CITIZEN_ARRIVAL_AGE_MAX,
      `${c.n} arrived aged ${age}`);
    assert.ok(Number.isFinite(c.b), 'with a birthday');
  }
  // Deterministic: reading the same save twice must not age anybody.
  assert.equal(M.citizenAgeYears(people[0], 1200), M.citizenAgeYears(people[0], 1200));
  assert.equal(M.citizenAgeYears(people[0], 1212), M.citizenAgeYears(people[0], 1200) + 1,
    'and a year passing ages them a year');

  // A save from before anybody had a birthday. Without seeding, everyone reads
  // as born in Year 1 and a century-old city kills them all on load.
  const legacy = [{ n: 'Ada Pike', i: HOME, s: 900, p: M.CITIZEN_PATIENCE }];
  const seeded = M.seedCitizenLives(legacy, 1200);
  assert.ok(Number.isFinite(seeded[0].b), 'a birthday is invented');
  assert.ok(M.citizenAgeYears(seeded[0], 1200) < M.CITIZEN_MAX_AGE,
    'and it is not one that kills them immediately');
  assert.equal(seeded[0].n, legacy[0].n, 'everything else survives');
  assert.equal(M.seedCitizenLives(seeded, 1200)[0].b, seeded[0].b, 'and is stable once set');
  assert.equal(M.seedCitizenLives([], 0).length, 0);

  // Nobody dies young; everybody dies eventually.
  assert.equal(M.citizenDeathChance(30), 0, 'the young do not die of old age');
  assert.equal(M.citizenDeathChance(M.CITIZEN_FRAIL_AGE - 1), 0);
  assert.ok(M.citizenDeathChance(M.CITIZEN_FRAIL_AGE + 10) > M.citizenDeathChance(M.CITIZEN_FRAIL_AGE),
    'and the risk climbs with the years');
  assert.equal(M.citizenDeathChance(M.CITIZEN_MAX_AGE), 1, 'nobody sees past the cap');

  // Run a long time and check people actually die, and are replaced.
  let living = people, gone = [];
  for (let m = 1; m < 800; m++) {
    const step = M.advanceCitizens(living, context(grid, { ageMinutes: 1200 + m }));
    living = step.citizens;
    gone = gone.concat(step.deaths);
  }
  assert.ok(gone.length > 0, 'sixty years and nobody died');
  assert.ok(living.length > 0, 'and the street did not empty out');
  for (const d of gone) {
    assert.ok(d.age >= M.CITIZEN_FRAIL_AGE, `${d.name} died at ${d.age}`);
    assert.ok(d.name && d.street && d.arrivedYear >= 1, 'a death notice is printable');
  }
}

// --- an obituary is written from what the city knows -----------------------
{
  const grid = town();
  const ctx = context(grid, { ageMinutes: 1200 });
  const person = { n: 'Elsie Halloway', i: HOME, s: 12 * 94, p: 6, b: 12 * 94 - 12 * 37 };
  const bio = M.citizenBio(person, ctx);
  const text = M.obituary(bio, 'Cedar Pines', 900);

  assert.ok(text.startsWith('Elsie Halloway'), 'it is about a person');
  assert.ok(text.includes(bio.street), 'and names where they lived');
  // Year 1 opens at minute 0, so a resident settled at month 12*94 arrived in
  // Year 95 — read off the bio rather than assumed, since getting that wrong
  // in the paper would be the sort of error nobody would ever notice.
  assert.equal(bio.arrivedYear, M.calendarFor(person.s).year);
  assert.ok(text.includes('Year ' + bio.arrivedYear), 'and when they came');
  assert.ok(text.includes('900'), 'and what the city was then');
  assert.ok(!/undefined|NaN|\[object/.test(text), text);
  // A period paper does not print numerals in an obituary, and the column
  // lives or dies on sounding like one.
  assert.ok(/in the [a-z-]+ year/.test(text), `no ordinal words in: ${text}`);
  for (const [n, want] of [[1, 'first'], [11, 'eleventh'], [20, 'twentieth'],
    [21, 'twenty-first'], [44, 'forty-fourth'], [81, 'eighty-first'], [99, 'ninety-ninth']])
    assert.equal(M.ordinalWords(n), want, `${n}`);

  // What they did with their life, not the fact they had stopped: everybody in
  // this column is retired by the time it is written.
  // Born so as to be 75 at the moment the bio is taken, which is past frail.
  const old = { n: 'Ada Pike', i: HOME, s: 12 * 94, p: 6, b: 1200 - 12 * 75 };
  const oldBio = M.citizenBio(old, ctx);
  assert.equal(oldBio.trade, M.TRADE_RETIRED, 'the panel says retired');
  assert.ok(oldBio.career && oldBio.career !== M.TRADE_RETIRED, 'the obituary knows better');
  assert.ok(M.obituary(oldBio, 'Cedar Pines', 0).includes(M.capitalise(oldBio.career)),
    'and prints the trade they actually had');
  // A city too young to remember leaves the clause out rather than guessing.
  assert.ok(!M.obituary(bio, 'Cedar Pines', 0).includes('numbered'));
}

// --- a trade comes from what was built around them -------------------------
{
  const works = town();
  for (let x = 14; x <= 20; x++) works[at(x, 20)] = 'I3';
  const shops = town();
  for (let x = 14; x <= 20; x++) shops[at(x, 20)] = 'C3';
  const person = { n: 'Cyril Rooke', i: at(17, 17), s: 0, p: 6, b: -12 * 40 };

  const atWorks = M.citizenTrade(works, size, person, 0);
  const atShops = M.citizenTrade(shops, size, person, 0);
  assert.ok(Array.from(M.TRADES_INDUSTRIAL).includes(atWorks),
    `a street of chimneys makes ${atWorks}`);
  assert.ok(Array.from(M.TRADES_COMMERCIAL).includes(atShops),
    `a street of shopfronts makes ${atShops}`);
  assert.ok(Array.from(M.TRADES_PLAIN).includes(M.citizenTrade(town(), size, person, 0)),
    'and a street of neither still makes a living somehow');
  assert.equal(atWorks, M.citizenTrade(works, size, person, 0), 'a trade does not change on a reread');
}


// --- streets the mayor names ----------------------------------------------
// The city generates a plausible name for every road. This is where one stops
// being the city's and becomes the player's — and every letter written from
// that street has to change wording with it, or the naming is decoration.
{
  const g = M.emptyGrid(size);
  for (let x = 10; x < 30; x++) g[at(x, 15)] = '#0';
  g[at(12, 16)] = 'R2';
  const generated = M.streetOf(g, size, at(12, 16));

  const names = M.renameStreet({}, 'ew', 15, 'Keith Boulevard');
  assert.equal(M.streetOf(g, size, at(12, 16), names), 'Keith Boulevard');
  assert.notEqual(generated, 'Keith Boulevard', 'and it really was called something else');
  assert.equal(M.roadStreet(g, size, at(15, 15), names).named, true, 'the road knows it was named');
  assert.equal(M.roadStreet(g, size, at(15, 15)).named, false);

  // The whole reason the key is axis-and-line: extending the road must not
  // lose the name, exactly as it must not lose the generated one.
  const longer = g.slice();
  for (let x = 30; x < 50; x++) longer[at(x, 15)] = '#0';
  for (let x = 2; x < 10; x++) longer[at(x, 15)] = '#0';
  assert.equal(M.streetOf(longer, size, at(12, 16), names), 'Keith Boulevard');

  // A resident writes from the street the player named.
  const ctx = context(g, { streetNames: names });
  const cast = [{ n: 'Ada Pike', i: at(12, 16), s: 0, p: M.CITIZEN_PATIENCE, b: -480 }];
  assert.equal(M.citizenBio(cast[0], ctx).street, 'Keith Boulevard');
  assert.equal(M.citizenLetters(cast, ctx, 1)[0].street, 'Keith Boulevard');

  // Clearing it hands the street back to the city.
  assert.equal(M.streetOf(g, size, at(12, 16), M.renameStreet(names, 'ew', 15, '   ')),
    generated, 'an empty name restores the generated one');
  // And the map is replaced rather than edited, so a QML property assignment
  // actually notifies.
  assert.notEqual(M.renameStreet(names, 'ew', 15, 'Other'), names);
  assert.equal(names['ew:15'], 'Keith Boulevard', 'the original is left alone');

  assert.ok(M.STREET_NAME_MAX > 8 && M.STREET_NAME_MAX < 64);
  assert.equal(M.renameStreet({}, 'ew', 15, 'x'.repeat(200))['ew:15'].length, M.STREET_NAME_MAX,
    'a name is capped rather than overflowing the map label');
  assert.equal(M.streetOf(g, size, at(12, 16), { 'ew:15': '' }), generated,
    'and an empty stored name is not printed as a blank street');
}

console.log('PASS: named residents at real addresses, complaints that are true of their own ' +
  'tile and ranked as a person would rank them, patience that recovers when the problem is ' +
  'fixed, and a letters column that says something different in every letter, on streets that are real roads, for people who arrive as adults, work at what was built around them, and are written up when they go, on streets the mayor can name.');
