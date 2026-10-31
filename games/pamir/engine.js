// Pax Pamir (Second Edition) rules engine, with the original card set from data.js. DOM-free.
import { makeRng } from '../../platform/rng.js';
import {
  REGIONS, REGION_INFO, BORDERS, bordersOf, borderBetween, COALITIONS, COALITION_INFO, SUITS, SUIT_INFO,
  IMPACTS, ACTIONS, EVENTS, buildCourtCards,
} from './data.js';

export * from './data.js';
export const GIFT_COSTS = [2, 4, 6];
export const BLOCKS_PER_COALITION = 12;
export const CYLINDERS = 10;
export const TOTAL_CHECKS = 4;

function log(G, msg, kind = 'info') { G.log.push({ turn: G.turnNo, msg, kind }); }
const nm = (G, p) => G.players[p].name;
const isYou = (G, p) => G.players[p].name === 'You';
const vb = (G, p, v) => (isYou(G, p) ? v.replace(/ies\b/, 'y').replace(/es\b/, 'e').replace(/s\b/, '') : v);
const say = (G, p, v) => `${nm(G, p)} ${vb(G, p, v)}`;
export const cname = (c) => (c.kind === 'court' ? c.name : c.kind === 'event' ? c.name : 'Dominance Check');

// ---------------- setup ----------------
export function newGame({ seed, players }) {
  const rng = makeRng(seed);
  const n = players.length;
  const G = {
    seed: String(seed), rng, n, uid: 0, turnNo: 0, log: [],
    players: players.map((s, i) => ({ idx: i, name: s.name || `Player ${i + 1}`, kind: s.kind || 'bot', level: s.level || 'normal', loyalty: s.loyalty || COALITIONS[i % 3], rupees: 4, hand: [], court: [], gifts: [false, false, false], prizes: [], supply: CYLINDERS, points: 0 })),
    map: { armies: {}, roads: {}, tribes: {} },
    blocksLeft: Object.fromEntries(COALITIONS.map((c) => [c, BLOCKS_PER_COALITION])),
    market: [Array(6).fill(null), Array(6).fill(null)],
    deck: [], discardPile: [], favored: 'political',
    turn: 0, actionsLeft: 2, used: [], marked: [], phase: 'action', pending: null,
    checks: 0, lastCheck: null, winner: null, endReason: null,
  };
  for (const r of REGIONS) { G.map.armies[r] = Object.fromEntries(COALITIONS.map((c) => [c, 0])); G.map.tribes[r] = Array(n).fill(0); }
  for (const b of BORDERS) G.map.roads[b.id] = Object.fromEntries(COALITIONS.map((c) => [c, 0]));
  // Deck: six piles of (5 + players) court cards. Piles 2-6 each get an event; piles 3-6 each get a dominance check.
  const court = rng.shuffle(buildCourtCards()).map((c) => ({ ...c, uid: ++G.uid }));
  const events = rng.shuffle(EVENTS).slice(0, 5).map((e) => ({ ...e, kind: 'event', uid: ++G.uid }));
  const size = 5 + n, piles = [];
  for (let i = 0; i < 6; i++) {
    const pile = court.splice(0, size);
    if (i >= 1) pile.push(events[i - 1]);
    if (i >= 2) pile.push({ kind: 'dominance', name: 'Dominance Check', uid: ++G.uid });
    piles.push(rng.shuffle(pile));
  }
  // deck top is the end of the array: pile 1 on top.
  G.deck = piles.slice().reverse().flat();
  refill(G);
  G.turn = rng.int(n);
  log(G, `The game begins. Loyalties: ${G.players.map((p) => `${p.name} ${COALITION_INFO[p.loyalty].name}`).join(', ')}. Political is favored.`, 'head');
  startTurn(G);
  return G;
}

