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

// --- industry saturates, which is the whole reason it can be over-built ---
// The old formula could not fall below 0.6 and was pinned at its ceiling in
// any city with industry at all, so the demand meter told a player to keep
// zoning works for ever and the optimal play was to carpet the map.
{
  const of = share => ({ population: 10000, jobsIndustrial: Math.round(10000 * share),
    jobsCommercial: 2000, resCount: 200, decorationPoints: 0 });
  const appetite = share => M.computeDemand(of(share), 0).I;

  assert.ok(appetite(0.05) > appetite(0.45), 'a city short of works wants more than a full one');
  assert.ok(appetite(0.45) > appetite(0.7), 'and it keeps falling rather than levelling off');
  assert.ok(appetite(0.7) < 0.1, 'a city that is nothing but factories is asked to stop');
  assert.ok(appetite(M.IND_JOB_TARGET) > appetite(M.IND_JOB_TARGET * 1.5),
    'the target is the turn of the curve');
  // Monotonic the whole way, so the meter never rewards over-building.
  let last = Infinity;
  for (let share = 0; share <= 1; share += 0.05) {
    const now = appetite(share);
    assert.ok(now <= last + 1e-9, `demand rose again at ${share.toFixed(2)}`);
    last = now;
  }
  // Never quite zero: ordinances and city character multiply this, and a hard
  // zero would swallow both.
  assert.ok(appetite(5) > 0, 'even an absurd city leaves a lever to pull');
  assert.ok(M.computeDemand(of(5), 0, M.ordinanceEffects(['subsidy'])).I > appetite(5),
    'the subsidy still does something in the city most likely to want it');

  // A city with more jobs than workers does not want another it cannot staff.
  assert.ok(M.computeDemand({ population: 800, jobsIndustrial: 2000, jobsCommercial: 500,
    resCount: 20 }, 0).I < appetite(0.7), 'no workers, no appetite');
}

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
assert.equal(M.electionDue(M.ELECTION_INTERVAL_TICKS + 5, M.ELECTION_INTERVAL_TICKS), false,
  'and not again until the next full term');
// A founding mayor gets a longer first term and a lower bar: a six-month-old
// town cannot have parks, coverage or a surplus, so judging it like an
// established city measures how fast it could spend, not how well it was run.
assert.equal(M.nextElectionTick(0, 0), M.FIRST_ELECTION_TICKS, 'the first term is longer');
assert.ok(M.FIRST_ELECTION_TICKS > M.ELECTION_INTERVAL_TICKS);
assert.equal(M.nextElectionTick(80, 72), 72 + M.ELECTION_INTERVAL_TICKS,
  'and every term after it is the normal length');
assert.equal(M.electionDue(M.FIRST_ELECTION_TICKS - 1, 0), false, 'not due early');
assert.equal(M.electionDue(M.FIRST_ELECTION_TICKS, 0), true, 'due on time');
assert.equal(M.electionThreshold(0), M.FIRST_ELECTION_THRESHOLD, 'a gentler first bar');
assert.equal(M.electionThreshold(72), M.ELECTION_THRESHOLD, 'the usual bar thereafter');
assert.ok(M.FIRST_ELECTION_THRESHOLD > 0 && M.FIRST_ELECTION_THRESHOLD < M.ELECTION_THRESHOLD,
  'gentler, but still losable');

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

// --- a founding mayor must have a real chance -----------------------------
// Keith was voted out of a brand-new town and could not have avoided it: at
// month 48 a young city has no parks to offset its industry, no full service
// coverage, and no surplus. This pins that a plausible young city clears its
// own bar, and that an established one is still held to the higher one.
{
  const young = M.emptyGrid(size);
  let n = 0;
  for (let r = 20; r < 27; r++)
    for (let c = 20; c < 33; c++)
      young[r * size + c] = (r % 3 === 0) ? '#0' : ((n++ % 5 === 0) ? 'I2' : (n % 3 === 0 ? 'C1' : 'R2'));
  // Enough plants to actually cover the block: a tier-0 generator only reaches
  // about five tiles, so one of each would model an incompetently built town
  // rather than the competently run one this test is about.
  for (const c of [22, 28]) { young[19 * size + c] = 'E0'; young[19 * size + c + 2] = 'W0'; }
  // The basic four services, which cost about $350 to build — affordable by
  // the end of a first term, and the thing the electorate is really asking
  // about. A town that has not built them should struggle; this one has.
  young[19 * size + 25] = 'F0'; young[27 * size + 22] = 'S0';
  young[27 * size + 26] = 'N0'; young[27 * size + 30] = 'H0';

  const stats = M.summarize(young);
  assert.ok(stats.population > 200, 'a real young town');
  assert.ok(stats.parkHappinessBonus === 0, 'with no parks yet, as a new city has none');

  const coverage = M.serviceCoverageStats(young, size);
  const income = M.incomeFor(stats, 10);
  const upkeep = M.computeUpkeep(stats, M.defaultFunding(), []);
  const approval = M.computeApproval(M.computeHappiness(10, stats), coverage, 0, 0,
    income - upkeep, stats.population);

  assert.ok(approval >= M.FIRST_ELECTION_THRESHOLD,
    `a competently run new town survives its first election (approval ${approval})`);
  assert.ok(approval < 90, 'without the first term being a free pass');

  // The industrial penalty scales with share, not headcount: the same ratio
  // costs the same whatever the city's size, which is what makes it a dial
  // the player can actually turn rather than a flat tax on having factories.
  const small = { resCount: 40, comCount: 10, indCount: 10 };
  const large = { resCount: 400, comCount: 100, indCount: 100 };
  assert.ok(Math.abs(M.industrialMood(small) - M.industrialMood(large)) < 1e-9,
    'the same industrial share costs the same at any size');
  assert.ok(M.industrialMood({ resCount: 90, comCount: 5, indCount: 5 })
    < M.industrialMood(small), 'a lighter industrial share costs less');
  assert.equal(M.industrialMood({ resCount: 0, comCount: 0, indCount: 0 }), 0,
    'an empty city is not unhappy about factories it does not have');
  assert.equal(M.industrialMood({ resCount: 0, comCount: 0, indCount: 50 }),
    M.INDUSTRIAL_HAPPINESS_MAX, 'and an all-industry city takes the full hit');
}

console.log('PASS: a founding term long enough and judged gently enough to be winnable, ' +
  'and an industrial penalty that scales with share rather than headcount.');
