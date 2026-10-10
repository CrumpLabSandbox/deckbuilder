// Bot strategies for Ashfall. Shared by sim.mjs (calibration) and the UI (per-seed par).
import {
  newGame, chooseFounder, playCard, buyCard, buyWork, endDay, resolvePending, score, cardCost, workCost,
  CARDS, WORKS, DAYS,
} from './engine.js';

const giveActions = (id) => /\+(\d) Action/.test(CARDS[id].text) ? Number(RegExp.$1) : 0;
const isAction = (id) => CARDS[id].types.includes('action');
const isTreasure = (id) => CARDS[id].types.includes('treasure');

export function resolvePrompt(G) {
  const p = G.pending;
  const text = p.text.toLowerCase();
  const byValue = p.cards.slice().sort((a, b) => value(G, a.id) - value(G, b.id));
  let chosen = [];
  if (text.includes('trash')) {
    // Trash cinders, then (if forced) the weakest card; optionally shells late if deck is rich.
    chosen = byValue.filter(c => c.id === 'cinder').slice(0, p.max).map(c => c.uid);
    if (chosen.length < p.min) chosen = byValue.slice(0, p.min).map(c => c.uid);
  } else if (text.includes('discard the top')) {
    chosen = byValue[0] && value(G, byValue[0].id) <= 0 ? [byValue[0].uid] : [];
  } else if (text.includes('discard')) {
    chosen = byValue.slice(0, p.min).map(c => c.uid);
  } else if (text.includes('put into your hand')) {
    chosen = [byValue[byValue.length - 1].uid];
  } else {
    chosen = byValue.slice(0, p.min).map(c => c.uid);
  }
  resolvePending(G, chosen);
}

// Rough card value for a bot deciding what to keep.
function value(G, id) {
  const d = CARDS[id];
  if (id === 'cinder') return -2;
  if (d.types.includes('relic') && !isAction(id)) return G.day >= 10 ? 1 : 0;
  if (isTreasure(id)) return d.coin;
  return d.cost;
}

export function playTurn(G, strategy) {
  // Action phase: play non-terminals first, then terminals.
  while (G.phase === 'action' && G.actions > 0 && !G.pending) {
    const acts = G.hand.filter(c => isAction(c.id));
    if (!acts.length) break;
    acts.sort((a, b) => (giveActions(b.id) - giveActions(a.id)) || (CARDS[b.id].cost - CARDS[a.id].cost));
    playCard(G, acts[0].uid);
    while (G.pending) resolvePrompt(G);
  }
  for (const c of G.hand.slice()) if (isTreasure(c.id)) playCard(G, c.uid);
  while (G.buys > 0) {
    const pick = strategy(G);
    if (!pick) break;
    if (pick.startsWith('work:')) { if (!buyWork(G, pick.slice(5))) break; continue; }
    if (!buyCard(G, pick)) break;
  }
}

// Shared: is there a Work worth taking at this coin level? Simple value-per-day heuristic.
function workPick(G) {
  const daysLeft = DAYS - G.day; // days the work will act
  let best = null, bestV = 0;
  for (const id of G.worksMarket) {
    const w = WORKS[id], cost = workCost(G, id);
    if (cost > G.coins) continue;
    let v = 0;
    if (w.vp) v = w.vp;
    else if (w.vpFn) v = w.vpFn([...G.deck, ...G.hand, ...G.discard, ...G.play]) + 1;
    else if (w.shields) v = daysLeft * 0.4;
    else v = daysLeft * ({ weir: 0.5, workshop: 0.25, square: 0.6, trench: 0.3, kiln: 0.2, charter: 1.0, reliquary: 0.5, lighthouse: 0.8, library: 1.2, mine: 1.5 }[id] || 0.5);
    // Compare against buying treasure with the same coins: roughly cost/2 points of value.
    if (v > cost * 0.9 && v > bestV) { best = id; bestV = v; }
  }
  return best ? 'work:' + best : null;
}

export function bigMoney(G) {
  const c = G.coins, cost = (id) => cardCost(G, id);
  if (c >= cost('heart') && G.supply.heart > 0) return 'heart';
  const w = workPick(G); if (w) return w;
  if (G.day >= 8 && c >= cost('idol') && G.supply.idol > 0) return 'idol';
  if (c >= cost('obsidian')) return 'obsidian';
  if (G.day >= 10 && c >= cost('idol') && G.supply.idol > 0) return 'idol';
  if (c >= cost('pearl')) return 'pearl';
  if (G.day >= 11 && c >= cost('totem') && G.supply.totem > 0) return 'totem';
  return null;
}