// ---------------- queries ----------------
export const tribes = (G, r, p) => G.map.tribes[r][p];
export const armies = (G, r, c) => G.map.armies[r][c];
export const rulingPieces = (G, r, p) => tribes(G, r, p) + armies(G, r, G.players[p].loyalty);
export function ruler(G, r) {
  let best = null, bestV = -1, tie = false;
  for (const p of G.players) {
    if (!tribes(G, r, p.idx)) continue;
    const v = rulingPieces(G, r, p.idx);
    if (v > bestV) { best = p.idx; bestV = v; tie = false; } else if (v === bestV) tie = true;
  }
  if (best === null || tie) return null;
  // Must also beat every other player's ruling pieces, including those with armies but no tribes.
  for (const p of G.players) if (p.idx !== best && rulingPieces(G, r, p.idx) >= bestV) return null;
  return best;
}
export const ruledBy = (G, p) => REGIONS.filter((r) => ruler(G, r) === p);
export const stars = (G, p, suit) => G.players[p].court.filter((cc) => cc.card.suit === suit).reduce((s, cc) => s + cc.card.rank, 0);
export const courtLimit = (G, p) => 3 + stars(G, p, 'political');
export const handLimit = (G, p) => 2 + stars(G, p, 'intelligence');
export const shelter = (G, p) => stars(G, p, 'economic');
export function influence(G, p) {
  const pl = G.players[p];
  return 1 + pl.gifts.filter(Boolean).length + pl.prizes.filter((c) => c.prize === pl.loyalty).length + pl.court.filter((cc) => cc.card.patriot === pl.loyalty).length;
}
export const cylindersInPlay = (G, p) => CYLINDERS - G.players[p].supply;
export function blockCounts(G) {
  const b = Object.fromEntries(COALITIONS.map((c) => [c, 0]));
  for (const r of REGIONS) for (const c of COALITIONS) b[c] += G.map.armies[r][c];
  for (const x of BORDERS) for (const c of COALITIONS) b[c] += G.map.roads[x.id][c];
  return b;
}
export function dominant(G) {
  const b = blockCounts(G);
  for (const c of COALITIONS) if (COALITIONS.every((o) => o === c || b[c] >= b[o] + 4)) return c;
  return null;
}
export function findCourtCard(G, uid) {
  for (const p of G.players) { const i = p.court.findIndex((cc) => cc.card.uid === uid); if (i >= 0) return { owner: p.idx, i, cc: p.court[i] }; }
  return null;
}
// All court cards in seat order, for spy movement (a ring).
export function courtRing(G) { return G.players.flatMap((p) => p.court.map((cc) => cc.card.uid)); }
export const purchaseCost = (G, col) => col * (G.favored === 'military' ? 2 : 1);
export function bribeFor(G, p, card) {
  if (card.kind !== 'court') return { to: null, amount: 0 };
  const r = ruler(G, card.region);
  if (r === null || r === p) return { to: null, amount: 0 };
  return { to: r, amount: tribes(G, card.region, r) };
}
export const cur = (G) => G.players[G.turn];
export const isFreeAction = (G, cc) => cc.card.suit === G.favored;

