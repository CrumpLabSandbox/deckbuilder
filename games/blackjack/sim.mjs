// Blackjack check: a basic-strategy player should lose about 0.3-0.6% of what they bet.
import { newGame, deal, insure, act, dealerStep, nextRound, setBet } from './engine.js';
import { recommend } from './strategy.js';
const quick = process.argv.includes('--quick');
const ROUNDS = quick ? 20000 : Number(process.argv[2] || 600000);
const G = newGame({ seed: 'bj-sim', players: [{ name: 'BS', kind: 'bot' }], options: { bankroll: 1e12 } });
let bj = 0, busts = 0, dealerBusts = 0;
for (let r = 0; r < ROUNDS; r++) {
  setBet(G, 0, 10);
  deal(G);
  while (G.phase === 'insurance') insure(G, 0, false);
  let guard = 0;
  while (G.phase === 'play') { const rec = recommend(G); act(G, rec.action); if (++guard > 50) throw new Error('stuck'); }
  while (G.phase === 'dealer') dealerStep(G);
  if (G.phase !== 'settled') throw new Error('not settled: ' + G.phase);
  for (const h of G.players[0].hands) { if (h.result === 'blackjack') bj++; if (h.result === 'bust') busts++; }
  nextRound(G);
}
const edge = -G.stats.net / G.stats.wagered * 100;
const perRound = -G.stats.net / (ROUNDS * 10) * 100;
console.log(`Blackjack: ${ROUNDS} rounds of basic strategy, 6 decks, S17, DAS, late surrender.`);
console.log(`  house edge ${perRound.toFixed(2)}% of initial bets (${edge.toFixed(2)}% of all money wagered) · player blackjacks ${(100 * bj / ROUNDS).toFixed(2)}% of rounds (expected ~4.7%)`);
if (!quick && (perRound < 0 || perRound > 1.2)) { console.log('UNEXPECTED EDGE'); process.exit(1); }
console.log('OK');
