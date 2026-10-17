// Bit Flip: engine. Blocks are 'W' or 'B'. DOM-free, used by bots, sim and UI.
import { makeRng } from '../../platform/rng.js';

export const WIDTHS = [1, 2, 3, 4];
export const DEFAULTS = {
  points: { 1: 1, 2: 3, 3: 6, 4: 10 },
  flipLead: 1,          // votes must lead by this much to override the printed face
  endMode: 'immediate', // 'immediate' | 'round'
  jackpotVotes: true,   // a scored 4-register's blocks become votes
  columns: false,       // columns of the triangle also score (experimental)
  drawPerTurn: 2,
  actionOnWidth: 3,     // scoring a register this wide or wider draws an action card
  maxRounds: 40,
};
export const COUNTS = {
  2: { goalDeck: 40, bag: 24, actions: 16 },
  3: { goalDeck: 45, bag: 28, actions: 18 },
  4: { goalDeck: 50, bag: 32, actions: 20 },
  5: { goalDeck: 60, bag: 40, actions: 24 },
};
export const ACTIONS = ['bitflip', 'rehearsal', 'priming', 'recount'];
export const ACTION_INFO = {
  bitflip: { name: 'Bit Flip', text: 'Flip one block on any board, or one goal card (its votes return to the bag).' },
  rehearsal: { name: 'Rehearsal', text: 'Draw 3 extra blocks and place them now.' },
  priming: { name: 'Priming', text: 'Next draw: draw 4, keep 2, return 2.' },
  recount: { name: 'Recount', text: 'Return up to 2 blocks of one colour from one goal card to the bag.' },
};

function log(G, msg) { G.log.push({ round: G.round, player: G.turn, msg }); }
const other = (c) => (c === 'W' ? 'B' : 'W');

export function newGame({ seed, players, options = {} }) {
  const rng = makeRng(seed);
  const n = players.length;
  const counts = COUNTS[n] || COUNTS[4];
  const G = {
    seed: String(seed), rng, opts: { ...DEFAULTS, ...options }, nPlayers: n,
    bag: { W: options.bag || counts.bag, B: options.bag || counts.bag },
    goalDeck: options.goalDeck || counts.goalDeck,
    goals: {}, players: [], turn: -1, round: 0, turnCount: 0, phase: 'setup', log: [], over: false, winner: null, endReason: null,
    hand: [], pendingVotes: [], actionDeck: [], actionDiscard: [], secretDeck: [],
    stats: { flips: 0, scoresByWidth: { 1: 0, 2: 0, 3: 0, 4: 0 }, secretScores: 0, betScores: 0, votesPlaced: 0, firstJackpot: null, roundsAtEnd: 0 },
    finalRound: false,
  };
  // Goal layout: deal 10 cards.
  for (const w of WIDTHS) { G.goals[w] = []; for (let i = 0; i < w; i++) G.goals[w].push(dealGoalCard(G)); }
  // Action deck.
  const per = Math.ceil(counts.actions / ACTIONS.length);
  for (const a of ACTIONS) for (let i = 0; i < per; i++) G.actionDeck.push(a);
  G.actionDeck = rng.shuffle(G.actionDeck);
  // Secret deck: every pattern of width 2..4 (4+8+16 = 28), shuffled.
  for (const w of [2, 3, 4]) for (let m = 0; m < (1 << w); m++) G.secretDeck.push({ width: w, pattern: Array.from({ length: w }, (_, i) => ((m >> i) & 1) ? 'B' : 'W') });
  G.secretDeck = rng.shuffle(G.secretDeck);
  players.forEach((spec, idx) => {
    const p = { idx, name: spec.name || `Player ${idx + 1}`, kind: spec.kind || 'bot', strategy: spec.strategy || 'balanced', board: {}, score: 0, secret: null, actions: [], primed: false,
      stats: { scored: { 1: 0, 2: 0, 3: 0, 4: 0 }, votes: 0, secrets: 0, bets: 0, actionsPlayed: 0 } };
    for (const w of WIDTHS) p.board[w] = Array(w).fill(null);
    p.secret = G.secretDeck.pop();
    G.players.push(p);
  });
  G.phase = 'main';
  nextTurn(G);
  return G;
}

function dealGoalCard(G) {
  if (G.goalDeck <= 0) return null;
  G.goalDeck--;
  return { face: G.rng.next() < 0.5 ? 'W' : 'B', votes: { W: 0, B: 0 } };
}

