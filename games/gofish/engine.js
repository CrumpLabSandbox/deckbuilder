// Go Fish: standard rules. DOM-free engine.
import { makeRng } from '../../platform/rng.js';

export const SUITS = ['S', 'H', 'D', 'C'];
export const SUIT_INFO = { S: { glyph: '♠', red: false }, H: { glyph: '♥', red: true }, D: { glyph: '♦', red: true }, C: { glyph: '♣', red: false } };
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const rankName = (r) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[r] || String(r);
export const rankWord = (r, n = 2) => {
  const w = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace' }[r];
  return n === 1 ? w : w === 'six' ? 'sixes' : `${w}s`;
};

function log(G, msg, kind = 'info') { G.log.push({ msg, kind, turn: G.turnNo }); }
const nm = (G, p) => G.players[p].name;
const isYou = (G, p) => G.players[p].name === 'You';
const verb = (G, p, v) => (isYou(G, p) ? v.replace(/es\b/, 'e').replace(/s\b/, '') : v);
const say = (G, p, v) => `${nm(G, p)} ${verb(G, p, v)}`;

export function newGame({ seed, players }) {
  const rng = makeRng(seed), n = players.length;
  const G = {
    seed: String(seed), rng, n, turnNo: 0, log: [],
    players: players.map((s, i) => ({ idx: i, name: s.name || `Player ${i + 1}`, kind: s.kind || 'bot', level: s.level || 'normal', hand: [], books: [] })),
    deck: [], turn: 0, phase: 'ask', last: null, winners: null,
    // Public knowledge: seen[p][rank] = number of that rank everyone knows p is holding, and when it was learned.
    seen: players.map(() => ({})),
  };
  let uid = 0;
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ uid: ++uid, suit: s, rank: r });
  G.deck = rng.shuffle(deck);
  const deal = n <= 3 ? 7 : 5;
  for (let k = 0; k < deal; k++) for (const p of G.players) p.hand.push(G.deck.pop());
  log(G, `Dealt ${deal} cards each. ${G.deck.length} cards in the pond.`, 'head');
  for (const p of G.players) checkBooks(G, p.idx);
  G.turn = rng.int(n);
  startTurn(G);
  return G;
}

export const totalBooks = (G) => G.players.reduce((s, p) => s + p.books.length, 0);
export const ranksIn = (hand) => [...new Set(hand.map((c) => c.rank))].sort((a, b) => a - b);
export const count = (hand, r) => hand.filter((c) => c.rank === r).length;
export const cur = (G) => G.players[G.turn];

function remember(G, p, r, n) {
  if (n <= 0) delete G.seen[p][r]; else G.seen[p][r] = { n, at: G.turnNo };
}

function checkBooks(G, p) {
  const pl = G.players[p];
  for (const r of ranksIn(pl.hand)) {
    if (count(pl.hand, r) === 4) {
      pl.hand = pl.hand.filter((c) => c.rank !== r);
      pl.books.push(r);
      remember(G, p, r, 0);
      log(G, `${say(G, p, 'lays')} down a book of ${rankWord(r)}!`, 'book');
    }
  }
}

function startTurn(G) {
  if (totalBooks(G) === 13) return endGame(G);
  for (let guard = 0; guard < 4 * G.n + 60; guard++) {
    const p = G.turn, pl = G.players[p];
    // No cards: draw one from the pond if there is one.
    if (!pl.hand.length && G.deck.length) {
      pl.hand.push(G.deck.pop());
      log(G, `${nm(G, p)} ${isYou(G, p) ? 'have' : 'has'} no cards, so ${isYou(G, p) ? 'you draw' : 'draws'} one from the pond.`);
      checkBooks(G, p);
      if (totalBooks(G) === 13) return endGame(G);
    }
    if (pl.hand.length && askableTargets(G, p).length) { G.turnNo++; G.phase = 'ask'; return; }
    // Cards but nobody to ask: draw one and pass.
    if (pl.hand.length && G.deck.length) {
      pl.hand.push(G.deck.pop());
      log(G, `Nobody else has cards to ask, so ${isYou(G, p) ? 'you draw' : nm(G, p) + ' draws'} from the pond.`);
      checkBooks(G, p);
      if (totalBooks(G) === 13) return endGame(G);
    }
    if (!G.deck.length && !G.players.some((q) => q.hand.length && askableTargets(G, q.idx).length)) return endGame(G);
    G.turn = (G.turn + 1) % G.n;
  }
  endGame(G);
}

// You may ask anyone else who still holds cards.
export const askableTargets = (G, p) => G.players.filter((q) => q.idx !== p && q.hand.length).map((q) => q.idx);
export function canAsk(G, target, rank) {
  const p = G.turn;
  return G.phase === 'ask' && target !== p && G.players[target]?.hand.length > 0 && count(G.players[p].hand, rank) > 0;
}

export function ask(G, target, rank) {
  if (!canAsk(G, target, rank)) return false;
  const p = G.turn, me = G.players[p], them = G.players[target];
  const had = count(me.hand, rank);
  log(G, `${nm(G, p)}: “${nm(G, target)}, do you have any ${rankWord(rank)}?”`, 'ask');
  const got = them.hand.filter((c) => c.rank === rank);
  if (got.length) {
    them.hand = them.hand.filter((c) => c.rank !== rank);
    me.hand.push(...got);
    remember(G, target, rank, 0);
    remember(G, p, rank, had + got.length);
    log(G, `${say(G, target, 'hands')} over ${got.length} ${rankWord(rank, got.length)}. ${isYou(G, p) ? 'You go' : `${nm(G, p)} goes`} again.`, 'got');
    G.last = { type: 'got', p, target, rank, n: got.length };
    checkBooks(G, p);
    if (totalBooks(G) === 13) return endGame(G), true;
    if (!me.hand.length || !askableTargets(G, p).length) return passTurn(G), true;
    return true;
  }
  remember(G, p, rank, had);
  if (!G.deck.length) {
    log(G, `“Go fish!” But the pond is empty.`, 'fish');
    G.last = { type: 'empty', p, target, rank };
    return passTurn(G), true;
  }
  const card = G.deck.pop();
  me.hand.push(card);
  if (card.rank === rank) {
    remember(G, p, rank, had + 1);
    log(G, `“Go fish!” ${say(G, p, 'draws')} the ${rankWord(rank, 1)} ${isYou(G, p) ? 'you' : 'they'} asked for and ${isYou(G, p) ? 'go' : 'goes'} again!`, 'got');
    G.last = { type: 'wish', p, target, rank, card };
    checkBooks(G, p);
    if (totalBooks(G) === 13) return endGame(G), true;
    if (!me.hand.length || !askableTargets(G, p).length) return passTurn(G), true;
    return true;
  }
  log(G, `“Go fish!” ${say(G, p, 'draws')} a card.`, 'fish');
  G.last = { type: 'fish', p, target, rank, card };
  checkBooks(G, p);
  return passTurn(G), true;
}

function passTurn(G) {
  if (totalBooks(G) === 13) return endGame(G);
  G.turn = (G.turn + 1) % G.n;
  startTurn(G);
}

function endGame(G) {
  if (G.phase === 'over') return;
  G.phase = 'over';
  const top = Math.max(...G.players.map((p) => p.books.length));
  G.winners = G.players.filter((p) => p.books.length === top).map((p) => p.idx);
  log(G, `All 13 books are down. ${G.winners.map((i) => nm(G, i)).join(' and ')} win${G.winners.length === 1 && !isYou(G, G.winners[0]) ? 's' : ''} with ${top} books.`, 'book');
}
