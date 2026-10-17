// Bit Flip balance simulation. node games/bitflip/sim.mjs [games] [players] [key=value ...]
import { newGame } from './engine.js';
import { botTurn, STRATEGIES } from './bots.js';
import { makeRng } from '../../platform/rng.js';

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const N = quick ? 60 : Number(args[0] || 1000);
const NP = Number(args[1] || 4);
const options = {};
for (const a of args.slice(2)) { const m = a.match(/^(\w+)=(.+)$/); if (m) options[m[1]] = isNaN(Number(m[2])) ? (m[2] === 'true' ? true : m[2] === 'false' ? false : m[2]) : Number(m[2]); }

function expand(o) {
  const out = { ...o };
  for (const w of [1, 2, 3, 4]) if (out['p' + w] !== undefined) { out.points = { ...(out.points || { 1: 1, 2: 3, 3: 6, 4: 10 }), [w]: out['p' + w] }; delete out['p' + w]; }
  return out;
}
export function playGame(seed, specs, opts) {
  const G = newGame({ seed, players: specs, options: expand(opts) });
  let guard = 0;
  while (!G.over) { botTurn(G); if (++guard > 5000) throw new Error('runaway ' + seed); }
  return G;
}

const pick = makeRng('bitflip-' + NP + JSON.stringify(options));
const byStrat = {}, bySeat = {};
let rounds = 0, turns = 0, flips = 0, votes = 0, jackpotWins = 0, jackpots = 0, secrets = 0, bets = 0, scores = 0, maxScore = 0, bagEmpty = 0, most4Wins = 0, winnerFrom4 = 0, winnerPts = 0, margin = 0;
const byWidth = { 1: 0, 2: 0, 3: 0, 4: 0 }, ends = {};
const tally = (m, k, win, s) => { const e = m[k] || (m[k] = { n: 0, w: 0, s: 0 }); e.n++; e.w += win; e.s += s; };
for (let g = 0; g < N; g++) {
  const specs = Array.from({ length: NP }, (_, i) => ({ name: 'P' + i, strategy: pick.pick(STRATEGIES) }));
  const G = playGame(`bf-${g}`, specs, options);
  rounds += G.round; turns += G.turnCount; flips += G.stats.flips; votes += G.stats.votesPlaced; secrets += G.stats.secretScores; bets += G.stats.betScores;
  ends[G.endReason] = (ends[G.endReason] || 0) + 1;
  for (const w of [1, 2, 3, 4]) byWidth[w] += G.stats.scoresByWidth[w];
  if (G.stats.firstJackpot !== null) { jackpots++; if (G.winner === G.stats.firstJackpot) jackpotWins++; }
  if (G.bag.W + G.bag.B === 0) bagEmpty++;
  { const w = G.players[G.winner]; const m4 = Math.max(...G.players.map(p => p.stats.scored[4])); if (w.stats.scored[4] === m4 && m4 > 0) most4Wins++; winnerFrom4 += w.stats.scored[4] * (expand(options).points?.[4] ?? 10); winnerPts += w.score; const second = G.players[G.ranking[1]]; margin += w.score - second.score; }
  for (const p of G.players) { const win = G.winner === p.idx ? 1 : 0; tally(byStrat, p.strategy, win, p.score); tally(bySeat, 'seat' + p.idx, win, p.score); scores += p.score; maxScore = Math.max(maxScore, p.score); }
}
console.log(`Bit Flip: ${N} games, ${NP} players, options ${JSON.stringify(options)}`);
console.log(`  length: ${(rounds / N).toFixed(1)} rounds, ${(turns / N).toFixed(0)} turns · mean score ${(scores / N / NP).toFixed(1)} (max ${maxScore})`);
console.log(`  ends: ${Object.entries(ends).map(([k, v]) => `${(100 * v / N).toFixed(0)}% ${k}`).join(' | ')}`);
console.log(`  flips/game ${(flips / N).toFixed(1)} · votes/game ${(votes / N).toFixed(1)} · scores by width 1:${(byWidth[1] / N).toFixed(1)} 2:${(byWidth[2] / N).toFixed(1)} 3:${(byWidth[3] / N).toFixed(1)} 4:${(byWidth[4] / N).toFixed(1)} · secret scores/game ${(secrets / N).toFixed(2)} · bet payoffs/game ${(bets / N).toFixed(2)} · bag empty at end ${(100 * bagEmpty / N).toFixed(0)}%`);
console.log(`  winner had (joint) most 4-registers in ${(100 * most4Wins / N).toFixed(0)}% of games · ${(100 * winnerFrom4 / winnerPts).toFixed(0)}% of winner's points came from 4-registers · mean winning margin ${(margin / N).toFixed(1)}`);
console.log(`  first 4-register scorer wins ${(100 * jackpotWins / Math.max(1, jackpots)).toFixed(0)}% (fair ${(100 / NP).toFixed(0)}%) in ${(100 * jackpots / N).toFixed(0)}% of games with a jackpot`);
for (const [title, m] of [['by strategy', byStrat], ['by seat', bySeat]]) {
  console.log(`  ${title}: ` + Object.entries(m).sort((a, b) => b[1].w / b[1].n - a[1].w / a[1].n).map(([k, e]) => `${k} ${(100 * e.w / e.n).toFixed(0)}% (${(e.s / e.n).toFixed(1)}pts)`).join(' · '));
}
console.log('OK');
