// Fox in the Forest bot simulation: termination, game length, and bot strength.
import { newGame, collect, nextRound } from './engine.js';
import { botAct } from './bots.js';
const quick = process.argv.includes('--quick');
const N = quick ? 20 : Number(process.argv[2] || 200);
function run(levels, seed) {
  const G = newGame({ seed, players: levels.map((l, i) => ({ name: 'P' + i, level: l })) });
  let guard = 0;
  while (G.phase !== 'over') {
    if (G.phase === 'trickdone') collect(G);
    else if (G.phase === 'roundover') nextRound(G);
    else if (!botAct(G)) throw new Error('stuck ' + G.phase);
    if (++guard > 20000) throw new Error('runaway');
    for (const p of G.players) if (p.hand.length > 14) throw new Error('hand too big');
  }
  return G;
}
const pairs = process.env.PAIRS ? JSON.parse(process.env.PAIRS) : quick ? [['normal', 'easy']] : [['normal', 'easy'], ['normal', 'normal'], ['hard', 'normal'], ['hard', 'easy']];
for (const [a, b] of pairs) {
  let wa = 0, rounds = 0, firstDealerWins = 0;
  const bands = {};
  for (let g = 0; g < N; g++) {
    const levels = g % 2 ? [b, a] : [a, b];
    const G = run(levels, `fox-${a}-${b}-${g}`);
    const ai = g % 2 ? 1 : 0;
    if (G.winner === ai) wa++;
    rounds += G.round;
    for (const row of G.history) for (const r of row) bands[r.band] = (bands[r.band] || 0) + 1;
  }
  const tot = Object.values(bands).reduce((x, y) => x + y, 0);
  console.log(`${a} vs ${b}: ${a} wins ${(100 * wa / N).toFixed(0)}% · ${(rounds / N).toFixed(1)} rounds/game · bands ${Object.entries(bands).map(([k, v]) => `${k} ${(100 * v / tot).toFixed(0)}%`).join(', ')}`);
}
console.log('OK');
