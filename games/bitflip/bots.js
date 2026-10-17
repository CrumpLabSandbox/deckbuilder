import { cur, goalColor, goalPattern, rowFull, matches, placeFromHand, voteFromHand, returnFromHand, pickUp, placePendingVote, returnPendingVotes, playAction, endTurn } from './engine.js';

export const STRATEGIES = ['grinder', 'builder', 'balanced', 'politician', 'gambler'];
const other = (c) => (c === 'W' ? 'B' : 'W');
const count = (arr, c) => arr.filter(x => x === c).length;

// Target pattern for a row: public goal, or the secret when it is closer given the row and hand.
function targetFor(G, p, w) {
  const goal = goalPattern(G, w);
  const opts = [{ how: 'goal', pat: goal }];
  if (p.secret && p.secret.width === w) opts.push({ how: 'secret', pat: p.secret.pattern });
  const row = p.board[w];
  for (const o of opts) {
    // A wild ('X') position is satisfied by whatever we have or draw; treat it as needing any colour we hold.
    o.pat = o.pat.map((c, i) => c === 'X' ? (row[i] || (G.hand[0] || 'W')) : c);
    o.need = o.pat.map((c, i) => row[i] === c ? null : c).filter(Boolean);
    o.wrong = o.pat.filter((c, i) => row[i] !== null && row[i] !== c).length;
    // Can the hand (plus wrongly placed blocks) cover the need?
    const avail = { W: count(G.hand, 'W'), B: count(G.hand, 'B') };
    for (let i = 0; i < w; i++) if (row[i] !== null && row[i] !== o.pat[i]) avail[row[i]]++;
    o.coverable = Math.min(count(o.need, 'W'), avail.W) + Math.min(count(o.need, 'B'), avail.B);
    o.remaining = o.need.length - o.coverable;
  }
  opts.sort((a, b) => a.remaining - b.remaining || a.wrong - b.wrong || (a.how === 'secret' ? -1 : 1));
  return opts[0];
}

function rowPriority(G, p, w, t, strategy) {
  const pts = G.opts.points[w];
  const need = t.need.length;
  if (!need) return -Infinity;
  if (strategy === 'grinder') return 100 - w * 10 - t.remaining;
  if (strategy === 'builder' || strategy === 'gambler') return w * 10 + (t.remaining === 0 ? 5 : 0) - t.remaining;
  // balanced / politician: points per block still needed, discounted by how far away completion is
  return pts / need * (t.remaining === 0 ? 1.3 : 1) - t.remaining * 0.8;
}

// One row placement: pick the best (row, slot, colour) for a block in hand. Returns true if placed.
function placeOne(G, p, strategy) {
  let best = null, bestV = -Infinity;
  for (const w of G.widths) {
    if (rowFull(p, w)) continue;
    const t = targetFor(G, p, w);
    const v = rowPriority(G, p, w, t, strategy);
    if (v <= bestV) continue;
    // find an empty slot whose needed colour is in hand, else a wrong slot we can swap
    for (let i = 0; i < w; i++) {
      const needC = t.pat[i];
      if (p.board[w][i] === null && G.hand.includes(needC)) { best = { w, i, c: needC, t }; bestV = v; break; }
    }
    if (bestV !== v) for (let i = 0; i < w; i++) {
      if (p.board[w][i] !== null && p.board[w][i] !== t.pat[i] && G.hand.includes(t.pat[i])) { best = { w, i, c: t.pat[i], t, swap: true }; bestV = v; break; }
    }
  }
  if (!best) return false;
  if (best.swap) pickUp(G, best.w, best.i);
  // Gambler: don't complete a 4-row that only matches by swapping into a bet... (handled in bet logic)
  return placeFromHand(G, best.w, best.i, best.c);
}

// Attack target: a goal position where opponents have matching blocks in rows that are close to scoring and we are not
// aligned with them. With overwrite on, a flip erases every such block, so multi-hit positions are worth more.
function attackTarget(G, p, colourAvail) {
  let best = null, bestV = 0;
  const ow = G.opts.overwrite;
  for (const w of G.widths.slice().reverse()) {
    const goal = goalPattern(G, w);
    for (let i = 0; i < w; i++) {
      if (goal[i] === 'X') continue;
      const flipTo = other(goal[i]);
      if (!colourAvail(flipTo)) continue;
      if (p.board[w][i] === goal[i] && !rowFull(p, w)) continue; // would hurt us too
      let v = 0;
      for (const q of G.players) {
        if (q === p || rowFull(q, w)) continue;
        const row = q.board[w];
        if (row[i] !== goal[i]) continue;
        const matched = row.filter((c, k) => matches(c, goal[k])).length;
        // Threat: how close they are; value of a hit: tempo (and a lost block when overwriting).
        const closeness = matched / w;
        v += G.opts.points[w] * closeness * (ow ? 0.5 : 0.25) * (matched >= w - 1 ? 2 : 1);
      }
      if (!v) continue;
      const g = G.goals[w][i];
      const needVotes = Math.max(1, (g.votes[goal[i]] - g.votes[flipTo]) + G.opts.flipLead);
      v /= needVotes;
      if (v > bestV) { bestV = v; best = { w, i, c: flipTo, needVotes }; }
    }
  }
  return bestV >= 1.0 ? best : null;
}

// Bet target: a full non-matching row of ours; vote on a position where the goal differs from our block.
function betTarget(G, p, colourAvail) {
  for (const w of [4, 3, 2]) {
    if (!rowFull(p, w)) continue;
    const goal = goalPattern(G, w);
    for (let i = 0; i < w; i++) if (!matches(p.board[w][i], goal[i]) && colourAvail(p.board[w][i])) return { w, i, c: p.board[w][i] };
  }
  return null;
}

