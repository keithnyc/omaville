# Developing Omaville

## Layout

| File | Role |
| --- | --- |
| `Model.js` | The simulation. A `.pragma library` of pure functions — no QML types, no I/O, no timers. Everything that decides what the city does lives here. |
| `Service.qml` | The headless half: holds state, owns the one timer, reads and writes the save. Loaded by the shell whether or not anything is on screen. |
| `CityView.qml` | The whole interface, shared by the docked panel and the detached window so neither can drift from the other. |
| `BarWidget.qml` | The bar entry: the icon, the badge, the click target. |
| `Panel.qml` / `DetachedWindow.qml` | Two frames around the same `CityView`. |
| `Traffic.js` | Road capacity, congestion, and the cosmetic vehicles. |
| `Ambience.js` | Sky, weather, birds, the occasional balloon. |
| `Waterfront.js` | Shoreline and placeable water edges. |
| `CoverageStatus.qml`, `ToolHint.qml`, `GazetteStory.qml` | Self-contained pieces of the interface. |

The split matters more than it looks. `Model.js` is loadable by Node, which is
why all but one of the test suites run without a compositor at all.

## Two clocks

The city runs on a **calendar**: one 15-second tick is one city month. Growth,
tax, upkeep, demand, the post and the Gazette all move on that clock.

People run on a **slower** one — `PEOPLE_YEAR_PER_DAY = 0.5` — so a resident you
befriend doesn't die of old age over a lunch break. Anything to do with a
citizen's age, marriage or memorial uses the people clock; anything to do with
the city's finances uses the calendar. Mixing them is the most common way to
break something subtly.

## State

One JSON file: `~/.local/state/omarchy/omaville-state.json`.

There is a hard 64KB read cap. `tests/save-format.mjs` builds a worst-case city
and asserts the result is under *half* the cap, so a feature that adds a field
per tile or per citizen fails the test long before it can silently truncate
somebody's city. If you add persistent state, extend that test with it.

Derived state is derived, never restored. `connectedNeighbors`, for instance, is
recomputed from the roads on load; a save that could disagree with the map is a
save that eventually will.

## Tests

```bash
tools/run-tests.sh
```

That runs the 45 Node tests in `tests/` and the QtQuick hover suite, which needs
real geometry and synthetic mouse events. **Always use the script.** Run bare,
`qmltestrunner` opens actual windows on your desktop, and a real pointer resting
over one of them delivers genuine hover events that race the synthetic ones — the
flyout tests then fail at random with no bug behind it. The script forces
`QT_QPA_PLATFORM=offscreen` and `QT_QUICK_BACKEND=software` so that can't happen.

Two patterns recur in `tests/`:

- **Model tests** load `Model.js` into a Node `vm` with the `.pragma library`
  line stripped, then assert on pure functions.
- **Source tests** pull a single function out of `Service.qml` or `CityView.qml`
  by regex and run it against a stubbed `root`. Coarse, but it catches the class
  of bug where the model is right and the wiring isn't.

After writing a test, mutate the source it covers and confirm the test fails. A
test that passes against a deliberately broken implementation is worse than none.

## Lint

```bash
/usr/lib/qt6/bin/qmllint -I /usr/share/omarchy/shell *.qml
```

The `-I` is not optional. Without it every shell import resolves to nothing and
the output is noise. Unresolved `qs.Commons` / `qs.Ui` warnings are the expected
baseline even with it; anything else is yours.

## Installing a working copy

```bash
omarchy plugin validate .
cp -a *.qml *.js manifest.json assets ~/.config/omarchy/plugins/io.github.keithnyc.omaville/
omarchy-restart-shell
journalctl _PID=$(pgrep -x quickshell | head -1) | grep -i omaville
```

Every file has to land together. `Model.js`, `Service.qml` and `CityView.qml`
must agree about build tiers; `Traffic.js` and `CityView.qml` must agree about
vehicle fields. Copying a subset is how you get a city that loads and then
quietly misbehaves.

Two log lines are expected and harmless: the duplicate IPC handler registration,
and the read-only `moduleName` warning.

Never edit the packaged files under `/usr/share/omarchy`, and never point a test
at a real save — copy it read-only if you need real data.

## Art

Sprites are near-overhead orthographic, warm, on transparent 256px canvases,
entrances to the lower left, with small contact shadows and no baked ground
slab — the terrain underneath is drawn by the renderer and has to show through.
Roads, lamps, paths and vehicles are procedural Canvas drawing, not images, so
their topology stays dynamic.

Each family's `PROMPTS.md` records the exact prompt and the ImageMagick
invocation that produced every sprite. The full-resolution generation outputs
are not kept in the repository; the prompts and the finished 256px PNGs are.
