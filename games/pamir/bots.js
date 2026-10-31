// Pax Pamir bots and the teaching coach. Bots list sensible actions, try each on a copy of the game,
// and take the one that most improves a position score. The coach uses the same search and explains
// the suggestion by describing what changed.
import {
  act, cloneGame, canPurchase, canPlay, canUseCard, findCourtCard, ruledBy, ruler, taxSources, battleSites,
  spyTargets, roadOptions, courtRing, needsDiscard, influence, cylindersInPlay, blockCounts, dominant, stars,
  tribes, armies, bribeFor, purchaseCost, isFreeAction, cname, GIFT_COSTS,
  REGIONS, REGION_INFO, BORDERS, bordersOf, COALITIONS, COALITION_INFO, SUIT_INFO,
} from './engine.js';

function snapshot(G, p) {
  const pl = G.players[p], b = blockCounts(G), others = COALITIONS.filter((c) => c !== pl.loyalty);
  return {
    points: pl.points,
    margin: b[pl.loyalty] - Math.max(...others.map((c) => b[c])),
    influence: influence(G, p),
    cylinders: cylindersInPlay(G, p),
    rupees: pl.rupees,
    ruled: ruledBy(G, p).length,
    court: pl.court.reduce((s, cc) => s + cc.card.rank, 0),
    hand: pl.hand.length,
    loyalty: pl.loyalty,
    rivals: G.players.filter((q) => q.idx !== p).reduce((s, q) => s + q.points * 8 + cylindersInPlay(G, q.idx) * 0.5, 0),
  };
}
export function value(G, p) {
  const s = snapshot(G, p);
  let v = s.points * 8;
  v += 1.3 * Math.max(-5, Math.min(8, s.margin));
  v += 1.6 * s.influence + 0.9 * s.cylinders;
  v += 0.4 * Math.min(s.rupees, 12) + 0.1 * Math.max(0, s.rupees - 12);
  v += 0.8 * s.court + 0.35 * Math.min(s.hand, 3) + 0.12 * Math.max(0, s.hand - 3);
  v += 1.1 * s.ruled;
  v -= 0.25 * s.rivals / Math.max(1, G.n - 1);
  if (G.phase === 'over') v += G.winner === p ? 1000 : -1000;
  return v;
}

