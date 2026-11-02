// Go Fish simulation: games end, and better memory wins more.
import { newGame } from './engine.js';
import { botTurn } from './bots.js';
const quick = process.argv.includes('--quick');
const N = quick ? 100 : Number(process.argv[2] || 2000);
for (const mix of [['easy', 'hard'], ['normal', 'hard', 'normal', 'hard'], ['easy', 'normal', 'hard', 'easy', 'normal', 'hard'], ['normal', 'normal', 'normal']]) {
  const wins = {}, seats = {};
  let turns = 0;
  for (let g = 0; g < N; g++) {
    const levels = mix.map((_, i) => mix[(i + g) % mix.length]);
    const G = newGame({ seed: `gf-${mix.join('')}-${g}`, players: levels.map((l, i) => ({ name: 'P' + i, level: l })) });
    let guard = 0;
    while (G.phase !== 'over') { if (!botTurn(G)) throw new Error('stuck'); if (++guard > 5000) throw new Error('runaway'); }
    if (G.players.reduce((s, p) => s + p.books.length, 0) !== 13) throw new Error('books do not add up');
    turns += G.turnNo;
    for (const p of G.players) { seats[p.level] = (seats[p.level] || 0) + 1; if (G.winners.includes(p.idx)) wins[p.level] = (wins[p.level] || 0) + 1 / G.winners.length; }
  }
  console.log(`${mix.length} players [${[...new Set(mix)].join('/')}]: ${(turns / N).toFixed(0)} turns · ` + Object.keys(seats).map((l) => `${l} wins ${(100 * (wins[l] || 0) / seats[l]).toFixed(0)}% per seat`).join(', ') + ` (fair ${(100 / mix.length).toFixed(0)}%)`);
}
console.log('OK');
