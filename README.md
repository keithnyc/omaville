# Omaville

A tiny idle city builder for [Omarchy](https://omarchy.org). Zone roads and
residential/commercial/industrial blocks, watch it grow while you work, and
check in on it from the bar.

## How it works

The city lives in a headless service that keeps ticking (one simulated
minute per active shell minute) whether or not the panel is open — a machine
that sleeps doesn't lose progress, but the city doesn't secretly keep
growing while suspended either. Each tick: zoned tiles next to a road grow
one density level if there's demand and the city is happy, tax income comes
in, upkeep goes out, and population/happiness are recalculated.

Click the bar icon to open the city panel. Pick a tool (Road, Res, Com, Ind,
Park, Clear) and click or drag on the grid to build. Roads are required —
zones can grow within two orthogonal steps of one, via open land, other zones,
parks, or decorations (not across water or service buildings). Population milestones and
budget crises show up as desktop notifications.

## Install

```bash
omarchy plugin add <repo-url> --enable
```

## State

- `~/.local/state/omarchy/omaville-state.json` — the whole city (safe to
  delete to start over)

## Dependencies

`omarchy-notification-send` from Omarchy itself, for milestone/budget
notifications. No network access, no other external commands.

## License

MIT — see [LICENSE](LICENSE).
