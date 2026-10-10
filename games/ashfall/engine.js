// Ashfall game engine. Pure state + functions, no DOM. Used by the browser UI and by sim.mjs.
import { makeRng } from '../../platform/rng.js';
import {
  CARDS, BASICS, KINGDOM_BY_AGE, OMENS, OMEN_POOLS, DAYS, HAND_SIZE, AGES,
  KINGDOM_PILE, KINGDOM_PICKS, WORKS, WORKS_BY_AGE, WORK_PICKS,
} from './cards.js';

export { CARDS, OMENS, DAYS, AGES, WORKS };

export function ageForDay(day) {
  return AGES.find(a => day >= a.days[0] && day <= a.days[1]) || AGES[AGES.length - 1];
}

export function newGame(seed) {
  const rng = makeRng(seed);
  const G = {
    seed: String(seed),
    rng,
    uidCounter: 0,
    day: 0,
    age: 0,
    deck: [], hand: [], discard: [], play: [], trash: [],
    actions: 0, buys: 0, coins: 0,
    relicDiscount: 0,
    supply: {},
    market: [],       // kingdom card ids currently on offer
    worksMarket: [],  // work ids currently on offer
    works: [],        // work ids owned
    omens: [],        // omen id per day, index 0 = day 1
    phase: 'setup',   // 'action' | 'buy' | 'over'
    pending: null,
    log: [],
    stats: { bought: {}, trashed: 0, cindersGained: 0 },
  };
  // Omen schedule: day 1 calm, then draws from each age's pool.
  G.omens = ['calm'];
  for (const age of AGES) {
    const need = age.days[1] - age.days[0] + 1 - (age.n === 1 ? 1 : 0);
    const pool = rng.shuffle(OMEN_POOLS[age.n]);
    G.omens.push(...pool.slice(0, need));
  }
  // Kingdom picks per age, decided up front so the whole game is seed-determined.
  G.kingdom = {};
  for (const age of AGES) G.kingdom[age.n] = rng.shuffle(KINGDOM_BY_AGE[age.n]).slice(0, KINGDOM_PICKS).sort(byCost);
  G.worksByAge = {};
  for (const age of AGES) G.worksByAge[age.n] = rng.shuffle(WORKS_BY_AGE[age.n]).slice(0, WORK_PICKS).sort((a, b) => WORKS[a].cost - WORKS[b].cost);
  for (const id of BASICS) G.supply[id] = CARDS[id].pile;
  // Starting deck: 7 Shells, 3 Totems.
  for (let i = 0; i < 7; i++) G.discard.push(mk(G, 'shell'));
  for (let i = 0; i < 3; i++) G.discard.push(mk(G, 'totem'));
  // Before Day 1 the player chooses a Founder: one free Age I card for the starting deck.
  G.phase = 'founder';
  G.founderChoices = G.kingdom[1].slice();
  return G;
}

export function chooseFounder(G, id) {
  if (G.phase !== 'founder' || !G.founderChoices.includes(id)) return false;
  G.discard.push(mk(G, id));
  G.founder = id;
  log(G, `Founder: ${CARDS[id].name} joins the island.`);
  drawCards(G, HAND_SIZE);
  startDay(G);
  return true;
}

// Deep copy of a game with a fresh RNG stream (for simulations). Only valid when nothing is pending.
export function cloneGame(G, salt) {
  if (G.pending) throw new Error('cannot clone with a pending prompt');
  const { rng, ...rest } = G;
  const copy = structuredClone(rest);
  copy.rng = makeRng(`${G.seed}:${salt}`);
  return copy;
}

function byCost(a, b) { return CARDS[a].cost - CARDS[b].cost || a.localeCompare(b); }
function mk(G, id) { return { uid: ++G.uidCounter, id }; }
function log(G, msg) { G.log.push({ day: G.day, msg }); }

export function allOwned(G) {
  return [...G.deck, ...G.hand, ...G.discard, ...G.play];
}

export function cardVp(G, card, owned = allOwned(G)) {
  const d = CARDS[card.id];
  if (d.vpFn) return d.vpFn(owned);
  return d.vp || 0;
}

export function workVp(G, id, owned = allOwned(G)) {
  const w = WORKS[id];
  return w.vpFn ? w.vpFn(owned) : (w.vp || 0);
}

export function score(G) {
  const owned = allOwned(G);
  return owned.reduce((s, c) => s + cardVp(G, c, owned), 0)
    + G.works.reduce((s, id) => s + workVp(G, id, owned), 0);
}

