// Mayor's dilemmas: enough of them, not the same ones over and over, and only
// the ones that make sense for this city.
//
// After a week of play the 24 original scenarios were drawn uniformly at
// random, so the same handful kept coming back. The fix is three things, each
// checked here: a memory of what fired recently, which sits out until the rest
// have had a turn; scenarios that need something (a lake, woodland, a
// connected neighbour) so a city without one never gets them; and names filled
// in from the player's own city.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math, JSON });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);
const service = fs.readFileSync(new URL('../Service.qml', import.meta.url), 'utf8');
const EVENTS = Array.from(M.EVENTS);

// --- the catalogue is well-formed -----------------------------------------
const effectKeys = ['treasuryDelta', 'incomeMultiplier', 'effectTicks', 'populationPercent', 'happinessDelta'];
const requireKeys = ['minPopulation', 'lakes', 'woodland', 'industry', 'transit', 'schools', 'clinics', 'neighbors'];
assert.ok(EVENTS.length >= 44, `only ${EVENTS.length} dilemmas`);
assert.equal(new Set(EVENTS.map(e => e.id)).size, EVENTS.length, 'ids are unique');
for (const e of EVENTS) {
  assert.ok(e.title && e.flavor, `${e.id} has a title and flavour`);
  assert.equal(e.choices.length, 2, `${e.id} is a binary choice`);
  for (const c of e.choices) {
    assert.ok(c.label && c.hint && c.outcome, `${e.id} choice is complete`);
    for (const k of Object.keys(c.effects)) assert.ok(effectKeys.includes(k), `${e.id}: unknown effect ${k}`);
    if ((c.effects.happinessDelta || c.effects.incomeMultiplier) && !c.effects.effectTicks)
      assert.fail(`${e.id}: a lingering effect with no duration`);
  }
  for (const k of Object.keys(e.requires || {}))
    assert.ok(requireKeys.includes(k), `${e.id}: unknown requirement ${k}`);
  const text = JSON.stringify(e);
  for (const placeholder of text.match(/\{[a-z]+\}/g) || [])
    assert.ok(['{city}', '{neighbor}'].includes(placeholder), `${e.id}: unknown placeholder ${placeholder}`);
  if (text.includes('{neighbor}'))
    assert.ok(e.requires && e.requires.neighbors >= 1, `${e.id} names a neighbour it may not have`);
}
// Every requirement the catalogue uses is something the service actually passes.
const roll = service.match(/function rollEvent\(\) \{[\s\S]*?\n  \}/)[0];
for (const key of ['recent', 'population', 'lakes', 'woodland', 'industry', 'transit', 'schools', 'clinics', 'neighborNames', 'city'])
  assert.ok(new RegExp('\\b' + key + ':').test(roll), `rollEvent does not pass ${key}`);
const conditional = EVENTS.filter(e => e.requires).length;
assert.ok(conditional >= 10 && conditional < EVENTS.length / 2,
  `${conditional} conditional dilemmas: enough to vary, not so many a young city gets nothing`);

// --- the rotation ---------------------------------------------------------
const bigCity = {
  population: 5000, lakes: 100, woodland: 200, industry: 50, transit: 3, schools: 3, clinics: 3,
  neighborNames: ['Northfield', 'Easton'], city: 'Omaville'
};
function fire(context, times, pending = []) {
  let recent = [];
  const fired = [];
  for (let i = 0; i < times; i++) {
    const e = M.rollForEvent(pending, context.population, 1, Object.assign({}, context, { recent }));
    assert.ok(e, 'a certain roll fires');
    fired.push(e.id);
    recent = Array.from(M.rememberEvent(recent, e.id));
  }
  return { fired, recent };
}
{
  const { fired, recent } = fire(bigCity, 400);
  assert.ok(recent.length <= M.EVENT_RECENT_MEMORY, 'the memory is bounded');
  for (let i = 0; i < fired.length; i++) {
    const again = fired.indexOf(fired[i], i + 1);
    if (again >= 0)
      assert.ok(again - i > M.EVENT_RECENT_MEMORY,
        `${fired[i]} came back after ${again - i} dilemmas`);
  }
  assert.equal(new Set(fired).size, EVENTS.length, 'a big city sees every scenario');
}

