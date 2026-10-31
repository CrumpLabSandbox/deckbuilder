// Bots for the party variant. Same three levels as the two-player game, generalised to N players.
import { actor, legalCards, playCard, foxSwap, woodcut, collect, trickWinner, trumpSuit, cloneGame, bandFor } from './engine.js';

export const LEVELS = { easy: 0, normal: 0, hard: 20 };

const victor = (G) => G.bands.find((b) => b.name === 'Victorious');
const humbleMax = (G) => G.bands[0].to;

export function estimateTricks(G, hand, trump) {
  const decay = Math.pow(0.82, G.n - 2); // side-suit winners get trumped more often with more players
  let e = 0;
  for (const c of hand) {
    if (c.suit === trump) e += c.rank >= 9 ? 0.85 : c.rank >= 6 ? 0.45 : 0.15;
    else if (c.rank === 11) e += 0.7 * decay;
    else if (c.rank === 10) e += 0.45 * decay;
    else if (c.rank === 9) e += 0.45;
  }
  return e;
}
function plan(G, p) {
  if (!G.plans[p]) {
    const v = victor(G), t = (humbleMax(G) + v.from) / 2 + (G.opts.planBias ?? 0.3);
    G.plans[p] = estimateTricks(G, G.players[p].hand, trumpSuit(G)) >= t ? 'win' : 'humble';
  }
  return G.plans[p];
}
export function wantWin(G, p) {
  const me = G.players[p].tricks, left = G.players[p].hand.length, v = victor(G);
  if (me >= v.from) return false; // already Victorious: stop before Greedy
  if (me > humbleMax(G)) return true; // Humble is gone: climb to Victorious
  if (plan(G, p) === 'win' && me + left < v.from) G.plans[p] = 'humble';
  return plan(G, p) === 'win';
}

const power = (c, trump) => (c.suit === trump ? 20 + c.rank : c.rank === 9 ? 19.5 : c.rank);
const winsNow = (G, p, card) => trickWinner([...G.trick.cards, { p, card }], trumpSuit(G)).entry.p === p;

export function heuristicPlay(G, p) {
  const legal = legalCards(G, p), trump = trumpSuit(G), want = wantWin(G, p);
  const by = (f) => legal.slice().sort(f);
  if (!G.trick.cards.length) {
    if (want) return by((a, b) => power(b, trump) - power(a, trump))[0];
    return by((a, b) => (a.rank === 7) - (b.rank === 7) || power(a, trump) - power(b, trump))[0];
  }
  const winners = legal.filter((c) => winsNow(G, p, c));
  const losers = legal.filter((c) => !winsNow(G, p, c));
  if (want && winners.length) return winners.sort((a, b) => power(b, trump) - power(a, trump))[0];
  if (!want && losers.length) return losers.sort((a, b) => (a.rank === 7) - (b.rank === 7) || power(b, trump) - power(a, trump))[0];
  if (want) return by((a, b) => (a.rank === 7) - (b.rank === 7) || power(a, trump) - power(b, trump))[0];
  return by((a, b) => power(a, trump) - power(b, trump))[0];
}
export function heuristicFox(G, p) {
  const hand = G.players[p].hand, want = plan(G, p) === 'win' || G.players[p].tricks > humbleMax(G);
  let best = null, bestV = estimateTricks(G, hand, trumpSuit(G));
  for (const c of hand) {
    const v = estimateTricks(G, hand.filter((x) => x !== c).concat([G.decree]), c.suit);
    if (want ? v > bestV + 0.3 : v < bestV - 0.3) { bestV = v; best = c; }
  }
  return best ? best.uid : null;
}
export function heuristicWoodcut(G, p) {
  const trump = trumpSuit(G), sorted = G.players[p].hand.slice().sort((a, b) => power(a, trump) - power(b, trump));
  return (wantWin(G, p) ? sorted[0] : sorted[sorted.length - 1]).uid;
}

function sampleWorld(G, p, salt) {
  const C = cloneGame(G, salt);
  const others = C.players.filter((q) => q.idx !== p);
  const mine = new Set(C.players[p].hand.map((c) => c.uid));
  const fixedByPlayer = new Map(others.map((q) => [q.idx, q.hand.filter((c) => G.known[q.idx].includes(c.uid))]));
  const fixed = new Set([...mine, C.decree.uid, ...G.bottomed[p], ...[...fixedByPlayer.values()].flat().map((c) => c.uid)]);
  let pool = C.rng.shuffle([...others.flatMap((q) => q.hand), ...C.deck].filter((c) => !fixed.has(c.uid)));
  for (const q of C.rng.shuffle(others)) {
    const keep = fixedByPlayer.get(q.idx), need = q.hand.length - keep.length;
    const fits = pool.filter((c) => !G.voids[q.idx].includes(c.suit));
    const take = (fits.length >= need ? fits : pool).slice(0, need);
    pool = pool.filter((c) => !take.includes(c));
    q.hand = [...keep, ...take];
  }
  const bottom = C.deck.filter((c) => G.bottomed[p].includes(c.uid));
  C.deck = [...bottom, ...pool.filter((c) => !bottom.includes(c))];
  return C;
}
function rollout(C, p) {
  const before = C.players.map((q) => q.score);
  let guard = 0;
  while (C.phase !== 'roundover' && C.phase !== 'over' && guard++ < 600) {
    if (C.phase === 'trickdone') { collect(C); continue; }
    const a = actor(C);
    if (C.phase === 'play') playCard(C, heuristicPlay(C, a).uid);
    else if (C.phase === 'fox') foxSwap(C, heuristicFox(C, a));
    else if (C.phase === 'woodcut') woodcut(C, heuristicWoodcut(C, a));
  }
  const gain = C.players.map((q, i) => q.score - before[i]);
  const others = gain.filter((_, i) => i !== p);
  return gain[p] - others.reduce((s, x) => s + x, 0) / others.length;
}

export function choosePlay(G, p) {
  const level = G.players[p].level, legal = legalCards(G, p);
  if (level === 'easy') return legal[Math.floor(G.rng.next() * legal.length)];
  if (level === 'normal' || legal.length === 1) return heuristicPlay(G, p);
  let best = null, bestV = -Infinity;
  for (const c of legal) {
    let tot = 0;
    for (let s = 0; s < LEVELS.hard; s++) {
      const C = sampleWorld(G, p, `${G.round}:${G.played.length}:${c.uid}:${s}`);
      playCard(C, c.uid);
      tot += rollout(C, p);
    }
    if (tot > bestV) { bestV = tot; best = c; }
  }
  return best;
}

export function botAct(G) {
  const p = actor(G);
  if (p === null) return false;
  const easy = G.players[p].level === 'easy';
  if (G.phase === 'play') return playCard(G, choosePlay(G, p).uid);
  if (G.phase === 'fox') return foxSwap(G, easy ? null : heuristicFox(G, p));
  if (G.phase === 'woodcut') { const h = G.players[p].hand; return woodcut(G, easy ? h[0].uid : heuristicWoodcut(G, p)); }
  return false;
}
