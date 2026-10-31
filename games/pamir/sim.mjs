// Pax Pamir simulation: games terminate, checks resolve, seats are fair, normal beats easy.
import { newGame } from './engine.js';
import { botStep } from './bots.js';
const args = process.argv.slice(2), quick = args.includes('--quick');
const N = quick ? 4 : Number(args[0] || 60), NP = Number(args[1] || 3);
const mix = process.env.MIX ? JSON.parse(process.env.MIX) : Array(NP).fill('normal');
let turns = 0, checksSum = 0, dominantChecks = 0, totalChecks = 0, early = 0, winsByLevel = {}, seatsByLevel = {}, seatWins = Array(NP).fill(0), pointsSum = 0;
const t0 = Date.now();
for (let g = 0; g < N; g++) {
  const levels = mix.map((_, i) => mix[(i + g) % NP]);
  const G = newGame({ seed: `pp-${NP}-${g}`, players: levels.map((l, i) => ({ name: 'P' + i, level: l, loyalty: ['afghan', 'british', 'russian'][(i + g) % 3] })) });
  let guard = 0;
  while (G.phase !== 'over') { if (!botStep(G)) throw new Error(`illegal bot action in ${G.phase}`); if (++guard > 20000) throw new Error('runaway game ' + g); }
  turns += G.turnNo; checksSum += G.checks;
  for (const e of G.log) if (e.kind === 'check' && /is dominant/.test(e.msg)) dominantChecks++;
  totalChecks += G.checks;
  if (/lead/.test(G.endReason)) early++;
  seatWins[G.winner]++;
  for (const p of G.players) { seatsByLevel[p.level] = (seatsByLevel[p.level] || 0) + 1; if (G.winner === p.idx) winsByLevel[p.level] = (winsByLevel[p.level] || 0) + 1; pointsSum += p.points; }
}
console.log(`Pax Pamir: ${N} games, ${NP} players [${mix.join(',')}] in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  ${(turns / N).toFixed(1)} turns per game (${(turns / N / NP).toFixed(1)} each) · ${(checksSum / N).toFixed(1)} checks · ${(100 * dominantChecks / totalChecks).toFixed(0)}% of checks found a dominant coalition · ${(100 * early / N).toFixed(0)}% ended early by a 4-point lead · mean points ${(pointsSum / N / NP).toFixed(1)}`);
console.log(`  wins by seat ${seatWins.map((w) => (100 * w / N).toFixed(0) + '%').join('/')} · by level ${Object.keys(seatsByLevel).map((l) => `${l} ${(100 * (winsByLevel[l] || 0) / seatsByLevel[l]).toFixed(0)}% per seat`).join(', ')}`);
console.log('OK');
