// Take 5 (6 nimmt!): 104 cards, four rows, simultaneous play, lowest penalty wins. DOM-free engine.
import { makeRng } from '../../platform/rng.js';

export const DEFAULTS = { target: 66, handSize: 10, rows: 4, rowMax: 5 };

// Bullheads (penalty points) printed on each card.
export function bulls(n) {
  if (n === 55) return 7;
  if (n % 11 === 0) return 5;
  if (n % 10 === 0) return 3;
  if (n % 5 === 0) return 2;
  return 1;
}
export const rowBulls = (row) => row.reduce((s, n) => s + bulls(n), 0);

function log(G, msg, kind = 'info') { G.log.push({ round: G.round, turn: G.turn, msg, kind }); }
const nm = (G, p) => G.players[p].name;
const says = (G, p, v) => `${nm(G, p)} ${G.players[p].name === 'You' ? v.replace(/s\b/, '').replace(/^take$/, 'take') : v}`;

export function newGame({ seed, players, options = {} }) {
  const G = {
    seed: String(seed), rng: makeRng(seed), opts: { ...DEFAULTS, ...options },
    players: players.map((s, i) => ({ idx: i, name: s.name || `Player ${i + 1}`, kind: s.kind || 'bot', level: s.level || 'normal', hand: [], score: 0, roundPts: 0, taken: [] })),
    rows: [], round: 0, turn: 0, choices: {}, queue: [], revealed: [], pending: null, last: null,
    phase: 'choose', log: [], winners: null, history: [],
  };
  startRound(G);
  return G;
}

function startRound(G) {
  G.round++;
  G.turn = 1;
  const deck = G.rng.shuffle(Array.from({ length: 104 }, (_, i) => i + 1));
  for (const p of G.players) { p.hand = deck.splice(0, G.opts.handSize).sort((a, b) => a - b); p.roundPts = 0; p.taken = []; }
  G.rows = [];
  for (let r = 0; r < G.opts.rows; r++) G.rows.push([deck.pop()]);
  G.rows.sort((a, b) => a[0] - b[0]);
  G.choices = {}; G.queue = []; G.revealed = []; G.pending = null; G.last = null;
  G.phase = 'choose';
  log(G, `Round ${G.round}. The rows start with ${G.rows.map((r) => r[0]).join(', ')}.`, 'head');
}

export const allChosen = (G) => G.players.every((p) => G.choices[p.idx] !== undefined);
export const waitingFor = (G) => G.players.filter((p) => G.choices[p.idx] === undefined).map((p) => p.idx);

export function chooseCard(G, p, n) {
  if (G.phase !== 'choose' || G.choices[p] !== undefined || !G.players[p].hand.includes(n)) return false;
  G.choices[p] = n;
  if (allChosen(G)) reveal(G);
  return true;
}

function reveal(G) {
  G.revealed = G.players.map((p) => ({ p: p.idx, card: G.choices[p.idx] })).sort((a, b) => a.card - b.card);
  for (const e of G.revealed) { const h = G.players[e.p].hand; h.splice(h.indexOf(e.card), 1); }
  G.queue = G.revealed.slice();
  G.phase = 'resolve';
  log(G, `Turn ${G.turn}: ${G.revealed.map((e) => `${nm(G, e.p)} ${e.card}`).join(', ')}.`, 'turnlog');
}

// The row a card goes to: the one whose last card is the highest number below it. -1 if it is lower than every row.
export function targetRow(rows, n) {
  let best = -1;
  rows.forEach((r, i) => { const last = r[r.length - 1]; if (last < n && (best < 0 || last > rows[best][rows[best].length - 1])) best = i; });
  return best;
}

function take(G, p, t, card, why) {
  const row = G.rows[t], pts = rowBulls(row);
  const pl = G.players[p];
  pl.score += pts; pl.roundPts += pts; pl.taken.push(...row);
  G.rows[t] = [card];
  G.last = { p, card, row: t, took: row.slice(), pts, why };
  log(G, `${says(G, p, 'takes')} row ${t + 1} (${row.length} card${row.length === 1 ? '' : 's'}, ${pts} bullhead${pts === 1 ? '' : 's'}) ${why}.`, 'take');
}

// Resolve the next revealed card. Returns false if nothing to do or a human must choose a row first.
export function step(G) {
  if (G.phase !== 'resolve') return false;
  const e = G.queue[0];
  const t = targetRow(G.rows, e.card);
  if (t < 0) {
    if (G.players[e.p].kind === 'human') { G.phase = 'pickrow'; G.pending = e; return false; }
    take(G, e.p, botPickRow(G), e.card, `because ${e.card} is lower than every row`);
  } else if (G.rows[t].length >= G.opts.rowMax) {
    take(G, e.p, t, e.card, `because the ${e.card} would be the sixth card`);
  } else {
    G.rows[t].push(e.card);
    G.last = { p: e.p, card: e.card, row: t, took: null, pts: 0 };
  }
  G.queue.shift();
  if (!G.queue.length) finishTurn(G);
  return true;
}

export function pickRow(G, t) {
  if (G.phase !== 'pickrow' || t < 0 || t >= G.rows.length) return false;
  const e = G.pending;
  take(G, e.p, t, e.card, `because ${e.card} is lower than every row`);
  G.pending = null;
  G.queue.shift();
  G.phase = 'resolve';
  if (!G.queue.length) finishTurn(G);
  return true;
}

// Fewest bullheads; on a tie, the row with fewer cards.
export function botPickRow(G) {
  let best = 0;
  G.rows.forEach((r, i) => { const a = rowBulls(r), b = rowBulls(G.rows[best]); if (a < b || (a === b && r.length < G.rows[best].length)) best = i; });
  return best;
}

function finishTurn(G) {
  G.choices = {};
  if (G.players[0].hand.length) { G.turn++; G.phase = 'choose'; return; }
  const line = G.players.map((p) => `${p.name} ${p.roundPts}`).join(', ');
  log(G, `End of round ${G.round}. Bullheads this round: ${line}.`, 'score');
  G.history.push(G.players.map((p) => p.roundPts));
  const top = Math.max(...G.players.map((p) => p.score));
  if (top >= G.opts.target) {
    const low = Math.min(...G.players.map((p) => p.score));
    G.winners = G.players.filter((p) => p.score === low).map((p) => p.idx);
    G.phase = 'over';
    log(G, `Someone reached ${G.opts.target}. ${G.winners.map((i) => G.players[i].name).join(' and ')} win${G.winners.length === 1 && G.players[G.winners[0]].name !== 'You' ? 's' : ''} with ${low}.`, 'score');
  } else G.phase = 'roundover';
}

export function nextRound(G) { if (G.phase !== 'roundover') return false; startRound(G); return true; }

// Where a card would go if it were the only card played this turn (used for the hand preview).
export function preview(G, n) {
  const t = targetRow(G.rows, n);
  if (t < 0) return { kind: 'low', pts: rowBulls(G.rows[botPickRow(G)]) };
  if (G.rows[t].length >= G.opts.rowMax) return { kind: 'sixth', row: t, pts: rowBulls(G.rows[t]) };
  return { kind: 'place', row: t, pos: G.rows[t].length + 1, gap: n - G.rows[t][G.rows[t].length - 1] };
}