// ---------------- pieces ----------------
function takeCylinder(G, p) {
  const pl = G.players[p];
  if (pl.supply > 0) { pl.supply--; return true; }
  // Out of cylinders: take one from play (a spy first, else a tribe in the region where you have most).
  for (const q of G.players) for (const cc of q.court) if (cc.spies[p]) { cc.spies[p]--; return true; }
  const r = REGIONS.slice().sort((a, b) => tribes(G, b, p) - tribes(G, a, p))[0];
  if (tribes(G, r, p)) { G.map.tribes[r][p]--; overthrowCheckTribes(G, p, r); return true; }
  return false;
}
function takeBlock(G, c) {
  if (G.blocksLeft[c] > 0) { G.blocksLeft[c]--; return true; }
  for (const b of BORDERS) if (G.map.roads[b.id][c]) { G.map.roads[b.id][c]--; return true; }
  for (const r of REGIONS) if (G.map.armies[r][c]) { G.map.armies[r][c]--; return true; }
  return false;
}
function placeArmy(G, r, c) { if (takeBlock(G, c)) G.map.armies[r][c]++; }
function placeRoad(G, bid, c) { if (takeBlock(G, c)) G.map.roads[bid][c]++; }
function placeTribe(G, r, p) { if (takeCylinder(G, p)) G.map.tribes[r][p]++; }
function placeSpy(G, uid, p) { const f = findCourtCard(G, uid); if (f && takeCylinder(G, p)) f.cc.spies[p] = (f.cc.spies[p] || 0) + 1; }
function removeTribe(G, r, p) {
  if (!G.map.tribes[r][p]) return;
  G.map.tribes[r][p]--; G.players[p].supply++;
  overthrowCheckTribes(G, p, r);
}
// Overthrow rule, part 1: losing your last tribe in a region discards your political cards of that region.
function overthrowCheckTribes(G, p, r) {
  if (G.map.tribes[r][p] > 0) return;
  const pol = G.players[p].court.filter((cc) => cc.card.suit === 'political' && cc.card.region === r);
  if (pol.length) log(G, `Overthrow: ${nm(G, p)} has no tribes left in ${REGION_INFO[r].name}, so ${pol.map((cc) => cc.card.name).join(', ')} ${pol.length === 1 ? 'is' : 'are'} discarded.`, 'warn');
  for (const cc of pol) discardCourtCard(G, p, cc.card.uid, true);
}
// Remove a court card from play; return spies; apply leverage; Overthrow rule, part 2.
export function discardCourtCard(G, owner, uid, toPile = true) {
  const pl = G.players[owner];
  const i = pl.court.findIndex((cc) => cc.card.uid === uid);
  if (i < 0) return null;
  const cc = pl.court.splice(i, 1)[0];
  for (const [q, n] of Object.entries(cc.spies)) G.players[q].supply += n;
  if (cc.leverage) {
    const owed = 2 * cc.leverage, paid = Math.min(owed, pl.rupees);
    pl.rupees -= paid;
    if (paid < owed) {
      const lose = Math.ceil((owed - paid) / 2);
      for (let k = 0; k < lose && pl.hand.length; k++) G.discardPile.push(pl.hand.pop());
      log(G, `${nm(G, owner)} could not repay the leverage on ${cc.card.name} and discards ${lose} card${lose === 1 ? '' : 's'} from hand.`, 'warn');
    }
  }
  if (toPile) G.discardPile.push(cc.card);
  if (cc.card.suit === 'political' && !pl.court.some((x) => x.card.suit === 'political' && x.card.region === cc.card.region) && G.map.tribes[cc.card.region][owner]) {
    log(G, `Overthrow: ${nm(G, owner)} has no political card left for ${REGION_INFO[cc.card.region].name}, so their tribes there are removed.`, 'warn');
    pl.supply += G.map.tribes[cc.card.region][owner];
    G.map.tribes[cc.card.region][owner] = 0;
  }
  return cc;
}
function changeLoyalty(G, p, c) {
  const pl = G.players[p];
  if (pl.loyalty === c) return;
  const old = pl.loyalty;
  for (const cc of pl.court.filter((x) => x.card.patriot === old)) discardCourtCard(G, p, cc.card.uid);
  pl.prizes = pl.prizes.filter((x) => { if (x.prize === old) { G.discardPile.push(x); return false; } return true; });
  const gifts = pl.gifts.filter(Boolean).length;
  pl.supply += gifts; pl.gifts = [false, false, false];
  pl.loyalty = c;
  log(G, `${say(G, p, 'changes')} loyalty from ${COALITION_INFO[old].name} to ${COALITION_INFO[c].name}, losing ${gifts} gift${gifts === 1 ? '' : 's'} and any ${COALITION_INFO[old].name} patriots and prizes.`, 'warn');
}

// ---------------- market ----------------
function refill(G) {
  for (const row of G.market) {
    const cards = row.filter(Boolean);
    for (let c = 0; c < 6; c++) row[c] = cards[c] || null;
  }
  for (const row of G.market) for (let c = 0; c < 6; c++) if (!row[c] && G.deck.length) row[c] = { card: G.deck.pop(), rupees: 0 };
}

// ---------------- turn flow ----------------
function startTurn(G) {
  G.turnNo++;
  G.actionsLeft = 2; G.used = []; G.marked = []; G.phase = 'action'; G.pending = null;
  log(G, isYou(G, G.turn) ? 'Your turn.' : `${nm(G, G.turn)}'s turn.`, 'turn');
}

// Every legal decision is an action object passed here. Returns true if it was legal and done.
export function act(G, a) {
  if (G.phase === 'over') return false;
  const p = G.turn, pl = G.players[p];
  if (G.phase === 'discard') {
    if (a.type !== 'discard') return false;
    return doCleanupDiscard(G, a.uid);
  }
  switch (a.type) {
    case 'purchase': return purchase(G, p, a.row, a.col);
    case 'play': return play(G, p, a);
    case 'tax': case 'gift': case 'build': case 'move': case 'betray': case 'battle': return cardAction(G, p, a);
    case 'endTurn': return endTurn(G);
    default: return false;
  }
}

