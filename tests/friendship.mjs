// Friendship with the named residents.
//
// The point is attachment, and attachment has three enemies, each tested here:
// time (a resident who ages a year every three minutes is dead by the
// afternoon, so people run on days played instead); sameness (twelve residents
// who all want the same thing and say the same line are one resident); and
// homework (requests that pile up, or cannot be granted, or have to be
// reported, are chores rather than favours).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math, Number, JSON, Date, Object });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);
const service = fs.readFileSync(new URL('../Service.qml', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../CityView.qml', import.meta.url), 'utf8');
const size = M.GRID_SIZE;
const at = (x, y) => y * size + x;
const seeded = (seed = 1) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const never = () => 0.999999;
const always = () => 0;

// The well-served neighbourhood from tests/citizens.mjs: nobody in it has a
// complaint, so any request made here is a wish.
const HOUSE_ROWS = [13, 14, 16, 17];
function town() {
  const g = M.emptyGrid(size);
  for (let x = 14; x <= 20; x++) {
    for (const y of [12, 15, 18]) g[at(x, y)] = '#0';
    for (const y of HOUSE_ROWS) g[at(x, y)] = 'R2';
  }
  g[at(15, 11)] = 'E1'; g[at(16, 11)] = 'W1';
  g[at(17, 11)] = 'F1'; g[at(18, 11)] = 'S1';
  g[at(19, 11)] = 'N1'; g[at(20, 11)] = 'H1';
  return g;
}
const HOME = at(17, 16);
const context = (grid, over = {}) => Object.assign({
  grid, gridSize: size, utilities: M.findUtilities(grid), funding: M.defaultFunding(),
  traffic: null, crimes: [], fires: [], population: 3000, ageMinutes: 600,
  neighbors: [{ name: 'Oakhurst' }], random: seeded(), playDay: 10,
  peopleClock: M.peopleClock(10), newDay: true, today: { year: 2026, month: 8, day: 15 },
  cityName: 'Omaville'
}, over);
const person = (over = {}) => Object.assign(
  { n: 'Mabel Ashby', i: HOME, s: 0, p: M.CITIZEN_PATIENCE, b: M.peopleClock(10) - 30 * 12,
    a: M.peopleClock(10), t: 0, f: 0 }, over);

// --- the people clock -------------------------------------------------------
{
  assert.equal(M.peopleClock(0), 0);
  const mabel = person();
  const age = M.citizenAgeYears(mabel, M.peopleClock(10));
  const daysPerYear = Math.round(1 / M.PEOPLE_YEAR_PER_DAY);
  assert.equal(M.citizenAgeYears(mabel, M.peopleClock(10 + daysPerYear)), age + 1,
    `${daysPerYear} days played is a year of a life`);
  assert.equal(M.playDateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05', 'a day is the local date');
  assert.equal(M.playDateKey(new Date(2026, 0, 6, 0, 1)), '2026-01-06');

  // Only a new day rolls old age. The same resident, at an age where death is
  // certain, survives every tick of a day and dies on the next one.
  const ancient = person({ b: M.peopleClock(10) - M.CITIZEN_MAX_AGE * 12 });
  const grid = town();
  for (let tick = 0; tick < 200; tick++)
    assert.equal(M.advanceCitizens([ancient], context(grid, { newDay: false })).deaths.length, 0,
      'nobody dies of old age mid-day');
  assert.equal(M.advanceCitizens([ancient], context(grid, { newDay: true })).deaths.length, 1);
  // And a day is only part of a year: the yearly risk is scaled to it.
  const frail = M.CITIZEN_FRAIL_AGE + 10;
  assert.equal(M.citizenDeathChanceToday(frail), M.citizenDeathChance(frail) * M.PEOPLE_YEAR_PER_DAY);
  assert.equal(M.citizenDeathChanceToday(M.CITIZEN_MAX_AGE), 1, 'the cap stays certain');

  // Rare: nobody who arrives dies in their first four weeks of play, and a
  // dozen residents lose only a handful in two months.
  let people = M.advanceCitizens([], context(grid, { playDay: 1, peopleClock: M.peopleClock(1) })).citizens;
  assert.equal(people.length, M.citizenTarget(3000));
  let deaths = 0, firstDeath = -1;
  const random = seeded(7);
  for (let day = 2; day <= 60; day++) {
    for (let tick = 0; tick < 20; tick++) {
      const step = M.advanceCitizens(people, context(grid, {
        playDay: day, peopleClock: M.peopleClock(day), newDay: tick === 0, random }));
      people = step.citizens;
      deaths += step.deaths.length;
      if (step.deaths.length && firstDeath < 0) firstDeath = day;
    }
  }
  const frailIn = (M.CITIZEN_FRAIL_AGE - M.CITIZEN_ARRIVAL_AGE_MAX) / M.PEOPLE_YEAR_PER_DAY;
  assert.ok(firstDeath < 0 || firstDeath >= frailIn, `a death on play day ${firstDeath}`);
  assert.ok(frailIn >= 28, 'even the oldest arrival has four weeks before old age tells');
  assert.ok(deaths <= 6, `${deaths} deaths in sixty days of play is not rare`);
}

// --- moving an older save onto the clock -----------------------------------
{
  // Written against the city calendar: born 40 city-years before minute 1200,
  // arrived 90 city-years ago — longer than they have been alive.
  const legacy = [{ n: 'Ada Pike', i: HOME, s: 1200 - 90 * 12, p: 6, b: 1200 - 40 * 12 }];
  const clock = M.peopleClock(3);
  const [moved] = M.seedCitizenLives(legacy, 1200, clock);
  assert.equal(M.citizenAgeYears(moved, clock), 40, 'nobody gets older or younger in the move');
  assert.equal(M.citizenYearsInCity(moved, clock), 40 - M.CITIZEN_ARRIVAL_AGE_MIN,
    'and years here never exceed their adult life');
  assert.ok(Number.isInteger(moved.t) && moved.t >= 0 && moved.t < M.TRAITS.length, 'they get a trait');
  assert.equal(moved.f, 0, 'and start as a newcomer');
  assert.equal(moved.s, legacy[0].s, 'the city-calendar arrival date is kept for the paper');
  assert.deepEqual(JSON.parse(JSON.stringify(M.seedCitizenLives([moved], 1500, M.peopleClock(9))[0])),
    JSON.parse(JSON.stringify(moved)), 'and a resident already moved is left alone');
}

// --- nothing a resident knows is dropped by a tick --------------------------
{
  const grid = town();
  const mabel = person({ f: 33, q: { k: 'trees', d: 4 }, h: 9, y: 2025, extra: 'kept' });
  const [after] = M.advanceCitizens([mabel], context(grid, { newDay: false, population: 250 })).citizens;
  for (const key of ['f', 'q', 'h', 'y', 't', 'a', 'extra'])
    assert.deepEqual(after[key], mabel[key], `${key} survives a month`);
}

// --- hearts ----------------------------------------------------------------
{
  assert.equal(M.friendshipHearts(0), 0);
  assert.equal(M.friendshipHearts(9), 0);
  assert.equal(M.friendshipHearts(10), 1);
  assert.equal(M.friendshipHearts(M.FRIEND_MAX), 5);
  assert.equal(M.FRIEND_TITLES.length, 6);
  assert.equal(M.addFriendship(person({ f: 95 }), 20).f, M.FRIEND_MAX, 'capped');
  assert.equal(M.addFriendship(person({ f: 5 }), -30).f, 0, 'and floored');
  const ctx = context(town());
  assert.equal(M.citizenBio(person({ f: 0 }), ctx).friendship.trait, '', 'a stranger keeps their trait to themselves');
  assert.equal(M.citizenBio(person({ f: 10, t: 0 }), ctx).friendship.trait, 'Gardener');
}

// --- the catalogue: every trait wants things, and says things ---------------
{
  for (const trait of M.TRAITS) {
    const wishes = Object.keys(M.WISHES).filter(k => M.WISHES[k].traits.includes(trait));
    assert.ok(wishes.length >= 3, `${trait} only wants ${wishes.length} things`);
    assert.ok(M.TRAIT_LABELS[trait], `${trait} has a label`);
    const tiers = M.HELLO_LINES[trait];
    assert.equal(tiers.length, 3, `${trait} talks three ways`);
    for (const lines of tiers) {
      assert.ok(lines.length >= 4, `${trait} has too few lines`);
      assert.equal(new Set(lines).size, lines.length, `${trait} repeats itself`);
    }
  }
  for (const key of Object.keys(M.WISHES)) {
    const w = M.WISHES[key];
    for (const t of w.traits) assert.ok(M.TRAITS.includes(t), `${key}: unknown trait ${t}`);
    assert.ok(w.ask.includes('$STREET') || w.ask.length > 30, `${key} ask`);
    assert.ok(w.thanks.length > 20, `${key} thanks`);
  }
  for (const key of M.FIX_REQUEST_KEYS) {
    assert.ok(M.CITIZEN_COMPLAINTS[key], `${key} has a complaint to ask with`);
    assert.ok(M.FIX_THANKS[key], `${key} has a thank-you`);
  }
  // Filled lines never leave a placeholder behind.
  for (const trait of M.TRAITS.keys())
    for (let f of [0, 30, 60])
      for (let day = 0; day < 8; day++) {
        const line = M.helloLine(person({ t: trait, f }), day, 'Mill Road', 'Omaville');
        assert.ok(!/\$[A-Z]|undefined/.test(line), line);
      }
}

// --- requests -----------------------------------------------------------------
{
  const grid = town();
  const cast = M.advanceCitizens([], context(grid)).citizens.map((c, k) => Object.assign(c, { t: k % 6 }));

  // A good street, so every request is a wish; no more than the day's share,
  // and no more open than the board holds, however many days go by.
  let people = cast;
  for (let day = 11; day < 30; day++) {
    const step = M.advancePeopleDay(people, context(grid, { playDay: day, random: never }));
    assert.ok(step.requests.length <= M.REQUESTS_PER_DAY, `${step.requests.length} new requests in a day`);
    people = step.citizens;
    const open = people.filter(p => p.q).length;
    assert.ok(open <= M.REQUESTS_OPEN_MAX, `${open} open requests`);
    for (const p of people.filter(p => p.q)) {
      const wish = M.WISHES[p.q.k];
      assert.ok(wish, `${p.n} asked for ${p.q.k}`);
      assert.ok(wish.traits.includes(M.citizenTraitKey(p)), `${p.n} asked for something out of character`);
    }
    for (const r of step.requests) assert.ok(r.text && !r.text.includes('$STREET'), r.text);
  }

  // A complaint comes first, as a request to put it right.
  const noPolice = grid.slice(); noPolice[at(18, 11)] = '_0';
  const gripes = M.advancePeopleDay(cast, context(noPolice, { random: never }));
  const fixes = gripes.citizens.filter(p => p.q && p.q.k.startsWith('fix:'));
  assert.ok(fixes.length > 0, 'somebody with a complaint asks for it to be fixed');
  assert.ok(fixes.every(p => p.q.k === 'fix:police'));

  // A wish is granted the moment it is built, with nothing to report.
  const gardener = person({ t: 0, q: { k: 'trees', d: 10 }, f: 12 });
  assert.equal(M.checkRequests([gardener], context(grid)).thanked.length, 0, 'not before it exists');
  const planted = grid.slice();
  planted[at(17, 19)] = 'T0'; planted[at(16, 19)] = 'T0';
  const granted = M.checkRequests([gardener], context(planted));
  assert.equal(granted.thanked.length, 1, 'granted when the trees go in');
  assert.equal(granted.citizens[0].q, null, 'and closed');
  assert.equal(granted.citizens[0].f, 12 + M.FRIEND_REQUEST, 'and paid for in friendship');
  assert.ok(granted.thanked[0].text.includes(M.streetOf(planted, size, HOME)), granted.thanked[0].text);
  assert.equal(M.checkRequests(granted.citizens, context(planted)).thanked.length, 0, 'once');

  // A complaint request is granted by fixing the complaint.
  const fix = person({ q: { k: 'fix:police', d: 10 } });
  assert.equal(M.checkRequests([fix], context(noPolice)).thanked.length, 0);
  assert.equal(M.checkRequests([fix], context(grid)).thanked.length, 1);

  // An ungrantable request lapses rather than holding a place for ever, and
  // costs nothing when it does.
  const stale = person({ f: 20, q: { k: 'trees', d: 10 } });
  const [still] = M.advancePeopleDay([stale], context(grid, { playDay: 10 + M.REQUEST_LAPSE_DAYS - 1, random: never })).citizens;
  assert.ok(still.q, 'still asking the day before it lapses');
  const lapsed = M.advancePeopleDay([stale], context(grid, { playDay: 10 + M.REQUEST_LAPSE_DAYS, random: never }));
  assert.ok(!lapsed.citizens[0].q || lapsed.citizens[0].q.d === 10 + M.REQUEST_LAPSE_DAYS, 'then lets it go');
  assert.equal(lapsed.citizens[0].f, 20 + M.FRIEND_GOOD_DAY, 'at no cost');

  // A resident whose every wish is already met asks for nothing.
  const content = person({ t: 0 });
  const garden = grid.slice();
  garden[at(16, 19)] = 'T0'; garden[at(17, 19)] = 'T0'; garden[at(18, 19)] = 'B0'; garden[at(19, 19)] = 'P1';
  assert.equal(M.pickWish(content, context(garden), 3), '', 'nothing to ask for');
}

// --- a day's goodwill -----------------------------------------------------------
{
  const grid = town();
  const noPolice = grid.slice(); noPolice[at(18, 11)] = '_0';
  const [good] = M.advancePeopleDay([person({ f: 20, q: { k: 'x', d: 0 } })], context(grid, { random: never })).citizens;
  assert.equal(good.f, 20 + M.FRIEND_GOOD_DAY, 'a good day on a good street');
  const [bad] = M.advancePeopleDay([person({ f: 20, q: { k: 'x', d: 0 } })], context(noPolice, { random: never })).citizens;
  assert.equal(bad.f, 20 + M.FRIEND_BAD_DAY, 'a day with a complaint');
}

// --- hello, once a day --------------------------------------------------------
{
  const cast = [person({ f: 20 }), person({ n: 'Cyril Rooke', i: HOME + 1, f: 0 })];
  const first = M.sayHello(cast, HOME, 10);
  assert.ok(first, 'hello');
  assert.equal(first.citizen.f, 20 + M.FRIEND_HELLO);
  assert.equal(first.citizens[1].f, 0, 'only to the one greeted');
  assert.equal(M.sayHello(first.citizens, HOME, 10), null, 'twice in a day is not twice as friendly');
  assert.ok(M.sayHello(first.citizens, HOME, 11), 'tomorrow is another day');
  assert.equal(M.sayHello(cast, 12345, 10), null, 'nobody lives there');
  const bio = M.citizenBio(first.citizen, context(town()));
  assert.equal(bio.friendship.greetedToday, true);
  assert.ok(bio.friendship.hello.length > 10, 'and they said something');
}

// --- birthdays, on the real day ---------------------------------------------------
{
  const mabel = person();
  const b = M.citizenBirthday(mabel);
  assert.ok(b.month >= 0 && b.month < 12 && b.day >= 1 && b.day <= 28);
  assert.deepEqual(M.citizenBirthday(Object.assign({}, mabel, { i: HOME + 3 })), b, 'a move does not change it');
  const today = { year: 2026, month: b.month, day: b.day };
  const other = { year: 2026, month: (b.month + 1) % 12, day: b.day };
  assert.equal(M.noticeBirthday([mabel], HOME, other), null, 'not on another day');
  const noticed = M.noticeBirthday([mabel], HOME, today);
  assert.equal(noticed.citizen.f, M.FRIEND_BIRTHDAY);
  assert.equal(M.noticeBirthday(noticed.citizens, HOME, today), null, 'once a year');
  assert.ok(M.noticeBirthday(noticed.citizens, HOME, { year: 2027, month: b.month, day: b.day }), 'and again next year');
}

// --- what friends do -----------------------------------------------------------------
{
  // Twice the patience before packing.
  const grid = town();
  const noPolice = grid.slice(); noPolice[at(18, 11)] = '_0';
  let friend = [person({ f: M.FRIEND_HEARTS[M.FRIEND_PATIENCE_HEARTS - 1] })];
  let stranger = [person({ f: 0 })];
  let friendLeft = false, strangerLeft = false;
  for (let m = 0; m < M.CITIZEN_PATIENCE * 2 - 1; m++) {
    const fs1 = M.advanceCitizens(friend, context(noPolice, { newDay: false, population: 250 }));
    const ss1 = M.advanceCitizens(stranger, context(noPolice, { newDay: false, population: 250 }));
    friend = fs1.citizens.filter(c => c.n === 'Mabel Ashby');
    stranger = ss1.citizens.filter(c => c.n === 'Mabel Ashby');
    friendLeft = friendLeft || fs1.departures.length > 0;
    strangerLeft = strangerLeft || ss1.departures.length > 0;
  }
  assert.equal(strangerLeft, true, 'a stranger gives up');
  assert.equal(friendLeft, false, 'a friend holds on twice as long');
  for (let m = 0; m < 2 && !friendLeft; m++)
    friendLeft = M.advanceCitizens(friend, context(noPolice, { newDay: false, population: 250 })).departures.length > 0
      || (friend = M.advanceCitizens(friend, context(noPolice, { newDay: false, population: 250 })).citizens, false);
  assert.equal(friendLeft, true, 'but not for ever');

  // Gifts: only from friends, planted on open ground near home or sent as money.
  const giftCtx = context(grid, { random: always });
  assert.equal(M.advancePeopleDay([person({ f: 0 })], giftCtx).gifts.length, 0, 'strangers send nothing');
  const gifts = M.advancePeopleDay([person({ f: 60, t: 0 })], giftCtx).gifts;
  assert.equal(gifts.length, 1);
  const gift = gifts[0];
  if (gift.kind === 'plant') {
    assert.ok(M.isOpenLand(M.tileTypeOf(grid[gift.index])), 'planted on open ground');
    assert.ok(M.withinRadius(size, gift.index, HOME, 3), 'near home');
    assert.equal(gift.type, 'B', 'a gardener plants flowers');
  } else {
    assert.ok(gift.amount >= 30 && gift.amount <= 150, `a gift of $${gift.amount}`);
  }
  const money = M.chooseGift(person({ f: 60 }), context(grid, { population: 1e7 }), never, {});
  assert.equal(money.kind, 'money');
  assert.equal(money.amount, 150, 'a gift, not a bailout');

  // A memorial goes on the nearest open ground.
  const site = M.memorialSite(grid, size, HOME);
  assert.ok(site >= 0 && M.isOpenLand(M.tileTypeOf(grid[site])));
  const packed = M.emptyGrid(size).fill('R1');
  assert.equal(M.memorialSite(packed, size, HOME), -1, 'or nowhere, if there is none');
}

// --- the service ---------------------------------------------------------------------
{
  const tick = service.match(/onTriggered:[\s\S]*?root\.tendResidents\(moved, peopleCtx, newDay\)/)[0];
  assert.ok(/var newDay = dateKey !== root\.lastPlayDate/.test(tick), 'a day turns over on a new local date');
  assert.ok(/root\.playDay \+= 1/.test(tick) && (tick.match(/root\.playDay \+= 1/g) || []).length === 1);
  assert.ok(/peopleClock: root\.peopleClock/.test(tick) && /newDay: newDay/.test(tick));
  for (const field of ['playDay', 'lastPlayDate', 'memorials', 'memorialOffers', 'residentNews'])
    assert.ok(new RegExp(`\\b${field}: root\\.${field},`).test(service), `${field} is saved`);
  assert.ok(/Model\.seedCitizenLives\(\s*Array\.isArray\(saved\.citizens\) \? saved\.citizens : \[\], ageMinutes, Model\.peopleClock\(playDay\)\)/.test(service),
    'an older save is moved onto the clock where it stands');
  const reset = service.match(/function resetCity\([\s\S]*?\n  \}/)[0];
  for (const line of ['root.memorials = ({})', 'root.memorialOffers = []', 'root.residentNews = 0'])
    assert.ok(reset.includes(line), `New Game clears ${line}`);
  assert.ok(!/root\.playDay = /.test(reset), 'but not the days played, which belong to the player');

  // Run the service's own resident functions against a stub.
  const fn = n => service.match(new RegExp('  function ' + n + '\\([\\s\\S]*?\\n  \\}'))[0];
  const grid = town();
  const root = {
    initialized: true, outOfOffice: false, grid, gridSize: size, treasury: 100, ageMinutes: 600,
    citizens: [person({ f: 50 })], memorials: {}, memorialOffers: [], residentNews: 0,
    playDay: 10, today: { year: 2026, month: 0, day: 1 }, cityLog: [], notified: [],
    notify(t, b) { this.notified.push(b) }, logEvent(k, t) { this.cityLog.push({ kind: k, text: t }) }
  };
  const ctx = vm.createContext({ root, Model: M, flushState() {}, Object });
  for (const n of ['tendResidents', 'acceptMemorial', 'declineMemorial', 'bulldozeTile', 'sayHello'])
    root[n] = vm.runInContext('(' + fn(n) + ')', ctx);
  const peopleCtx = context(grid);

  // A friend's death offers a memorial; a stranger's does not.
  const friendBio = M.citizenBio(person({ f: 50 }), peopleCtx);
  const strangerBio = M.citizenBio(person({ n: 'Cyril Rooke', f: 0 }), peopleCtx);
  root.tendResidents({ deaths: [friendBio, strangerBio], moves: [] }, peopleCtx, false);
  assert.equal(root.memorialOffers.length, 1, 'only for somebody the office knew well');
  assert.equal(root.memorialOffers[0].n, 'Mabel Ashby');

  assert.equal(root.acceptMemorial(0), true);
  const site = Object.keys(root.memorials).map(Number)[0];
  assert.equal(root.grid[site], 'V0', 'a statue is raised');
  assert.equal(root.memorials[site].n, 'Mabel Ashby', 'and the map remembers who for');
  assert.equal(root.treasury, 100, 'free');
  assert.equal(root.memorialOffers.length, 0, 'and the offer is closed');
  root.bulldozeTile(site);
  assert.equal(root.memorials[site], undefined, 'knocking it down forgets it');

  // Knocking down a resident's house costs their friendship.
  root.bulldozeTile(HOME);
  assert.equal(root.citizens[0].f, 50 + M.FRIEND_BULLDOZED);

  // A granted request is delivered as a letter and a popup, and marks the bar.
  root.grid = grid.slice(); root.grid[at(17, 19)] = 'T0'; root.grid[at(16, 19)] = 'T0';
  root.citizens = [person({ t: 0, q: { k: 'trees', d: 1 } })];
  root.residentNews = 0;
  root.tendResidents({ deaths: [], moves: [] }, context(root.grid), false);
  assert.equal(root.notified.length, 1, 'a popup');
  assert.equal(root.residentNews, 1, 'a mark on the bar');
  assert.ok(root.cityLog.some(e => e.kind === 'resident' && e.text.startsWith('Mabel Ashby')), 'and a log entry');

  // A friend's gift of money reaches the treasury; a planting reaches the map.
  root.citizens = [person({ f: 60, t: 1 })];
  const before = root.treasury;
  root.tendResidents({ deaths: [], moves: [] }, context(root.grid, { random: () => 0.01 }), true);
  const planted = root.grid.filter((t, k) => grid[k] !== t && t === 'T0').length;
  assert.ok(root.treasury > before || planted > 2, 'the gift arrived');
}

// --- the panel ---------------------------------------------------------------------
{
  assert.ok(/onResidentsOpenChanged: if \(residentsOpen && root\.serviceReady\) root\.cityService\.markResidentsSeen\(\)/.test(view),
    'opening Residents clears the news');
  assert.ok(/root\.cityService\.sayHello\(residentActions\.person\.index\)/.test(view), 'the panel says hello');
  assert.ok(/root\.cityService\.noticeBirthday\(residentActions\.person\.index\)/.test(view), 'and remembers birthdays');
  assert.ok(/root\.cityService\.acceptMemorial\(memorialOffer\.index\)/.test(view), 'and raises memorials');
  for (const key of ['peopleClock', 'playDay', 'today', 'cityName'])
    assert.ok(new RegExp(`${key}: root\\.cityService\\.${key}`).test(view), `the panel reads ${key}`);
}

console.log('PASS: people age by days played and die rarely, older saves move onto the clock intact, requests fit the resident and never pile up, hello and birthdays once each, friends stay longer and send gifts, memorials for friends, all wired to the service and panel.');
