// Tenure game engine: multi-player, DOM-free. Used by the browser UI, the bots and sim.mjs.
import { makeRng } from '../../platform/rng.js';
import {
  CARDS, BASICS, ERA_DECKS, COPIES, HONORS, HONOR_BY_ID, ROLES, TRACKS, TRACK_INFO,
  HAND_SIZE, MAX_YEARS, HONORS_TO_WIN, ROW_SIZE, ERA_YEARS,
} from './cards.js';

export const DEMAND_MAX_TARGETS = 2;
export { CARDS, HONORS, HONOR_BY_ID, ROLES, TRACKS, TRACK_INFO, MAX_YEARS, HONORS_TO_WIN, BASICS };

function mk(G, id) { return { uid: ++G.uidCounter, id }; }
function log(G, msg) { G.log.push({ year: G.year, player: G.turn, msg }); }
function pull(arr, uid) { const i = arr.findIndex(c => c.uid === uid); return i >= 0 ? arr.splice(i, 1)[0] : null; }

export function newGame({ seed, players }) {
  const rng = makeRng(seed);
  const G = {
    seed: String(seed), rng, uidCounter: 0,
    year: 0, turn: -1, turnCount: 0,
    players: [], row: [], eraDecks: {}, era: 1,
    supply: {}, honors: {}, finalRound: false, phase: 'main', pending: null, log: [], winner: null, endReason: null,
    ts: null, // per-turn state
  };
  for (const id of BASICS) G.supply[id] = 12;
  for (const h of HONORS) G.honors[h.id] = null;
  for (const e of [1, 2, 3]) {
    const cards = [];
    for (const id of ERA_DECKS[e]) for (let i = 0; i < COPIES; i++) cards.push(mk(G, id));
    G.eraDecks[e] = rng.shuffle(cards);
  }
  players.forEach((spec, idx) => {
    const role = ROLES[spec.role];
    const p = {
      idx, name: spec.name || role.name, roleId: spec.role, role, kind: spec.kind || 'bot', strategy: spec.strategy || null,
      deck: [], hand: [], discard: [], play: [], cv: [], trash: [],
      points: { research: 0, teaching: 0, service: 0, prestige: 0 },
      honors: [], handSize: role.hand || HAND_SIZE,
    };
    for (const [id, n] of Object.entries(role.deck)) for (let i = 0; i < n; i++) p.discard.push(mk(G, id));
    for (const icon of role.cv) p.cv.push({ uid: ++G.uidCounter, id: 'role', icons: [icon], name: role.name });
    for (const [t, v] of Object.entries(role.points)) p.points[t] = v;
    G.players.push(p);
  });
  // Later seats draw extra cards for their first turn to offset going later in the honors race.
  for (const p of G.players) drawCards(G, p, p.handSize + (p.idx >= 1 ? 1 : 0));
  refillRow(G);
  nextTurn(G);
  return G;
}

export function cloneGame(G, salt) {
  if (G.pending) throw new Error('cannot clone with a pending prompt');
  const { rng, ...rest } = G;
  const copy = structuredClone(rest);
  for (const p of copy.players) p.role = ROLES[p.roleId];
  copy.rng = makeRng(`${G.seed}:${salt}`);
  return copy;
}

export const cur = (G) => G.players[G.turn];
export const opponents = (G, p) => G.players.filter(o => o !== p);

function drawCards(G, p, n) {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (!p.deck.length) {
      if (!p.discard.length) break;
      p.deck = G.rng.shuffle(p.discard);
      p.discard = [];
    }
    p.hand.push(p.deck.pop());
    drawn++;
  }
  return drawn;
}

function refillRow(G) {
  while (G.row.length < ROW_SIZE) {
    let e = G.era;
    while (e <= 3 && !G.eraDecks[e].length) e++;
    if (e > 3) break;
    G.row.push(G.eraDecks[e].pop());
  }
}

export function cvIcons(p, icon) { return p.cv.reduce((n, c) => n + (c.icons || CARDS[c.id].icons).filter(i => i === icon).length, 0); }
export function cvIconsAll(p) { const m = {}; for (const t of TRACKS) m[t] = cvIcons(p, t); return m; }
export function playIcons(p, icon) { return p.play.reduce((n, c) => n + CARDS[c.id].icons.filter(i => i === icon).length, 0); }
export function cardIcons(c) { return c.icons || CARDS[c.id].icons; }

export function cardCost(G, p, id) {
  const d = CARDS[id];
  const disc = p.role.discount ? p.role.discount(d) : 0;
  return Math.max(disc ? 1 : 0, d.cost - disc);
}

export function standing(p) {
  return TRACKS.reduce((s, t) => s + p.points[t], 0) + honorPoints(p);
}

export function honorPoints(p) { return p.honors.reduce((s, id) => s + HONOR_BY_ID[id].value, 0); }

