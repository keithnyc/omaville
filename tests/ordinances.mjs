// Ordinances and elections. The ordinances are only interesting if their
// tradeoffs are real, and the election is only interesting if it can actually
// be lost — but it must never be able to destroy a city someone built over
// hours, so the recoverability is pinned too.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);
const size = M.GRID_SIZE;

// --- every ordinance is well-formed and does something --------------------
const ids = Array.from(M.ORDINANCES, o => o.id);
assert.equal(new Set(ids).size, ids.length, 'ordinance ids are unique');
for (const o of M.ORDINANCES) {
  assert.ok(o.id && o.name && o.blurb, `${o.id} is displayable`);
  assert.ok(Object.keys(o.effects).length > 0, `${o.id} actually does something`);
  assert.equal(M.ordinance(o.id).name, o.name);
}
assert.equal(M.ordinance('nope'), null);

// Nothing is a free win: every ordinance either costs money or carries a
// downside, and the one that pays you carries two.
for (const o of M.ORDINANCES) {
  const downside = o.effects.happiness < 0 || o.effects.crimeChance > 1
    || o.effects.fireChance > 1;
  assert.ok(o.rate > 0 || downside, `${o.id} must cost something or hurt something`);
}
const gambling = M.ordinance('gambling');
assert.ok(gambling.rate < 0, 'gambling is revenue');
assert.ok(gambling.effects.crimeChance > 1 && gambling.effects.happiness < 0,
  'and pays for it twice over');

// --- cost scales with the city, and revenue reads as negative ------------
assert.equal(M.ordinanceCost([], 5000), 0, 'no policies, no cost');
assert.equal(M.ordinanceCost(['nonsense'], 5000), 0, 'unknown ids are ignored');
assert.ok(M.ordinanceCost(['curfew'], 4000) > M.ordinanceCost(['curfew'], 1000) * 3.5,
  'a policy costs proportionally more in a bigger city');
assert.ok(M.ordinanceCost(['gambling'], 2000) < 0, 'revenue is a negative cost');
const paid = Array.from(M.ORDINANCES.filter(o => o.rate > 0), o => o.id);
assert.ok(M.ordinanceCost(paid, 2385) > 250,
  'enacting everything is a serious commitment, not a rounding error');

// --- effects stack, and default to neutral -------------------------------
const none = M.ordinanceEffects([]);
for (const key of ['fireChance', 'crimeChance', 'crimeSuppress', 'waterDemand',
  'residentialDemand', 'commercialDemand', 'industrialDemand', 'industrialNuisance'])
  assert.equal(none[key], 1, `${key} is neutral with no ordinances`);
assert.equal(none.happiness, 0);
assert.equal(M.ordinanceEffects(undefined).fireChance, 1, 'missing list is neutral');

const both = M.ordinanceEffects(['watch', 'gambling']);
assert.ok(Math.abs(both.crimeChance - 0.7 * 1.5) < 1e-9, 'multipliers multiply');
assert.equal(both.happiness, 1 - 3, 'happiness deltas add');

// --- the tradeoffs are real where they are claimed to be -----------------
const stats = M.summarize((() => {
  const g = M.emptyGrid(size);
  for (let i = 0; i < 20; i++) { g[500 + i] = 'R2'; g[560 + i] = 'C2'; g[620 + i] = 'I2'; }
  return g;
})());

// Water conservation genuinely relieves the grid rather than adding capacity.
const grid = M.emptyGrid(size);
for (let i = 0; i < 40; i++) grid[500 + i] = 'R3';
grid[400] = 'E2'; grid[401] = 'W0';
const plain = M.utilityLoad(grid, M.summarize(grid), M.ordinanceEffects([]));
const saving = M.utilityLoad(grid, M.summarize(grid), M.ordinanceEffects(['conservation']));
assert.ok(saving.waterDemand < plain.waterDemand, 'conservation cuts draw');
assert.ok(saving.water > plain.water, 'which relieves an overloaded grid');
assert.equal(saving.powerDemand, plain.powerDemand, 'and leaves power alone');

