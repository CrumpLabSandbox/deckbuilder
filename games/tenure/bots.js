// Bot players for Tenure. Shared by the UI (AI opponents) and sim.mjs (balancing).
import {
  cur, opponents, playCard, playAll, buyRow, buyBasic, canBuyRow, canBuyBasic, publish, canPublish,
  claimHonor, eligibleHonors, endTurn, resolvePending, cardCost, cvIcons, playIcons,
  CARDS, HONORS, TRACKS, BASICS, MAX_YEARS,
} from './engine.js';

export const STRATEGIES = ['research', 'teaching', 'service', 'prestige', 'adaptive', 'balanced'];

// Dry-run a card's effect to estimate what it would do for player p right now.
function estimate(G, p, id) {
  const d = CARDS[id];
  const r = { pts: { research: 0, teaching: 0, service: 0, prestige: 0 }, energy: 0, draw: 0, hits: 0, shared: 0, trash: 0 };
  const icons = (icon) => cvIcons(p, icon) + playIcons(p, icon) + d.icons.filter(i => i === icon).length;
  const api = {
    player: p, hand: () => p.hand,
    energy(n) { r.energy += n; }, pts(t, n) { r.pts[t] += n; return true; }, ptsTo(o, t, n) { if (o === p) r.pts[t] += n; return true; },
    points: (t) => p.points[t], draw(n) { r.draw += n; return n; },
    icons, cvIcons: (icon) => cvIcons(p, icon),
    gainCard() {}, discardWorst() { return true; }, loseHighest() { return true; }, trashFromHand() {},
    demand(icon, fn) { const mine = cvIcons(p, icon); const t = opponents(G, p).filter(o => !o.role.immune && cvIcons(o, icon) < mine).slice(0, 2); for (const o of t) { fn(o); r.hits++; } return r.hits; },
    share(icon, fn, bonus) { const mine = cvIcons(p, icon); let s = 0; for (const o of opponents(G, p)) if (cvIcons(o, icon) >= mine) { s++; } r.shared += s; if (s) { if (bonus) bonus(); else r.draw += 1; } return s; },
    prompt(spec) { r.trash += Math.min(spec.max, p.hand.filter(c => CARDS[c.id].junk).length); },
  };
  try { d.effect(G, api, d); } catch (e) { /* estimation only */ }
  if (p.role.onPlay) p.role.onPlay(d, api, { ...G.ts });
  if (p.role.onDemandHit && r.hits) p.role.onDemandHit(api);
  return r;
}

function weights(p, strategy, G) {
  const w = { research: 0.35, teaching: 0.35, service: 0.35, prestige: 0.35 };
  let focus = strategy;
  if (strategy === 'adaptive') {
    focus = TRACKS.slice().sort((a, b) => (p.points[b] + 2 * cvIcons(p, b)) - (p.points[a] + 2 * cvIcons(p, a)))[0];
  }
  if (strategy === 'balanced') { for (const t of TRACKS) w[t] = 0.7; }
  else { w[focus] = 1.0; }
  if (p.role.noHonorTrack) w[p.role.noHonorTrack] *= 0.5;
  // Lean toward tracks where an unclaimed honor is within reach.
  for (const h of HONORS) {
    if (G.honors[h.id] !== null) continue;
    if (p.role.noHonorTrack && h.track === p.role.noHonorTrack) continue;
    const gaps = Object.entries(h.need).map(([t, v]) => [t, v - p.points[t]]);
    const total = gaps.reduce((s, [, g]) => s + Math.max(0, g), 0);
    if (total > 0 && total <= 6) for (const [t, g] of gaps) if (g > 0) w[t] += 0.3;
  }
  return { w, focus };
}

function cardScore(G, p, id, strategy) {
  const d = CARDS[id];
  const { w, focus } = weights(p, strategy, G);
  const e = estimate(G, p, id);
  let v = 0;
  for (const t of TRACKS) v += w[t] * e.pts[t];
  v += 0.6 * e.energy + 0.9 * e.draw + 0.8 * e.hits + 0.6 * e.trash;
  for (const icon of d.icons) v += icon === focus ? 0.7 : 0.25;
  if (d.onTurnStart) v += 2.5 + (MAX_YEARS - G.year) * 0.15;
  if (d.onGameEnd) v += Math.min(4, p.cv.length / 2);
  if (id === 'sabbatical') v += 0.5;
  return v;
}