export function scoreBreakdown(G) {
  const owned = allOwned(G);
  const map = {};
  for (const c of owned) {
    const v = cardVp(G, c, owned);
    if (!v) continue;
    map[c.id] = map[c.id] || { id: c.id, name: CARDS[c.id].name, count: 0, vp: 0 };
    map[c.id].count++;
    map[c.id].vp += v;
  }
  for (const id of G.works) {
    const v = workVp(G, id, owned);
    if (v) map['work:' + id] = { id, name: WORKS[id].name + ' (Work)', count: 1, vp: v };
  }
  return Object.values(map).sort((a, b) => b.vp - a.vp);
}

export function currentOmen(G) { return OMENS[G.omens[G.day - 1]]; }
export function nextOmen(G) { return G.day < DAYS ? OMENS[G.omens[G.day]] : null; }

export function cardCost(G, id) {
  const d = CARDS[id];
  let c = d.cost;
  if (G.omens[G.day - 1] === 'lava') c += 1;
  if (d.types.includes('relic')) c -= G.relicDiscount;
  return Math.max(0, c);
}

export function workCost(G, id) {
  let c = WORKS[id].cost;
  if (G.omens[G.day - 1] === 'lava') c += 1;
  return c;
}

export function isShielded(G, omenId) {
  return G.works.some(w => (WORKS[w].shields || []).includes(omenId));
}

// ---------- Internal helpers exposed to card effects ----------
function drawCards(G, n) {
  const drawn = [];
  for (let i = 0; i < n; i++) {
    if (!G.deck.length) {
      if (!G.discard.length) break;
      G.deck = G.rng.shuffle(G.discard);
      G.discard = [];
      log(G, 'Shuffled the discard pile into a new deck.');
    }
    const c = G.deck.pop();
    G.hand.push(c);
    drawn.push(c);
  }
  return drawn;
}

function makeApi(G) {
  const api = {
    draw(n) { const d = drawCards(G, n); if (d.length) log(G, `Drew ${d.length} card${d.length === 1 ? '' : 's'}.`); return d; },
    actions(n) { G.actions += n; },
    buys(n) { G.buys += n; },
    coins(n) { G.coins += n; },
    gain(id, to = 'discard') {
      if (G.supply[id] !== undefined) { if (G.supply[id] <= 0) return null; G.supply[id]--; }
      const c = mk(G, id);
      G[to].push(c);
      if (id === 'cinder') G.stats.cindersGained++;
      log(G, `Gained ${CARDS[id].name}.`);
      return c;
    },
    icons(icon) { return G.play.reduce((n, c) => n + CARDS[c.id].icons.filter(i => i === icon).length, 0); },
    otherIcons(icon, self) { return api.icons(icon) - self.icons.filter(i => i === icon).length; },
    peek(n) {
      // Ensure up to n cards are on top of the deck (shuffling discard in if needed).
      if (G.deck.length < n && G.discard.length) {
        const rest = G.rng.shuffle(G.discard);
        G.discard = [];
        G.deck = [...rest, ...G.deck];
        log(G, 'Shuffled the discard pile into the deck.');
      }
      return G.deck.slice(-n).reverse();
    },
    discardFromDeck(uid) { const c = pull(G.deck, uid); if (c) { G.discard.push(c); log(G, `Discarded ${CARDS[c.id].name} from the deck.`); } },
    deckToHand(uid) { const c = pull(G.deck, uid); if (c) { G.hand.push(c); log(G, `Put ${CARDS[c.id].name} into hand.`); } },
    discardFromHand(uid) { const c = pull(G.hand, uid); if (c) { G.discard.push(c); log(G, `Discarded ${CARDS[c.id].name}.`); } return c; },
    trashFromHand(uid) { const c = pull(G.hand, uid); if (c) { G.trash.push(c); G.stats.trashed++; log(G, `Trashed ${CARDS[c.id].name}.`); } return c; },
    prompt(p) {
      const cards = p.cards.slice();
      const max = Math.min(p.max, cards.length);
      const min = Math.min(p.min, cards.length);
      if (cards.length === 0 || max === 0) { p.resolve([]); return; }
      if (min === cards.length) { p.resolve(cards.map(c => c.uid)); return; } // forced
      G.pending = { ...p, cards, min, max };
    },
  };
  return api;
}

function pull(arr, uid) {
  const i = arr.findIndex(c => c.uid === uid);
  return i >= 0 ? arr.splice(i, 1)[0] : null;
}

// ---------- Day flow ----------
function startDay(G) {
  G.day += 1;
  const age = ageForDay(G.day);
  if (age.n !== G.age) {
    G.age = age.n;
    G.market = G.kingdom[age.n].slice();
    for (const id of G.market) G.supply[id] = KINGDOM_PILE;
    G.worksMarket = G.worksByAge[age.n].slice();
    log(G, `Age ${age.n}: ${age.name}. New cards and Works reach the market.`);
  }
  G.actions = 1; G.buys = 1; G.coins = 0; G.relicDiscount = 0;
  G.play = [];
  G.phase = 'action';
  const api = makeApi(G);
  for (const id of G.works) if (WORKS[id].onDay) WORKS[id].onDay(G, api);
  const omenId = G.omens[G.day - 1];
  const omen = OMENS[omenId];
  if (isShielded(G, omenId)) {
    log(G, `Day ${G.day}. Omen: ${omen.name}, but the island is shielded.`);
  } else {
    log(G, `Day ${G.day}. Omen: ${omen.name}.`);
    if (omen.apply) omen.apply(G, api);
  }
}