const DRAWERS = ['shipwright', 'guild_hall', 'fleet', 'sage', 'storyteller', 'oracle', 'beacon'];
const VILLAGES = ['elder', 'fair'];
export function engineBot(G) {
  const c = G.coins, cost = (id) => cardCost(G, id);
  const owned = [...G.deck, ...G.hand, ...G.discard, ...G.play];
  const n = (ids) => owned.filter(x => ids.includes(x.id)).length;
  const nTerm = owned.filter(x => isAction(x.id) && giveActions(x.id) === 0).length;
  const nVill = n(VILLAGES), nDraw = n(DRAWERS), nAct = owned.filter(x => isAction(x.id)).length;
  const nMoney = owned.filter(x => ['pearl', 'obsidian'].includes(x.id)).length;
  const avail = (ids) => G.market.filter(id => ids.includes(id) && G.supply[id] > 0 && cost(id) <= c).sort((a, b) => cost(b) - cost(a));
  const late = G.day >= DAYS - 4;
  if (c >= cost('heart') && G.supply.heart > 0) return 'heart';
  { const w = workPick(G); if (w) return w; }
  if (late && c >= cost('idol') && G.supply.idol > 0) return 'idol';
  if (G.day >= DAYS - 1 && c >= cost('totem') && G.supply.totem > 0) return 'totem';
  if (!late) {
    const d = avail(DRAWERS), v = avail(VILLAGES), t = avail(COIN_TERMINALS);
    const cantrip = avail(['harbor', 'relic_hunter', 'apprentice', 'netmaker', 'lookout', 'shrine']);
    const wantTerm = nTerm < nVill + 1 && nTerm < 3;
    if (c >= 6 && d.length && cost(d[0]) >= 6 && nDraw < 3) return d[0];
    if (c >= 7 && t.length && cost(t[0]) >= 7 && wantTerm) return t[0];
    if (c >= 6 && nMoney < 2 + nDraw) return 'obsidian';
    if (d.length && nDraw < 3 && cost(d[0]) >= 4) return d[0];
    if (t.length && wantTerm && cost(t[0]) >= 4) return t[0];
    if (v.length && nVill < nTerm && nVill < 2) return v[0];
    if (c >= 6) return 'obsidian';
    if (cantrip.length && nAct < 6 && cost(cantrip[0]) >= 3) return cantrip[0];
    if (c >= cost('idol') && G.day >= DAYS - 6 && G.supply.idol > 0) return 'idol';
    if (c >= cost('pearl')) return 'pearl';
    if (cantrip.length && nAct < 5) return cantrip[0];
    return null;
  }
  if (c >= cost('obsidian')) return 'obsidian';
  if (c >= cost('pearl')) return 'pearl';
  return null;
}

const COIN_TERMINALS = ['smelter', 'forgemaster', 'great_forge', 'fair', 'fisher'];
const CANTRIPS = ['harbor', 'shipwright', 'guild_hall', 'fleet', 'sage', 'relic_hunter', 'storyteller', 'elder'];
export function moneyPlus(G) {
  const c = G.coins, cost = (id) => cardCost(G, id);
  const owned = [...G.deck, ...G.hand, ...G.discard, ...G.play];
  const have = (ids) => owned.filter(x => ids.includes(x.id)).length;
  if (c >= cost('heart') && G.supply.heart > 0) return 'heart';
  { const w = workPick(G); if (w) return w; }
  if (G.day >= DAYS - 4 && c >= cost('idol') && G.supply.idol > 0) return 'idol';
  if (G.day >= DAYS - 1 && c >= cost('totem') && G.supply.totem > 0) return 'totem';
  const inMarket = (ids) => G.market.filter(id => ids.includes(id) && G.supply[id] > 0 && cost(id) <= c).sort((a, b) => cost(b) - cost(a));
  if (G.day <= DAYS - 5) {
    const t = inMarket(COIN_TERMINALS), k = inMarket(CANTRIPS);
    if (have(COIN_TERMINALS) < 2 && t.length && cost(t[0]) >= Math.min(c, 5)) return t[0];
    if (k.length && have(CANTRIPS) < 4 && cost(k[0]) >= 4 && (c < 6 || have(CANTRIPS) < 2)) return k[0];
    if (have(COIN_TERMINALS) < 3 && t.length && c < 6 && cost(t[0]) >= 4) return t[0];
  }
  if (c >= cost('obsidian')) return 'obsidian';
  if (G.day >= DAYS - 6 && c >= cost('idol') && G.supply.idol > 0) return 'idol';
  if (c >= cost('pearl')) return 'pearl';
  return null;
}


export function runBot(seed, strategy, founderPick) {
  const G = newGame(seed);
  const founders = G.founderChoices.filter(id => id !== 'cinder_rite');
  founders.sort((a, b) => CARDS[b].cost - CARDS[a].cost);
  chooseFounder(G, founderPick || founders[0]);
  while (G.phase !== 'over') {
    while (G.pending) resolvePrompt(G);
    playTurn(G, strategy);
    while (G.pending) resolvePrompt(G);
    endDay(G);
  }
  return G;
}

// The rival every seed is measured against: the best of the simple strategies.
export function parForSeed(seed) {
  const results = [
    { name: 'Harbormaster', strategy: 'bigMoney', score: score(runBot(seed, bigMoney)) },
    { name: 'Guildmaster', strategy: 'moneyPlus', score: score(runBot(seed, moneyPlus)) },
    { name: 'Tinker', strategy: 'engineBot', score: score(runBot(seed, engineBot)) },
  ];
  results.sort((a, b) => b.score - a.score);
  return results[0];
}
