// City advisors and municipal loans. The advisors' whole value is that they
// read the same helpers the tick does, so these assert they actually react to
// real simulated state rather than reporting canned text.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);

const size = M.GRID_SIZE;
const ctxFor = (grid, over = {}) => {
  const stats = M.summarize(grid);
  const funding = over.funding || M.defaultFunding();
  const income = M.computeIncome(stats.taxablePopulation, over.taxRatePercent ?? 15);
  return {
    stats, coverage: M.serviceCoverageStats(grid, size), demand: M.computeDemand(stats),
    income, upkeep: M.computeUpkeep(stats, funding), treasury: over.treasury ?? 1000,
    funding, loans: over.loans || [], taxRatePercent: over.taxRatePercent ?? 15
  };
};
const by = (list, who) => list.find(a => a.advisor === who);

// --- every advisor always reports, in a stable order ----------------------
const empty = M.emptyGrid(size);
const first = M.cityAdvice(ctxFor(empty));
assert.equal(first.length, M.ADVISOR_ORDER.length, 'one entry per advisor, always');
// Array.from on both sides: values built inside the vm carry that realm's
// prototype, which deepStrictEqual treats as a mismatch.
assert.deepEqual(Array.from(first, a => a.advisor), Array.from(M.ADVISOR_ORDER),
  'stable order so the panel does not reshuffle under the mouse');
for (const a of first) assert.ok(a.headline && a.detail && a.name, 'every entry is displayable');

// An empty map's first problem is that nobody can live there.
assert.equal(by(first, 'planning').severity, M.SEVERITY_URGENT);
assert.match(by(first, 'planning').headline, /Nowhere to live/);

// --- the planner notices a city that is full, not merely slow -------------
// Every residential tile grown to level 3 == at the zoned ceiling.
const full = M.emptyGrid(size);
for (let i = 0; i < 12; i++) { full[500 + i] = 'R3'; full[500 + i - size] = '#0'; }
const fullStats = M.summarize(full);
assert.equal(fullStats.population, M.residentialCeiling(fullStats), 'this city really is full');
const fullAdvice = by(M.cityAdvice(ctxFor(full)), 'planning');
assert.equal(fullAdvice.severity, M.SEVERITY_URGENT);
assert.match(fullAdvice.headline, /Housing is full/);
assert.match(fullAdvice.detail, /100% of its zoned ceiling/);

// Room to grow reads differently from being full.
const roomy = M.emptyGrid(size);
for (let i = 0; i < 12; i++) { roomy[500 + i] = 'R1'; roomy[500 + i - size] = '#0'; }
assert.notEqual(by(M.cityAdvice(ctxFor(roomy)), 'planning').headline, 'Housing is full');

// --- utilities advisor is driven by real coverage -------------------------
const dark = M.emptyGrid(size);
dark[500] = 'R2';
const darkAdvice = by(M.cityAdvice(ctxFor(dark)), 'utilities');
assert.equal(darkAdvice.severity, M.SEVERITY_URGENT);
assert.match(darkAdvice.detail, new RegExp(`${M.RES_CAP_PER_LEVEL * 2} residents`),
  'it reports the actual number of unserved residents');
dark[501] = 'E1'; dark[502] = 'W1';
assert.equal(by(M.cityAdvice(ctxFor(dark)), 'utilities').severity, M.SEVERITY_OK);

// --- safety advisor sees underfunding, not just missing buildings ---------
const guarded = M.emptyGrid(size);
guarded[500] = 'R2'; guarded[501] = 'F1'; guarded[502] = 'S1';
assert.equal(by(M.cityAdvice(ctxFor(guarded)), 'safety').severity, M.SEVERITY_OK);
const starved = by(M.cityAdvice(ctxFor(guarded, { funding: { F: 0.5, S: 0.5, N: 1, H: 1 } })), 'safety');
assert.equal(starved.severity, M.SEVERITY_WATCH, 'a starved department is worth flagging');

