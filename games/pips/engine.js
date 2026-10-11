// Pips: a deckbuilder played with two ordinary packs of cards. DOM-free engine.
import { makeRng } from '../../platform/rng.js';

export const SUITS = ['D', 'C', 'S', 'H'];
export const SUIT_INFO = {
  D: { name: 'Diamonds', glyph: '♦', color: 'red', job: 'Gold' },
  C: { name: 'Clubs', glyph: '♣', color: 'black', job: 'Hands' },
  S: { name: 'Spades', glyph: '♠', color: 'black', job: 'Blades' },
  H: { name: 'Hearts', glyph: '♥', color: 'red', job: 'Glory' },
};
export const RANK_NAMES = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const HAND_SIZE = 5;
export const ROW_SIZE = 5;
export const MAX_ROUNDS = 12;
export const COST = { basic: 0, number: 4, ace: 6, face: 7 };

export function tier(card) {
  if (card.rank <= 5) return 'basic';
  if (card.rank <= 10) return 'number';
  if (card.rank === 14) return 'ace';
  return 'face';
}
export function rankName(r) { return RANK_NAMES[r] || String(r); }
export function cardName(c) { return `${rankName(c.rank)}${SUIT_INFO[c.suit].glyph}`; }
export function cost(card) { return COST[tier(card)]; }
export function vp(card) {
  if (card.suit !== 'H') return 0;
  const t = tier(card);
  return t === 'number' ? 3 : t === 'face' ? 6 : 0;
}

// Human-readable effect text, from the same rules the engine applies.
export function effectText(card) {
  const t = tier(card);
  if (t === 'basic') return '+1 coin.';
  if (t === 'ace') return '+1 card, +2 coins.';
  const big = t === 'face';
  switch (card.suit) {
    case 'D': return big ? '+3 coins.' : '+2 coins.';
    case 'C': return big ? '+2 cards, +1 coin.' : '+1 card, +1 coin.';
    case 'S': return big ? 'Trash up to 2 cards from your hand. +2 coins for each card trashed.' : 'You may trash a card from your hand. +2 coins if you do.';
    case 'H': return big ? 'Worth 6 points. Does nothing when played.' : 'Worth 3 points. Does nothing when played.';
  }
  return '';
}

function log(G, msg) { G.log.push({ round: G.round, player: G.turn, msg }); }
function pull(arr, uid) { const i = arr.findIndex(c => c.uid === uid); return i >= 0 ? arr.splice(i, 1)[0] : null; }

export function newGame({ seed, players }) {
  const rng = makeRng(seed);
  const G = { seed: String(seed), rng, round: 0, turn: -1, players: [], row: [], deck: [], trash: [], phase: 'main', pending: null, log: [], winner: null, endReason: null, finalRound: false, coins: 0, bought: 0 };
  let uid = 0;
  const all = [];
  for (let pack = 0; pack < 2; pack++) for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) all.push({ uid: ++uid, rank, suit, pack });
  // Starting decks: every 2, 3, 4 and 5. Each player gets two of each rank, dealt at random.
  const basics = rng.shuffle(all.filter(c => c.rank <= 5));
  const rest = all.filter(c => c.rank > 5);
  players.forEach((spec, idx) => {
    const p = { idx, name: spec.name || `Player ${idx + 1}`, kind: spec.kind || 'bot', strategy: spec.strategy || 'money', deck: [], hand: [], discard: [], play: [] };
    for (let r = 2; r <= 5; r++) { for (let k = 0; k < 2; k++) { const i = basics.findIndex(c => c.rank === r); p.discard.push(basics.splice(i, 1)[0]); } }
    G.players.push(p);
  });
  G.deck = rng.shuffle(rest);
  refill(G);
  // Everyone after the first player draws 6 cards for their first turn.
  for (const p of G.players) draw(G, p, HAND_SIZE + (p.idx > 0 ? 1 : 0));
  next(G);
  return G;
}

export function cloneGame(G, salt) {
  if (G.pending) throw new Error('pending');
  const { rng, ...rest } = G;
  const c = structuredClone(rest);
  c.rng = makeRng(`${G.seed}:${salt}`);
  return c;
}

export const cur = (G) => G.players[G.turn];

function draw(G, p, n) {
  let d = 0;
  for (let i = 0; i < n; i++) {
    if (!p.deck.length) { if (!p.discard.length) break; p.deck = G.rng.shuffle(p.discard); p.discard = []; }
    p.hand.push(p.deck.pop()); d++;
  }
  return d;
}
function refill(G) { while (G.row.length < ROW_SIZE && G.deck.length) G.row.push(G.deck.pop()); }

export function faceHeartsLeft(G) {
  return G.deck.filter(c => c.suit === 'H' && tier(c) === 'face').length + G.row.filter(c => c.suit === 'H' && tier(c) === 'face').length;
}

