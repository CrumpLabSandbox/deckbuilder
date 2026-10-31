// Party variant simulation: do the bands work, and does skill matter?
// node games/foxparty/sim.mjs [games] [players] [bands-json]
import { newGame, collect, nextRound } from './engine.js';
import { botAct } from './bots.js';
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const N = quick ? 10 : Number(args[0] || 200);
const NP = Number(args[1] || 4);
const bands = args[2] && args[2].startsWith('[') ? JSON.parse(args[2]) : null;
const mixes = quick ? [Array(NP).fill('normal')] : (process.env.MIX ? [JSON.parse(process.env.MIX)] : [Array(NP).fill('normal'), ['hard', ...Array(NP - 1).fill('normal')], ['normal', ...Array(NP - 1).fill('easy')]]);
for (const mix of mixes) {
  const winsBy = {}, seatsBy = {}, bandsSeen = {}, trickHist = Array(11).fill(0), seatWins = Array(NP).fill(0);
  let rounds = 0, allGreedyish = 0;
  for (let g = 0; g < N; g++) {
    const rot = g % NP;
    const levels = mix.map((_, i) => mix[(i + rot) % NP]);
    const G = newGame({ seed: `fp-${NP}-${g}-${mix.join('')}`, players: levels.map((l, i) => ({ name: 'P' + i, level: l })), options: bands ? { bands } : {} });
    let guard = 0;
    while (G.phase !== 'over') {
      if (G.phase === 'trickdone') collect(G);
      else if (G.phase === 'roundover') nextRound(G);
      else if (!botAct(G)) throw new Error('stuck ' + G.phase);
      if (++guard > 50000) throw new Error('runaway');
    }
    rounds += G.round;
    for (const row of G.history) {
      for (const r of row) { bandsSeen[r.band] = (bandsSeen[r.band] || 0) + 1; trickHist[r.tricks]++; }
      if (row.filter((r) => r.band === 'Greedy').length) allGreedyish++;
    }
    for (const p of G.players) {
      seatsBy[p.level] = (seatsBy[p.level] || 0) + 1;
      if (G.winners.includes(p.idx)) { winsBy[p.level] = (winsBy[p.level] || 0) + 1 / G.winners.length; seatWins[p.idx] += 1 / G.winners.length; }
    }
  }
  const tot = Object.values(bandsSeen).reduce((a, b) => a + b, 0);
  console.log(`${NP}p [${mix.join(',')}] ${N} games, ${(rounds / N).toFixed(1)} rounds`);
  console.log(`  bands: ${Object.entries(bandsSeen).map(([k, v]) => `${k} ${(100 * v / tot).toFixed(0)}%`).join(' · ')} · rounds with a Greedy player ${(100 * allGreedyish / rounds).toFixed(0)}%`);
  console.log(`  tricks per player per round: ${trickHist.map((v, i) => `${i}:${(100 * v / tot).toFixed(0)}%`).filter((s) => !s.endsWith(':0%')).join(' ')}`);
  console.log(`  win share per seat of each level: ${Object.keys(seatsBy).map((l) => `${l} ${(100 * winsBy[l] / seatsBy[l] * 1).toFixed(0)}% (fair ${(100 / NP).toFixed(0)}%)`).join(' · ')} · by seat ${seatWins.map((w) => (100 * w / N).toFixed(0) + '%').join('/')}`);
}
console.log('OK');