function dumpSlot(G, p, c) {
  // Place a block where it does least harm: an empty slot in the lowest-value row, preferring slots whose target already is c.
  let best = null, bestV = -Infinity;
  for (const w of G.widths) {
    if (rowFull(p, w)) continue;
    const t = targetFor(G, p, w);
    for (let i = 0; i < w; i++) {
      if (p.board[w][i] !== null) continue;
      const v = (t.pat[i] === c ? 5 : 0) - w - (p.board[w].filter(x => x !== null).length === w - 1 && t.pat[i] !== c ? 20 : 0);
      if (v > bestV) { bestV = v; best = { w, i }; }
    }
  }
  return best;
}

function useActions(G, p) {
  // Rehearsal and Priming: play at once.
  if (p.actions.includes('rehearsal')) playAction(G, 'rehearsal');
  if (p.actions.includes('priming')) playAction(G, 'priming');
  // Bit Flip: finish a bet that is one off; else break an opponent one away on a wide row.
  if (p.actions.includes('bitflip')) {
    let done = false;
    for (const w of [4, 3, 2]) {
      if (!rowFull(p, w)) continue;
      const goal = goalPattern(G, w);
      const diff = goal.map((c, i) => !matches(p.board[w][i], c) ? i : -1).filter(i => i >= 0);
      if (diff.length === 1) { playAction(G, 'bitflip', { target: 'goal', w, i: diff[0] }); done = true; break; }
    }
    if (!done) {
      const t = attackTarget(G, p, () => true);
      if (t && G.opts.points[t.w] >= 6) playAction(G, 'bitflip', { target: 'goal', w: t.w, i: t.i });
    }
  }
  // Recount: clear opposing votes on a position where we are building and the goal was flipped against us.
  if (p.actions.includes('recount')) {
    for (const w of [4, 3]) {
      if (rowFull(p, w)) continue;
      for (let i = 0; i < w; i++) {
        const mine = p.board[w][i]; if (mine === null) continue;
        const g = G.goals[w][i];
        if (!g.ghost && goalColor(G, w, i) !== mine && g.votes[other(mine)] > 0 && g.face === mine) { playAction(G, 'recount', { w, i, colour: other(mine) }); return; }
      }
    }
  }
}

export function botTurn(G) {
  const p = cur(G);
  const strategy = p.strategy;
  useActions(G, p);
  // Priming return: give back the colour we need least.
  while (G.mustReturn > 0) {
    const needW = G.widths.reduce((n, w) => n + (rowFull(p, w) ? 0 : count(targetFor(G, p, w).need, 'W')), 0);
    const needB = G.widths.reduce((n, w) => n + (rowFull(p, w) ? 0 : count(targetFor(G, p, w).need, 'B')), 0);
    const give = (count(G.hand, 'W') - needW) >= (count(G.hand, 'B') - needB) ? 'W' : 'B';
    if (!returnFromHand(G, G.hand.includes(give) ? give : G.hand[0])) break;
  }
  const inHand = (c) => G.hand.includes(c);
  // Politician: one attacking vote per turn when a strong target exists.
  if (strategy === 'politician') { const t = attackTarget(G, p, inHand); if (t) voteFromHand(G, t.w, t.i, t.c); }
  let guard = 0;
  while (G.hand.length && guard++ < 40) {
    if (placeOne(G, p, strategy)) continue;
    // Nothing fits a row. Gambler: complete a nearly full wide row with the wrong colour as a bet.
    if (strategy === 'gambler') {
      let placed = false;
      for (const w of [4, 3]) {
        const filled = p.board[w].filter(x => x !== null).length;
        if (!rowFull(p, w) && filled === w - 1) { const i = p.board[w].indexOf(null); placeFromHand(G, w, i, G.hand[0]); placed = true; break; }
      }
      if (placed) continue;
    }
    const bet = betTarget(G, p, inHand); if (bet) { voteFromHand(G, bet.w, bet.i, bet.c); continue; }
    const atk = attackTarget(G, p, inHand); if (atk) { voteFromHand(G, atk.w, atk.i, atk.c); continue; }
    const c = G.hand[0];
    const d = dumpSlot(G, p, c);
    if (d) { placeFromHand(G, d.w, d.i, c); continue; }
    // Board full of bets: vote where it helps the most or anywhere.
    const b2 = betTarget(G, p, () => true);
    if (b2) { voteFromHand(G, b2.w, b2.i, c); continue; }
    voteFromHand(G, G.widths[0], 0, c);
  }
  // Jackpot votes.
  let guard2 = 0;
  while (G.pendingVotes.length && guard2++ < 10) {
    const c = G.pendingVotes[0];
    const has = (x) => x === c;
    const bet = betTarget(G, p, has); if (bet) { placePendingVote(G, bet.w, bet.i); continue; }
    const atk = attackTarget(G, p, has); if (atk) { placePendingVote(G, atk.w, atk.i); continue; }
    // Push the world toward what is in our RAM: a position where our placed block disagrees with the goal.
    let pushed = false;
    for (const w of [3, 2, 4]) { if (rowFull(p, w)) continue; for (let i = 0; i < w; i++) if (p.board[w][i] === c && goalColor(G, w, i) !== c) { placePendingVote(G, w, i); pushed = true; break; } if (pushed) break; }
    if (pushed) continue;
    returnPendingVotes(G);
  }
  endTurn(G);
}