export function canPurchase(G, p, row, col) {
  const slot = G.market[row][col];
  return G.phase === 'action' && G.actionsLeft > 0 && !!slot && !G.marked.includes(slot.card.uid) && G.players[p].rupees >= purchaseCost(G, col);
}
function purchase(G, p, row, col) {
  if (!canPurchase(G, p, row, col)) return false;
  const pl = G.players[p], slot = G.market[row][col], per = G.favored === 'military' ? 2 : 1;
  for (let c = 0; c < col; c++) {
    const target = G.market[row][c] || G.market[1 - row][c];
    if (target) { target.rupees += per; G.marked.push(target.card.uid); }
  }
  pl.rupees -= purchaseCost(G, col);
  pl.rupees += slot.rupees;
  G.market[row][col] = null;
  G.actionsLeft--;
  const card = slot.card;
  log(G, `${say(G, p, 'buys')} ${cname(card)} for ${purchaseCost(G, col)}${slot.rupees ? `, collecting ${slot.rupees} rupee${slot.rupees === 1 ? '' : 's'} from it` : ''}.`);
  if (card.kind === 'court') pl.hand.push(card);
  else if (card.kind === 'event') { G.discardPile.push(card); eventPurchased(G, p, card); }
  else { G.discardPile.push(card); dominanceCheck(G); }
  return true;
}

function eventPurchased(G, p, e) {
  const pl = G.players[p];
  if (e.key === 'caravans') pl.rupees += 3;
  else if (e.key === 'skirmish') G.favored = 'military';
  else if (e.key === 'durbar') G.favored = 'political';
  else if (e.key === 'whispers') G.favored = 'intelligence';
  else if (e.key === 'boom') G.favored = 'economic';
  else if (e.key === 'amnesty') { const r = REGIONS.slice().sort((a, b) => tribes(G, b, p) - tribes(G, a, p))[0]; placeTribe(G, r, p); }
  log(G, `${e.name}: ${e.purchased}`, 'event');
}
function eventDiscarded(G, e) {
  if (e.key === 'caravans') for (const pl of G.players) pl.rupees += 1;
  else if (e.key === 'skirmish') { let best = null, bc = null; for (const r of REGIONS) for (const c of COALITIONS) if (G.map.armies[r][c] && (!best || G.map.armies[r][c] > G.map.armies[best][bc])) { best = r; bc = c; } if (best) { G.map.armies[best][bc]--; G.blocksLeft[bc]++; } }
  else if (e.key === 'durbar') for (const pl of G.players) { if (pl.court.some((cc) => cc.card.suit === 'political')) pl.rupees += 1; }
  else if (e.key === 'whispers') for (const pl of G.players) for (const cc of pl.court) { for (const [q, n] of Object.entries(cc.spies)) G.players[q].supply += n; cc.spies = {}; }
  else if (e.key === 'boom') for (const s of G.market[0]) if (s) s.rupees += 1;
  log(G, `${e.name} leaves the market: ${e.discarded}`, 'event');
}

export function canPlay(G, p, uid) {
  const pl = G.players[p], card = pl.hand.find((c) => c.uid === uid);
  if (G.phase !== 'action' || G.actionsLeft <= 0 || !card) return false;
  return pl.rupees >= bribeFor(G, p, card).amount;
}
function play(G, p, a) {
  if (!canPlay(G, p, a.uid)) return false;
  const pl = G.players[p], card = pl.hand.find((c) => c.uid === a.uid);
  const bribe = bribeFor(G, p, card);
  if (bribe.amount) { pl.rupees -= bribe.amount; G.players[bribe.to].rupees += bribe.amount; log(G, `${say(G, p, 'pays')} ${nm(G, bribe.to)} a bribe of ${bribe.amount}, because ${nm(G, bribe.to)} rule${isYou(G, bribe.to) ? '' : 's'} ${REGION_INFO[card.region].name}.`); }
  pl.hand = pl.hand.filter((c) => c !== card);
  if (card.patriot && card.patriot !== pl.loyalty) changeLoyalty(G, p, card.patriot);
  const cc = { card, spies: {}, leverage: 0 };
  if (a.side === 'left') pl.court.unshift(cc); else pl.court.push(cc);
  G.actionsLeft--;
  log(G, `${say(G, p, 'plays')} ${card.name} to the ${a.side === 'left' ? 'left' : 'right'} of their court.`);
  let roadI = 0, spyI = 0;
  for (const imp of card.impacts) {
    if (imp === 'army') placeArmy(G, card.region, pl.loyalty);
    else if (imp === 'road') {
      const opts = bordersOf(card.region).map((b) => b.id);
      const bid = a.roads && opts.includes(a.roads[roadI]) ? a.roads[roadI] : opts[0];
      roadI++;
      placeRoad(G, bid, pl.loyalty);
    } else if (imp === 'tribe') placeTribe(G, card.region, p);
    else if (imp === 'spy') {
      const opts = spyTargets(G, card.region);
      if (opts.length) { const t = a.spies && opts.includes(a.spies[spyI]) ? a.spies[spyI] : opts[0]; placeSpy(G, t, p); }
      spyI++;
    } else if (imp === 'leverage') { pl.rupees += 2; cc.leverage++; }
    else if (imp === 'favor') { G.favored = card.suit; log(G, `${SUIT_INFO[card.suit].name} is now the favored suit.`); }
  }
  return true;
}
export const spyTargets = (G, region) => G.players.flatMap((q) => q.court.filter((cc) => cc.card.region === region).map((cc) => cc.card.uid));
export const roadOptions = (region) => bordersOf(region).map((b) => b.id);