export function honorEligible(G, p, h) {
  if (G.honors[h.id] !== null) return false;
  if (p.role.noHonorTrack && h.track === p.role.noHonorTrack) return false;
  return Object.entries(h.need).every(([t, v]) => p.points[t] >= v);
}
export function eligibleHonors(G, p) { return HONORS.filter(h => honorEligible(G, p, h)); }

// ---------- effect API ----------
function makeApi(G, p) {
  const api = {
    player: p,
    hand() { return p.hand; },
    energy(n) { G.ts.energy += n; },
    pts(t, n) { return api.ptsTo(p, t, n); },
    ptsTo(o, t, n) {
      const before = o.points[t];
      o.points[t] = Math.max(0, o.points[t] + n);
      const d = o.points[t] - before;
      if (d) log(G, `${o.name}: ${d > 0 ? '+' : ''}${d} ${TRACK_INFO[t].name}.`);
      return d !== 0;
    },
    points(t) { return p.points[t]; },
    draw(n) { const d = drawCards(G, p, n); if (d) log(G, `${p.name} draws ${d}.`); return d; },
    icons(icon) { return cvIcons(p, icon) + playIcons(p, icon); },
    cvIcons(icon) { return cvIcons(p, icon); },
    gainCard(o, id) {
      if (CARDS[id].junk && o.role.shieldJunk) { log(G, `${o.name} shrugs off the ${CARDS[id].name}.`); return; }
      o.discard.push(mk(G, id)); log(G, `${o.name} gains ${CARDS[id].name}.`);
    },
    discardWorst(o) {
      if (!o.hand.length || o.role.shieldJunk) return false;
      const worst = o.hand.slice().sort((a, b) => cardValue(a.id) - cardValue(b.id))[0];
      pull(o.hand, worst.uid); o.discard.push(worst);
      log(G, `${o.name} discards ${CARDS[worst.id].name}.`);
      return true;
    },
    loseHighest(o, n) {
      const t = TRACKS.slice().sort((a, b) => o.points[b] - o.points[a])[0];
      return api.ptsTo(o, t, -n);
    },
    trashFromHand(uid) { const c = pull(p.hand, uid); if (c) { p.trash.push(c); log(G, `${p.name} trashes ${CARDS[c.id].name}.`); } return c; },
    demand(icon, fn) {
      const mine = cvIcons(p, icon);
      let hit = 0;
      // A demand reaches at most the two most junior opponents, so it does not scale without limit.
      const targets = opponents(G, p).filter(o => !o.role.immune && cvIcons(o, icon) < mine)
        .sort((a, b) => cvIcons(a, icon) - cvIcons(b, icon)).slice(0, DEMAND_MAX_TARGETS);
      for (const o of targets) { fn(o); hit++; }
      if (hit && p.role.onDemandHit) p.role.onDemandHit(api);
      if (!hit) log(G, `${p.name}'s demand finds no one junior.`);
      return hit;
    },
    share(icon, fn, bonus) {
      const mine = cvIcons(p, icon);
      let shared = 0;
      for (const o of opponents(G, p)) if (cvIcons(o, icon) >= mine) { fn(o); shared++; }
      if (shared) { if (bonus) bonus(); else api.draw(1); }
      return shared;
    },
    prompt(spec) {
      const cards = spec.cards.slice();
      const max = Math.min(spec.max, cards.length), min = Math.min(spec.min, cards.length);
      if (!cards.length || max === 0) { spec.resolve([]); return; }
      if (min === cards.length) { spec.resolve(cards.map(c => c.uid)); return; }
      G.pending = { ...spec, cards, min, max };
    },
  };
  return api;
}

// A rough per-card value used when an opponent must discard automatically.
export function cardValue(id) {
  const d = CARDS[id];
  if (d.junk) return -1;
  return d.cost + (d.icons.length ? 0.5 : 0);
}

// ---------- turn flow ----------
function nextTurn(G) {
  G.turn = (G.turn + 1) % G.players.length;
  if (G.turn === 0) {
    if (G.finalRound) return endGame(G, `Someone reached ${HONORS_TO_WIN} honors.`);
    G.year += 1;
    if (G.year > MAX_YEARS) return endGame(G, 'The academic calendar runs out.');
    for (const e of [3, 2]) if (G.year >= ERA_YEARS[e] && G.era < e) { G.era = e; log(G, `Era ${e} begins. New cards enter the Journal.`); }
    log(G, `Year ${G.year}.`);
  }
  G.turnCount++;
  const p = cur(G);
  G.ts = { energy: G.year === 1 && p.idx >= 2 ? 1 : 0, published: false, claimed: false, bought: 0 };
  G.phase = 'main';
  const api = makeApi(G, p);
  log(G, `${p.name} begins their turn.`);
  if (p.role.onTurnStart) p.role.onTurnStart(api);
  for (const c of p.cv) { const d = CARDS[c.id]; if (d && d.onTurnStart) d.onTurnStart(G, api); }
}

