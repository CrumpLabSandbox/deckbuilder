// Take 5 bot simulation: termination, game length, and whether the smarter bots actually play better.
import { newGame, step, nextRound } from './engine.js';
import { botsChoose } from './bots.js';
const quick = process.argv.includes('--quick');
const N = quick ? 40 : Number(process.argv[2] || 400);
function run(players, seed) {
  const G = newGame({ seed, players });
  let guard = 0;
  while (G.phase !== 'over') {
    if (G.phase === 'choose') botsChoose(G);
    else if (G.phase === 'resolve') step(G);
    else if (G.phase === 'roundover') nextRound(G);
    else throw new Error('stuck in ' + G.phase);
    if (++guard > 20000) throw new Error('runaway');
  }
  return G;
}
for (const [label, levels] of [['easy vs hard, 4 players', ['easy', 'hard', 'easy', 'hard']], ['normal vs hard, 4 players', ['normal', 'hard', 'normal', 'hard']], ['all normal, 6 players', Array(6).fill('normal')], ['all normal, 10 players', Array(10).fill('normal')]]) {
  const wins = {}, pts = {}, cnt = {};
  let rounds = 0;
  for (let g = 0; g < N; g++) {
    const G = run(levels.map((l, i) => ({ name: 'P' + i, level: l })), `t5-${label}-${g}`);
    rounds += G.round;
    for (const p of G.players) {
      cnt[p.level] = (cnt[p.level] || 0) + 1; pts[p.level] = (pts[p.level] || 0) + p.score;
      if (G.winners.includes(p.idx)) wins[p.level] = (wins[p.level] || 0) + 1 / G.winners.length;
    }
  }
  const share = Object.keys(cnt).map((l) => `${l}: wins ${(100 * (wins[l] || 0) / N / (cnt[l] / N)).toFixed(0)}% of seats, mean ${(pts[l] / cnt[l]).toFixed(1)} bullheads`).join(' · ');
  console.log(`${label} — ${(rounds / N).toFixed(1)} rounds per game — ${share}`);
}
console.log('OK');