// ---------------- card actions ----------------
export function canUseCard(G, p, uid, type) {
  const f = findCourtCard(G, uid);
  if (G.phase !== 'action' || !f || f.owner !== p || G.used.includes(uid) || !f.cc.card.actions.includes(type)) return false;
  return isFreeAction(G, f.cc) || G.actionsLeft > 0;
}
function spend(G, cc) { G.used.push(cc.card.uid); if (!isFreeAction(G, cc)) G.actionsLeft--; }

export function taxSources(G, p) {
  const ruled = ruledBy(G, p);
  const players = G.players.filter((q) => q.idx !== p && q.court.some((cc) => ruled.includes(cc.card.region)))
    .map((q) => ({ p: q.idx, max: Math.max(0, q.rupees - shelter(G, q.idx)) })).filter((s) => s.max > 0);
  const market = [];
  G.market.forEach((row, ri) => row.forEach((s, ci) => { if (s && s.rupees) market.push({ row: ri, col: ci, max: s.rupees }); }));
  return { players, market };
}
export function battleSites(G, p) {
  const pl = G.players[p], sites = [];
  for (const r of REGIONS) {
    const lim = armies(G, r, pl.loyalty);
    if (!lim) continue;
    const enemies = COALITIONS.filter((c) => c !== pl.loyalty).reduce((s, c) => s + armies(G, r, c) + bordersOf(r).reduce((t, b) => t + G.map.roads[b.id][c], 0), 0)
      + G.players.filter((q) => q.idx !== p && q.loyalty !== pl.loyalty).reduce((s, q) => s + tribes(G, r, q.idx), 0);
    if (enemies) sites.push({ region: r, limit: lim, enemies });
  }
  for (const q of G.players) for (const cc of q.court) {
    const mine = cc.spies[p] || 0;
    const enemies = Object.entries(cc.spies).filter(([k]) => Number(k) !== p).reduce((s, [, n]) => s + n, 0);
    if (mine && enemies) sites.push({ card: cc.card.uid, limit: mine, enemies });
  }
  return sites;
}

