// Euchre: four players in two partnerships, 24-card deck, game to 10. DOM-free engine.
import { makeRng } from '../../platform/rng.js';

export const SUITS = ['S', 'H', 'C', 'D'];
export const SUIT_INFO = {
  S: { glyph: '♠', name: 'Spades', one: 'spade', color: 'black' },
  H: { glyph: '♥', name: 'Hearts', one: 'heart', color: 'red' },
  C: { glyph: '♣', name: 'Clubs', one: 'club', color: 'black' },
  D: { glyph: '♦', name: 'Diamonds', one: 'diamond', color: 'red' },
};
export const RANKS = [9, 10, 11, 12, 13, 14];
export const SEATS = ['South', 'West', 'North', 'East'];
export const DEFAULTS = { stickTheDealer: true, target: 10 };

export const rankName = (r) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[r] || String(r);
export const cardName = (c) => `${rankName(c.rank)}${SUIT_INFO[c.suit].glyph}`;
export const suitName = (s) => SUIT_INFO[s].name;
export const sister = (s) => ({ S: 'C', C: 'S', H: 'D', D: 'H' })[s];
export const team = (p) => p % 2;
export const partnerOf = (p) => (p + 2) % 4;
export const nextSeat = (p) => (p + 1) % 4;
export const isRight = (c, t) => !!t && c.rank === 11 && c.suit === t;
export const isLeft = (c, t) => !!t && c.rank === 11 && c.suit === sister(t);
export const effSuit = (c, t) => (isLeft(c, t) ? t : c.suit);
export const isTrump = (c, t) => !!t && effSuit(c, t) === t;
// Trick-taking power of a card given trump and the suit led. Off-suit, non-trump cards cannot win.
export function power(c, t, led) {
  if (isRight(c, t)) return 200;
  if (isLeft(c, t)) return 199;
  if (isTrump(c, t)) return 100 + c.rank;
  if (effSuit(c, t) === led) return c.rank;
  return 0;
}
export const ALL_CARDS = SUITS.flatMap((s) => RANKS.map((r) => ({ suit: s, rank: r })));
export const sameCard = (a, b) => a.suit === b.suit && a.rank === b.rank;

function log(G, msg, kind = 'info') { G.log.push({ hand: G.handNo, msg, kind }); }
const nm = (G, p) => G.players[p].name;
// "Pat plays" but "You play".
const vb = (G, p, v) => (G.players[p].name === 'You' ? (v.endsWith('sses') || v.endsWith('ses') ? v.slice(0, -2) : v.replace(/s\b/, '')) : v);
const say = (G, p, v) => `${nm(G, p)} ${vb(G, p, v)}`;
export const teamName = (G, t) => `${G.players[t].name} & ${G.players[t + 2].name}`;

export function newGame({ seed, players, options = {} }) {
  const G = {
    seed: String(seed), rng: makeRng(seed), opts: { ...DEFAULTS, ...options },
    players: players.map((s, i) => ({ idx: i, name: s.name || SEATS[i], kind: s.kind || 'bot', hand: [] })),
    scores: [0, 0], dealer: 0, handNo: 0, log: [], phase: 'deal', winner: null, history: [],
    stats: { hands: 0, made: 0, euchred: 0, marches: 0, alone: 0, aloneMarches: 0, aloneEuchred: 0, round1: 0, round2: 0, forced: 0, misdeals: 0 },
  };
  G.dealer = G.rng.int(4);
  startHand(G);
  return G;
}

function startHand(G) {
  G.handNo++;
  let uid = 0;
  const deck = G.rng.shuffle(ALL_CARDS.map((c) => ({ ...c, uid: ++uid })));
  for (const p of G.players) p.hand = [];
  for (let k = 0; k < 5; k++) for (let i = 1; i <= 4; i++) G.players[(G.dealer + i) % 4].hand.push(deck.pop());
  const upcard = deck.pop();
  G.hand = {
    upcard, kitty: deck, trump: null, maker: null, alone: false, out: null, turn: nextSeat(G.dealer), passes: 0,
    pickedUp: false, discarded: null, trick: null, tricks: [], won: [0, 0], played: [], lastTrick: null, result: null, bids: [],
  };
  G.phase = 'bid1';
  log(G, `Hand ${G.handNo}. ${say(G, G.dealer, 'deals')}; the ${cardName(upcard)} is turned up.`, 'head');
}

// Whose decision it is, or null while a trick is being shown or a hand is over.
export function actor(G) {
  if (G.phase === 'bid1' || G.phase === 'bid2' || G.phase === 'play') return G.hand.turn;
  if (G.phase === 'discard') return G.dealer;
  return null;
}

