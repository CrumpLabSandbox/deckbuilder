// Spite and Malice (Cat and Mouse): two-player competitive patience. DOM-free engine.
import { makeRng } from '../../platform/rng.js';

export const SUITS = ['S', 'H', 'D', 'C'];
export const SUIT_INFO = { S: { glyph: '♠', color: 'black' }, H: { glyph: '♥', color: 'red' }, D: { glyph: '♦', color: 'red' }, C: { glyph: '♣', color: 'black' } };
export const PAYOFF_SIZE = 20;
export const HAND_SIZE = 5;
export const CENTER_PILES = 3;
export const SIDE_STACKS = 4;
export const TOP_VALUE = 12; // piles build Ace (1) to Queen (12); Kings (13) are wild
export const MAX_TURNS = 400;

export function rankName(r) { return r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r); }
export function cardName(c) { return `${rankName(c.rank)}${SUIT_INFO[c.suit].glyph}`; }
export const isWild = (c) => c.rank === 13;

function log(G, msg) { G.log.push({ turn: G.turnCount, player: G.turn, msg }); }

export function newGame({ seed, players }) {
  const rng = makeRng(seed);
  const G = { seed: String(seed), rng, stock: [], completed: [], center: [], players: [], turn: -1, turnCount: 0, phase: 'main', winner: null, endReason: null, log: [], playedThisTurn: 0 };
  for (let i = 0; i < CENTER_PILES; i++) G.center.push([]);
  let uid = 0;
  const all = [];
  for (let pack = 0; pack < 2; pack++) for (const suit of SUITS) for (let rank = 1; rank <= 13; rank++) all.push({ uid: ++uid, rank, suit });
  G.stock = rng.shuffle(all);
  players.forEach((spec, idx) => {
    const p = { idx, name: spec.name || `Player ${idx + 1}`, kind: spec.kind || 'bot', payoff: [], hand: [], side: [] };
    for (let i = 0; i < SIDE_STACKS; i++) p.side.push([]);
    for (let i = 0; i < PAYOFF_SIZE; i++) p.payoff.push(G.stock.pop());
    G.players.push(p);
  });
  // The player whose pay-off top card is higher goes first (ties: player 1).
  const tops = G.players.map(p => p.payoff[p.payoff.length - 1].rank);
  G.turn = tops[1] > tops[0] ? 0 : -1; // next() advances by one
  next(G);
  return G;
}

export const cur = (G) => G.players[G.turn];
export const other = (G) => G.players[1 - G.turn];
export const payoffTop = (p) => p.payoff[p.payoff.length - 1] || null;
export const sideTop = (p, i) => p.side[i][p.side[i].length - 1] || null;
export const pileValue = (pile) => pile.length; // Ace..Queen in order, wilds fill gaps

function drawToHand(G, p) {
  while (p.hand.length < HAND_SIZE) {
    if (!G.stock.length) {
      if (!G.completed.length) break;
      G.stock = G.rng.shuffle(G.completed); G.completed = [];
      log(G, 'Completed piles are shuffled into a new stock.');
    }
    p.hand.push(G.stock.pop());
  }
}

function next(G) {
  G.turn = (G.turn + 1) % G.players.length;
  G.turnCount++;
  G.playedThisTurn = 0;
  const p = cur(G);
  const before = p.hand.length;
  drawToHand(G, p);
  if (p.hand.length > before) log(G, `${p.name} draws ${p.hand.length - before}.`);
  if (G.turnCount > MAX_TURNS) endGame(G, null, 'The game has gone on too long. It is a draw.');
}

export function canPlayOn(card, pile) {
  const v = pileValue(pile);
  if (v >= TOP_VALUE) return false;
  return isWild(card) || card.rank === v + 1;
}

// Sources: {from:'hand', uid} | {from:'payoff'} | {from:'side', i}
export function sourceCard(G, src) {
  const p = cur(G);
  if (src.from === 'hand') return p.hand.find(c => c.uid === src.uid) || null;
  if (src.from === 'payoff') return payoffTop(p);
  if (src.from === 'side') return sideTop(p, src.i);
  return null;
}

export function canPlay(G, src, pileIdx) {
  if (G.phase !== 'main') return false;
  const c = sourceCard(G, src);
  return !!c && canPlayOn(c, G.center[pileIdx]);
}

function takeSource(G, src) {
  const p = cur(G);
  if (src.from === 'hand') { const i = p.hand.findIndex(c => c.uid === src.uid); return p.hand.splice(i, 1)[0]; }
  if (src.from === 'payoff') return p.payoff.pop();
  return p.side[src.i].pop();
}

export function play(G, src, pileIdx) {
  if (!canPlay(G, src, pileIdx)) return false;
  const p = cur(G);
  const c = takeSource(G, src);
  const pile = G.center[pileIdx];
  pile.push(c);
  G.playedThisTurn++;
  log(G, `${p.name} plays ${cardName(c)}${isWild(c) ? ` as ${pileValue(pile)}` : ''} from ${src.from === 'payoff' ? 'the pay-off pile' : src.from === 'side' ? 'a side stack' : 'hand'}.`);
  if (pileValue(pile) >= TOP_VALUE) { G.completed.push(...pile); G.center[pileIdx] = []; log(G, 'A center pile is complete and cleared.'); }
  if (src.from === 'payoff' && !p.payoff.length) { endGame(G, p.idx, `${p.name} has emptied their pay-off pile.`); return true; }
  if (!p.hand.length) { drawToHand(G, p); if (p.hand.length) log(G, `${p.name} empties their hand and draws ${p.hand.length} more.`); }
  return true;
}

export function canDiscard(G, uid, stackIdx) {
  if (G.phase !== 'main') return false;
  return cur(G).hand.some(c => c.uid === uid) && stackIdx >= 0 && stackIdx < SIDE_STACKS;
}

// Discarding a hand card onto a side stack ends the turn.
export function discard(G, uid, stackIdx) {
  if (!canDiscard(G, uid, stackIdx)) return false;
  const p = cur(G);
  const c = takeSource(G, { from: 'hand', uid });
  p.side[stackIdx].push(c);
  log(G, `${p.name} discards ${cardName(c)} to side stack ${stackIdx + 1}.`);
  next(G);
  return true;
}

// Only legal when the hand is empty and nothing can be drawn (stock and completed piles exhausted).
export function canPass(G) { return G.phase === 'main' && cur(G).hand.length === 0; }
export function pass(G) {
  if (!canPass(G)) return false;
  log(G, `${cur(G).name} has no cards to discard and passes.`);
  G.passes = (G.passes || 0) + 1;
  if (G.passes >= 2 && G.playedThisTurn === 0) { endGame(G, null, 'Neither player can move. It is a draw.'); return true; }
  next(G);
  return true;
}

function endGame(G, winner, reason) {
  G.phase = 'over';
  G.endReason = reason;
  if (winner === null) {
    // Draw by stalemate: fewer pay-off cards wins, else a tie.
    const [a, b] = G.players;
    winner = a.payoff.length < b.payoff.length ? 0 : b.payoff.length < a.payoff.length ? 1 : null;
    if (winner !== null) G.endReason += ` ${G.players[winner].name} has fewer pay-off cards left.`;
  }
  G.winner = winner;
  log(G, reason);
}

export function visibleState(G, viewerIdx) {
  // What a player may know: everything except the other hand and the face-down parts of pay-off piles.
  return G;
}