function next(G) {
  G.turn = (G.turn + 1) % G.players.length;
  if (G.turn === 0) {
    if (G.finalRound || G.round >= MAX_ROUNDS) return endGame(G);
    G.round++;
    log(G, `Round ${G.round}.`);
  }
  // The market moves: the oldest card slides off into the trash and a new one is dealt.
  if (G.deck.length && G.row.length && !(G.round === 1 && G.turn === 0)) {
    const gone = G.row.shift();
    G.trash.push(gone);
    refill(G);
    log(G, `${cardName(gone)} slides out of the market.`);
  }
  G.coins = 0; G.bought = 0; G.phase = 'main';
}

export function canPlay(G, uid) { return !G.pending && G.phase === 'main' && cur(G).hand.some(c => c.uid === uid); }

export function playCard(G, uid) {
  if (!canPlay(G, uid)) return false;
  const p = cur(G);
  const c = pull(p.hand, uid);
  p.play.push(c);
  const t = tier(c);
  if (t === 'basic') { G.coins += 1; }
  else if (t === 'ace') { G.coins += 2; draw(G, p, 1); }
  else {
    const big = t === 'face';
    if (c.suit === 'D') G.coins += big ? 3 : 2;
    else if (c.suit === 'C') { G.coins += 1; draw(G, p, big ? 2 : 1); }
    else if (c.suit === 'S') {
      const max = big ? 2 : 1;
      if (p.hand.length) G.pending = { text: `${cardName(c)}: trash up to ${max} card${max > 1 ? 's' : ''} from your hand, +2 coins each.`, cards: p.hand.slice(), min: 0, max: Math.min(max, p.hand.length), okLabel: 'Trash',
        resolve(chosen) { for (const u of chosen) { const x = pull(p.hand, u); if (x) { G.trash.push(x); G.coins += 2; log(G, `${p.name} trashes ${cardName(x)} (+2).`); } } } };
    }
  }
  log(G, `${p.name} plays ${cardName(c)}.`);
  return true;
}

export function playAll(G) {
  if (G.pending || G.phase !== 'main') return;
  const p = cur(G);
  // Draw first (clubs, aces), then money, then spades last so there is a full hand to trash from.
  const order = (c) => (c.suit === 'C' || tier(c) === 'ace') ? 0 : c.suit === 'S' ? 2 : 1;
  let guard = 0;
  while (!G.pending && p.hand.length && guard++ < 60) {
    const c = p.hand.slice().sort((a, b) => order(a) - order(b))[0];
    playCard(G, c.uid);
  }
}

export function canBuy(G, i) { return !G.pending && G.phase === 'main' && !!G.row[i] && G.coins >= cost(G.row[i]); }
export function buy(G, i) {
  if (!canBuy(G, i)) return false;
  const p = cur(G);
  const c = G.row.splice(i, 1)[0];
  G.coins -= cost(c); G.bought++;
  p.discard.push(c);
  log(G, `${p.name} buys ${cardName(c)} for ${cost(c)}.`);
  refill(G);
  if (c.suit === 'H' && tier(c) === 'face' && faceHeartsLeft(G) === 0 && !G.finalRound) { G.finalRound = true; G.endReason = 'The last face heart is gone.'; log(G, 'The last face heart is gone. This round is the last.'); }
  return true;
}

export function resolvePending(G, chosen) {
  const sp = G.pending; if (!sp) return false;
  const valid = chosen.filter(u => sp.cards.some(c => c.uid === u));
  if (valid.length < sp.min || valid.length > sp.max) return false;
  G.pending = null; sp.resolve(valid); return true;
}

export function endTurn(G) {
  if (G.pending || G.phase !== 'main') return false;
  const p = cur(G);
  p.discard.push(...p.hand, ...p.play); p.hand = []; p.play = [];
  draw(G, p, HAND_SIZE);
  if (!G.deck.length && !G.row.length && !G.finalRound) { G.finalRound = true; G.endReason = 'The market is empty.'; log(G, 'The market is empty. This round is the last.'); }
  next(G);
  return true;
}

export function score(p) { return [...p.deck, ...p.hand, ...p.discard, ...p.play].reduce((s, c) => s + vp(c), 0); }
export function deckSize(p) { return p.deck.length + p.hand.length + p.discard.length + p.play.length; }

function endGame(G) {
  G.phase = 'over';
  const ranked = G.players.slice().sort((a, b) => score(b) - score(a) || deckSize(a) - deckSize(b) || a.idx - b.idx);
  G.ranking = ranked.map(p => p.idx);
  G.winner = ranked[0].idx;
  if (!G.endReason) G.endReason = `${MAX_ROUNDS} rounds are up.`;
  log(G, `${ranked[0].name} wins with ${score(ranked[0])} points.`);
}