function makeTrump(G, t, p, alone, msg) {
  const h = G.hand;
  h.trump = t; h.maker = p; h.alone = alone; h.out = alone ? partnerOf(p) : null;
  log(G, msg, 'bid');
  if (alone) log(G, `${say(G, partnerOf(p), 'sits')} this hand out.`, 'bid');
}

export function orderUp(G, alone = false) {
  if (G.phase !== 'bid1') return false;
  const h = G.hand, p = h.turn, dealerCalls = p === G.dealer;
  h.bids.push({ p, text: (dealerCalls ? 'Pick it up' : 'Order it up') + (alone ? ', alone' : '') });
  makeTrump(G, h.upcard.suit, p, alone, `${say(G, p, dealerCalls ? 'picks' : 'orders')} it up${alone ? ` and ${vb(G, p, 'goes')} alone` : ''}. ${suitName(h.upcard.suit)} are trump.`);
  G.stats.round1++;
  if (h.out === G.dealer) {
    log(G, `${nm(G, G.dealer)} ${G.players[G.dealer].name === 'You' ? 'are' : 'is'} sitting out, so the ${cardName(h.upcard)} is not picked up.`, 'bid');
    startPlay(G);
  } else {
    G.players[G.dealer].hand.push(h.upcard);
    h.pickedUp = true;
    G.phase = 'discard';
    log(G, `${say(G, G.dealer, 'picks')} up the ${cardName(h.upcard)} and ${vb(G, G.dealer, 'discards')} a card.`, 'bid');
  }
  return true;
}

export function canPass(G) {
  if (G.phase === 'bid1') return true;
  if (G.phase === 'bid2') return !(G.opts.stickTheDealer && G.hand.turn === G.dealer);
  return false;
}

export function pass(G) {
  if (!canPass(G)) return false;
  const h = G.hand, p = h.turn;
  h.bids.push({ p, text: 'Pass' });
  log(G, `${say(G, p, 'passes')}.`, 'bid');
  h.passes++;
  if (h.passes < 4) { h.turn = nextSeat(p); return true; }
  if (G.phase === 'bid1') {
    G.phase = 'bid2'; h.passes = 0; h.turn = nextSeat(G.dealer); h.bids = [];
    log(G, `Everyone passed. The ${cardName(h.upcard)} is turned down, so ${suitName(h.upcard.suit).toLowerCase()} can't be trump. Anyone may now name another suit.`, 'bid');
    return true;
  }
  log(G, 'Everyone passed again. The hand is thrown in and the deal moves on.', 'bid');
  G.stats.misdeals++;
  G.dealer = nextSeat(G.dealer);
  startHand(G);
  return true;
}

export function callSuit(G, suit, alone = false) {
  if (G.phase !== 'bid2' || suit === G.hand.upcard.suit || !SUITS.includes(suit)) return false;
  const h = G.hand, p = h.turn;
  h.bids.push({ p, text: `${SUIT_INFO[suit].glyph}${alone ? ', alone' : ''}` });
  if (G.opts.stickTheDealer && p === G.dealer && h.passes === 3) G.stats.forced++;
  makeTrump(G, suit, p, alone, `${say(G, p, 'names')} ${suitName(suit).toLowerCase()}${alone ? ` and ${vb(G, p, 'goes')} alone` : ''}.`);
  G.stats.round2++;
  startPlay(G);
  return true;
}

export function discard(G, uid) {
  if (G.phase !== 'discard') return false;
  const hand = G.players[G.dealer].hand;
  const i = hand.findIndex((c) => c.uid === uid);
  if (i < 0) return false;
  G.hand.discarded = hand.splice(i, 1)[0];
  log(G, `${say(G, G.dealer, 'discards')} a card face down.`, 'bid');
  startPlay(G);
  return true;
}

function startPlay(G) {
  const h = G.hand;
  G.phase = 'play';
  let l = nextSeat(G.dealer);
  if (l === h.out) l = nextSeat(l);
  h.trick = { leader: l, cards: [] };
  h.turn = l;
}

