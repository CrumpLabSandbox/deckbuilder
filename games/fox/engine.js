// The Fox in the Forest (two-player trick-taking). DOM-free engine.
import { makeRng } from '../../platform/rng.js';

export const SUITS = ['B', 'K', 'M'];
export const SUIT_INFO = {
  B: { name: 'Bells', one: 'bell', glyph: '🔔', cls: 'bells' },
  K: { name: 'Keys', one: 'key', glyph: '🗝️', cls: 'keys' },
  M: { name: 'Moons', one: 'moon', glyph: '🌙', cls: 'moons' },
};
export const ABILITY = {
  1: { name: 'Swan', icon: '🦢', text: 'If you play this and lose the trick, you lead the next trick.' },
  3: { name: 'Fox', icon: '🦊', text: 'When you play this, you may exchange the decree card with a card from your hand.' },
  5: { name: 'Woodcutter', icon: '🪓', text: 'When you play this, draw 1 card, then put any 1 card from your hand on the bottom of the deck.' },
  7: { name: 'Treasure', icon: '💎', text: 'The winner of the trick gets 1 point for each 7 in the trick.' },
  9: { name: 'Witch', icon: '🧙', text: 'If this is the only 9 in the trick, it counts as a trump.' },
  11: { name: 'Monarch', icon: '👑', text: 'When you lead this, your opponent must play the 1 or their highest card of this suit, if they have that suit.' },
};
export const DEFAULTS = { target: 21, handSize: 13 };
export const BANDS = [
  { name: 'Humble', from: 0, to: 3, pts: 6 },
  { name: 'Defeated', from: 4, to: 4, pts: 1 },
  { name: 'Defeated', from: 5, to: 5, pts: 2 },
  { name: 'Defeated', from: 6, to: 6, pts: 3 },
  { name: 'Victorious', from: 7, to: 9, pts: 6 },
  { name: 'Greedy', from: 10, to: 13, pts: 0 },
];
export function roundPoints(t) { return BANDS.find((b) => t >= b.from && t <= b.to).pts; }
export function bandName(t) { return BANDS.find((b) => t >= b.from && t <= b.to).name; }
export const cardName = (c) => `${c.rank} of ${SUIT_INFO[c.suit].name}${ABILITY[c.rank] ? ` (${ABILITY[c.rank].name})` : ''}`;
export const short = (c) => `${c.rank}${SUIT_INFO[c.suit].glyph}`;
export const other = (p) => 1 - p;

function log(G, msg, kind = 'info') { G.log.push({ round: G.round, msg, kind }); }
const nm = (G, p) => G.players[p].name;
const isYou = (G, p) => G.players[p].name === 'You';
const vb = (G, p, v) => (isYou(G, p) ? v.replace(/es\b/, 'e').replace(/s\b/, '') : v);
const say = (G, p, v) => `${nm(G, p)} ${vb(G, p, v)}`;

export function newGame({ seed, players, options = {} }) {
  const G = {
    seed: String(seed), rng: makeRng(seed), opts: { ...DEFAULTS, ...options },
    players: players.map((s, i) => ({ idx: i, name: s.name || `Player ${i + 1}`, kind: s.kind || 'bot', level: s.level || 'normal', hand: [], tricks: 0, treasure: 0, score: 0 })),
    round: 0, dealer: 0, decree: null, deck: [], trick: null, turn: 0, phase: 'play', pending: null, lastTrick: null,
    played: [], voids: [[], []], known: [[], []], bottomed: [[], []], plans: [null, null], log: [], history: [], winner: null,
  };
  G.dealer = G.rng.int(2);
  startRound(G);
  return G;
}