// --- a city only gets what makes sense for it ----------------------------
{
  const village = { population: 120, neighborNames: [], city: 'Hamlet' };
  const { fired } = fire(village, 300);
  const byId = Object.fromEntries(EVENTS.map(e => [e.id, e]));
  for (const id of fired) assert.ok(!byId[id].requires, `${id} happened to a city it needs more of`);
  assert.equal(new Set(fired).size, EVENTS.filter(e => !e.requires).length,
    'and still gets every unconditional one');
  // Having seen everything it qualifies for, it gets the stalest back rather
  // than nothing.
  const eligible = EVENTS.filter(e => !e.requires).map(e => e.id);
  const recent = eligible.slice().reverse();   // oldest first, so the last in catalogue order is stalest
  const e = M.rollForEvent([], 120, 1, Object.assign({}, village, { recent }));
  assert.equal(e.id, recent[0]);
  assert.equal(M.eventEligible(byId.lake_monster, { lakes: 11 }), false);
  assert.equal(M.eventEligible(byId.lake_monster, { lakes: 12 }), true);
  assert.equal(M.eventEligible(byId.neighbor_rivalry, { neighborNames: [] }), false);
}

// --- names are the player's own -------------------------------------------
{
  const rivalry = EVENTS.find(e => e.id === 'neighbor_rivalry');
  const filled = M.instantiateEvent(rivalry, { city: 'Omaville', neighborNames: ['Northfield'] });
  assert.equal(filled.title, 'Mayor — Northfield says their city is better than Omaville');
  assert.ok(!/\{[a-z]+\}/.test(JSON.stringify(filled)), 'no placeholder left behind');
  assert.equal(filled.requires, undefined, 'requirements are not saved with the queued dilemma');
  assert.ok(JSON.stringify(rivalry).includes('{city}'), 'the catalogue itself is untouched');
  assert.equal(JSON.stringify(M.instantiateEvent(EVENTS[0], {})), JSON.stringify(EVENTS[0]),
    'a plain scenario is queued exactly as written');
}

// --- the queue has an end -------------------------------------------------
{
  const pending = EVENTS.slice(0, M.EVENT_MAX_PENDING).map(e => e.id);
  assert.equal(M.rollForEvent(pending, 5000, 1, bigCity), null, 'no sixth dilemma while five wait');
  assert.ok(M.rollForEvent(pending.slice(1), 5000, 1, bigCity), 'deciding one makes room');
  const { fired } = fire(bigCity, 50, pending.slice(1));
  assert.ok(fired.every(id => !pending.slice(1).includes(id)), 'and nothing already waiting is queued twice');
  // Older callers with no context still work.
  assert.ok(M.rollForEvent([], 5000, 1));
}

// --- the service keeps the memory ------------------------------------------
assert.ok(/root\.recentEventIds = Model\.rememberEvent\(root\.recentEventIds, event\.id\)/.test(roll),
  'a fired dilemma is remembered');
assert.ok(/recentEventIds: root\.recentEventIds,/.test(service), 'saved');
assert.ok(/recentEventIds = Array\.isArray\(saved\.recentEventIds\) \? saved\.recentEventIds : \[\]/.test(service), 'loaded');
assert.ok(/root\.recentEventIds = \[\]/.test(service.match(/function resetCity\([\s\S]*?\n  \}/)[0]), 'and cleared for a new city');

console.log(`PASS: ${EVENTS.length} dilemmas (${conditional} conditional), no repeat within ${M.EVENT_RECENT_MEMORY}, requirements respected, names filled, queue capped at ${M.EVENT_MAX_PENDING}, memory persisted.`);