function cardAction(G, p, a) {
  if (!canUseCard(G, p, a.card, a.type)) return false;
  const f = findCourtCard(G, a.card), cc = f.cc, rank = cc.card.rank, pl = G.players[p];
  if (a.type === 'gift') {
    const slot = pl.gifts.indexOf(false);
    if (slot < 0 || pl.rupees < GIFT_COSTS[slot]) return false;
    spend(G, cc);
    pl.rupees -= GIFT_COSTS[slot];
    if (takeCylinder(G, p)) pl.gifts[slot] = true;
    log(G, `${say(G, p, 'buys')} a gift for ${GIFT_COSTS[slot]} rupees with ${cc.card.name}: +1 influence.`);
    return true;
  }
  if (a.type === 'tax') {
    const src = taxSources(G, p);
    let left = rank; const got = [];
    const takes = a.takes || [...src.players.sort((x, y) => y.max - x.max).map((s) => ({ from: 'player', p: s.p })), ...src.market.sort((x, y) => y.max - x.max).map((s) => ({ from: 'market', row: s.row, col: s.col }))];
    spend(G, cc);
    for (const t of takes) {
      if (left <= 0) break;
      if (t.from === 'player') {
        const s = src.players.find((x) => x.p === t.p); if (!s) continue;
        const n = Math.min(left, t.n ?? left, s.max, G.players[t.p].rupees);
        if (n > 0) { G.players[t.p].rupees -= n; pl.rupees += n; left -= n; s.max -= n; got.push(`${n} from ${nm(G, t.p)}`); }
      } else {
        const slot = G.market[t.row][t.col]; if (!slot) continue;
        const n = Math.min(left, t.n ?? left, slot.rupees);
        if (n > 0) { slot.rupees -= n; pl.rupees += n; left -= n; got.push(`${n} from the market`); }
      }
    }
    log(G, `${say(G, p, 'taxes')} with ${cc.card.name}: ${got.length ? got.join(', ') : 'nothing to take'}.`);
    return true;
  }
  if (a.type === 'build') {
    const ruled = ruledBy(G, p);
    if (!ruled.length) return false;
    const pieces = (a.pieces || []).slice(0, 3);
    for (const pc of pieces) {
      if (pc.kind === 'army' && !ruled.includes(pc.region)) return false;
      if (pc.kind === 'road') { const b = BORDERS.find((x) => x.id === pc.border); if (!b || !(ruled.includes(b.a) || ruled.includes(b.b))) return false; }
    }
    if (!pieces.length || pl.rupees < 2 * pieces.length) return false;
    spend(G, cc);
    pl.rupees -= 2 * pieces.length;
    for (const pc of pieces) pc.kind === 'army' ? placeArmy(G, pc.region, pl.loyalty) : placeRoad(G, pc.border, pl.loyalty);
    log(G, `${say(G, p, 'builds')} with ${cc.card.name}: ${pieces.map((pc) => (pc.kind === 'army' ? `an army in ${REGION_INFO[pc.region].name}` : `a road on ${pc.border.split('-').map((r) => REGION_INFO[r].name).join('–')}`)).join(', ')}.`);
    return true;
  }
  if (a.type === 'move') {
    const moves = (a.moves || []).slice(0, rank);
    if (!moves.length) return false;
    const C = structuredClone({ map: G.map, courts: G.players.map((q) => q.court.map((x) => ({ uid: x.card.uid, spies: { ...x.spies } }))) });
    for (const m of moves) {
      if (m.kind === 'army') {
        const b = borderBetween(m.from, m.to);
        if (!b || !C.map.armies[m.from][pl.loyalty] || !C.map.roads[b.id][pl.loyalty]) return false;
        C.map.armies[m.from][pl.loyalty]--; C.map.armies[m.to][pl.loyalty]++;
      } else {
        const ring = courtRing(G), i = ring.indexOf(m.from), j = ring.indexOf(m.to);
        if (i < 0 || j < 0 || !(Math.abs(i - j) === 1 || Math.abs(i - j) === ring.length - 1)) return false;
        const from = C.courts.flat().find((x) => x.uid === m.from), to = C.courts.flat().find((x) => x.uid === m.to);
        if (!from.spies[p]) return false;
        from.spies[p]--; to.spies[p] = (to.spies[p] || 0) + 1;
      }
    }
    spend(G, cc);
    G.map = C.map;
    for (const q of G.players) for (const x of q.court) { const y = C.courts.flat().find((z) => z.uid === x.card.uid); x.spies = Object.fromEntries(Object.entries(y.spies).filter(([, n]) => n > 0)); }
    log(G, `${say(G, p, 'moves')} with ${cc.card.name}: ${moves.map((m) => (m.kind === 'army' ? `army ${REGION_INFO[m.from].name}→${REGION_INFO[m.to].name}` : 'a spy to a neighbouring card')).join(', ')}.`);
    return true;
  }
  if (a.type === 'betray') {
    const t = findCourtCard(G, a.target);
    if (!t || !(t.cc.spies[p] > 0) || pl.rupees < 2) return false;
    spend(G, cc);
    pl.rupees -= 2;
    const card = t.cc.card;
    log(G, `${say(G, p, 'betrays')} ${card.name} in ${nm(G, t.owner)}'s court with ${cc.card.name}.`, 'warn');
    discardCourtCard(G, t.owner, card.uid, !(a.takePrize && card.prize));
    if (a.takePrize && card.prize) {
      if (card.prize !== pl.loyalty) changeLoyalty(G, p, card.prize);
      pl.prizes.push(card);
      log(G, `${say(G, p, 'keeps')} it as a ${COALITION_INFO[card.prize].name} prize: +1 influence.`);
    }
    return true;
  }
  if (a.type === 'battle') {
    const site = a.site;
    const sites = battleSites(G, p);
    const s = sites.find((x) => (site.region && x.region === site.region) || (site.card && x.card === site.card));
    if (!s) return false;
    const limit = Math.min(rank, s.limit);
    spend(G, cc);
    const removed = [];
    let left = limit;
    if (s.region) {
      const r = s.region;
      const order = a.removals || defaultBattleTargets(G, p, r);
      for (const t of order) {
        if (left <= 0) break;
        if (t.kind === 'army' && G.map.armies[r][t.c] > 0 && t.c !== pl.loyalty) { G.map.armies[r][t.c]--; G.blocksLeft[t.c]++; removed.push(`${COALITION_INFO[t.c].name} army`); left--; }
        else if (t.kind === 'road' && G.map.roads[t.border][t.c] > 0 && t.c !== pl.loyalty) { G.map.roads[t.border][t.c]--; G.blocksLeft[t.c]++; removed.push(`${COALITION_INFO[t.c].name} road`); left--; }
        else if (t.kind === 'tribe' && tribes(G, r, t.p) > 0 && G.players[t.p].loyalty !== pl.loyalty && t.p !== p) { removeTribe(G, r, t.p); removed.push(`${nm(G, t.p)}'s tribe`); left--; }
      }
      log(G, `${say(G, p, 'battles')} in ${REGION_INFO[r].name} with ${cc.card.name}, removing ${removed.join(', ') || 'nothing'}.`, 'warn');
    } else {
      const t = findCourtCard(G, s.card);
      for (const [q, n] of Object.entries(t.cc.spies)) {
        if (Number(q) === p) continue;
        const k = Math.min(n, left);
        t.cc.spies[q] -= k; G.players[q].supply += k; left -= k;
        if (k) removed.push(`${k} of ${nm(G, Number(q))}'s spies`);
        if (left <= 0) break;
      }
      log(G, `${say(G, p, 'battles')} on ${t.cc.card.name}, removing ${removed.join(', ') || 'nothing'}.`, 'warn');
    }
    return true;
  }
  return false;
}
export function defaultBattleTargets(G, p, r) {
  const pl = G.players[p], out = [];
  for (const c of COALITIONS) if (c !== pl.loyalty) for (let k = 0; k < G.map.armies[r][c]; k++) out.push({ kind: 'army', c });
  const leader = G.players.filter((q) => q.idx !== p && q.loyalty !== pl.loyalty).sort((a, b) => b.points - a.points);
  for (const q of leader) for (let k = 0; k < tribes(G, r, q.idx); k++) out.push({ kind: 'tribe', p: q.idx });
  for (const b of bordersOf(r)) for (const c of COALITIONS) if (c !== pl.loyalty) for (let k = 0; k < G.map.roads[b.id][c]; k++) out.push({ kind: 'road', border: b.id, c });
  return out;
}