// --- treasurer ------------------------------------------------------------
const broke = ctxFor(dark, { treasury: M.TREASURY_FLOOR });
assert.match(by(M.cityAdvice(broke), 'finance').headline, /insolvent/);
assert.equal(by(M.cityAdvice(broke), 'finance').severity, M.SEVERITY_URGENT);

const hoard = by(M.cityAdvice(ctxFor(full, { treasury: 40000 })), 'finance');
assert.match(hoard.headline, /idle/, 'a treasury doing nothing is itself a problem worth naming');

// topAdvice surfaces the most severe thing, not merely the first.
const unpowered = M.emptyGrid(size);
unpowered[700] = 'R2';
const top = M.topAdvice(M.cityAdvice(ctxFor(unpowered)));
assert.equal(top.severity, M.SEVERITY_URGENT);
assert.ok(M.cityAdvice(ctxFor(unpowered)).some(a => a.severity < top.severity),
  'and it beat calmer advisors to the summary line');

// --- loans ----------------------------------------------------------------
const seed = M.loanOffer('seed');
assert.ok(seed && M.loanOffer('nope') === null);
// Repaying every instalment clears exactly principal + interest.
assert.ok(Math.abs(M.loanPaymentFor(seed) * seed.ticks - seed.principal * (1 + seed.interest)) < 0.01,
  'the schedule repays the debt exactly, no more and no less');

const bigIncome = 10000;
let loans = [];
assert.ok(M.canBorrow(seed, loans, 0, bigIncome).ok, 'the smallest bond has no population gate');
assert.equal(M.canBorrow(M.loanOffer('growth'), loans, 10, bigIncome).reason, 'too-small',
  'larger bonds need a real city behind them');
assert.equal(M.canBorrow(seed, loans, 0, 0).reason, 'cant-service',
  'a city with no income cannot service a loan');

loans = M.takeLoan(loans, seed, 5);
assert.equal(loans.length, 1);
assert.equal(loans[0].remaining, seed.principal * (1 + seed.interest));
assert.ok(Math.abs(M.totalLoanPayment(loans) - M.loanPaymentFor(seed)) < 0.01);

loans = M.takeLoan(loans, seed, 6);
assert.equal(M.canBorrow(seed, loans, 0, bigIncome).reason, 'too-many-loans',
  `no more than ${M.MAX_ACTIVE_LOANS} at once`);

// Debt service is capped as a share of income — the thing that stops
// borrowing becoming an infinite hole.
assert.equal(M.canBorrow(seed, [], 0, M.loanPaymentFor(seed) / M.LOAN_BURDEN_LIMIT * 0.9).reason,
  'cant-service');

// A loan pays off in exactly its stated term and then disappears.
let one = M.takeLoan([], seed, 0);
for (let tick = 0; tick < seed.ticks; tick++) {
  assert.equal(one.length, 1, `loan still outstanding at tick ${tick}`);
  one = M.advanceLoans(one);
}
assert.equal(one.length, 0, 'cleared on schedule, not a tick early or late');
assert.equal(M.totalLoanPayment(one), 0);
assert.equal(M.totalLoanDebt(M.takeLoan([], seed, 0)), seed.principal * (1 + seed.interest));

// The treasurer reports debt while it is being carried.
const indebted = by(M.cityAdvice(ctxFor(full, { loans: M.takeLoan([], seed, 0) })), 'finance');
assert.ok(/debt|short/i.test(indebted.headline), 'the treasurer mentions the debt');


// --- map overlays ---------------------------------------------------------
// The overlays exist to show where an advisor's problem is, so the thing
// worth pinning is that they agree with the simulation rather than
// re-deriving it. A red tile the tick disagrees about is worse than no view.
for (const def of M.OVERLAYS) assert.ok(def.key && def.label, 'every overlay is pickable');
assert.equal(M.overlayDef('nope'), null);
assert.equal(M.overlayDef('power').service, 'power');

