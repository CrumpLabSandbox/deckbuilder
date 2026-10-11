import { cur, other, payoffTop, sideTop, pileValue, canPlayOn, isWild, play, discard, pass, canPass, TOP_VALUE, SIDE_STACKS } from './engine.js';

// Can the pay-off card be played after a short chain of hand/side plays? Returns the chain or null.
function chainToPayoff(G, p, depth = 4) {
  const target = payoffTop(p);
  if (!target) return null;
  const sources = () => {
    const s = p.hand.map(c => ({ from: 'hand', uid: c.uid, card: c }));
    for (let i = 0; i < SIDE_STACKS; i++) { const t = sideTop(p, i); if (t) s.push({ from: 'side', i, card: t }); }
    return s;
  };
  // Depth-limited search over pile values (not full state), avoiding wilds unless needed.
  const values = G.center.map(pileValue);
  const avail = sources().filter(s => !isWild(s.card) || true);
  function dfs(vals, used, chain, d) {
    for (let k = 0; k < vals.length; k++) if (vals[k] < TOP_VALUE && (isWild(target) || target.rank === vals[k] + 1)) return chain.concat([{ src: { from: 'payoff' }, pile: k }]);
    if (d === 0) return null;
    for (let k = 0; k < vals.length; k++) {
      if (vals[k] >= TOP_VALUE) continue;
      // Prefer exact cards; wild only if no exact card fits this pile.
      const exact = avail.filter((s, i) => !used.has(i) && !isWild(s.card) && s.card.rank === vals[k] + 1);
      const wilds = avail.filter((s, i) => !used.has(i) && isWild(s.card));
      for (const s of (exact.length ? exact : wilds)) {
        const i = avail.indexOf(s);
        // A side-stack card is only available if it is still the top; cards beneath it are not in avail, so this is safe.
        const nv = vals.slice(); nv[k] = nv[k] + 1 >= TOP_VALUE ? 0 : nv[k] + 1;
        const r = dfs(nv, new Set([...used, i]), chain.concat([{ src: { from: s.from, uid: s.uid, i: s.i }, pile: k }]), d - 1);
        if (r) return r;
      }
    }
    return null;
  }
  return dfs(values, new Set(), [], depth);
}

function opponentNeeds(G) {
  const o = other(G), t = payoffTop(o);
  return t && !isWild(t) ? t.rank : null;
}

export function botTurn(G) {
  const p = cur(G);
  let guard = 0;
  while (G.phase === 'main' && guard++ < 60) {
    // 1. Pay-off card directly or via a short chain.
    const chain = chainToPayoff(G, p);
    if (chain) { for (const step of chain) { if (!play(G, step.src, step.pile)) break; if (G.phase !== 'main') return; } continue; }
    // 2. Free plays from hand or side stacks that do not set up the opponent's pay-off card.
    const need = opponentNeeds(G);
    let played = false;
    const cands = [];
    p.hand.forEach(c => cands.push({ from: 'hand', uid: c.uid, card: c }));
    for (let i = 0; i < SIDE_STACKS; i++) { const t = sideTop(p, i); if (t) cands.push({ from: 'side', i, card: t }); }
    for (const s of cands.sort((a, b) => (isWild(a.card) ? 1 : 0) - (isWild(b.card) ? 1 : 0))) {
      if (isWild(s.card)) continue; // keep Kings for the pay-off card
      for (let k = 0; k < G.center.length; k++) {
        if (!canPlayOn(s.card, G.center[k])) continue;
        const after = pileValue(G.center[k]) + 1;
        const helpsOpponent = need !== null && after + 1 === need;
        // Playing from hand when it empties the hand is always worth it (free redraw).
        if (helpsOpponent && !(s.from === 'hand' && p.hand.length === 1)) continue;
        play(G, s, k); played = true; break;
      }
      if (played) break;
    }
    if (played) continue;
    break;
  }
  if (G.phase !== 'main') return;
  // 3. Discard: build descending runs on side stacks, keep Kings, avoid handing the opponent their card.
  if (!p.hand.length) { if (canPass(G)) pass(G); return; }
  let best = null, bestV = -Infinity;
  for (const c of p.hand) {
    for (let i = 0; i < SIDE_STACKS; i++) {
      const t = sideTop(p, i);
      let v = 0;
      if (!t) v = 2 - Math.min(2, p.side.filter(s => !s.length).length * 0.4);
      else if (t.rank === c.rank + 1) v = 5;        // descending run: both stay playable in order
      else if (t.rank === c.rank) v = 3;
      else if (t.rank > c.rank) v = 1;
      else v = -2;                                   // burying a lower card under a higher one
      if (isWild(c)) v -= 6;
      v += (13 - c.rank) * 0.05;                      // slight preference for dumping high cards
      if (v > bestV) { bestV = v; best = { uid: c.uid, i }; }
    }
  }
  discard(G, best.uid, best.i);
}
