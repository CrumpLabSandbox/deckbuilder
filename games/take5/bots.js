// Take 5 bots. Easy plays a random card; normal and hard estimate each card's expected penalty by
// sampling what the other players might play from the cards they could be holding.
import { bulls, rowBulls, targetRow, chooseCard, step, waitingFor } from './engine.js';

export const LEVELS = { easy: 0, normal: 24, hard: 96 };

function unseenPool(G, p) {
  const known = new Set([...G.players[p].hand, ...G.rows.flat(), ...G.players.flatMap((q) => q.taken)]);
  const pool = [];
  for (let n = 1; n <= 104; n++) if (!known.has(n)) pool.push(n);
  return pool;
}

// Expected bullheads this turn for playing `card`, given sampled opponent cards.
function simulate(G, p, card, others) {
  const rows = G.rows.map((r) => ({ last: r[r.length - 1], len: r.length, pts: rowBulls(r) }));
  const plays = [{ p, card }, ...others].sort((a, b) => a.card - b.card);
  let mine = 0;
  for (const e of plays) {
    let t = -1;
    rows.forEach((r, i) => { if (r.last < e.card && (t < 0 || r.last > rows[t].last)) t = i; });
    let pts = 0;
    if (t < 0) {
      t = rows.reduce((b, r, i) => (r.pts < rows[b].pts || (r.pts === rows[b].pts && r.len < rows[b].len) ? i : b), 0);
      pts = rows[t].pts; rows[t] = { last: e.card, len: 1, pts: bulls(e.card) };
    } else if (rows[t].len >= G.opts.rowMax) {
      pts = rows[t].pts; rows[t] = { last: e.card, len: 1, pts: bulls(e.card) };
    } else rows[t] = { last: e.card, len: rows[t].len + 1, pts: rows[t].pts + bulls(e.card) };
    if (e.p === p) mine = pts;
  }
  return mine;
}

export function chooseFor(G, p) {
  const me = G.players[p], samples = LEVELS[me.level] ?? LEVELS.normal;
  if (!samples) return me.hand[Math.floor(G.rng.next() * me.hand.length)];
  const pool = unseenPool(G, p);
  const others = G.players.filter((q) => q.idx !== p).map((q) => q.idx);
  let best = null, bestV = Infinity;
  for (const card of me.hand) {
    let total = 0;
    for (let s = 0; s < samples; s++) {
      const picked = new Set();
      const draws = others.map((q) => {
        let n; do { n = pool[Math.floor(G.rng.next() * pool.length)]; } while (picked.has(n) && picked.size < pool.length);
        picked.add(n); return { p: q, card: n };
      });
      total += simulate(G, p, card, draws);
    }
    // Small tie-breaker: when penalties are equal, prefer spending middling cards and keeping extremes flexible.
    const v = total / samples + (me.level === 'hard' ? Math.abs(card - 52) / 2000 : 0);
    if (v < bestV) { bestV = v; best = card; }
  }
  return best;
}

// Let every bot that has not chosen yet pick its card.
export function botsChoose(G) {
  for (const p of waitingFor(G)) if (G.players[p].kind === 'bot') chooseCard(G, p, chooseFor(G, p));
}