// growthBlocker must match tickGrid's own reasons, in tickGrid's own order.
const blocked = M.emptyGrid(size);
const spot = 40 * size + 40;
blocked[spot] = 'R1';
let u = M.findUtilities(blocked);
assert.equal(M.growthBlocker(blocked, size, spot, u, 70), 'road', 'no road is the first blocker');
blocked[spot + 1] = '#0';
u = M.findUtilities(blocked);
assert.equal(M.growthBlocker(blocked, size, spot, u, 70), 'power');
blocked[spot + 2] = 'E1';
u = M.findUtilities(blocked);
assert.equal(M.growthBlocker(blocked, size, spot, u, 70), 'water');
blocked[spot + 3] = 'W1';
u = M.findUtilities(blocked);
assert.equal(M.growthBlocker(blocked, size, spot, u, 70), '', 'fully connected: nothing blocking');
assert.equal(M.growthBlocker(blocked, size, spot, u, 10), 'unhappy',
  'and it agrees with tickGrid that growth needs happiness >= 20');
blocked[spot] = 'R3';
assert.equal(M.growthBlocker(blocked, size, spot, u, 70), 'max');
assert.equal(M.growthBlocker(blocked, size, spot + 1, u, 70), '', 'roads are not zones');
for (const reason of ['max', 'road', 'power', 'water', 'unhappy'])
  assert.ok(M.GROWTH_BLOCKER_LABELS[reason], `${reason} is displayable`);

// A blocked tile the overlay paints red must be one the tick really refuses
// to grow: run the real tickGrid with growth forced and confirm it stays put.
const stuck = M.emptyGrid(size);
stuck[spot] = 'R1';
stuck[spot + 1] = '#0';
const stuckU = M.findUtilities(stuck);
assert.notEqual(M.growthBlocker(stuck, size, spot, stuckU, 70), '');
const forced = vm.createContext({ Math: Object.assign(Object.create(Math), { random: () => 0 }) });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  forced);
// random() === 0 makes every roll maximally favourable to growth, so if the
// tile still never rises the block is real and not just unlucky. (It in fact
// decays, since an unconnected tile is also a decay candidate — which is the
// same verdict, only harsher.)
const after = forced.tickGrid(stuck, size, { population: 50 }, 70, stuckU, { R: 9, C: 1, I: 1 });
assert.ok(M.parseTile(after[spot]).level <= M.parseTile(stuck[spot]).level,
  'the tick agrees: a tile the overlay marks blocked never grows');

// Coverage overlay states line up with isCovered itself.
const covered = M.emptyGrid(size);
covered[spot] = 'R2';
covered[spot + 1] = 'E1';
const cu = M.findUtilities(covered);
const pdef = M.overlayDef('power');
assert.equal(M.overlayCoverageState(covered, size, spot, pdef, cu, null), 'covered');
assert.equal(M.overlayCoverageState(covered, size, spot + 2, pdef, cu, null), 'idle',
  'in range but nothing built there');
const lonely = M.emptyGrid(size);
lonely[spot] = 'R2';
assert.equal(M.overlayCoverageState(lonely, size, spot, pdef, M.findUtilities(lonely), null), 'gap',
  'built and uncovered is the actionable case');
assert.equal(M.overlayCoverageState(lonely, size, spot + 9, pdef, M.findUtilities(lonely), null), '');

// --- an overlay only accuses zones the service actually serves ------------
// A school and a clinic affect residential growth and nothing else — tickGrid
// applies both inside the branch that runs for houses alone. Painting a
// factory red on the Health overlay accuses the player of neglecting something
// a factory has never wanted, and sends them to build a clinic that will
// change nothing.
{
  const g = M.emptyGrid(size);
  const homes = spot, shops = spot + 1, works = spot + 2;
  g[homes] = 'R3'; g[shops] = 'C3'; g[works] = 'I3';
  const u = M.findUtilities(g), funding = M.defaultFunding();
  const state = (key, at) => M.overlayCoverageState(g, size, at, M.overlayDef(key), u, funding);

  for (const key of ['schools', 'medical']) {
    assert.equal(state(key, homes), 'gap', `${key} still flags an uncovered house`);
    assert.equal(state(key, shops), '', `${key} must not flag a shopfront`);
    assert.equal(state(key, works), '', `${key} must not flag a works`);
  }
  for (const key of ['power', 'water', 'fire', 'police', 'transit'])
    for (const [at, what] of [[homes, 'homes'], [shops, 'shops'], [works, 'works']])
      assert.equal(state(key, at), 'gap', `${key} genuinely applies to ${what}`);

  // Every overlay that names a service has to say who it serves, or it falls
  // back to all three and quietly accuses the wrong zones again.
  for (const def of M.OVERLAYS) {
    if (!def.service) continue;
    assert.ok(def.serves, `the ${def.key} overlay must declare who it serves`);
    assert.ok(/^[RCI]+$/.test(def.serves), `${def.key} serves an odd set: ${def.serves}`);
  }
}

