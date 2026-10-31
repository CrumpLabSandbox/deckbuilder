// Fox in the Forest, party variant for 4-5 players. One suit per player, ranks 1-11,
// ten cards each, rounds = number of players. DOM-free engine.
import { makeRng } from '../../platform/rng.js';

export const ALL_SUITS = ['B', 'K', 'M', 'A', 'S'];
export const SUIT_INFO = {
  B: { name: 'Bells', one: 'bell', glyph: '🔔', cls: 'bells' },
  K: { name: 'Keys', one: 'key', glyph: '🗝️', cls: 'keys' },
  M: { name: 'Moons', one: 'moon', glyph: '🌙', cls: 'moons' },
  A: { name: 'Acorns', one: 'acorn', glyph: '🌰', cls: 'acorns' },
  S: { name: 'Stars', one: 'star', glyph: '⭐', cls: 'stars' },
};
export const ABILITY = {
  1: { name: 'Swan', icon: '🦢', text: 'If you play this and lose the trick, you lead the next trick. If two Swans lose, the first one played leads.' },
  3: { name: 'Fox', icon: '🦊', text: 'When you play this, you may exchange the decree card with a card from your hand.' },
  5: { name: 'Woodcutter', icon: '🪓', text: 'When you play this, draw 1 card, then put any 1 card from your hand on the bottom of the deck.' },
  7: { name: 'Treasure', icon: '💎', text: 'The winner of the trick gets 1 point for each 7 in the trick.' },
  9: { name: 'Witch', icon: '🧙', text: 'If this is the only 9 in the trick, it counts as a trump.' },
  11: { name: 'Monarch', icon: '👑', text: 'When you lead this, every other player who has this suit must play the 1 or their highest card of it.' },
};
// Bands for ten tricks shared by several players. Tuned by sim.mjs.
export const BANDS = {
  4: [{ name: 'Humble', from: 0, to: 1, pts: 6 }, { name: 'Defeated', from: 2, to: 2, pts: 2 }, { name: 'Victorious', from: 3, to: 5, pts: 6 }, { name: 'Greedy', from: 6, to: 10, pts: 0 }],
  5: [{ name: 'Humble', from: 0, to: 0, pts: 6 }, { name: 'Defeated', from: 1, to: 1, pts: 1 }, { name: 'Defeated', from: 2, to: 2, pts: 2 }, { name: 'Victorious', from: 3, to: 4, pts: 6 }, { name: 'Greedy', from: 5, to: 10, pts: 0 }],
};
export const DEFAULTS = { handSize: 10, bands: null, rounds: null };

export const bandFor = (G, t) => G.bands.find((b) => t >= b.from && t <= b.to) || G.bands[G.bands.length - 1];
export const cardName = (c) => `${c.rank} of ${SUIT_INFO[c.suit].name}${ABILITY[c.rank] ? ` (${ABILITY[c.rank].name})` : ''}`;
export const short = (c) => `${c.rank}${SUIT_INFO[c.suit].glyph}`;

function log(G, msg, kind = 'info') { G.log.push({ round: G.round, msg, kind }); }
const nm = (G, p) => G.players[p].name;
const isYou = (G, p) => G.players[p].name === 'You';
const vb = (G, p, v) => (isYou(G, p) ? v.replace(/es\b/, 'e').replace(/s\b/, '') : v);
const say = (G, p, v) => `${nm(G, p)} ${vb(G, p, v)}`;
export const nextSeat = (G, p) => (p + 1) % G.n;

export function newGame({ seed, players, options = {} }) {
  const n = players.length;
  const opts = { ...DEFAULTS, ...options };
  const G = {
    seed: String(seed), rng: makeRng(seed), opts, n,
    suits: ALL_SUITS.slice(0, n),
    bands: opts.bands || BANDS[n] || BANDS[4],
    rounds: opts.rounds || n,
    players: players.map((s, i) => ({ idx: i, name: s.name || `Player ${i + 1}`, kind: s.kind || 'bot', level: s.level || 'normal', hand: [], tricks: 0, treasure: 0, score: 0 })),
    round: 0, dealer: 0, decree: null, deck: [], trick: null, turn: 0, phase: 'play', pending: null, lastTrick: null,
    played: [], voids: [], known: [], bottomed: [], plans: [], log: [], history: [], winners: null,
  };
  G.dealer = G.rng.int(n);
  startRound(G);
  return G;
}

