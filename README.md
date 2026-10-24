# The Deckhouse

A small web platform for building and playing deckbuilder games. Everything is static HTML,
CSS and JavaScript modules: no build step, no framework. The site is deployed to GitHub Pages
by the workflow in `.github/workflows/deploy.yml` on every push to `main`.

## Layout

```
index.html            The hub: lists every game from games/registry.js
platform/             Shared code (seeded RNG, base styles)
games/registry.js     The list of games shown on the hub
games/<slug>/         One folder per game, self-contained
```

### Adding a game

1. Create `games/<slug>/index.html` (plus whatever JS and CSS it needs).
2. Link the shared styles with `../../platform/platform.css` and, if you want seeded play,
   import `makeRng` from `../../platform/rng.js`.
3. Add an entry to `games/registry.js`. The hub picks it up automatically.

## Games

### Ashfall

A 15-day solo deckbuilder. Dominion-style Actions, Buys and Coins with a market of guild cards,
plus Innovation-style Ages: every five days the market is replaced and whatever you did not buy
is gone. Works are island buildings that never enter your deck. A daily Omen strikes each day
and tomorrow's is always forecast. Every seed is also played by three bot captains; the best of
them sets par, and your rating is relative to it.

- `engine.js`: all game rules, no DOM. Importable from Node.
- `cards.js`: card, Work and Omen definitions.
- `bots.js`: the rival strategies used for par.
- `sim.mjs`: headless simulation for balancing. `node games/ashfall/sim.mjs 2000` prints score
  distributions; `--trace <seed>` logs one bot game; `--quick` is what CI runs.

### Tenure

A 2-4 player deckbuilder about academic life, playable hot-seat or against bots. Four scoring
tracks (Research, Teaching, Service, Prestige), Innovation-style first-come Honors, and a CV:
publish a played card to remove it from your deck and keep its icons as seniority, which decides
whom your demand and share effects reach. Eight asymmetric roles.

- `engine.js`: multi-player rules, no DOM.
- `cards.js`: cards, roles and honors.
- `bots.js`: AI opponents (six strategies).
- `sim.mjs`: balance simulation. `node games/tenure/sim.mjs 1000 3` reports win rate by role,
  strategy and seat for 1000 three-player games; `--quick` is what CI runs.

### Pips

A deckbuilder for 2-4 players with two ordinary packs of playing cards, about 20 minutes. Suit is
the job (Diamonds money, Clubs draw, Spades trash, Hearts points), rank is the size. `rules.html`
is the printable rules sheet for playing with real cards; `index.html` plays it in the browser
against bots or hot-seat. `node games/pips/sim.mjs 2000` checks pace and seat balance.

### Spite and Malice

The classic two-player competitive patience (Cat and Mouse), to the common two-deck rules:
20-card pay-off piles, three center piles built Ace to Queen, Kings wild, four side stacks.
Against a bot or hot-seat. `node games/spite/sim.mjs` checks that bot games terminate and that
the starting player has no edge.

### Bit Flip

An original design workshopped in this repo: a bag of white and black blocks, registers of 2, 3
and 4 bits per player, public goal cards that are voted on with blocks, instant scoring with goal
refresh, a finite goal deck as the clock, secret patterns, jackpot votes and interference (a flip
erases old-colour blocks in unfinished rows; the flipper keeps one). 2-5 players.
`rules.html` is the physical rules sheet. `node games/bitflip/sim.mjs 1000 4 [key=value ...]`
reports strategy and seat win rates and game length; options include `overwrite`, `columns`,
`p4`, `goalDeck`, `flipLead` and `endMode`.

### Euchre

Standard four-player Euchre (24-card deck, bowers, order up and name trump, going alone, stick the
dealer optional, game to 10). You play South with a bot partner against two bots. The coach
(`bots.js`) is the same logic the bots use, so every suggestion comes with its reason. `rules.html`
is a printable cheat sheet. `node games/euchre/sim.mjs 2000` reports bidding and scoring rates.

## Local development

Any static server works:

```
python3 -m http.server 8000
```

then open http://localhost:8000/.

## Deployment

Push to `main`. The workflow runs the Ashfall simulation as a sanity check, then publishes the
repository root to GitHub Pages. The repository's Pages source must be set to "GitHub Actions"
(Settings → Pages → Build and deployment → Source).
