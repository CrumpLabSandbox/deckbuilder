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
