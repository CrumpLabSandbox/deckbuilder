// Go Fish bots. Easy asks at random. Normal remembers what others asked for recently.
// Hard remembers everything that was said at the table.
import { ask, askableTargets, ranksIn, count, cur } from './engine.js';

const MEMORY = { easy: 0, normal: 2, hard: Infinity }; // how many turns back a bot remembers

export function choose(G, p) {
  const me = G.players[p], level = me.level, targets = askableTargets(G, p);
  const mine = ranksIn(me.hand);
  const pick = (arr) => arr[Math.floor(G.rng.next() * arr.length)];
  if (!targets.length) return null;
  if (level === 'easy') return { target: pick(targets), rank: pick(mine) };
  const horizon = MEMORY[level];
  // Known holdings that we can ask for (we must hold the rank too).
  let best = null;
  for (const q of targets) for (const [r, info] of Object.entries(G.seen[q])) {
    const rank = Number(r);
    if (!count(me.hand, rank) || G.turnNo - info.at > horizon * G.n) continue;
    const score = info.n * 2 + count(me.hand, rank);
    if (!best || score > best.score) best = { target: q, rank, score };
  }
  if (best) return best;
  // Otherwise ask for the rank we hold most of, from the player holding the most cards.
  const rank = mine.slice().sort((a, b) => count(me.hand, b) - count(me.hand, a) || G.rng.next() - 0.5)[0];
  const most = Math.max(...targets.map((q) => G.players[q].hand.length));
  return { target: pick(targets.filter((q) => G.players[q].hand.length === most)), rank };
}

export function botTurn(G) {
  const p = G.turn;
  const c = choose(G, p);
  if (!c) return false;
  return ask(G, c.target, c.rank);
}