function startRound(G) {
  G.round++;
  let uid = 0;
  const all = [];
  for (const s of SUITS) for (let r = 1; r <= 11; r++) all.push({ uid: ++uid, suit: s, rank: r });
  const deck = G.rng.shuffle(all);
  for (const p of G.players) { p.hand = deck.splice(0, G.opts.handSize); p.tricks = 0; p.treasure = 0; }
  G.decree = deck.pop();
  G.deck = deck;
  G.played = []; G.voids = [[], []]; G.known = [[], []]; G.bottomed = [[], []]; G.plans = [null, null];
  const leader = other(G.dealer);
  G.trick = { leader, cards: [] };
  G.turn = leader; G.phase = 'play'; G.pending = null; G.lastTrick = null;
  log(G, `Round ${G.round}. ${say(G, G.dealer, 'deals')}. The decree card is the ${cardName(G.decree)}: ${SUIT_INFO[G.decree.suit].name} are trump. ${nm(G, leader)} lead${isYou(G, leader) ? '' : 's'} first.`, 'head');
}

export const trumpSuit = (G) => G.decree.suit;
export function actor(G) {
  if (G.phase === 'play') return G.turn;
  if (G.phase === 'fox' || G.phase === 'woodcut') return G.pending.p;
  return null;
}

export function legalCards(G, p) {
  const hand = G.players[p].hand, cards = G.trick.cards;
  if (!cards.length) return hand.slice();
  const led = cards[0].card;
  const follow = hand.filter((c) => c.suit === led.suit);
  if (!follow.length) return hand.slice();
  if (led.rank === 11) {
    // Monarch: the 1 of the suit or the highest card of the suit.
    const high = follow.reduce((a, b) => (b.rank > a.rank ? b : a));
    return follow.filter((c) => c.rank === 1 || c === high);
  }
  return follow;
}
export const isLegal = (G, p, uid) => legalCards(G, p).some((c) => c.uid === uid);

// Winner of a (one- or two-card) trick and why.
export function trickWinner(cards, trump) {
  const nines = cards.filter((e) => e.card.rank === 9).length;
  const asTrump = (e) => e.card.suit === trump || (e.card.rank === 9 && nines === 1);
  const ts = cards.filter(asTrump);
  if (ts.length) {
    const w = ts.reduce((a, b) => (b.card.rank > a.card.rank ? b : a));
    const witch = w.card.rank === 9 && w.card.suit !== trump;
    return { entry: w, why: witch ? 'the Witch counts as trump' : ts.length === 2 ? 'it is the higher trump' : `trump (${SUIT_INFO[trump].name}) beats the other suits` };
  }
  const led = cards[0].card.suit;
  const w = cards.filter((e) => e.card.suit === led).reduce((a, b) => (b.card.rank > a.card.rank ? b : a));
  return { entry: w, why: cards.length > 1 && cards[1].card.suit !== led ? `the other card didn't follow ${SUIT_INFO[led].name.toLowerCase()} or play trump` : `it is the higher ${SUIT_INFO[led].one}` };
}

export function playCard(G, uid) {
  if (G.phase !== 'play') return false;
  const p = G.turn;
  if (!isLegal(G, p, uid)) return false;
  const hand = G.players[p].hand;
  const card = hand.splice(hand.findIndex((c) => c.uid === uid), 1)[0];
  const tr = G.trick;
  if (tr.cards.length && card.suit !== tr.cards[0].card.suit && !G.voids[p].includes(tr.cards[0].card.suit)) G.voids[p].push(tr.cards[0].card.suit);
  tr.cards.push({ p, card });
  G.played.push(card);
  G.known[p] = G.known[p].filter((u) => u !== card.uid);
  log(G, `${say(G, p, tr.cards.length === 1 ? 'leads' : 'plays')} the ${cardName(card)}.`);
  if (card.rank === 3 && hand.length) { G.phase = 'fox'; G.pending = { p }; return true; }
  if (card.rank === 5 && G.deck.length) {
    const drawn = G.deck.pop();
    hand.push(drawn);
    G.phase = 'woodcut'; G.pending = { p, drawn };
    log(G, `${say(G, p, 'draws')} a card for the Woodcutter.`);
    return true;
  }
  advance(G);
  return true;
}

