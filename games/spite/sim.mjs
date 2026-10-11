import { newGame } from './engine.js';
import { botTurn } from './bots.js';
const quick = process.argv.includes('--quick');
const N = quick ? 100 : Number(process.argv[2] || 2000);
let turns = 0, draws = 0, first = 0, maxT = 0;
for (let g = 0; g < N; g++) {
  const G = newGame({ seed: 'sm-' + g, players: [{ name: 'A' }, { name: 'B' }] });
  const starter = G.turn;
  let guard = 0;
  while (G.phase !== 'over') { botTurn(G); if (++guard > 1000) throw new Error('runaway ' + g); }
  turns += G.turnCount; maxT = Math.max(maxT, G.turnCount);
  if (G.winner === null) draws++; else if (G.winner === starter) first++;
}
console.log(`Spite and Malice: ${N} bot games. Mean turns ${(turns / N).toFixed(1)} (max ${maxT}), draws ${(100 * draws / N).toFixed(1)}%, starter wins ${(100 * first / (N - draws)).toFixed(1)}%`);
console.log('OK');