export function canPlay(G, uid) {
  if (G.pending || G.phase !== 'main') return false;
  return cur(G).hand.some(c => c.uid === uid);
}

export function playCard(G, uid) {
  if (!canPlay(G, uid)) return false;
  const p = cur(G);
  const c = pull(p.hand, uid);
  const d = CARDS[c.id];
  p.play.push(c);
  log(G, `${p.name} plays ${d.name}.`);
  const api = makeApi(G, p);
  d.effect(G, api, d);
  if (p.role.onPlay) p.role.onPlay(d, api, G.ts);
  return true;
}

export function playAll(G) {
  if (G.pending || G.phase !== 'main') return;
  const p = cur(G);
  // Play cards that scale with icons last so they count the others.
  const order = p.hand.slice().sort((a, b) => scaler(a.id) - scaler(b.id) || cardValue(a.id) - cardValue(b.id));
  for (const c of order) { if (G.pending) break; playCard(G, c.uid); }
}
function scaler(id) { return /per (🔬|📚|🏛️|🏆|\d)/.test(CARDS[id].text) ? 1 : 0; }

export function canBuyRow(G, i) {
  if (G.pending || G.phase !== 'main') return false;
  const c = G.row[i];
  return !!c && G.ts.energy >= cardCost(G, cur(G), c.id);
}
export function buyRow(G, i) {
  if (!canBuyRow(G, i)) return false;
  const p = cur(G);
  const c = G.row.splice(i, 1)[0];
  G.ts.energy -= cardCost(G, p, c.id);
  G.ts.bought++;
  p.discard.push(c);
  log(G, `${p.name} recruits ${CARDS[c.id].name}.`);
  refillRow(G);
  return true;
}
export function canBuyBasic(G, id) {
  if (G.pending || G.phase !== 'main') return false;
  return G.supply[id] > 0 && G.ts.energy >= cardCost(G, cur(G), id);
}
export function buyBasic(G, id) {
  if (!canBuyBasic(G, id)) return false;
  const p = cur(G);
  G.ts.energy -= cardCost(G, p, id);
  G.ts.bought++;
  G.supply[id]--;
  p.discard.push(mk(G, id));
  log(G, `${p.name} recruits ${CARDS[id].name}.`);
  return true;
}

export function canPublish(G, uid) {
  if (G.pending || G.phase !== 'main' || G.ts.published) return false;
  const c = cur(G).play.find(x => x.uid === uid);
  return !!c && !CARDS[c.id].junk;
}
export function publish(G, uid) {
  if (!canPublish(G, uid)) return false;
  const p = cur(G);
  const c = pull(p.play, uid);
  p.cv.push(c);
  G.ts.published = true;
  log(G, `${p.name} publishes ${CARDS[c.id].name} to their CV.`);
  if (p.role.onPublish) p.role.onPublish(CARDS[c.id], makeApi(G, p));
  return true;
}

export function canClaim(G, id) {
  if (G.pending || G.phase !== 'main' || G.ts.claimed) return false;
  const h = HONORS.find(x => x.id === id);
  return !!h && honorEligible(G, cur(G), h);
}
export function claimHonor(G, id) {
  if (!canClaim(G, id)) return false;
  const p = cur(G);
  G.honors[id] = p.idx;
  p.honors.push(id);
  G.ts.claimed = true;
  log(G, `${p.name} claims the honor: ${HONORS.find(h => h.id === id).name}.`);
  if (p.honors.length >= HONORS_TO_WIN && !G.finalRound) {
    G.finalRound = true;
    log(G, `${p.name} holds ${HONORS_TO_WIN} honors. The year will be the last.`);
  }
  return true;
}

export function resolvePending(G, chosen) {
  const sp = G.pending;
  if (!sp) return false;
  const valid = chosen.filter(u => sp.cards.some(c => c.uid === u));
  if (valid.length < sp.min || valid.length > sp.max) return false;
  G.pending = null;
  sp.resolve(valid);
  return true;
}

export function endTurn(G) {
  if (G.pending || G.phase !== 'main') return false;
  const p = cur(G);
  p.discard.push(...p.hand, ...p.play);
  p.hand = []; p.play = [];
  drawCards(G, p, p.handSize);
  nextTurn(G);
  return true;
}

function endGame(G, reason) {
  G.phase = 'over';
  G.endReason = reason;
  for (const p of G.players) {
    const api = makeApi(G, p);
    for (const c of p.cv) { const d = CARDS[c.id]; if (d && d.onGameEnd) d.onGameEnd(G, api, p); }
  }
  const ranked = G.players.slice().sort((a, b) =>
    standing(b) - standing(a) || b.honors.length - a.honors.length || b.points.prestige - a.points.prestige || a.idx - b.idx);
  G.ranking = ranked.map(p => p.idx);
  G.winner = ranked[0].idx;
  log(G, `Game over: ${reason} ${ranked[0].name} wins with a standing of ${standing(ranked[0])}.`);
}
