// Stopping the clock on purpose.
//
// The city already halts itself after five minutes away from the keyboard, so
// a machine left on overnight was never the problem this solves. The gap is
// sitting at the desk all evening and not wanting the city to advance while
// you are there.
//
// The thing that would make it useless is a second clock: if anything else
// advanced time, pausing would stop the visible part and leave the rest
// running. So most of this checks there is exactly one.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const service = fs.readFileSync(new URL('../Service.qml', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../CityView.qml', import.meta.url), 'utf8');
const widget = fs.readFileSync(new URL('../BarWidget.qml', import.meta.url), 'utf8');

// --- there is one clock, and pause stops it -------------------------------
{
  const timers = (service.match(/^\s*Timer\s*\{/gm) || []).length;
  assert.equal(timers, 1, `${timers} timers in the service; pause only stops one of them`);
  assert.equal((service.match(/onTriggered:/g) || []).length, 1, 'and it fires in one place');

  const running = /running: root\.initialized && !root\.paused && !idleMonitor\.isIdle/;
  assert.ok(running.test(service), 'the tick refuses to run while paused');

  // Nothing may advance the calendar outside that tick.
  const ticks = (service.match(/root\.ageMinutes \+= 1/g) || []).length;
  assert.equal(ticks, 1, 'the month only turns over in one place');

  // And nothing may derive time from the wall clock, which would let a paused
  // city catch up the moment it resumed.
  const fnAt = name => {
    const at = service.indexOf(`function ${name}(`);
    return at < 0 ? '' : service.slice(at, service.indexOf('\n  }', at));
  };
  for (const name of ['loadState', 'flushState'])
    assert.ok(!/ageMinutes\s*[+-]?=/.test(fnAt(name)),
      `${name} must not move the clock — a paused night would be replayed on resume`);
}

// --- it survives a restart, but not a new city ----------------------------
{
  assert.ok(/paused: root\.paused/.test(service), 'saved, so closing the panel keeps it stopped');
  assert.ok(/paused = saved\.paused === true/.test(service),
    'and a save from before it existed is running, not paused');

  const reset = service.slice(service.indexOf('function resetCity('));
  const body = reset.slice(0, reset.indexOf('\n  }'));
  assert.ok(/root\.paused = false/.test(body),
    'a new city starts running — one that does not grow reads as broken, not paused');

  // The notification preference is the opposite case, deliberately.
  assert.ok(!/popupNotifications/.test(body),
    'while the notification preference is a preference and survives a new city');
}

// --- and you can tell, from either place ----------------------------------
{
  assert.ok(/setPaused\(!root\.cityService\.paused\)/.test(view), 'the header can toggle it');
  assert.ok(/Paused · /.test(view), 'the calendar says so where the eye already goes');
  // The bar is the only thing visible with the panel shut, so a city stopped
  // on purpose must not look there like a city that has stopped working.
  assert.ok(/cityService\.paused === true/.test(widget), 'the bar widget knows');
  assert.ok(/\(paused\)/.test(widget), 'and says so in its tooltip');
  assert.ok(/visible: root\.paused && !root\.alerting/.test(widget),
    'with a glyph that yields to a real alert rather than competing with it');
}

console.log('PASS: one clock, stopped on purpose, remembered across a restart, reset for a ' +
  'new city, and visible from both the panel and the bar.');
