// Blackjack: players against the dealer, standard casino rules. DOM-free engine.
import { makeRng } from '../../platform/rng.js';

export const SUITS = ['S', 'H', 'D', 'C'];
export const SUIT_INFO = { S: { glyph: '♠', red: false }, H: { glyph: '♥', red: true }, D: { glyph: '♦', red: true }, C: { glyph: '♣', red: false } };
export const rankName = (r) => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[r] || String(r);
export const cardValue = (c) => (c.rank === 1 ? 11 : Math.min(10, c.rank));
export const DEFAULTS = { decks: 6, h17: false, surrender: true, das: true, maxHands: 4, minBet: 10, maxBet: 500, bankroll: 1000, penetration: 0.75 };

export function total(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { t += cardValue(c); if (c.rank === 1) aces++; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { t, soft: aces > 0 && t <= 21 };
}
export const isNatural = (h) => h.cards.length === 2 && !h.fromSplit && total(h.cards).t === 21;

function log(G, msg, kind = 'info') { G.log.push({ round: G.round, msg, kind }); if (G.log.length > 400) G.log.splice(0, G.log.length - 400); }

export function newGame({ seed, players, options = {} }) {
  const opts = { ...DEFAULTS, ...options };
  const G = {
    seed: String(seed), rng: makeRng(seed), opts, round: 0, log: [], phase: 'betting',
    shoe: [], cut: 0, uid: 0, dealer: { cards: [], hidden: true },
    players: players.map((s, i) => ({ idx: i, name: s.name || `Seat ${i + 1}`, kind: s.kind || 'human', bank: opts.bankroll, bet: s.kind === 'bot' ? opts.minBet * 2 : opts.minBet, hands: [], insurance: null, net: 0 })),
    turn: null, stats: { hands: 0, wagered: 0, net: 0 }, count: 0,
  };
  shuffle(G);
  return G;
}

function shuffle(G) {
  const cards = [];
  for (let d = 0; d < G.opts.decks; d++) for (const s of SUITS) for (let r = 1; r <= 13; r++) cards.push({ uid: ++G.uid, suit: s, rank: r });
  G.shoe = G.rng.shuffle(cards);
  G.cut = Math.floor(cards.length * (1 - G.opts.penetration));
  G.count = 0;
  log(G, `The dealer shuffles ${G.opts.decks} deck${G.opts.decks === 1 ? '' : 's'} into the shoe.`, 'shuffle');
}
// Hi-Lo running count, for players who want to watch it.
function seen(G, c) { const v = cardValue(c); if (v <= 6) G.count++; else if (v >= 10) G.count--; }
function draw(G, faceUp = true) { if (!G.shoe.length) shuffle(G); const c = G.shoe.pop(); if (faceUp) seen(G, c); return c; }
export const trueCount = (G) => G.count / Math.max(0.5, G.shoe.length / 52);

// ---------- betting ----------
export function setBet(G, p, amount) {
  if (G.phase !== 'betting') return false;
  const pl = G.players[p];
  pl.bet = Math.max(0, Math.min(Math.floor(amount), G.opts.maxBet, pl.bank));
  return true;
}
export const bettors = (G) => G.players.filter((p) => p.bet >= G.opts.minBet && p.bank >= p.bet);

export function deal(G) {
  if (G.phase !== 'betting' || !bettors(G).length) return false;
  if (G.shoe.length < G.cut) shuffle(G);
  G.round++;
  G.dealer = { cards: [], hidden: true };
  for (const pl of G.players) {
    pl.hands = []; pl.insurance = null; pl.net = 0;
    if (pl.bet >= G.opts.minBet && pl.bank >= pl.bet) {
      pl.bank -= pl.bet;
      pl.hands.push({ cards: [], bet: pl.bet, done: false, doubled: false, fromSplit: false, surrendered: false, result: null, payout: 0 });
      G.stats.wagered += pl.bet;
    }
  }
  const active = G.players.filter((p) => p.hands.length);
  for (let k = 0; k < 2; k++) {
    for (const pl of active) pl.hands[0].cards.push(draw(G));
    G.dealer.cards.push(draw(G, k === 0));
  }
  log(G, `Round ${G.round}. The dealer shows ${rankName(G.dealer.cards[0].rank)}.`, 'head');
  if (G.dealer.cards[0].rank === 1) {
    G.phase = 'insurance';
    log(G, 'Dealer shows an ace: insurance is offered.', 'info');
    return true;
  }
  afterInsurance(G);
  return true;
}

export const dealerUpTen = (G) => cardValue(G.dealer.cards[0]) === 10;
export function needsInsurance(G) { return G.players.filter((p) => p.hands.length && p.insurance === null); }
export function insure(G, p, yes) {
  if (G.phase !== 'insurance') return false;
  const pl = G.players[p];
  if (!pl.hands.length || pl.insurance !== null) return false;
  const cost = Math.floor(pl.hands[0].bet / 2);
  if (yes && pl.bank >= cost) { pl.bank -= cost; pl.insurance = cost; log(G, `${pl.name} take${pl.name === 'You' ? '' : 's'} insurance for ${cost}.`); }
  else pl.insurance = 0;
  if (!needsInsurance(G).length) afterInsurance(G);
  return true;
}

function afterInsurance(G) {
  const up = G.dealer.cards[0];
  const peek = up.rank === 1 || cardValue(up) === 10;
  const dealerBJ = total(G.dealer.cards).t === 21;
  if (peek && dealerBJ) {
    G.dealer.hidden = false; seen(G, G.dealer.cards[1]);
    log(G, 'The dealer checks and has blackjack.', 'dlr');
    for (const pl of G.players) {
      if (pl.insurance) { pl.bank += pl.insurance * 3; pl.net += pl.insurance * 2; log(G, `${pl.name}'s insurance pays ${pl.insurance * 2}.`, 'win'); }
    }
    return settle(G);
  }
  if (peek) log(G, 'The dealer checks for blackjack: no blackjack.', 'dlr');
  for (const pl of G.players) {
    if (pl.insurance) { pl.net -= pl.insurance; log(G, `${pl.name} lose${pl.name === 'You' ? '' : 's'} the insurance bet.`, 'lose'); }
    const h = pl.hands[0];
    if (h && isNatural(h)) {
      const pay = Math.floor(h.bet * 1.5);
      pl.bank += h.bet + pay; pl.net += pay; h.result = 'blackjack'; h.payout = pay; h.done = true;
      log(G, `${pl.name} ${pl.name === 'You' ? 'have' : 'has'} blackjack! Paid ${pay} (3 to 2).`, 'win');
    }
  }
  G.phase = 'play';
  G.turn = null;
  advance(G);
}

// ---------- playing ----------
export function current(G) {
  if (G.phase !== 'play' || !G.turn) return null;
  const pl = G.players[G.turn.p];
  return { pl, h: pl.hands[G.turn.h] };
}
function advance(G) {
  for (const pl of G.players) for (let i = 0; i < pl.hands.length; i++) {
    const h = pl.hands[i];
    if (!h.done) {
      if (total(h.cards).t >= 21 || (h.splitAces && h.cards.length >= 2)) { h.done = true; continue; }
      G.turn = { p: pl.idx, h: i };
      return;
    }
  }
  G.turn = null;
  G.phase = 'dealer';
  G.dealer.hidden = false; seen(G, G.dealer.cards[1]);
  const live = G.players.some((p) => p.hands.some((h) => !h.result && total(h.cards).t <= 21 && !h.surrendered));
  log(G, `The dealer turns over ${rankName(G.dealer.cards[1].rank)}: ${describeTotal(G.dealer.cards)}.`, 'dlr');
  if (!live) G.dealer.done = true;
}
export function legal(G) {
  const c = current(G);
  if (!c) return {};
  const { pl, h } = c, two = h.cards.length === 2;
  const sameValue = two && cardValue(h.cards[0]) === cardValue(h.cards[1]);
  return {
    hit: true, stand: true,
    double: two && pl.bank >= h.bet && (!h.fromSplit || G.opts.das) && !h.splitAces,
    split: sameValue && pl.bank >= h.bet && pl.hands.length < G.opts.maxHands && !h.splitAces,
    surrender: G.opts.surrender && two && !h.fromSplit && pl.hands.length === 1,
  };
}
export function act(G, action) {
  const c = current(G);
  if (!c || !legal(G)[action]) return false;
  const { pl, h } = c, who = pl.name === 'You' ? 'You' : pl.name, s = pl.name === 'You' ? '' : 's';
  if (action === 'hit') {
    const card = draw(G); h.cards.push(card);
    const tt = total(h.cards);
    log(G, `${who} hit${s}: ${rankName(card.rank)} → ${describeTotal(h.cards)}.`);
    if (tt.t > 21) { h.done = true; h.result = 'bust'; pl.net -= h.bet; log(G, `${who} bust${pl.name === 'You' ? '' : 's'} and lose${s} ${h.bet}.`, 'lose'); }
    else if (tt.t === 21) h.done = true;
  } else if (action === 'stand') {
    h.done = true; log(G, `${who} stand${s} on ${describeTotal(h.cards)}.`);
  } else if (action === 'double') {
    pl.bank -= h.bet; G.stats.wagered += h.bet; h.bet *= 2; h.doubled = true;
    const card = draw(G); h.cards.push(card); h.done = true;
    log(G, `${who} double${s} down to ${h.bet} and draw${s} ${rankName(card.rank)} → ${describeTotal(h.cards)}.`);
    if (total(h.cards).t > 21) { h.result = 'bust'; pl.net -= h.bet; log(G, `${who} bust${pl.name === 'You' ? '' : 's'} and lose${s} ${h.bet}.`, 'lose'); }
  } else if (action === 'split') {
    pl.bank -= h.bet; G.stats.wagered += h.bet;
    const aces = h.cards[0].rank === 1;
    const second = { cards: [h.cards.pop()], bet: h.bet, done: false, doubled: false, fromSplit: true, splitAces: aces, surrendered: false, result: null, payout: 0 };
    h.fromSplit = true; h.splitAces = aces;
    h.cards.push(draw(G)); second.cards.push(draw(G));
    pl.hands.splice(G.turn.h + 1, 0, second);
    log(G, `${who} split${s}${aces ? ' aces (one card each)' : ''}.`);
    if (aces) { h.done = true; second.done = true; }
  } else if (action === 'surrender') {
    h.done = true; h.surrendered = true; h.result = 'surrender';
    const back = Math.floor(h.bet / 2); pl.bank += back; pl.net -= h.bet - back; h.payout = -(h.bet - back);
    log(G, `${who} surrender${s}, getting back ${back}.`, 'lose');
  }
  if (h.done) advance(G);
  return true;
}

// ---------- dealer ----------
export function dealerShouldHit(G) {
  const t = total(G.dealer.cards);
  return t.t < 17 || (G.opts.h17 && t.t === 17 && t.soft);
}
export function dealerStep(G) {
  if (G.phase !== 'dealer') return false;
  if (!G.dealer.done && dealerShouldHit(G)) {
    const c = draw(G); G.dealer.cards.push(c);
    log(G, `The dealer draws ${rankName(c.rank)} → ${describeTotal(G.dealer.cards)}.`, 'dlr');
    return true;
  }
  return settle(G);
}

function settle(G) {
  const d = total(G.dealer.cards), dBJ = G.dealer.cards.length === 2 && d.t === 21;
  if (G.phase === 'dealer' && !G.dealer.done) log(G, d.t > 21 ? `The dealer busts with ${d.t}.` : `The dealer stands on ${d.t}.`, 'dlr');
  for (const pl of G.players) for (const h of pl.hands) {
    G.stats.hands++;
    if (h.result) continue;
    const t = total(h.cards).t, who = pl.name, verb = pl.name === 'You' ? '' : 's';
    if (dBJ) {
      if (isNatural(h)) { pl.bank += h.bet; h.result = 'push'; log(G, `${who} push${pl.name === 'You' ? '' : 'es'} with blackjack.`); }
      else { h.result = 'lose'; pl.net -= h.bet; h.payout = -h.bet; log(G, `${who} lose${verb} ${h.bet} to the dealer's blackjack.`, 'lose'); }
    } else if (d.t > 21 || t > d.t) { pl.bank += 2 * h.bet; pl.net += h.bet; h.result = 'win'; h.payout = h.bet; log(G, `${who} win${verb} ${h.bet} with ${t}.`, 'win'); }
    else if (t === d.t) { pl.bank += h.bet; h.result = 'push'; log(G, `${who} push${pl.name === 'You' ? '' : 'es'} at ${t}.`); }
    else { h.result = 'lose'; pl.net -= h.bet; h.payout = -h.bet; log(G, `${who} lose${verb} ${h.bet} (${t} against ${d.t}).`, 'lose'); }
  }
  for (const pl of G.players) G.stats.net += pl.net;
  G.dealer.hidden = false;
  G.phase = 'settled';
  return true;
}
export function nextRound(G) {
  if (G.phase !== 'settled') return false;
  G.phase = 'betting';
  for (const pl of G.players) { pl.hands = []; pl.insurance = null; }
  G.dealer = { cards: [], hidden: true };
  return true;
}
export function rebuy(G, p) { if (G.phase !== 'betting' && G.phase !== 'settled') return false; G.players[p].bank += G.opts.bankroll; log(G, `${G.players[p].name} buy${G.players[p].name === 'You' ? '' : 's'} another ${G.opts.bankroll} in chips.`); return true; }

export function describeTotal(cards) {
  const t = total(cards);
  if (cards.length === 2 && t.t === 21) return 'blackjack';
  return t.t > 21 ? `bust (${t.t})` : t.soft ? `soft ${t.t}` : `${t.t}`;
}