// ---------------- cleanup ----------------
export function needsDiscard(G) {
  const p = G.turn, pl = G.players[p];
  if (pl.court.length > courtLimit(G, p)) return 'court';
  if (pl.hand.length > handLimit(G, p)) return 'hand';
  return null;
}
function endTurn(G) {
  if (G.phase !== 'action') return false;
  G.phase = 'discard';
  continueCleanup(G);
  return true;
}
function doCleanupDiscard(G, uid) {
  const p = G.turn, pl = G.players[p], need = needsDiscard(G);
  if (need === 'court') { if (!pl.court.some((cc) => cc.card.uid === uid)) return false; log(G, `${say(G, p, 'discards')} ${findCourtCard(G, uid).cc.card.name} from court (over the court limit).`); discardCourtCard(G, p, uid); }
  else if (need === 'hand') { const i = pl.hand.findIndex((c) => c.uid === uid); if (i < 0) return false; G.discardPile.push(pl.hand.splice(i, 1)[0]); log(G, `${say(G, p, 'discards')} a card from hand (over the hand limit).`); }
  else return false;
  continueCleanup(G);
  return true;
}
function continueCleanup(G) {
  if (needsDiscard(G)) { G.phase = 'discard'; G.pending = { need: needsDiscard(G) }; return; }
  G.pending = null;
  // Events in the leftmost column leave the market and take effect.
  for (const row of [0, 1]) {
    const s = G.market[row][0];
    if (s && s.card.kind !== 'court') {
      G.market[row][0] = null;
      G.discardPile.push(s.card);
      if (s.card.kind === 'event') eventDiscarded(G, s.card); else { log(G, 'A Dominance Check leaves the market and is resolved.', 'event'); dominanceCheck(G); }
      if (G.phase === 'over') return;
    }
  }
  // House rule: once the deck is empty the market keeps drifting, so the final Dominance Check always arrives.
  if (!G.deck.length) {
    for (const row of [0, 1]) {
      const s = G.market[row][0];
      if (!s || s.card.kind !== 'court') continue;
      G.market[row][0] = null;
      G.discardPile.push(s.card);
      log(G, `The deck is empty, so ${s.card.name} drifts out of the market.`);
    }
  }
  refill(G);
  if (!G.deck.length && G.market.flat().every((s) => !s || s.card.kind === 'court') && G.checks < TOTAL_CHECKS) {
    // Safety net: no check left anywhere but the game has not ended. Resolve the final check now.
    G.checks = TOTAL_CHECKS - 1; dominanceCheck(G); if (G.phase === 'over') return;
  }
  G.turn = (G.turn + 1) % G.n;
  startTurn(G);
}

