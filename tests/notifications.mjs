// Silencing the desktop pop-ups, and nothing else.
//
// The city's news reaches the player five ways: a desktop pop-up, the city
// log, the unseen markers, the "while you were away" summary and the Gazette.
// Only the first is a pop-up. A setting that switched off the others as well
// would be describing something it does not do, and would quietly cost the
// player the record of what happened while they were not looking.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const service = fs.readFileSync(new URL('../Service.qml', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../CityView.qml', import.meta.url), 'utf8');

// --- one choke point ------------------------------------------------------
{
  // Twenty-odd call sites, one function. The gate has to be inside it, or the
  // next notification added is a notification that ignores the setting.
  const calls = (service.match(/root\.notify\(/g) || []).length;
  assert.ok(calls > 10, `expected many notify call sites, found ${calls}`);

  const fn = service.slice(service.indexOf('function notify(title, body)'));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.ok(/if \(!root\.popupNotifications\) return/.test(body),
    'notify() itself refuses when pop-ups are off');
  assert.ok(body.indexOf('popupNotifications') < body.indexOf('execDetached'),
    'and refuses before spawning anything');

  // Nothing else may consult it. Asserted by naming the functions rather than
  // by counting occurrences, which says what actually matters and does not
  // break every time the save gains a line.
  const fnBody = name => {
    const at = service.indexOf(`function ${name}(`);
    assert.ok(at >= 0, `${name} exists`);
    return service.slice(at, service.indexOf('\n  }', at));
  };
  for (const name of ['logEvent', 'markSeen', 'sampleHistory'])
    assert.ok(!/popupNotifications/.test(fnBody(name)),
      `${name} is never gated by it — that record is the whole point of keeping it`);
}

// --- it survives, and it is a preference not city state -------------------
{
  assert.ok(/popupNotifications: root\.popupNotifications/.test(service), 'it is saved');
  assert.ok(/popupNotifications = saved\.popupNotifications !== false/.test(service),
    'and an older save with no such key defaults to on rather than to off');

  // resetCity clears the city; it must not clear this. Starting a new town is
  // not a reason to start shouting at somebody again.
  const reset = service.slice(service.indexOf('function resetCity('));
  const resetBody = reset.slice(0, reset.indexOf('\n  }'));
  assert.ok(/root\.citizens = \[\]/.test(resetBody), 'the reset really is the one being read');
  assert.ok(!/popupNotifications/.test(resetBody),
    'a new city keeps the notification preference');
}

// --- and it is reachable -------------------------------------------------
{
  assert.ok(/setPopupNotifications/.test(view), 'the settings card can set it');
  assert.ok(/cityService\.popupNotifications === modelData\.value/.test(view),
    'and shows which way it is currently set');
  const setter = service.slice(service.indexOf('function setPopupNotifications('));
  assert.ok(/flushState\(\)/.test(setter.slice(0, setter.indexOf('\n  }'))),
    'and the choice is written to disk when it is made');
  // The label has to be honest about how narrow this is.
  assert.ok(/Desktop popups/.test(view), 'labelled as pop-ups, not as notifications');
  assert.ok(/still logs/.test(view) && /Gazette still/.test(view),
    'and says plainly what carries on regardless');
}

console.log('PASS: desktop pop-ups gated at the single point every notification passes ' +
  'through, with the log, the markers and the Gazette untouched.');