// Fox: swap the decree card with a hand card (uid), or keep it (null).
export function foxSwap(G, uid) {
  if (G.phase !== 'fox') return false;
  const p = G.pending.p, hand = G.players[p].hand;
  if (uid !== null) {
    const i = hand.findIndex((c) => c.uid === uid);
    if (i < 0) return false;
    const old = G.decree;
    G.decree = hand[i];
    hand[i] = old;
    G.known[p].push(old.uid); // everyone saw the old decree go into this hand
    log(G, `${say(G, p, 'swaps')} the decree: the ${cardName(G.decree)} is the new decree, so ${SUIT_INFO[G.decree.suit].name} are trump.`, 'decree');
  } else log(G, `${say(G, p, 'keeps')} the decree as it is.`);
  G.pending = null;
  advance(G);
  return true;
}

// Woodcutter: put one hand card on the bottom of the deck.
export function woodcut(G, uid) {
  if (G.phase !== 'woodcut') return false;
  const p = G.pending.p, hand = G.players[p].hand;
  const i = hand.findIndex((c) => c.uid === uid);
  if (i < 0) return false;
  const c = hand.splice(i, 1)[0];
  G.deck.unshift(c);
  G.bottomed[p].push(c.uid);
  G.known[p] = G.known[p].filter((u) => u !== c.uid);
  log(G, `${say(G, p, 'puts')} a card on the bottom of the deck.`);
  G.pending = null;
  advance(G);
  return true;
}

function advance(G) {
  G.phase = 'play';
  if (G.trick.cards.length < 2) { G.turn = other(G.turn); return; }
  const { entry: w, why } = trickWinner(G.trick.cards, trumpSuit(G));
  const loser = other(w.p);
  const loserCard = G.trick.cards.find((e) => e.p === loser).card;
  const sevens = G.trick.cards.filter((e) => e.card.rank === 7).length;
  G.players[w.p].tricks++;
  G.players[w.p].treasure += sevens;
  const next = loserCard.rank === 1 ? loser : w.p;
  G.lastTrick = { cards: G.trick.cards.slice(), winner: w.p, why, sevens, next, swan: loserCard.rank === 1 };
  G.phase = 'trickdone';
  let msg = `${say(G, w.p, 'wins')} the trick with the ${short(w.card)}: ${why}.`;
  if (sevens) msg += ` ${sevens} Treasure ${sevens === 1 ? 'point' : 'points'} to ${nm(G, w.p)}.`;
  if (loserCard.rank === 1) msg += ` ${nm(G, loser)} played the Swan and lost, so ${isYou(G, loser) ? 'you lead' : nm(G, loser) + ' leads'} next.`;
  log(G, msg, 'trick');
}

export function collect(G) {
  if (G.phase !== 'trickdone') return false;
  if (!G.players[0].hand.length) { scoreRound(G); return true; }
  G.trick = { leader: G.lastTrick.next, cards: [] };
  G.turn = G.lastTrick.next;
  G.phase = 'play';
  return true;
}

function scoreRound(G) {
  const row = G.players.map((p) => {
    const base = roundPoints(p.tricks), pts = base + p.treasure;
    p.score += pts;
    return { tricks: p.tricks, band: bandName(p.tricks), base, treasure: p.treasure, pts };
  });
  G.history.push(row);
  for (const p of G.players) {
    const r = row[p.idx];
    log(G, `${p.name}: ${r.tricks} tricks (${r.band}) ${r.base}${r.treasure ? ` + ${r.treasure} treasure` : ''} = ${r.pts}.`, 'score');
  }
  const [a, b] = G.players.map((p) => p.score);
  if (Math.max(a, b) >= G.opts.target && a !== b) {
    G.winner = a > b ? 0 : 1;
    G.phase = 'over';
    log(G, `${nm(G, G.winner)} win${isYou(G, G.winner) ? '' : 's'} the game, ${Math.max(a, b)} to ${Math.min(a, b)}.`, 'score');
  } else {
    if (Math.max(a, b) >= G.opts.target) log(G, 'Tied at the finish, so another round decides it.', 'score');
    G.phase = 'roundover';
  }
}

export function nextRound(G) {
  if (G.phase !== 'roundover') return false;
  G.dealer = other(G.dealer);
  startRound(G);
  return true;
}

export function cloneGame(G, salt) {
  const { rng, log: _l, history: _h, ...rest } = G;
  const C = structuredClone(rest);
  C.log = []; C.history = [];
  C.rng = makeRng(`${G.seed}:${salt}`);
  return C;
}
