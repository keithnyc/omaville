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

console.log('PASS: advisor coverage/zoning/budget reactions, stable ordering, and loan ' +
  'eligibility, schedule, burden cap and exact payoff.');
