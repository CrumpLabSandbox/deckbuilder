import { cur, playAll, buy, canBuy, canRefresh, refreshRow, endTurn, resolvePending, cost, tier, vp, faceHeartsLeft, MAX_ROUNDS } from './engine.js';

export const STRATEGIES = ['money', 'blades', 'hands', 'greedy'];

function want(G, p, c, strategy) {
  const t = tier(c), late = G.round >= MAX_ROUNDS - 4 || faceHeartsLeft(G) <= 2;
  const own = [...p.deck, ...p.hand, ...p.discard, ...p.play];
  const spades = own.filter(x => x.suit === 'S').length, clubs = own.filter(x => x.suit === 'C').length;
  if (c.suit === 'H') return t === 'face' ? 10 : (late ? 5 : strategy === 'greedy' ? 4 : 1.5);
  if (late && t !== 'face') return c.suit === 'D' ? 1.5 : 1;
  if (c.suit === 'D') return t === 'face' ? 7 : 3.5;
  if (c.suit === 'C') return (t === 'face' ? 6 : 3.2) + (strategy === 'hands' ? 1.5 : 0) - (clubs >= 4 ? 1 : 0);
  const basics = own.filter(x => tier(x) === 'basic').length;
  if (c.suit === 'S') return (t === 'face' ? 5.5 : 3.3) + (strategy === 'blades' ? 1.5 : 0) - (spades >= 2 ? 2 : 0) - (basics <= 3 ? 3 : 0) - (G.round > 7 ? 2 : 0);
  if (t === 'ace') return 5;
  return 0;
}

export function resolveBotPrompt(G) {
  const sp = G.pending, p = cur(G);
  const own = [...p.deck, ...p.hand, ...p.discard, ...p.play].length;
  const junk = sp.cards.filter(c => tier(c) === 'basic' && (own > 7 || G.round <= 8)).slice(0, sp.max);
  resolvePending(G, junk.map(c => c.uid));
}

export function botTurn(G) {
  const p = cur(G);
  while (G.pending) resolveBotPrompt(G);
  playAll(G);
  while (G.pending) { resolveBotPrompt(G); playAll(G); }
  for (let k = 0; k < 4; k++) {
    const opts = G.row.map((c, i) => ({ i, c, v: want(G, p, c, p.strategy) + 0.15 * cost(c) })).filter(o => canBuy(G, o.i) && o.v > 1.2);
    if (!opts.length) break;
    opts.sort((a, b) => b.v - a.v);
    buy(G, opts[0].i);
  }
  if (G.bought === 0 && canRefresh(G)) refreshRow(G);
  endTurn(G);
}