function startRound(G) {
  G.round++;
  let uid = 0;
  const all = [];
  for (const s of G.suits) for (let r = 1; r <= 11; r++) all.push({ uid: ++uid, suit: s, rank: r });
  const deck = G.rng.shuffle(all);
  for (const p of G.players) { p.hand = deck.splice(0, G.opts.handSize); p.tricks = 0; p.treasure = 0; }
  G.decree = deck.pop();
  G.deck = deck;
  G.played = [];
  G.voids = G.players.map(() => []); G.known = G.players.map(() => []); G.bottomed = G.players.map(() => []); G.plans = G.players.map(() => null);
  const leader = nextSeat(G, G.dealer);
  G.trick = { leader, cards: [] };
  G.turn = leader; G.phase = 'play'; G.pending = null; G.lastTrick = null;
  log(G, `Round ${G.round} of ${G.rounds}. ${say(G, G.dealer, 'deals')}. The decree is the ${cardName(G.decree)}: ${SUIT_INFO[G.decree.suit].name} are trump.`, 'head');
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
    const high = follow.reduce((a, b) => (b.rank > a.rank ? b : a));
    return follow.filter((c) => c.rank === 1 || c === high);
  }
  return follow;
}
export const isLegal = (G, p, uid) => legalCards(G, p).some((c) => c.uid === uid);

export function trickWinner(cards, trump) {
  const nines = cards.filter((e) => e.card.rank === 9).length;
  const asTrump = (e) => e.card.suit === trump || (e.card.rank === 9 && nines === 1);
  const ts = cards.filter(asTrump);
  if (ts.length) {
    const w = ts.reduce((a, b) => (b.card.rank > a.card.rank ? b : a));
    const witch = w.card.rank === 9 && w.card.suit !== trump;
    return { entry: w, why: witch ? 'the Witch counts as trump' : ts.length > 1 ? 'it is the highest trump' : `trump (${SUIT_INFO[trump].name}) beats the other suits` };
  }
  const led = cards[0].card.suit;
  const w = cards.filter((e) => e.card.suit === led).reduce((a, b) => (b.card.rank > a.card.rank ? b : a));
  return { entry: w, why: `it is the highest ${SUIT_INFO[led].one} and no trump was played` };
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

export function foxSwap(G, uid) {
  if (G.phase !== 'fox') return false;
  const p = G.pending.p, hand = G.players[p].hand;
  if (uid !== null) {
    const i = hand.findIndex((c) => c.uid === uid);
    if (i < 0) return false;
    const old = G.decree;
    G.decree = hand[i]; hand[i] = old;
    G.known[p].push(old.uid);
    log(G, `${say(G, p, 'swaps')} the decree: the ${cardName(G.decree)} makes ${SUIT_INFO[G.decree.suit].name} trump.`, 'decree');
  } else log(G, `${say(G, p, 'keeps')} the decree as it is.`);
  G.pending = null;
  advance(G);
  return true;
}

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
  if (G.trick.cards.length < G.n) { G.turn = nextSeat(G, G.turn); return; }
  const { entry: w, why } = trickWinner(G.trick.cards, trumpSuit(G));
  const sevens = G.trick.cards.filter((e) => e.card.rank === 7).length;
  G.players[w.p].tricks++;
  G.players[w.p].treasure += sevens;
  const swan = G.trick.cards.find((e) => e.card.rank === 1 && e.p !== w.p);
  const next = swan ? swan.p : w.p;
  G.lastTrick = { cards: G.trick.cards.slice(), winner: w.p, why, sevens, next, swan: !!swan };
  G.phase = 'trickdone';
  let msg = `${say(G, w.p, 'wins')} the trick with the ${short(w.card)}: ${why}.`;
  if (sevens) msg += ` ${sevens} Treasure to ${nm(G, w.p)}.`;
  if (swan) msg += ` ${nm(G, swan.p)} lost with the Swan and leads next.`;
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
    const b = bandFor(G, p.tricks), pts = b.pts + p.treasure;
    p.score += pts;
    return { tricks: p.tricks, band: b.name, base: b.pts, treasure: p.treasure, pts };
  });
  G.history.push(row);
  log(G, `Round ${G.round}: ` + G.players.map((p, i) => `${p.name} ${row[i].tricks} tricks (${row[i].band}) +${row[i].pts}`).join(', ') + '.', 'score');
  if (G.round >= G.rounds) {
    const top = Math.max(...G.players.map((p) => p.score));
    G.winners = G.players.filter((p) => p.score === top).map((p) => p.idx);
    G.phase = 'over';
    log(G, `${G.winners.map((i) => G.players[i].name).join(' and ')} win${G.winners.length === 1 && !isYou(G, G.winners[0]) ? 's' : ''} with ${top}.`, 'score');
  } else G.phase = 'roundover';
}

export function nextRound(G) {
  if (G.phase !== 'roundover') return false;
  G.dealer = nextSeat(G, G.dealer);
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