// ---------------- dominance ----------------
function award(G, ranked, keyFn, tiers, mult) {
  // ranked: players sorted by key desc. Tied players share the points of the places they occupy.
  const out = {};
  let i = 0;
  while (i < ranked.length && i < tiers.length) {
    const k = keyFn(ranked[i]);
    const group = ranked.filter((q) => keyFn(q) === k);
    const places = tiers.slice(i, i + group.length);
    const share = Math.floor(places.reduce((s, x) => s + x, 0) / group.length) * mult;
    for (const q of group) out[q.idx] = share;
    i += group.length;
  }
  return out;
}
export function dominanceCheck(G) {
  G.checks++;
  const final = G.checks >= TOTAL_CHECKS, mult = final ? 2 : 1;
  const d = dominant(G), b = blockCounts(G);
  let gains;
  if (d) {
    const loyal = G.players.filter((q) => q.loyalty === d).sort((x, y) => influence(G, y.idx) - influence(G, x.idx));
    gains = award(G, loyal, (q) => influence(G, q.idx), [5, 3, 1], mult);
    log(G, `Dominance Check ${G.checks}: ${COALITION_INFO[d].name} is dominant (${COALITIONS.map((c) => `${COALITION_INFO[c].name} ${b[c]}`).join(', ')}). Loyal players score by influence${final ? ' (doubled: final check)' : ''}.`, 'check');
    for (const r of REGIONS) for (const c of COALITIONS) { G.blocksLeft[c] += G.map.armies[r][c]; G.map.armies[r][c] = 0; }
    for (const x of BORDERS) for (const c of COALITIONS) { G.blocksLeft[c] += G.map.roads[x.id][c]; G.map.roads[x.id][c] = 0; }
    log(G, 'All coalition blocks are removed from the map.', 'check');
  } else {
    const all = G.players.slice().sort((x, y) => cylindersInPlay(G, y.idx) - cylindersInPlay(G, x.idx));
    gains = award(G, all, (q) => cylindersInPlay(G, q.idx), [3, 1], mult);
    log(G, `Dominance Check ${G.checks}: no coalition leads by 4 (${COALITIONS.map((c) => `${COALITION_INFO[c].name} ${b[c]}`).join(', ')}). Players score by cylinders in play${final ? ' (doubled: final check)' : ''}.`, 'check');
  }
  for (const [q, v] of Object.entries(gains)) if (v) { G.players[q].points += v; log(G, `${nm(G, Number(q))} score${isYou(G, Number(q)) ? '' : 's'} ${v}.`, 'check'); }
  G.lastCheck = { n: G.checks, dominant: d, blocks: b, gains, final };
  const sorted = G.players.slice().sort((x, y) => y.points - x.points || y.rupees - x.rupees);
  if (sorted[0].points >= (sorted[1]?.points ?? 0) + 4) return endGame(G, `${sorted[0].name} lead${isYou(G, sorted[0].idx) ? '' : 's'} by 4 or more after a Dominance Check.`);
  if (final) return endGame(G, 'The final Dominance Check has been resolved.');
}
function endGame(G, reason) {
  G.phase = 'over';
  const sorted = G.players.slice().sort((x, y) => y.points - x.points || y.rupees - x.rupees);
  G.winner = sorted[0].idx;
  G.endReason = reason;
  log(G, `${reason} ${sorted[0].name} win${isYou(G, sorted[0].idx) ? '' : 's'} with ${sorted[0].points} points.`, 'check');
}

export function cloneGame(G, salt) {
  const { rng, log: _l, ...rest } = G;
  const C = structuredClone(rest);
  C.log = [];
  C.rng = makeRng(`${G.seed}:${salt}`);
  return C;
}