export const trickSize = (G) => (G.hand.out === null ? 4 : 3);
export function ledSuit(G) {
  const tr = G.hand.trick;
  return tr && tr.cards.length ? effSuit(tr.cards[0].card, G.hand.trump) : null;
}
export function legalCards(G, p) {
  const hand = G.players[p].hand, led = ledSuit(G);
  if (!led) return hand.slice();
  const follow = hand.filter((c) => effSuit(c, G.hand.trump) === led);
  return follow.length ? follow : hand.slice();
}
export const isLegal = (G, p, uid) => legalCards(G, p).some((c) => c.uid === uid);
export function winningEntry(cards, t) {
  const led = effSuit(cards[0].card, t);
  return cards.reduce((b, e) => (power(e.card, t, led) > power(b.card, t, led) ? e : b));
}
export function currentWinner(G) {
  const cards = G.hand.trick.cards;
  return cards.length ? winningEntry(cards, G.hand.trump) : null;
}
function winReason(cards, t, w) {
  const led = effSuit(cards[0].card, t), c = w.card;
  if (isRight(c, t)) return 'the right bower is the highest card';
  if (isLeft(c, t)) return 'the left bower is the second-highest trump';
  if (isTrump(c, t) && led !== t) return `trump beats every ${SUIT_INFO[led].one}`;
  if (isTrump(c, t)) return 'it was the highest trump played';
  return `it was the highest ${SUIT_INFO[led].one} and nobody trumped`;
}

export function playCard(G, uid) {
  if (G.phase !== 'play') return false;
  const h = G.hand, p = h.turn;
  if (!isLegal(G, p, uid)) return false;
  const hand = G.players[p].hand;
  const card = hand.splice(hand.findIndex((c) => c.uid === uid), 1)[0];
  h.trick.cards.push({ p, card });
  h.played.push(card);
  const tag = isRight(card, h.trump) ? ' (right bower)' : isLeft(card, h.trump) ? ' (left bower)' : '';
  log(G, `${say(G, p, h.trick.cards.length === 1 ? 'leads' : 'plays')} the ${cardName(card)}${tag}.`);
  if (h.trick.cards.length === trickSize(G)) {
    const w = winningEntry(h.trick.cards, h.trump);
    h.won[team(w.p)]++;
    h.lastTrick = { leader: h.trick.leader, cards: h.trick.cards.slice(), winner: w.p, reason: winReason(h.trick.cards, h.trump, w) };
    h.tricks.push(h.lastTrick);
    G.phase = 'trickdone';
    log(G, `${say(G, w.p, 'wins')} the trick with the ${cardName(w.card)}: ${h.lastTrick.reason}.`, 'trick');
  } else {
    let n = nextSeat(p);
    if (n === h.out) n = nextSeat(n);
    h.turn = n;
  }
  return true;
}

// Clear a finished trick and continue (or score the hand after the fifth trick).
export function collect(G) {
  if (G.phase !== 'trickdone') return false;
  const h = G.hand;
  if (h.tricks.length === 5) { scoreHand(G); return true; }
  const l = h.lastTrick.winner;
  h.trick = { leader: l, cards: [] };
  h.turn = l;
  G.phase = 'play';
  return true;
}

function scoreHand(G) {
  const h = G.hand, mt = team(h.maker), mk = h.won[mt], makers = teamName(G, mt), defenders = teamName(G, 1 - mt);
  const tName = suitName(h.trump).toLowerCase();
  let to, pts, kind, text;
  G.stats.hands++;
  if (h.alone) G.stats.alone++;
  if (mk >= 3) {
    to = mt; G.stats.made++;
    if (mk === 5) {
      pts = h.alone ? 4 : 2; kind = h.alone ? 'Lone march!' : 'March!';
      G.stats.marches++; if (h.alone) G.stats.aloneMarches++;
      text = `${h.alone ? nm(G, h.maker) + ', alone,' : makers} took all five tricks in ${tName}: ${pts} points.`;
    } else {
      pts = 1; kind = 'Made it';
      text = `${makers} called ${tName} and took ${mk} tricks: 1 point.${h.alone ? ' (Going alone only pays extra for all five.)' : ''}`;
    }
  } else {
    to = 1 - mt; pts = 2; kind = 'Euchred!'; G.stats.euchred++;
    if (h.alone) G.stats.aloneEuchred++;
    text = `${makers} called ${tName} but took only ${mk} trick${mk === 1 ? '' : 's'}. ${defenders} euchred them for 2 points.`;
  }
  G.scores[to] += pts;
  h.result = { to, pts, kind, makersTricks: mk, text };
  log(G, text, 'score');
  G.history.push({ hand: G.handNo, dealer: G.dealer, maker: h.maker, trump: h.trump, alone: h.alone, won: h.won.slice(), to, pts, kind });
  if (G.scores[to] >= G.opts.target) {
    G.phase = 'over'; G.winner = to;
    log(G, `${teamName(G, to)} reach ${G.scores[to]} and win the game.`, 'score');
  } else G.phase = 'handover';
}

export function nextHand(G) {
  if (G.phase !== 'handover') return false;
  G.dealer = nextSeat(G.dealer);
  startHand(G);
  return true;
}
