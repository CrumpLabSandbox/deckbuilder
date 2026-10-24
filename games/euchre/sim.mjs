// Euchre bot simulation: termination, rule sanity and bidding calibration.
import { newGame, collect, nextHand } from './engine.js';
import { botAct } from './bots.js';
const quick = process.argv.includes('--quick');
const N = quick ? 100 : Number(process.argv[2] || 2000);
const tot = { hands: 0, made: 0, euchred: 0, marches: 0, alone: 0, aloneMarches: 0, aloneEuchred: 0, round1: 0, round2: 0, forced: 0, misdeals: 0 };
let wins = [0, 0], firstDealerTeamWins = 0;
for (let g = 0; g < N; g++) {
  const G = newGame({ seed: 'eu-' + g, players: [0, 1, 2, 3].map(() => ({ kind: 'bot' })) });
  const firstDealer = G.dealer;
  let guard = 0;
  while (G.phase !== 'over') {
    if (G.phase === 'trickdone') collect(G);
    else if (G.phase === 'handover') nextHand(G);
    else if (!botAct(G)) throw new Error('stuck in ' + G.phase);
    if (++guard > 20000) throw new Error('runaway ' + g);
    for (const p of G.players) if (p.hand.length > 6) throw new Error('hand too big');
  }
  for (const k in tot) tot[k] += G.stats[k];
  wins[G.winner]++;
  if (G.winner === firstDealer % 2) firstDealerTeamWins++;
}
const pct = (a, b) => (100 * a / Math.max(1, b)).toFixed(1) + '%';
console.log(`Euchre: ${N} bot games, ${(tot.hands / N).toFixed(1)} hands per game`);
console.log(`  makers succeed ${pct(tot.made, tot.hands)} · euchred ${pct(tot.euchred, tot.hands)} · marches ${pct(tot.marches, tot.hands)} of hands`);
console.log(`  trump set in round 1 ${pct(tot.round1, tot.hands)} · round 2 ${pct(tot.round2, tot.hands)} · stuck dealer ${pct(tot.forced, tot.hands)} · thrown in ${tot.misdeals}`);
console.log(`  alone ${pct(tot.alone, tot.hands)} of hands: march ${pct(tot.aloneMarches, tot.alone)}, euchred ${pct(tot.aloneEuchred, tot.alone)}`);
console.log(`  team wins ${pct(wins[0], N)} / ${pct(wins[1], N)} · first dealer's team wins ${pct(firstDealerTeamWins, N)}`);
console.log('OK');
