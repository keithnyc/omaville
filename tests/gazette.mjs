// The city Gazette: a front page derived from the log the city already keeps.
//
// An idle game's best moments happen while nobody is watching, and all the
// player gets on their return is a number that went up. This turns the log
// into something worth coming back to read. It is generated, never stored, so
// it costs no save budget — which means it has to be a pure function of the
// log and the history, and it has to be stable: an edition that reshuffles its
// own headlines every repaint is not a newspaper.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math, Number });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);

const entry = (m, kind, text) => ({ m, kind, text });
// The log is newest-first, which gazette() relies on to stop early.
const log = [
  entry(96, 'fire', 'A fire was put out.'),
  entry(94, 'fire', 'A building has been lost to the fire.'),
  entry(92, 'election', 'Mayor Ada re-elected with 64% approval.'),
  entry(90, 'market', 'Bought $400 of Ashford.'),
  entry(88, 'milestone', 'Population reached 2000.'),
  entry(86, 'crime', 'A crime wave was broken up.'),
  entry(84, 'ordinance', 'Passed Recycling.'),
  entry(20, 'loan', 'Took out a Small Works Bond for $500.')
];
const stats = { population: 2100, jobsCommercial: 400, jobsIndustrial: 300 };
const page = (over = {}) => M.gazette(Object.assign({
  cityName: 'Ashcombe', mayorName: 'Ada', ageMinutes: 100, sinceMinute: 80,
  log, history: [], stats, happiness: 68, treasury: 12500, jammed: 0, unserved: 0
}, over));

// --- a headline may never contradict its own story ------------------------
// The same "fire" kind is logged when a building burns down and when the last
// fire is put out. A pool that does not know the difference eventually runs
// THE CITY BURNS above a story about the fire being out.
{
  const resolved = [
    ['fire', 'A fire was put out.'],
    ['brownout', 'The grid is back within capacity.'],
    ['crime', 'A crime wave was broken up.'],
    ['election', 'Mayor Ada re-elected with 64% approval.']
  ];
  const alarming = [
    ['fire', 'A fire broke out. Crews are on the scene.'],
    ['brownout', 'The power grid went over capacity.'],
    ['crime', 'A crime wave has broken out downtown.']
  ];
  for (const [kind, text] of resolved) {
    const desk = M.GAZETTE_DESKS[kind];
    assert.ok(desk.calm, `${kind} needs a pool for news that ended well`);
    assert.ok(Array.from(desk.calm).includes(M.gazetteHeadline({ m: 41, kind, text }, [])),
      `"${text}" must not run under an alarming headline`);
  }
  for (const [kind, text] of alarming) {
    assert.ok(Array.from(M.GAZETTE_DESKS[kind].heads)
      .includes(M.gazetteHeadline({ m: 41, kind, text }, [])),
      `"${text}" must not run under a reassuring headline`);
  }
  // Anything unrecognised falls through to the alarming pool, which is the
  // safer way round for a paper reporting a fire.
  assert.ok(Array.from(M.GAZETTE_DESKS.fire.heads)
    .includes(M.gazetteHeadline({ m: 3, kind: 'fire', text: 'Something odd happened.' }, [])));
  // Every desk must be able to headline anything filed to it.
  for (const kind of Object.keys(M.GAZETTE_DESKS)) {
    const desk = M.GAZETTE_DESKS[kind];
    assert.ok(desk.heads.length >= 2, `${kind} needs more than one headline`);
    assert.ok(desk.weight > 0 && desk.spot, `${kind} has a weight and a picture`);
    for (const head of Array.from(desk.heads).concat(Array.from(desk.calm || [])))
      assert.equal(head, head.toUpperCase(), 'headlines are set in caps');
  }
}

// --- an edition is stable -------------------------------------------------
{
  const a = page(), b = page();
  assert.equal(JSON.stringify(a.lead), JSON.stringify(b.lead), 'same inputs, same lead');
  assert.equal(a.stories.map(s => s.headline).join('|'), b.stories.map(s => s.headline).join('|'));
  const before = JSON.stringify(log);
  page();
  assert.equal(JSON.stringify(log), before, 'generating a page does not disturb the log');
}

// --- it reads like a front page, not a ranking ----------------------------
{
  const p = page();
  assert.ok(p.lead, 'there is a lead story');
  assert.equal(p.lead.kind, 'election', 'the heaviest desk leads');
  const kinds = [p.lead.kind].concat(p.stories.map(s => s.kind));
  assert.equal(new Set(kinds).size, kinds.length,
    'one story per desk before any desk gets a second — a year with four elections ' +
    'and one fire must not bury the fire');
  const heads = [p.lead.headline].concat(p.stories.map(s => s.headline));
  assert.equal(new Set(heads).size, heads.length, 'and no headline runs twice on one page');
  assert.ok(kinds.includes('fire'), 'the fire made the page');
  assert.ok(heads.length <= M.GAZETTE_STORIES, 'a front page has a fixed number of slots');
  for (const s of p.stories.concat([p.lead])) {
    assert.ok(s.body && s.dateline && s.spot, `${s.headline} is printable`);
    assert.ok(/Year \d+/.test(s.dateline), 'each story is dated');
  }
}

// --- a slow news year is still a front page -------------------------------
{
  const p = page({ sinceMinute: 99 });
  assert.equal(p.quiet, true);
  assert.equal(p.lead, null, 'nothing to lead with');
  assert.equal(p.stories.length, 0);
  assert.ok(p.quietNote.length > 0, 'and it says so rather than printing a blank');
  assert.ok(p.figures.length > 0, 'the numbers still run');
  assert.ok(p.title.includes('Ashcombe'), 'and the masthead is still the masthead');
}