// ---------- candidate actions ----------
function bestRoad(G, p, region) {
  const c = G.players[p].loyalty;
  return roadOptions(region).sort((a, b) => {
    const score = (id) => { const x = BORDERS.find((y) => y.id === id); const other = x.a === region ? x.b : x.a; return armies(G, other, c) + (ruler(G, other) === p ? 2 : 0) - G.map.roads[id][c]; };
    return score(b) - score(a);
  });
}
function bestSpy(G, p, region) {
  const t = spyTargets(G, region);
  return t.sort((a, b) => {
    const fa = findCourtCard(G, a), fb = findCourtCard(G, b);
    const sc = (f) => (f.owner === p ? -1 : 1) * 2 + (f.cc.card.prize ? 2 : 0) + G.players[f.owner].points * 0.2 - (f.cc.spies[p] || 0);
    return sc(fb) - sc(fa);
  });
}
export function candidates(G, p) {
  const out = [], pl = G.players[p];
  if (G.phase === 'discard') {
    const need = needsDiscard(G);
    const pool = need === 'court' ? pl.court.map((cc) => cc.card) : pl.hand;
    for (const c of pool) out.push({ type: 'discard', uid: c.uid });
    return out;
  }
  if (G.phase !== 'action') return out;
  out.push({ type: 'endTurn' });
  G.market.forEach((row, r) => row.forEach((s, c) => { if (s && canPurchase(G, p, r, c)) out.push({ type: 'purchase', row: r, col: c }); }));
  for (const card of pl.hand) {
    if (!canPlay(G, p, card.uid)) continue;
    const roads = card.impacts.includes('road') ? bestRoad(G, p, card.region) : [];
    const spies = card.impacts.includes('spy') ? bestSpy(G, p, card.region) : [];
    out.push({ type: 'play', uid: card.uid, side: 'right', roads: [roads[0], roads[1] ?? roads[0]], spies: [spies[0], spies[1] ?? spies[0]] });
  }
  for (const cc of pl.court) {
    for (const t of cc.card.actions) {
      if (!canUseCard(G, p, cc.card.uid, t)) continue;
      const base = { type: t, card: cc.card.uid };
      if (t === 'tax') { const s = taxSources(G, p); if (s.players.length || s.market.length) out.push(base); }
      else if (t === 'gift') { const slot = pl.gifts.indexOf(false); if (slot >= 0 && pl.rupees >= GIFT_COSTS[slot]) out.push(base); }
      else if (t === 'build') {
        const ruled = ruledBy(G, p), n = Math.min(3, Math.floor(pl.rupees / 2));
        if (ruled.length && n > 0) {
          for (const r of ruled) {
            out.push({ ...base, pieces: Array.from({ length: n }, () => ({ kind: 'army', region: r })) });
            const rd = bestRoad(G, p, r);
            out.push({ ...base, pieces: [{ kind: 'army', region: r }, ...rd.slice(0, n - 1).map((b) => ({ kind: 'road', border: b }))] });
          }
        }
      } else if (t === 'move') {
        const c = pl.loyalty, moves = [];
        for (const b of BORDERS) if (G.map.roads[b.id][c]) {
          if (armies(G, b.a, c)) moves.push({ kind: 'army', from: b.a, to: b.b });
          if (armies(G, b.b, c)) moves.push({ kind: 'army', from: b.b, to: b.a });
        }
        for (const m of moves.slice(0, 6)) out.push({ ...base, moves: [m] });
        const ring = courtRing(G);
        ring.forEach((uid, i) => {
          const f = findCourtCard(G, uid);
          if (!f.cc.spies[p]) return;
          for (const j of [(i + 1) % ring.length, (i - 1 + ring.length) % ring.length]) if (ring[j] !== uid) out.push({ ...base, moves: [{ kind: 'spy', from: uid, to: ring[j] }] });
        });
      } else if (t === 'betray') {
        if (pl.rupees < 2) continue;
        for (const q of G.players) for (const x of q.court) if (x.spies[p] && x.card.uid !== cc.card.uid) {
          out.push({ ...base, target: x.card.uid, takePrize: !!x.card.prize && x.card.prize === pl.loyalty });
          if (x.card.prize && x.card.prize !== pl.loyalty) out.push({ ...base, target: x.card.uid, takePrize: true });
        }
      } else if (t === 'battle') {
        for (const s of battleSites(G, p)) out.push({ ...base, site: s.region ? { region: s.region } : { card: s.card } });
      }
    }
  }
  return out;
}

export function evaluate(G, p, a, salt = 0) {
  const C = cloneGame(G, `eval:${salt}`);
  if (!act(C, a)) return null;
  if (a.type === 'endTurn') { while (C.phase === 'discard' && C.turn === p) { const d = chooseDiscard(C, p); act(C, { type: 'discard', uid: d }); } }
  return { v: value(C, p), C };
}
export function chooseDiscard(G, p) {
  const pl = G.players[p], need = needsDiscard(G);
  if (need === 'court') return pl.court.slice().sort((a, b) => keep(G, p, a.card) - keep(G, p, b.card))[0].card.uid;
  return pl.hand.slice().sort((a, b) => keep(G, p, a) - keep(G, p, b))[0].uid;
}
function keep(G, p, card) {
  let v = card.rank * 2 + card.actions.length;
  if (card.suit === 'political' && tribes(G, card.region, p)) v += 4;
  if (card.patriot === G.players[p].loyalty) v += 3;
  if (card.suit === 'political') v += stars(G, p, 'political') ? 0 : 1;
  return v;
}

export function bestAction(G, p) {
  if (G.phase === 'discard') return { type: 'discard', uid: chooseDiscard(G, p) };
  const cands = candidates(G, p);
  let best = { type: 'endTurn' }, bestV = evaluate(G, p, best)?.v ?? -Infinity;
  for (const a of cands) {
    if (a.type === 'endTurn') continue;
    const r = evaluate(G, p, a);
    if (r && r.v > bestV + 0.05) { bestV = r.v; best = a; }
  }
  return best;
}