// --- the card and the map must measure the same distance ------------------
// They did not. serviceCoverageStats used the bare radius while the overlay
// and the tick both scaled it by the department's funding, so a city with its
// schools at 150% read "Education 99% covered, 225 residents unserved" above a
// Schools overlay that was solid green. Two places computing the same reach
// differently is the bug; this is the assertion that they are one number.
{
  for (const funding of [{ F: 1, S: 1, N: 1, H: 1, M: 1 },
    { F: 1.5, S: 0.5, N: 1.5, H: 1.25, M: 0.75 },
    { F: M.FUNDING_MIN, S: M.FUNDING_MAX, N: M.FUNDING_MAX, H: M.FUNDING_MIN, M: 1 }]) {
    const rows = M.serviceCoverageStats(M.emptyGrid(size), size, funding);
    for (const def of M.OVERLAYS) {
      if (!def.service) continue;
      const row = rows.find(r => r.key === def.service);
      assert.ok(row, `the card reports on ${def.service}`);
      assert.ok(Math.abs(row.radius - M.overlayRadius(def, funding)) < 1e-9,
        `${def.service}: the card measures ${row.radius} and the map measures ` +
        `${M.overlayRadius(def, funding)} — one of them is lying to the player`);
    }
  }

  // Funding a department really does close a gap, rather than only appearing to.
  const town = M.emptyGrid(size);
  const school = 32 * size + 32;
  town[school] = 'N1';
  // A house at the edge of the unfunded radius but inside the funded one.
  town[school + Math.round(M.SCHOOL_RADIUS * 1.1)] = 'R3';
  const starved = M.serviceCoverageStats(town, size, { N: 1 })
    .find(r => r.key === 'schools');
  const funded = M.serviceCoverageStats(town, size, { N: M.FUNDING_MAX })
    .find(r => r.key === 'schools');
  assert.ok(funded.served > starved.served,
    'paying a department more must reach houses the card previously called unserved');
  // Power has no budget, so no amount of money moves it.
  assert.equal(
    M.serviceCoverageStats(town, size, { N: M.FUNDING_MAX }).find(r => r.key === 'power').radius,
    M.POWER_RADIUS, 'power has no department budget to widen it');
}