// --- the masthead ---------------------------------------------------------
{
  const p = page({ ageMinutes: 25 });
  assert.equal(p.volume, 'III', 'volume is the year, in the style of the thing');
  assert.equal(p.number, 2, 'and the number is the month');
  assert.equal(p.dateline, 'February, Year 3');
  assert.equal(p.mayor, M.mayorTitle('Ada'));
  for (const [n, want] of [[1, 'I'], [4, 'IV'], [9, 'IX'], [14, 'XIV'], [40, 'XL'],
    [90, 'XC'], [400, 'CD'], [1987, 'MCMLXXXVII']])
    assert.equal(M.romanNumeral(n), want, `${n}`);
  assert.equal(M.romanNumeral(0), 'I', 'never blank');
}

// --- by the numbers, against a year ago -----------------------------------
{
  const history = [
    { m: 80, p: 1500, t: 9000, h: 60, i: 0, u: 0 },
    { m: 88, p: 1900, t: 11000, h: 64, i: 0, u: 0 },
    { m: 100, p: 2100, t: 12500, h: 68, i: 0, u: 0 }
  ];
  const p = page({ history });
  const pop = p.figures.find(f => f.label === 'Population');
  assert.equal(pop.value, 2100);
  // A year back from month 100 is month 88, and there is a sample exactly
  // there. History is sampled every few months, so this is approximate by
  // design — a newspaper quoting round numbers is in character.
  assert.equal(pop.change, 200, 'measured against the last sample at or before a year back');
  assert.equal(page({ history, ageMinutes: 92 }).figures.find(f => f.label === 'Population').change,
    2100 - 1500, 'and a year back from month 92 falls to the month-80 sample');
  const purse = p.figures.find(f => f.label === 'Treasury');
  assert.ok(purse.money && purse.moneyChange, 'money is formatted as money');
  // No history at all must not produce NaN on the page.
  for (const f of page({ history: [] }).figures)
    assert.ok(Number.isFinite(f.value) && Number.isFinite(f.change || 0), `${f.label} is a number`);
}

// --- the almanac reports the mood, since weather is not simulated ---------
{
  const grim = M.gazetteAlmanac(20, 0.4, 500);
  const fine = M.gazetteAlmanac(90, 0, 0);
  assert.notEqual(grim, fine);
  assert.ok(/disgrace/.test(grim) && /clear/.test(fine), 'the roads get a mention either way');
  assert.ok(/beyond the reach/.test(grim), 'and unserved households do');
  assert.ok(!/beyond the reach/.test(fine), 'but not when there are none');
}

// --- when to tell the player there is an edition worth reading ------------
{
  assert.equal(M.gazetteHasNews(log, 0), true);
  assert.equal(M.gazetteHasNews(log, 99), false, 'nothing new, no badge');
  assert.equal(M.gazetteHasNews([entry(50, 'market', 'Bought $10 of Ashford.')], 0), false,
    'one stray trade is not an edition');
  assert.equal(M.gazetteHasNews([entry(50, 'market', 'a'), entry(49, 'loan', 'b')], 0), true,
    'but two pieces of news are');
  assert.equal(M.gazetteHasNews([entry(50, 'fire', 'A fire broke out.')], 0), true,
    'and one fire certainly is');
  assert.equal(M.gazetteHasNews([], 0), false);
  assert.equal(M.gazetteHasNews(null, 0), false);
}

// --- nothing here may be stored -------------------------------------------
// The save has a hard 64KB cap and the grid already owns most of it. The
// Gazette exists because the log and the history are kept anyway.
{
  const service = fs.readFileSync(new URL('../Service.qml', import.meta.url), 'utf8');
  assert.ok(!/gazettes\s*:/.test(service) && !/property var gazette\b/.test(service),
    'editions are derived, never persisted');
}

// --- the art flag may not go stale ----------------------------------------
// The page is built to read without the engravings, and points its Images at
// nothing until they exist — a missing file logs a warning on every repaint,
// which would bury a real one. That gate is a hand-set boolean, so this is
// what stops it being wrong in either direction: art delivered but not shown,
// or art shown that is not there.
{
  const view = fs.readFileSync(new URL('../CityView.qml', import.meta.url), 'utf8');
  const flag = /readonly property bool gazetteArt: (true|false)/.exec(view);
  assert.ok(flag, 'CityView declares the gate');
  const claimed = flag[1] === 'true';
  const needed = ['masthead.png', 'spot-fire.png', 'spot-election.png',
    'spot-growth.png', 'spot-money.png', 'spot-civic.png'];
  const present = needed.filter(f =>
    fs.existsSync(new URL('../assets/gazette/' + f, import.meta.url)));
  const all = present.length === needed.length;
  assert.equal(claimed, all, all
    ? `every engraving is on disk (${present.length}/${needed.length}) — set gazetteArt: true`
    : `gazetteArt claims art that is not there (${present.length}/${needed.length} present: `
      + `missing ${needed.filter(f => !present.includes(f)).join(', ')})`);
  // Both places that draw one must respect the gate.
  assert.ok(/root\.gazetteArt \? Qt\.resolvedUrl\("assets\/gazette\/masthead/.test(view),
    'the masthead is gated');
  const story = fs.readFileSync(new URL('../GazetteStory.qml', import.meta.url), 'utf8');
  assert.ok(/root\.art && root\.story/.test(story), 'and so are the spot illustrations');
  assert.ok((view.match(/art: root\.gazetteArt/g) || []).length === 2,
    'both the lead and the secondary stories are told about it');
}

console.log('PASS: a stable front page per edition, one story per desk, headlines that cannot ' +
  'contradict their own story, a printable slow news year, and nothing added to the save.');