export const cur = (G) => G.players[G.turn];
export function goalColor(G, w, i) {
  const g = G.goals[w][i];
  const d = g.votes.W - g.votes.B;
  if (d >= G.opts.flipLead) return 'W';
  if (-d >= G.opts.flipLead) return 'B';
  return g.face;
}
export const goalPattern = (G, w) => G.goals[w].map((_, i) => goalColor(G, w, i));
export const rowFull = (p, w) => p.board[w].every(x => x !== null);
export const rowEmpty = (p, w) => p.board[w].every(x => x === null);
export function rowMatches(G, p, w) {
  if (!rowFull(p, w)) return null;
  const row = p.board[w];
  if (row.every((c, i) => c === goalColor(G, w, i))) return 'goal';
  if (p.secret && p.secret.width === w && row.every((c, i) => c === p.secret.pattern[i])) return 'secret';
  return null;
}
// Lines: rows always; columns of the left-aligned triangle when enabled. A line is a list of [w, i] cells.
export function lines(G) {
  const L = WIDTHS.map(w => ({ width: w, cells: Array.from({ length: w }, (_, i) => [w, i]), kind: 'row' }));
  if (G.opts.columns) for (let col = 0; col < 4; col++) {
    const cells = WIDTHS.filter(w => w > col).map(w => [w, col]);
    L.push({ width: cells.length, cells, kind: 'col' });
  }
  return L;
}

export function drawBlock(G) {
  const total = G.bag.W + G.bag.B;
  if (total <= 0) return null;
  const c = G.rng.next() * total < G.bag.W ? 'W' : 'B';
  G.bag[c]--;
  return c;
}
export function toBag(G, c) { G.bag[c]++; }

function nextTurn(G) {
  if (G.over) return;
  G.turn = (G.turn + 1) % G.nPlayers;
  if (G.turn === 0) {
    if (G.finalRound) return endGame(G, 'The goal deck ran out; the round was finished.');
    G.round++;
    if (G.round > G.opts.maxRounds) return endGame(G, 'Round limit reached.');
  }
  G.turnCount++;
  const p = cur(G);
  G.hand = [];
  const n = p.primed ? 4 : G.opts.drawPerTurn;
  for (let i = 0; i < n; i++) { const c = drawBlock(G); if (c) G.hand.push(c); }
  if (p.primed) { p.primed = false; G.mustReturn = Math.max(0, G.hand.length - 2); } else G.mustReturn = 0;
}

// ---- placement ----
export function canPlaceSlot(G, p, w, i) { return !G.over && p.board[w][i] === null && !rowFull(p, w); }

// Place a colour from the current hand onto the current player's empty slot.
export function placeFromHand(G, w, i, colour) {
  const p = cur(G);
  const hi = G.hand.indexOf(colour);
  if (hi < 0 || !canPlaceSlot(G, p, w, i)) return false;
  G.hand.splice(hi, 1);
  p.board[w][i] = colour;
  afterPlacement(G, p);
  return true;
}
// Vote with a hand block.
export function voteFromHand(G, w, i, colour) {
  const hi = G.hand.indexOf(colour);
  if (hi < 0 || G.over) return false;
  G.hand.splice(hi, 1);
  addVote(G, w, i, colour, cur(G));
  return true;
}
// Return a hand block to the bag (only when Priming requires it).
export function returnFromHand(G, colour) {
  const hi = G.hand.indexOf(colour);
  if (hi < 0 || G.mustReturn <= 0) return false;
  G.hand.splice(hi, 1); toBag(G, colour); G.mustReturn--;
  return true;
}
// Move a block out of an incomplete row (RAM) into the hand, to be placed again this turn.
export function pickUp(G, w, i) {
  const p = cur(G);
  if (G.over || p.board[w][i] === null || rowFull(p, w)) return false;
  G.hand.push(p.board[w][i]); p.board[w][i] = null;
  return true;
}

function addVote(G, w, i, colour, p) {
  const before = goalColor(G, w, i);
  G.goals[w][i].votes[colour]++;
  G.stats.votesPlaced++; if (p) p.stats.votes++;
  if (goalColor(G, w, i) !== before) { G.stats.flips++; log(G, `Goal ${w}.${i + 1} flips to ${goalColor(G, w, i)}.`); checkBets(G); }
}

// After any board change: score full matching rows for the player; for other players, bets may have come true.
function afterPlacement(G, p) {
  for (const L of lines(G)) scoreLineIfMatching(G, p, L);
}
function checkBets(G) { for (const q of G.players) for (const L of lines(G)) scoreLineIfMatching(G, q, L, true); }

