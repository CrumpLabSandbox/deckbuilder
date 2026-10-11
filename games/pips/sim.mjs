// Pace and balance check for Pips. node games/pips/sim.mjs [games]
import { newGame, score, deckSize, faceHeartsLeft } from './engine.js';
import { botTurn, STRATEGIES } from './bots.js';
import { makeRng } from '../../platform/rng.js';
const quick = process.argv.includes('--quick');
const N = quick ? 100 : Number(process.argv[2] || 2000);
const pick = makeRng('pips-setup');
const byStrat = {}, bySeat = {}; let rounds = 0, byHearts = 0, scores = 0, turns = 0;
for (let g = 0; g < N; g++) {
  const specs = [0, 1, 2, 3].map(i => ({ name: 'P' + i, kind: 'bot', strategy: pick.pick(STRATEGIES) }));
  const G = newGame({ seed: 'pips-' + g, players: specs });
  let guard = 0;
  while (G.phase !== 'over') { botTurn(G); if (++guard > 500) throw new Error('runaway'); }
  rounds += G.round; turns += guard; if (G.endReason.includes('heart')) byHearts++;
  for (const p of G.players) {
    const win = G.winner === p.idx ? 1 : 0;
    for (const [map, k] of [[byStrat, p.strategy], [bySeat, 'seat' + p.idx]]) { const e = map[k] || (map[k] = { n: 0, w: 0, s: 0 }); e.n++; e.w += win; e.s += score(p); }
    scores += score(p);
  }
}
console.log(`Pips: ${N} four-player games. Mean rounds ${(rounds / N).toFixed(1)}, mean turns ${(turns / N).toFixed(0)}, ended by face hearts ${(100 * byHearts / N).toFixed(0)}%, mean score ${(scores / N / 4).toFixed(1)}`);
for (const [title, map] of [['By strategy', byStrat], ['By seat', bySeat]]) {
  console.log(title);
  for (const [k, e] of Object.entries(map).sort((a, b) => b[1].w / b[1].n - a[1].w / a[1].n)) console.log(`  ${k.padEnd(8)} win=${(100 * e.w / e.n).toFixed(1)}% mean score=${(e.s / e.n).toFixed(1)}`);
}
console.log('OK');