// --- the demand meter rescales against the real span ----------------------
// Each bar is rescaled against its own achievable range, and CityView used to
// keep its own copy of those numbers — I: { min: 0.6, max: 0.9 }, mirroring
// the old formula's constants by hand. Changing the formula would have left
// the meter reading a range the model can no longer produce.
{
  assert.ok(M.DEMAND_RANGE, 'the model owns the spans');
  const view = fs.readFileSync(new URL('../CityView.qml', import.meta.url), 'utf8');
  assert.ok(/demandRange: Model\.DEMAND_RANGE/.test(view), 'and the meter reads them');
  // Matched on the code, not the prose: the comment beside it explains what
  // the stale copy used to be, and an earlier version of this assertion
  // rejected the explanation.
  assert.ok(!/demandRange: \(\{/.test(view), 'rather than declaring its own literal');

  // The spans have to actually bound what computeDemand produces.
  for (let pop = 200; pop <= 40000; pop *= 3)
    for (const indShare of [0, 0.2, 0.5, 1, 2])
      for (const comShare of [0, 0.3, 1]) {
        const d = M.computeDemand({ population: pop, resCount: pop / 40,
          jobsIndustrial: pop * indShare, jobsCommercial: pop * comShare,
          decorationPoints: 0 }, 0);
        for (const key of ['R', 'C', 'I']) {
          const span = M.DEMAND_RANGE[key];
          assert.ok(d[key] >= span.min - 1e-9 && d[key] <= span.max + 1e-9,
            `${key} demand ${d[key].toFixed(3)} falls outside its declared ` +
            `${span.min}-${span.max}, so the meter cannot draw it honestly`);
        }
      }
}

// Funding widens what the overlay draws, exactly as it widens real coverage.
const fdef = M.overlayDef('fire');
assert.ok(M.overlayRadius(fdef, { F: M.FUNDING_MAX }) > M.overlayRadius(fdef, { F: 1 }));
assert.equal(M.overlayRadius(pdef, { F: 0.5 }), M.POWER_RADIUS, 'power has no department budget');

// Every advisor that names a locatable problem points at a real overlay.
for (const a of M.cityAdvice(ctxFor(dark)))
  if (a.overlay) assert.ok(M.overlayDef(a.overlay), `${a.advisor} points at a real overlay`);

console.log('PASS: advisor coverage/zoning/budget reactions, stable ordering, loan ' +
  'eligibility, schedule, burden cap and exact payoff, and overlays that agree with tickGrid.');

// --- somebody has to say why the city is miserable ------------------------
// Six advisors covered coverage, traffic, money and zoning, and not one of
// them ever mentioned happiness. Keith's city sat at 44% with 30% of its lots
// industrial and a single park, and nothing in the game connected the two.
{
  const town = M.emptyGrid(M.GRID_SIZE);
  let n = 0;
  for (let r = 20; r < 27; r++)
    for (let c = 20; c < 33; c++)
      town[r * M.GRID_SIZE + c] = (r % 3 === 0) ? '#0' : ((n++ % 3 === 0) ? 'I2' : 'R2');
  const stats = M.summarize(town);
  const coverage = M.serviceCoverageStats(town, M.GRID_SIZE);

  const rows = M.moodBreakdown(10, stats, 0, 0);
  const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
  for (const key of ['industry', 'tax', 'traffic', 'ordinances', 'parks'])
    assert.ok(byKey[key], `${key} is accounted for`);
  assert.ok(byKey.industry.amount < 0, 'a heavily industrial city is dragged down by it');
  assert.ok(byKey.parks.amount >= 0, 'parks are the positive term');
  assert.equal(M.worstMood(rows).key, 'industry', 'and the worst drag is nameable');
  assert.equal(M.worstMood(M.moodBreakdown(10, { parkHappinessBonus: 20 }, 0, 0)), null,
    'a contented city has no drag to report');

  const speak = (happiness, moodStats) => M.wellbeingAdvice(coverage, stats, M.defaultFunding(),
    { happiness, rows: M.moodBreakdown(10, moodStats || stats, 0, 0) });

  const miserable = speak(44);
  assert.equal(miserable.severity, M.SEVERITY_URGENT, 'a miserable city is urgent');
  assert.match(miserable.headline, /unhappy/i);
  assert.match(miserable.detail, /industry/i, 'and names the cause');
  assert.match(miserable.detail, /park/i, 'and the lever, since parks are how you buy goodwill back');

  const middling = speak(60);
  assert.equal(middling.severity, M.SEVERITY_WATCH, 'a middling city is a watch, not an alarm');
  assert.match(middling.detail, /industry/i);

  // Once the mood is fine the advisor goes back to schools and clinics.
  assert.ok(!/unhapp/i.test(speak(80).headline), 'a happy city hears about something else');
  assert.ok(!/unhapp/i.test(M.wellbeingAdvice(coverage, stats, M.defaultFunding()).headline),
    'and omitting the mood entirely is safe for older callers');
}

console.log('PASS: an advisor that names the largest drag on happiness and the lever to fix it.');
