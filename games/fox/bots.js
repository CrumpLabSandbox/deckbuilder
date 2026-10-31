// Bots for The Fox in the Forest. Easy plays any legal card. Normal follows a plan (aim for 7-9
// tricks or for 0-3) with sensible card choices. Hard samples the unseen cards and plays out the rest
// of the round with the normal policy for each candidate card.
import { SUITS, actor, legalCards, playCard, foxSwap, woodcut, collect, trickWinner, trumpSuit, roundPoints, cloneGame, other } from './engine.js';

export const LEVELS = { easy: 0, normal: 0, hard: 30 };
const PLAN_T = 4.5; // expected tricks needed to aim for Victorious rather than Humble
const SHED = true;  // win with the highest winner, to be able to stop at 7

export function estimateTricks(hand, trump) {
  let e = 0;
  const len = hand.filter((c) => c.suit === trump).length;
  for (const c of hand) {
    if (c.suit === trump) e += c.rank >= 8 ? 0.95 : c.rank >= 5 ? 0.6 : 0.35;
    else if (c.rank === 11) e += 0.75;
    else if (c.rank === 10) e += 0.55;
    else if (c.rank === 9) e += 0.6;
    else if (c.rank === 8) e += 0.25;
  }
  return e + Math.max(0, len - 4) * 0.3;
}

function plan(G, p) {
  if (!G.plans[p]) G.plans[p] = estimateTricks(G.players[p].hand, trumpSuit(G)) >= PLAN_T ? 'win' : 'humble';
  return G.plans[p];
}
export function wantWin(G, p) {
  const me = G.players[p].tricks, left = G.players[p].hand.length;
  if (me >= 7) return false; // 7, 8 and 9 all score 6: stop before Greedy
  if (me >= 4) return true;
  if (plan(G, p) === 'win' && me + left < 7) G.plans[p] = 'humble';
  return plan(G, p) === 'win';
}

const power = (c, trump) => (c.suit === trump ? 20 + c.rank : c.rank === 9 ? 19.5 : c.rank);
function wouldWin(G, p, card) {
  const tr = G.trick.cards;
  if (!tr.length) return null;
  return trickWinner([...tr, { p, card }], trumpSuit(G)).entry.p === p;
}

export function heuristicPlay(G, p) {
  const legal = legalCards(G, p), trump = trumpSuit(G), want = wantWin(G, p);
  if (!G.trick.cards.length) {
    if (want) return legal.slice().sort((a, b) => power(b, trump) - power(a, trump))[0];
    // Lose the lead: low cards of side suits, never a 7 (it would feed treasure to the opponent).
    return legal.slice().sort((a, b) => (a.rank === 7) - (b.rank === 7) || power(a, trump) - power(b, trump))[0];
  }
  const winners = legal.filter((c) => wouldWin(G, p, c));
  const losers = legal.filter((c) => !wouldWin(G, p, c));
  // Win with the highest winner: shedding strength now makes it possible to stop at 7 later.
  if (want && winners.length) return winners.sort((a, b) => (b.rank === 7) - (a.rank === 7) || (SHED ? power(b, trump) - power(a, trump) : power(a, trump) - power(b, trump)))[0];
  if (!want && losers.length) return losers.sort((a, b) => (a.rank === 7) - (b.rank === 7) || power(b, trump) - power(a, trump))[0];
  if (want) return legal.slice().sort((a, b) => (a.rank === 7) - (b.rank === 7) || power(a, trump) - power(b, trump))[0];
  return legal.slice().sort((a, b) => power(a, trump) - power(b, trump))[0];
}

export function heuristicFox(G, p) {
  const hand = G.players[p].hand, want = plan(G, p) === 'win' || G.players[p].tricks >= 4;
  let best = null, bestV = estimateTricks(hand, trumpSuit(G));
  for (const c of hand) {
    const nh = hand.filter((x) => x !== c).concat([G.decree]);
    const v = estimateTricks(nh, c.suit);
    if (want ? v > bestV + 0.3 : v < bestV - 0.3) { bestV = v; best = c; }
  }
  return best ? best.uid : null;
}
export function heuristicWoodcut(G, p) {
  const hand = G.players[p].hand, trump = trumpSuit(G), want = wantWin(G, p);
  const sorted = hand.slice().sort((a, b) => power(a, trump) - power(b, trump));
  return (want ? sorted[0] : sorted[sorted.length - 1]).uid;
}

// Sample the hidden information from p's point of view.
function sampleWorld(G, p, salt) {
  const C = cloneGame(G, salt);
  const o = other(p), opp = C.players[o];
  const mine = new Set(C.players[p].hand.map((c) => c.uid));
  const knownOpp = opp.hand.filter((c) => G.known[o].includes(c.uid));
  const fixed = new Set([...mine, C.decree.uid, ...knownOpp.map((c) => c.uid), ...G.bottomed[p]]);
  const pool = C.rng.shuffle([...opp.hand, ...C.deck].filter((c) => !fixed.has(c.uid)));
  const need = opp.hand.length - knownOpp.length;
  const fits = pool.filter((c) => !G.voids[o].includes(c.suit));
  const take = (fits.length >= need ? fits : pool).slice(0, need);
  const rest = pool.filter((c) => !take.includes(c));
  opp.hand = [...knownOpp, ...take];
  const bottom = C.deck.filter((c) => G.bottomed[p].includes(c.uid));
  C.deck = [...bottom, ...C.rng.shuffle(rest)];
  return C;
}

function rollout(C, p) {
  const before = C.players.map((q) => q.score);
  let guard = 0;
  while (C.phase !== 'roundover' && C.phase !== 'over' && guard++ < 400) {
    if (C.phase === 'trickdone') { collect(C); continue; }
    const a = actor(C);
    if (C.phase === 'play') playCard(C, heuristicPlay(C, a).uid);
    else if (C.phase === 'fox') foxSwap(C, heuristicFox(C, a));
    else if (C.phase === 'woodcut') woodcut(C, heuristicWoodcut(C, a));
  }
  return (C.players[p].score - before[p]) - (C.players[other(p)].score - before[other(p)]);
}

export function choosePlay(G, p) {
  const level = G.players[p].level;
  const legal = legalCards(G, p);
  if (level === 'easy') return legal[Math.floor(G.rng.next() * legal.length)];
  if (level === 'normal' || legal.length === 1) return heuristicPlay(G, p);
  const n = LEVELS.hard;
  let best = null, bestV = -Infinity;
  for (const c of legal) {
    let tot = 0;
    for (let s = 0; s < n; s++) {
      const C = sampleWorld(G, p, `${G.round}:${G.played.length}:${c.uid}:${s}`);
      playCard(C, c.uid);
      tot += rollout(C, p);
    }
    if (tot / n > bestV) { bestV = tot / n; best = c; }
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