// Demand policies move only the zone they claim to.
const base = M.computeDemand(stats, 0, M.ordinanceEffects([]));
const homes = M.computeDemand(stats, 0, M.ordinanceEffects(['homestead']));
assert.ok(homes.R > base.R && homes.C === base.C && homes.I === base.I,
  'the homestead grant lifts housing and nothing else');
const works = M.computeDemand(stats, 0, M.ordinanceEffects(['subsidy']));
assert.ok(works.I > base.I && works.R === base.R, 'the subsidy lifts industry and nothing else');

// Disaster policies move the odds in the direction advertised.
const town = M.emptyGrid(size);
for (let i = 0; i < 30; i++) town[500 + i] = 'R3';
const fireSurvey = M.fireSurvey(town, size, M.findUtilities(town), M.defaultFunding());
assert.ok(M.fireStartChance(fireSurvey, M.ordinanceEffects(['smoke']))
  < M.fireStartChance(fireSurvey, M.ordinanceEffects([])), 'smoke detectors mean fewer fires');
const crimeSurvey = M.crimeSurvey(town, size, M.findUtilities(town), M.defaultFunding());
assert.ok(M.crimeStartChance(crimeSurvey, M.ordinanceEffects(['watch']))
  < M.crimeStartChance(crimeSurvey, M.ordinanceEffects([])), 'a watch means fewer crime waves');
assert.ok(M.crimeStartChance(crimeSurvey, M.ordinanceEffects(['gambling']))
  > M.crimeStartChance(crimeSurvey, M.ordinanceEffects([])), 'gambling means more');
assert.ok(M.ordinanceEffects(['curfew']).crimeSuppress > 1, 'a curfew ends waves faster');
assert.ok(M.ordinanceEffects(['curfew']).happiness < 0, 'and nobody enjoys it');

// --- approval is a summary judgement, not raw happiness ------------------
const clean = M.serviceCoverageStats(town, size);
const calm = M.computeApproval(70, clean, 0, 0, 100, 450);
assert.ok(M.computeApproval(70, clean, 1, 0, 100, 450) < calm, 'a fire costs approval');
assert.ok(M.computeApproval(70, clean, 0, 1, 100, 450) < calm, 'so does a crime wave');
assert.ok(M.computeApproval(70, clean, 0, 0, -400, 450) < calm, 'so does running a deficit');
assert.ok(M.computeApproval(90, clean, 0, 0, 100, 450) > calm, 'a happier city approves more');
for (const v of [M.computeApproval(0, clean, 9, 9, -9999, 450),
                 M.computeApproval(100, clean, 0, 0, 9999, 450)])
  assert.ok(v >= 0 && v <= 100, 'approval stays a percentage');

// --- elections come round on schedule ------------------------------------
assert.equal(M.electionDue(0, 0), false, 'not due the moment a city is founded');
assert.equal(M.electionDue(M.ELECTION_INTERVAL_TICKS - 1, 0), false);
assert.equal(M.electionDue(M.ELECTION_INTERVAL_TICKS, 0), true);
assert.equal(M.electionDue(M.ELECTION_INTERVAL_TICKS + 5, M.ELECTION_INTERVAL_TICKS), false,
  'and not again until the next full term');
assert.ok(M.nextElectionTick(0) === M.ELECTION_INTERVAL_TICKS);
assert.ok(M.nextElectionTick(M.ELECTION_INTERVAL_TICKS + 1) === M.ELECTION_INTERVAL_TICKS * 2);

// Losing must be survivable: the penalty is a fixed term out of office, which
// is short next to the interval, so a city is never lost to one bad quarter.
assert.ok(M.TERM_OUT_TICKS > 0, 'losing has a real consequence');
assert.ok(M.TERM_OUT_TICKS < M.ELECTION_INTERVAL_TICKS,
  'but it always ends well before the next election');
assert.ok(M.ELECTION_THRESHOLD > 0 && M.ELECTION_THRESHOLD < 100,
  'the bar is passable and losable');

console.log('PASS: well-formed ordinances with no free wins, cost scaling, stacking effects, ' +
  'real tradeoffs in water/demand/disaster odds, approval as a summary judgement, ' +
  'and an election that can be lost but never loses the city.');