function lineCells(p, L) { return L.cells.map(([w, i]) => p.board[w][i]); }
function scoreLineIfMatching(G, p, L, isBet = false) {
  if (G.over) return;
  const cells = lineCells(p, L);
  if (cells.some(c => c === null)) return;
  if (L.kind === 'row' && !rowFull(p, L.width)) return;
  const w = L.width;
  const goal = goalPattern(G, w);
  let how = null;
  if (cells.every((c, i) => c === goal[i])) how = 'goal';
  else if (p.secret && p.secret.width === w && cells.every((c, i) => c === p.secret.pattern[i])) how = 'secret';
  if (!how) { if (L.kind === 'row' && !isBet && G.round) p.stats.bets++; return; }
  const pts = G.opts.points[w];
  p.score += pts;
  p.stats.scored[w]++; G.stats.scoresByWidth[w]++;
  if (how === 'secret') { p.stats.secrets++; G.stats.secretScores++; }
  if (isBet) G.stats.betScores++;
  if (w === 4 && G.stats.firstJackpot === null) G.stats.firstJackpot = p.idx;
  log(G, `${p.name} scores a ${w}-register (${how}) for ${pts}.`);
  // Clear the line. Jackpot blocks become pending votes for the scoring player (only on their own turn).
  const blocks = cells.slice();
  for (const [ww, i] of L.cells) p.board[ww][i] = null;
  if (w === 4 && G.opts.jackpotVotes && p === cur(G)) G.pendingVotes.push(...blocks); else for (const c of blocks) toBag(G, c);
  if (how === 'secret') { p.secret = G.secretDeck.length ? G.secretDeck.pop() : null; }
  if (w >= G.opts.actionOnWidth && G.actionDeck.length) p.actions.push(G.actionDeck.pop());
  // The world moves on: votes on the old goal return to the bag and the goal is redealt.
  for (const g of G.goals[w]) { G.bag.W += g.votes.W; G.bag.B += g.votes.B; g.votes = { W: 0, B: 0 }; }
  refreshGoal(G, w);
}
function refreshGoal(G, w) {
  const fresh = [];
  for (let i = 0; i < w; i++) { const c = dealGoalCard(G); if (c) fresh.push(c); }
  if (fresh.length < w) {
    G.goals[w] = G.goals[w]; // leave as is
    G.goalDeck = 0;
    if (G.opts.endMode === 'round') { if (!G.finalRound) { G.finalRound = true; log(G, 'The goal deck is empty. This round is the last.'); } }
    else endGame(G, 'The goal deck could not refill a scored goal.');
    return;
  }
  G.goals[w] = fresh;
}

export function placePendingVote(G, w, i) {
  if (!G.pendingVotes.length || G.over) return false;
  addVote(G, w, i, G.pendingVotes.shift(), cur(G));
  return true;
}
export function returnPendingVotes(G) { for (const c of G.pendingVotes) toBag(G, c); G.pendingVotes = []; }

// ---- actions ----
export function playAction(G, type, params = {}) {
  const p = cur(G);
  const k = p.actions.indexOf(type);
  if (k < 0 || G.over) return false;
  p.actions.splice(k, 1); p.stats.actionsPlayed++; G.actionDiscard.push(type);
  if (type === 'rehearsal') { for (let i = 0; i < 3; i++) { const c = drawBlock(G); if (c) G.hand.push(c); } }
  else if (type === 'priming') { p.primed = true; }
  else if (type === 'recount') { const g = G.goals[params.w][params.i]; const n = Math.min(2, g.votes[params.colour]); g.votes[params.colour] -= n; G.bag[params.colour] += n; checkBets(G); }
  else if (type === 'bitflip') {
    if (params.target === 'goal') { const g = G.goals[params.w][params.i]; G.bag.W += g.votes.W; G.bag.B += g.votes.B; g.votes = { W: 0, B: 0 }; g.face = other(g.face); G.stats.flips++; checkBets(G); }
    else { const q = G.players[params.player]; const c = q.board[params.w][params.i]; if (c === null) return true; q.board[params.w][params.i] = other(c); afterPlacement(G, q); }
  }
  log(G, `${p.name} plays ${ACTION_INFO[type].name}.`);
  return true;
}

export function canEndTurn(G) { return !G.over && G.hand.length === 0 && G.mustReturn === 0 && G.pendingVotes.length === 0; }
export function endTurn(G) {
  if (!canEndTurn(G)) return false;
  nextTurn(G);
  return true;
}

function endGame(G, reason) {
  G.over = true; G.phase = 'over'; G.endReason = reason;
  G.stats.roundsAtEnd = G.round;
  const ranked = G.players.slice().sort((a, b) => b.score - a.score || a.stats.votes - b.stats.votes || a.idx - b.idx);
  G.ranking = ranked.map(p => p.idx);
  G.winner = ranked[0].idx;
  log(G, `${reason} ${ranked[0].name} wins with ${ranked[0].score}.`);
}