export function canPlay(G, uid) {
  if (G.pending || G.phase === 'over') return false;
  const c = G.hand.find(x => x.uid === uid);
  if (!c) return false;
  const d = CARDS[c.id];
  if (d.types.includes('action')) return G.phase === 'action' && G.actions > 0;
  if (d.types.includes('treasure')) return true;
  return false;
}

export function playCard(G, uid) {
  if (!canPlay(G, uid)) return false;
  const c = pull(G.hand, uid);
  const d = CARDS[c.id];
  G.play.push(c);
  if (d.types.includes('action')) {
    G.actions -= 1;
    log(G, `Played ${d.name}.`);
    d.effect(G, makeApi(G), d);
  } else {
    G.phase = 'buy';
    G.coins += d.coin;
    log(G, `Played ${d.name} (+${d.coin}).`);
  }
  return true;
}

export function playAllTreasures(G) {
  if (G.pending || G.phase === 'over') return;
  for (const c of G.hand.slice()) if (CARDS[c.id].types.includes('treasure')) playCard(G, c.uid);
}

export function canBuy(G, id) {
  if (G.pending || G.phase === 'over') return false;
  if (!(G.supply[id] > 0)) return false;
  if (G.buys <= 0) return false;
  return G.coins >= cardCost(G, id);
}

export function buyCard(G, id) {
  if (!canBuy(G, id)) return false;
  G.phase = 'buy';
  const cost = cardCost(G, id);
  G.coins -= cost;
  G.buys -= 1;
  G.supply[id] -= 1;
  G.discard.push(mk(G, id));
  G.stats.bought[id] = (G.stats.bought[id] || 0) + 1;
  log(G, `Bought ${CARDS[id].name} for ${cost}.`);
  return true;
}

export function canBuyWork(G, id) {
  if (G.pending || G.phase === 'over') return false;
  if (!G.worksMarket.includes(id)) return false;
  if (G.buys <= 0) return false;
  return G.coins >= workCost(G, id);
}

export function buyWork(G, id) {
  if (!canBuyWork(G, id)) return false;
  G.phase = 'buy';
  const cost = workCost(G, id);
  G.coins -= cost;
  G.buys -= 1;
  G.worksMarket = G.worksMarket.filter(w => w !== id);
  G.works.push(id);
  G.stats.bought['work:' + id] = 1;
  log(G, `Built ${WORKS[id].name} for ${cost}.`);
  return true;
}

export function resolvePending(G, chosenUids) {
  const p = G.pending;
  if (!p) return false;
  const valid = chosenUids.filter(u => p.cards.some(c => c.uid === u));
  if (valid.length < p.min || valid.length > p.max) return false;
  G.pending = null;
  p.resolve(valid);
  return true;
}

export function endDay(G) {
  if (G.pending || G.phase === 'over') return false;
  G.discard.push(...G.hand, ...G.play);
  G.hand = []; G.play = [];
  if (G.day >= DAYS) {
    G.phase = 'over';
    G.final = score(G);
    log(G, `The mountain falls silent. Final score: ${G.final}.`);
    return true;
  }
  const upcoming = G.omens[G.day]; // next day's omen
  drawCards(G, upcoming === 'smoke' && !isShielded(G, 'smoke') ? HAND_SIZE - 1 : HAND_SIZE);
  startDay(G);
  return true;
}

// ---------- Ratings ----------
// Every seed has a "par": the score of the best simple bot on that exact seed (see bots.js).
// Ratings are relative to par so a cruel Omen schedule or a thin market is not held against you.
export const RATINGS = [
  { diff: 10, name: 'Legend of the Mountain', blurb: 'The island remembers your name. Nothing more could have been saved.' },
  { diff: 4, name: 'Saved the Island', blurb: 'Boats full, relics aboard. The rival captains could only watch.' },
  { diff: 0, name: 'Survivors', blurb: 'You matched the best of the captains. The ash took its share, but the island lives.' },
  { diff: -8, name: 'Scattered', blurb: 'A few boats escaped with trinkets. The rival captains did better.' },
  { diff: -Infinity, name: 'Lost to the Ash', blurb: 'The mountain won. Try buying your engine before the Age ends.' },
];

export function rating(sc, par) {
  return RATINGS.find(r => sc - par >= r.diff);
}
