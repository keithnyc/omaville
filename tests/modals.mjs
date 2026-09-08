// Which cards cover the map, kept in one place.
//
// The map's hover condition used to carry its own hand-written list of open
// cards, naming five of the twelve. Opening the Gazette therefore left the map
// hovering underneath it and tile tooltips popped out from behind the card —
// and every card added since had silently joined the seven it did not know
// about.
//
// The routing half of the fix is in tests/hover/tst_modal_blocks_hover.qml,
// which is a real hover test because whether hover propagates is a fact about
// Qt and not about the source. This half is the bookkeeping: one list, and a
// new card cannot be left off it.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const view = fs.readFileSync(new URL('../CityView.qml', import.meta.url), 'utf8');

// Every card the panel can open over the map.
const declared = Array.from(view.matchAll(/^\s*property bool (\w+Open): false/gm))
  .map(m => m[1]);
assert.ok(declared.length >= 10, `expected the full set of cards, found ${declared.length}`);

const modalOpen = view.slice(view.indexOf('readonly property bool modalOpen:'));
const expression = modalOpen.slice(0, modalOpen.indexOf('readonly property int tileHoverIndex'));

for (const name of declared)
  assert.ok(expression.includes(`root.${name}`),
    `${name} opens a card over the map but is missing from modalOpen — the map ` +
    `will keep hovering underneath it, exactly as it did for the Gazette`);

// And the three places that need it all read the one property.
{
  const hover = view.slice(view.indexOf('readonly property int tileHoverIndex'));
  const condition = hover.slice(0, hover.indexOf('property bool tileHoverReady'));
  assert.ok(/!root\.modalOpen/.test(condition), 'the map hover reads it');
  for (const name of declared)
    assert.ok(!condition.includes(`root.${name}`),
      `the map hover names ${name} directly instead of using modalOpen, which is ` +
      `how the list drifted apart in the first place`);

  assert.ok(/visible: root\.modalOpen/.test(view), 'the overlay that draws the cards reads it');

  // The scrim has to be hoverEnabled or blocking clicks is all it does.
  const scrim = view.slice(view.indexOf('One scrim for the whole overlay'));
  const body = scrim.slice(0, scrim.indexOf('\n    }'));
  assert.ok(/hoverEnabled: true/.test(body), 'and the scrim consumes hover, not just clicks');
  // The two that must be answered still block the map, they just do not close
  // on an outside click.
  assert.ok(/confirmNewGameOpen \|\| root\.awaySummaryOpen\) return/.test(body),
    'the modal ones swallow the click without dismissing');
}

// --- one modal at a time --------------------------------------------------
// A dilemma fires on its own schedule rather than on a button, so it is the
// one card that can arrive while another is already open. Declared last, it
// drew straight through the away summary instead of beside it.
{
  const at = view.indexOf('Mayor\'s dilemma card');
  assert.ok(at > 0, 'the dilemma overlay is where it is expected');
  const overlay = view.slice(at, at + 2000);
  assert.ok(/visible: root\.currentEvent !== null && !root\.modalOpen/.test(overlay),
    'a dilemma waits for whatever is already open rather than drawing over it');
  // Its dim is a Rectangle, which blocks nothing, so it needs its own blocker
  // for the same reason the main scrim did.
  assert.ok(/hoverEnabled: true/.test(overlay),
    'and it stops the map hovering underneath, as the Gazette now does');
  assert.ok(!/onClicked/.test(overlay.slice(0, overlay.indexOf('id: eventCard'))),
    'without dismissing on an outside click — the mayor picks one of the two');
}

console.log(`PASS: ${declared.length} cards in one list, read by the overlay, the scrim and ` +
  `the map hover, with nothing keeping a second copy.`);
