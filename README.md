# Omaville

A tiny idle city builder for [Omarchy](https://omarchy.org). Zone roads and
residential/commercial/industrial blocks, watch it grow while you work, and
check in on it from the bar.

![Charleston, population 4,275, in October of Year 393](docs/screenshot.png)

## How it works

The city lives in a headless service that keeps ticking (one simulated
minute per active shell minute) whether or not the panel is open — a machine
that sleeps doesn't lose progress, but the city doesn't secretly keep
growing while suspended either. Each tick: zoned tiles next to a road grow
one density level if there's demand and the city is happy, tax income comes
in, upkeep goes out, and population/happiness are recalculated.

The city is taxed on residents *and* on business: commercial jobs at 80% of a
resident's rate, industrial at 50%. Because the staffed departments are billed
per resident, a low-tax city earns more from shops than from housing, and a
high-tax one the other way round — so the tax slider decides what kind of city
pays best, not just how much.

Building tiers need more than population: a **civic level** rises while your
schools actually reach people and stay funded, and falls when either lapses.
An elementary system supports tier 2; only a university system supports tier 3.
It gates what you can build, never what already stands — but let the schools
slide and the top tier locks again.

There is a long goal: hold a surplus budget, full service coverage, flowing
traffic, contented residents and no debt for 24 straight months and the city
is self-sustaining. The streak resets the moment any of it lapses. Track it
under City Goal in the menu.

Click the bar icon to open the city panel. Pick a tool (Road, Res, Com, Ind,
Park, Clear) and click or drag on the grid to build. Roads are required —
zones can grow within two orthogonal steps of one, via open land, other zones,
parks, or decorations (not across water or service buildings). Population milestones and
budget crises show up as desktop notifications.

Roads also carry traffic. Every built lot generates trips, spread across the
road tiles that serve it, and a road only carries so many; a jammed road stops
its lots growing and makes the city miserable. Three things fix it, and only
one costs money: zone shops among the houses so fewer trips start at all, lay
a connected grid so the same trips spread over more streets, or widen a street
into an Avenue ($20 to widen, 2.5x the capacity, more upkeep). The Traffic
overlay shows which roads are at their limit, and cars visibly crawl where a
road is over capacity.

When planning runs out, you can buy your way down: a Bus Depot / Tram Line /
Transit Hub ($130, then upgrades) takes a share of the car trips around it off
the road, billed monthly per resident like the other departments. Carpool,
telecommuting and road-toll ordinances cut trips city-wide. None of them ever
empties a road completely, and even a Transit Hub relieves less traffic than a
genuinely walkable neighbourhood does — planning beats spending. Gridlock also
slows the fire and police response, so a jammed city burns longer.

## The rest of it

**Services and disasters.** Power, water, fire, police, medical and schools each
cover a radius and bill you per resident every month. Coverage is summarised
resident-weighted, so "92% on water" means 92% of people, not 92% of tiles. Fires
start, spread along the lots they touch, and burn until an engine reaches them —
and engines drive on the same roads everyone else does, so a gridlocked city
burns longer.

**Residents.** People live in your houses, age on their own slower clock, take
the jobs you zone, and occasionally write to you. Build a post office and the
mail starts arriving: complaints, requests, thank-yous, the local news. Do what a
resident asked and they warm to you; ignore them and they cool off. Requests live
on the resident, not on the letter, so binning your post never cancels anything.

**The Gazette.** The paper covers your city — milestones, fires, arrivals,
departures, and the odd editorial about how you're running the place.

**Dilemmas.** Every so often somebody puts a decision in front of you with no
clean answer and a cost either way. No dilemma repeats until the rest have had a
turn.

**Neighbouring towns.** Four towns sit at the edges of the map. Connect a road to
one and you get trade, migration and commerce out of it — and competition. A town
meaningfully bigger than you presses on your commercial demand until you grow
past it. They grow on their own whether you're watching or not.

**Ordinances and the market.** City-wide policies you can switch on for a
monthly cost, and a market that moves under you regardless.

## Install

```bash
omarchy plugin add https://github.com/keithnyc/omaville --enable
```

Then add the Omaville widget to your bar from the Omarchy bar settings.

## State

- `~/.local/state/omarchy/omaville-state.json` — the whole city (safe to
  delete to start over)

## Dependencies

`omarchy-notification-send` from Omarchy itself, for milestone/budget
notifications. No network access, no other external commands.

## Development

See [DEVELOPING.md](DEVELOPING.md) for the layout, the two clocks, the save
format, and how to run the tests.

## License

MIT — see [LICENSE](LICENSE).