function chooseBuy(G, p, strategy) {
  const opts = [];
  G.row.forEach((c, i) => { if (canBuyRow(G, i)) opts.push({ kind: 'row', i, id: c.id }); });
  for (const id of BASICS) if (canBuyBasic(G, id)) opts.push({ kind: 'basic', id });
  if (!opts.length) return null;
  const deckSize = p.deck.length + p.hand.length + p.discard.length + p.play.length;
  const lateGame = G.year >= MAX_YEARS - 2;
  for (const o of opts) {
    o.v = cardScore(G, p, o.id, strategy) + 0.25 * cardCost(G, p, o.id);
    // Effort cards are worth less once the deck is big or the game is nearly over.
    if (['ra', 'grant'].includes(o.id)) o.v -= lateGame ? 2 : (deckSize > 16 ? 0.8 : 0);
    if (lateGame) { const e = estimate(G, p, o.id); o.v = TRACKS.reduce((s, t) => s + e.pts[t], 0) + 0.3 * e.draw; }
  }
  opts.sort((a, b) => b.v - a.v);
  return opts[0].v > 1.2 ? opts[0] : null;
}

function choosePublish(G, p, strategy) {
  const { focus } = weights(p, strategy, G);
  let best = null, bestV = 0;
  for (const c of p.play) {
    if (!canPublish(G, c.uid)) continue;
    const d = CARDS[c.id];
    let v = 0;
    if (d.onTurnStart || d.onGameEnd) v += 5;
    for (const icon of d.icons) v += icon === focus ? 1.5 : 0.6;
    // Losing the card's per-play value is the price. Starting cards are cheap to lose.
    const e = estimate(G, p, c.id);
    const playValue = TRACKS.reduce((s, t) => s + e.pts[t], 0) + 0.5 * e.energy + 0.7 * e.draw + 0.5 * e.hits;
    v -= Math.max(0, playValue - 1) * 0.9;
    if (d.id === 'coffee') v += G.year >= 4 ? 0.6 : 0.1;
    if (v > bestV) { best = c; bestV = v; }
  }
  return best;
}

function chooseHonor(G, p) {
  const el = eligibleHonors(G, p);
  if (!el.length) return null;
  // Claim the one most at risk of being sniped: lowest total threshold.
  el.sort((a, b) => sum(a.need) - sum(b.need) || b.value - a.value);
  return el[0];
}
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

export function resolveBotPrompt(G) {
  const sp = G.pending;
  const p = cur(G);
  const ranked = sp.cards.slice().sort((a, b) => botCardKeep(a.id, p) - botCardKeep(b.id, p));
  let chosen;
  if (/trash/i.test(sp.text)) {
    chosen = ranked.filter(c => botCardKeep(c.id, p) < 0.5).slice(0, sp.max).map(c => c.uid);
    if (chosen.length < sp.min) chosen = ranked.slice(0, sp.min).map(c => c.uid);
  } else chosen = ranked.slice(0, sp.min).map(c => c.uid);
  resolvePending(G, chosen);
}
function botCardKeep(id, p) {
  const d = CARDS[id];
  if (d.junk) return -2;
  if (id === 'coffee') { const n = p.deck.length + p.hand.length + p.discard.length + p.play.length; return n > 14 ? 0.2 : 1; }
  return 1 + d.cost;
}

// Play one full bot turn. Returns when the turn has ended (or the game is over).
export function botTurn(G) {
  const p = cur(G);
  const strategy = p.strategy || 'adaptive';
  while (G.pending) resolveBotPrompt(G);
  playAll(G);
  while (G.pending) { resolveBotPrompt(G); playAll(G); }
  for (let i = 0; i < 3 && G.phase === 'main'; i++) {
    const b = chooseBuy(G, p, strategy);
    if (!b) break;
    if (b.kind === 'row') buyRow(G, b.i); else buyBasic(G, b.id);
  }
  const pub = choosePublish(G, p, strategy);
  if (pub) publish(G, pub.uid);
  const h = chooseHonor(G, p);
  if (h) claimHonor(G, h.id);
  if (G.phase === 'main') endTurn(G);
}
