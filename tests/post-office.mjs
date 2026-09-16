// The post office: residents' letters, read where they are delivered.
//
// What would spoil it: a mailbox that grows until it eats the save file; an
// unread letter pushed out by a busy week; writing back as a friendship tap
// that pays twice, or pays for somebody who has left; an envelope that bobs
// over nothing; and a building that is half-added — placeable but invisible,
// or free to run because one of the upkeep tables was missed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math, Number, JSON, Date, Object });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);
const service = fs.readFileSync(new URL('../Service.qml', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../CityView.qml', import.meta.url), 'utf8');
const Y = M.TILE_POST;

// --- a whole building, not half of one ----------------------------------------
{
  assert.equal(Y, 'Y');
  assert.ok(M.COSTS[Y] > 0, 'it has a price');
  assert.equal(M.TILE_LABELS[Y], 'Post Office');
  const grid = M.emptyGrid(9);
  assert.ok(M.canPlace(grid, 40, Y, 1000), 'it can be built on open land');
  const wooded = grid.slice(); wooded[40] = 'X1';
  assert.ok(M.canPlace(wooded, 40, Y, 1000), 'or over woodland');
  assert.ok(!M.canPlace(grid, 40, Y, M.COSTS[Y] - 1), 'but not for less than it costs');
  const built = M.placeTile(grid, 40, Y);
  assert.equal(built[40], 'Y0');
  assert.equal(M.totalInvestment(Y, 0), M.COSTS[Y], 'bulldozing refunds what it cost');

  const stats = M.summarize(built);
  assert.equal(stats.postCount, 1);
  assert.equal(stats.postUpkeep, M.POST_UPKEEP, 'it costs something to run');
  assert.equal(stats.serviceUpkeep, M.summarize(grid).serviceUpkeep + M.POST_UPKEEP, 'and it is charged');
  const row = M.upkeepBreakdown(stats, M.defaultFunding(), []).find(r => r.key === 'post');
  assert.equal(row.amount, M.POST_UPKEEP, 'and itemised on the bill');
  assert.equal(M.monthlyCostOf(Y, 0), M.POST_UPKEEP, 'and quoted at the point of purchase');
  assert.deepEqual(Array.from(M.postOffices(built)), [40]);

  assert.ok(/\{ type: Model\.TILE_POST, label: "Post Office" \}/.test(view), 'it is in the build palette');
  assert.ok(/case Model\.TILE_POST:\s*\n\s*root\.drawPostOffice\(ctx, gx, gy, cellSize\)/.test(view), 'the map draws it');
  assert.ok(/case Model\.TILE_POST: root\.drawPostOffice\(ctx, 0, 0, width\); break/.test(view), 'so does its palette button');
  assert.ok(/if \(type === Model\.TILE_POST\) return "Post Office/.test(view), 'with a hint');
  assert.ok(/if \(t === Model\.TILE_POST\) return "Post Office/.test(view), 'and a status line');
  assert.ok(/if \(info\.type === Model\.TILE_POST\)/.test(view), 'and the inspector describes it');
}

// --- the mailbox ------------------------------------------------------------------
{
  let box = [];
  for (let k = 0; k < M.MAIL_MAX; k++) box = M.postLetter(box, { from: 'A' + k, kind: 'news', text: 't' + k, d: k });
  assert.equal(box.length, M.MAIL_MAX);
  assert.equal(box[0].from, 'A' + (M.MAIL_MAX - 1), 'newest first');
  assert.equal(new Set(box.map(l => l.id)).size, box.length, 'every letter has its own id');
  assert.equal(M.unreadMail(box), M.MAIL_MAX);

  // Full and all unread: the oldest goes.
  const overflow = M.postLetter(box, { from: 'New', kind: 'news', text: 'x', d: 99 });
  assert.equal(overflow.length, M.MAIL_MAX, 'the box is bounded');
  assert.ok(!overflow.some(l => l.from === 'A0'), 'the oldest unread letter goes when nothing is read');

  // With one read letter in the middle, that one goes instead.
  const middle = box[5];
  const withRead = M.markLetterRead(box, middle.id);
  assert.equal(M.unreadMail(withRead), M.MAIL_MAX - 1);
  const kept = M.postLetter(withRead, { from: 'New', kind: 'news', text: 'x', d: 99 });
  assert.ok(!kept.some(l => l.id === middle.id), 'a read letter makes room first');
  assert.ok(kept.some(l => l.from === 'A0'), 'so an unread one is never lost to a busy week');
  assert.deepEqual(M.markLetterRead(withRead, middle.id), withRead, 'reading twice changes nothing');
  const tidy = M.discardReadMail(withRead);
  assert.equal(tidy.length, M.MAIL_MAX - 1, 'discarding read letters keeps every unread one');
  assert.ok(tidy.every(l => !l.read));
}

// --- memorials are bounded too ------------------------------------------------------
{
  let memorials = {};
  for (let k = 0; k < M.MEMORIAL_MAX + 5; k++)
    memorials = M.recordMemorial(memorials, 100 + k, { n: 'P' + k, street: 'S', year: k });
  assert.equal(Object.keys(memorials).length, M.MEMORIAL_MAX);
  assert.ok(!memorials[100] && memorials[100 + M.MEMORIAL_MAX + 4], 'the oldest names are the ones forgotten');
}

// --- writing back -----------------------------------------------------------------
{
  const citizens = [{ n: 'Mabel Ashby', i: 5, f: 10 }, { n: 'Cyril Rooke', i: 6, f: 0 }];
  let box = M.postLetter([], { from: 'Mabel Ashby', i: 5, kind: 'news', text: 'hello', d: 1 });
  box = M.postLetter(box, { from: 'Walter Pike', i: 7, kind: 'farewell', text: 'bye', d: 2 });
  box = M.postLetter(box, { from: '', i: 8, kind: 'family', text: 'sorry', d: 3 });
  const [family, walter, mabel] = box;

  assert.ok(M.canReplyTo(mabel, citizens));
  const reply = M.replyToLetter(box, citizens, mabel.id);
  assert.equal(reply.citizens[0].f, 10 + M.FRIEND_REPLY, 'writing back is worth a little friendship');
  assert.equal(reply.citizens[1].f, 0, 'to the one written to');
  const replied = reply.mail.find(l => l.id === mabel.id);
  assert.ok(replied.replied && replied.read);
  assert.equal(M.replyToLetter(reply.mail, reply.citizens, mabel.id), null, 'once');
  assert.equal(M.canReplyTo(replied, citizens), false);
  assert.equal(M.replyToLetter(box, citizens, walter.id), null, 'nobody to write back to once they have left');
  assert.equal(M.replyToLetter(box, citizens, family.id), null, 'and a family letter is not a pen friend');
}

// --- what gets written -------------------------------------------------------------
{
  for (const trait of M.TRAITS) {
    const lines = M.MAIL_NEWS[trait];
    assert.ok(lines && lines.length >= 4, `${trait} has news to write`);
    for (let day = 0; day < 10; day++) {
      const text = M.newsLetterText({ n: 'Mabel Ashby', t: M.TRAITS.indexOf(trait) }, day, 'Mill Road', 'Omaville');
      assert.ok(!/\$[A-Z]|undefined/.test(text), text);
    }
  }
  for (const reason of M.FIX_REQUEST_KEYS.concat(['crime', 'fire-now']))
    assert.ok(M.CITIZEN_FAREWELL_REASONS[reason], `a farewell for leaving over ${reason}`);
  const farewell = M.farewellLetterText({ name: 'Walter Pike', reason: 'water', to: 'Oakhurst' });
  assert.ok(farewell.includes('Oakhurst') && !/undefined/.test(farewell), farewell);
  const family = M.familyLetterText({ name: 'Ada Pike', street: 'Mill Road' });
  assert.ok(family.includes('Ada Pike') && family.includes('Mill Road'));
  assert.ok(!/undefined/.test(M.birthdayLetterText({ n: 'Ada Pike' }, 'Mill Road')));
}

// --- the service delivers ---------------------------------------------------------------
{
  const fn = n => service.match(new RegExp('  function ' + n + '\\([\\s\\S]*?\\n  \\}'))[0];
  const size = M.GRID_SIZE;
  const grid = M.emptyGrid(size);
  const root = {
    initialized: true, grid, gridSize: size, treasury: 100, playDay: 12, mail: [], residentNews: 0,
    ageMinutes: 1,   // between rounds of post unless a test asks for one
    citizens: [{ n: 'Mabel Ashby', i: 100, s: 0, p: 6, b: 0, a: 0, t: 2, f: 60 }],
    memorialOffers: [], today: { year: 2026, month: 0, day: 1 }, streetNames: {}, cityName: 'Omaville',
    notify() {}, logEvent() {}
  };
  const ctx = vm.createContext({ root, Model: M, flushState() {}, Object });
  for (const n of ['tendResidents', 'writeLetter', 'readLetter', 'replyToLetter'])
    root[n] = vm.runInContext('(' + fn(n) + ')', ctx);

  root.writeLetter({ from: 'Mabel Ashby', i: 100, kind: 'news', text: 'hi' });
  assert.equal(root.mail[0].d, 12, 'dated to the day played');
  assert.equal(root.residentNews, 1, 'and the bar hears about it');

  // A leaver who knew the town writes a farewell; a newcomer who gave up
  // straight away does not, nor does somebody whose house simply vanished.
  root.mail = [];
  root.tendResidents({ deaths: [], moves: [], departures: [
    { name: 'Walter Pike', street: 'Mill Road', reason: 'water', to: 'Oakhurst', knewTown: true },
    { name: 'Nora Quill', street: 'Mill Road', reason: 'fire', to: 'Oakhurst', knewTown: false },
    { name: 'Ada Pike', street: 'Mill Road', reason: 'gone', to: '' }] },
    { grid, gridSize: size, utilities: M.findUtilities(grid), funding: M.defaultFunding(), random: () => 0.99 }, false);
  assert.deepEqual(Array.from(root.mail, l => l.kind), ['farewell']);

  // A friend's death brings a letter from the family; a stranger's does not.
  root.mail = [];
  const bio = (f) => ({ name: 'Ada Pike', index: 3, street: 'Mill Road', friendship: { hearts: M.friendshipHearts(f) } });
  root.tendResidents({ deaths: [bio(60), bio(0)], moves: [], departures: [] },
    { grid, gridSize: size, utilities: M.findUtilities(grid), funding: M.defaultFunding(), random: () => 0.99 }, false);
  assert.deepEqual(Array.from(root.mail, l => l.kind), ['family']);

  // On a round of post, somebody fond of the office writes with news. A roll
  // above the gift chance and below the news one picks news over a gift.
  root.mail = [];
  root.ageMinutes = M.POST_ROUND_MONTHS * 4;
  const newsRoll = (M.MAIL_GIFT_CHANCE + M.MAIL_NEWS_CHANCE) / 2;
  assert.ok(newsRoll > M.MAIL_GIFT_CHANCE && newsRoll < M.MAIL_NEWS_CHANCE);
  root.tendResidents({ deaths: [], moves: [], departures: [] },
    { grid, gridSize: size, utilities: M.findUtilities(grid), funding: M.defaultFunding(),
      random: () => newsRoll, ageMinutes: root.ageMinutes, playDay: 12, today: root.today }, false);
  assert.ok(root.mail.some(l => l.kind === 'news' && l.from === 'Mabel Ashby'), 'news from a friend');

  // Reading and writing back through the service.
  const letter = root.mail.find(l => l.kind === 'news');
  root.readLetter(letter.id);
  assert.equal(root.mail.find(l => l.id === letter.id).read, true);
  const before = root.citizens[0].f;
  assert.equal(root.replyToLetter(letter.id), true);
  assert.equal(root.citizens[0].f, before + M.FRIEND_REPLY);

  // A session brings post. Letters used to be tied to a new day of play, so an
  // evening at a 5,000-person city produced one round — and none at all if the
  // city happened to be small when it ran. Play forty minutes and see mail.
  {
    const town = M.emptyGrid(size);
    for (let x = 10; x <= 30; x++) {
      for (const y of [12, 15, 18]) town[y * size + x] = '#0';
      for (const y of [13, 14, 16, 17]) town[y * size + x] = 'R3';
    }
    for (const [x, t] of [[11, 'E1'], [12, 'W1'], [13, 'F1'], [14, 'S1'], [15, 'N1'], [16, 'H1']])
      town[11 * size + x] = t;
    let seed = 3;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const cast = M.advanceCitizens([], { grid: town, gridSize: size, utilities: M.findUtilities(town),
      funding: M.defaultFunding(), crimes: [], fires: [], population: 5000, ageMinutes: 600,
      peopleClock: M.peopleClock(4), newDay: false, neighbors: [{ name: 'Oakhurst' }],
      random: rand, streetNames: {} }).citizens.map((c, k) => Object.assign(c, { t: k % 6, f: 40 }));
    assert.equal(cast.length, M.citizenTarget(5000), 'a full cast of residents');
    Object.assign(root, { grid: town, citizens: cast, mail: [], playDay: 4, treasury: 5000 });
    // Forty minutes of city time at fifteen seconds a tick.
    for (let tick = 1; tick <= 160; tick++) {
      root.ageMinutes = 600 + tick;
      root.tendResidents({ deaths: [], moves: [], departures: [] },
        { grid: root.grid, gridSize: size, utilities: M.findUtilities(root.grid), funding: M.defaultFunding(),
          crimes: [], fires: [], streetNames: {}, cityName: 'Omaville', population: 5000,
          ageMinutes: root.ageMinutes, playDay: 4, today: root.today, random: rand }, false);
    }
    assert.ok(root.mail.length >= 4, `only ${root.mail.length} letters in forty minutes of play`);
    assert.ok(root.mail.some(l => l.kind === 'request'), 'including somebody asking for something');
    const open = root.citizens.filter(c => c.q).length;
    assert.ok(open <= M.REQUESTS_OPEN_MAX, `${open} requests open at once`);
  }

  for (const field of ['mail'])
    assert.ok(new RegExp(`\\b${field}: root\\.${field},`).test(service), `${field} is saved`);
  assert.ok(/mail = Array\.isArray\(saved\.mail\) \? saved\.mail\.slice\(0, Model\.MAIL_MAX\) : \[\]/.test(service), 'loaded, bounded');
  assert.ok(/root\.mail = \[\]/.test(service.match(/function resetCity\([\s\S]*?\n  \}/)[0]), 'and cleared for a new city');
  assert.ok(/readonly property var postOffices: Model\.postOffices\(root\.grid\)/.test(service),
    'the service finds post offices once, for every view');
}

// --- the view ----------------------------------------------------------------------------
{
  // Clicking one opens the mailbox. This was first wired into the paint path,
  // which returns before doing anything when no tool is selected and treats a
  // click with the Post Office tool still in hand as a build — so in the game
  // clicking a post office did nothing at all, while a test that only looked
  // for the check's source passed. So: run the decision, and pin where it sits.
  {
    const grid = M.emptyGrid(M.GRID_SIZE); grid[70] = 'Y0'; grid[71] = 'R1';
    const vroot = { grid, activeTool: '' };
    const ctx = vm.createContext({ root: vroot, Model: M });
    const decide = vm.runInContext('(' + view.match(/  function pressOpensMail\([\s\S]*?\n  \}/)[0] + ')', ctx);
    for (const tool of ['', 'inspect', 'Y', '#', 'R', 'decorations']) {
      vroot.activeTool = tool;
      assert.equal(decide(70), true, `opens with tool "${tool}"`);
    }
    vroot.activeTool = 'bulldoze';
    assert.equal(decide(70), false, 'but the bulldozer still knocks it down');
    vroot.activeTool = '';
    assert.equal(decide(71), false, 'and a house is not a post office');
    assert.equal(decide(-1), false);

    const press = view.match(/onPressed: function\(mouse\) \{[\s\S]*?\n            \}/)[0];
    const opens = press.indexOf('root.pressOpensMail(tileIndexAt(mouse.x, mouse.y))');
    const paints = press.indexOf('applyAt(mouse.x, mouse.y)');
    assert.ok(opens > 0 && paints > opens, 'decided on the press, before any painting');
    const applyAt = view.match(/function applyAt\(mx, my\) \{[\s\S]*?\n            \}/)[0];
    assert.ok(!applyAt.includes('mailOpen') && !view.match(/function applyIndex\(idx\) \{[\s\S]*?\n            \}/)[0].includes('mailOpen'),
      'and not in the paint path, which never runs without a tool');
  }
  const modal = view.match(/readonly property bool modalOpen:[\s\S]*?\n  readonly/)[0];
  assert.ok(modal.includes('root.mailOpen'), 'the mailbox is a modal, so nothing behind it takes the mouse');
  assert.ok(/root\.gazetteOpen = false; root\.mailOpen = false/.test(view), 'and the scrim closes it');
  assert.ok(/visible: root\.unreadMail > 0 && root\.postOffices\.length > 0/.test(view),
    'an envelope only while there is unread mail and somewhere to read it');
  assert.ok(/model: mailOverlay\.visible \? root\.postOffices : \[\]/.test(view), 'over each post office');
  const sparkles = view.match(/\{ dx: -?[\d.]+, dy: -?[\d.]+, delay: \d+ \}/g) || [];
  assert.equal(sparkles.length, 4, 'with sparkles');
  assert.ok(/running: envelopeSpot\.visible && root\.active/.test(view), 'animated only when it can be seen');
  assert.ok(/root\.cityService\.replyToLetter\(letterRow\.modelData\.id\)/.test(view), 'the mailbox writes back');
  assert.ok(/Style\.space\(440\),\s*\n\s*mailHeader\.implicitHeight/.test(view), 'a full box scrolls in a card of a readable height');
  assert.ok(/visible: letterRow\.opened\s*\n\s*width: parent\.width\s*\n\s*wrapMode: Text\.WordWrap/.test(view), 'one line per letter until opened');
  assert.ok(/root\.cityService\.discardReadMail\(\)/.test(view), 'and read letters can be cleared out');
  assert.ok(/\{ action: "mail", label: "Post Office", enabled: root\.serviceReady && root\.postOffices\.length > 0 \}/.test(view),
    'and can be opened from the game menu');

  // The art gate agrees with the files, both ways.
  const gated = /readonly property bool postOfficeArt: true/.test(view);
  const files = ['post-office.png', 'envelope.png'].map(f => fs.existsSync(new URL('../assets/postoffice/' + f, import.meta.url)));
  if (gated) assert.ok(files.every(Boolean), 'postOfficeArt is on but the sprites are missing');
  else assert.ok(!files.some(Boolean), 'the post office sprites have arrived — set postOfficeArt: true');
}

console.log(`PASS: post office built, charged and drawn; ${M.MAIL_MAX}-letter box keeps unread mail; writing back once, to residents still here; farewells, family letters and news delivered; envelope and sparkles over post offices with mail.`);