export function botStep(G) {
  const p = G.turn;
  G.idle = G.idle || {};
  let a = G.players[p].level === 'easy' && G.phase === 'action' ? randomAction(G, p) : bestAction(G, p);
  // Keep the market moving: a bot that has bought nothing for two turns takes the cheapest card it can.
  if (a.type === 'endTurn' && G.phase === 'action' && (G.idle[p] || 0) >= 2 && G.actionsLeft > 0) {
    const free = [[0, 0], [1, 0], [0, 1], [1, 1]].find(([r, c]) => canPurchase(G, p, r, c));
    if (free) a = { type: 'purchase', row: free[0], col: free[1] };
  }
  if (a.type === 'purchase') G.idle[p] = 0;
  if (a.type === 'endTurn' && G.phase === 'action') G.idle[p] = (G.idle[p] || 0) + (G.actionsLeft === 2 ? 1 : 0);
  return act(G, a);
}
function randomAction(G, p) {
  const c = candidates(G, p).filter((a) => a.type !== 'endTurn');
  if (!c.length || G.rng.next() < 0.25) return { type: 'endTurn' };
  return c[Math.floor(G.rng.next() * c.length)];
}

// ---------- the coach: describe an action and why it helps ----------
export function describe(G, p, a) {
  const pl = G.players[p];
  if (a.type === 'endTurn') return 'End your turn.';
  if (a.type === 'discard') { const f = findCourtCard(G, a.uid); return `Discard ${f ? f.cc.card.name : pl.hand.find((c) => c.uid === a.uid)?.name}.`; }
  if (a.type === 'purchase') { const s = G.market[a.row][a.col]; return `Buy ${cname(s.card)} from the market for ${purchaseCost(G, a.col)} rupee${purchaseCost(G, a.col) === 1 ? '' : 's'}${s.rupees ? ` (it carries ${s.rupees})` : ''}.`; }
  if (a.type === 'play') { const c = pl.hand.find((x) => x.uid === a.uid); const b = bribeFor(G, p, c); return `Play ${c.name} into your court${b.amount ? `, paying a bribe of ${b.amount}` : ''}.`; }
  const f = findCourtCard(G, a.card), nm = f ? f.cc.card.name : 'a card';
  if (a.type === 'tax') return `Tax with ${nm}.`;
  if (a.type === 'gift') return `Buy a gift with ${nm} (${GIFT_COSTS[pl.gifts.indexOf(false)]} rupees).`;
  if (a.type === 'build') return `Build with ${nm}: ${a.pieces.map((x) => (x.kind === 'army' ? `army in ${REGION_INFO[x.region].name}` : `road ${x.border.split('-').map((r) => REGION_INFO[r].name).join('–')}`)).join(', ')}.`;
  if (a.type === 'move') return `Move with ${nm}: ${a.moves.map((m) => (m.kind === 'army' ? `army ${REGION_INFO[m.from].name} → ${REGION_INFO[m.to].name}` : 'a spy to the next card')).join(', ')}.`;
  if (a.type === 'betray') { const t = findCourtCard(G, a.target); return `Betray ${t.cc.card.name} with ${nm}${a.takePrize ? ' and keep it as a prize' : ''}.`; }
  if (a.type === 'battle') return `Battle ${a.site.region ? `in ${REGION_INFO[a.site.region].name}` : 'on a court card'} with ${nm}.`;
  return a.type;
}
export function explain(G, p, a) {
  const before = snapshot(G, p);
  const r = evaluate(G, p, a);
  if (!r) return { text: describe(G, p, a), why: [] };
  const after = snapshot(r.C, p), why = [];
  const coal = COALITION_INFO[after.loyalty].name;
  if (after.points > before.points) why.push(`you score ${after.points - before.points} point${after.points - before.points === 1 ? '' : 's'} now`);
  if (after.loyalty !== before.loyalty) why.push(`you switch loyalty to ${coal}`);
  if (after.margin > before.margin) why.push(`${coal}'s lead in blocks grows to ${after.margin >= 0 ? '+' : ''}${after.margin} (4 or more makes it dominant at the next check)`);
  if (after.influence > before.influence) why.push(`your influence rises to ${after.influence}, which decides the scoring if ${coal} is dominant`);
  if (after.ruled > before.ruled) why.push(`you come to rule ${after.ruled} region${after.ruled === 1 ? '' : 's'} (bribes, taxes and building)`);
  if (after.cylinders > before.cylinders) why.push(`you have ${after.cylinders} cylinders in play, which scores if no coalition is dominant`);
  if (after.court > before.court) why.push('your court gets stronger');
  if (after.rupees > before.rupees + 1) why.push(`you gain ${after.rupees - before.rupees} rupees`);
  if (a.type === 'purchase' && after.hand > before.hand) why.push('it gives you a card to play next');
  if (a.type === 'endTurn' && !why.length) why.push('nothing else available improves your position enough to be worth the rupees or the card');
  return { text: describe(G, p, a), why };
}
export { SUIT_INFO, isFreeAction };
