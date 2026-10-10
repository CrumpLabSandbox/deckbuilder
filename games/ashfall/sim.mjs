// Headless simulation of Ashfall with simple bots. Used to calibrate ratings and
// as a CI sanity check (node games/ashfall/sim.mjs --quick).
import {
  cloneGame, buyCard, buyWork, endDay, score, cardCost, workCost, DAYS, rating,
} from './engine.js';
import { resolvePrompt, playTurn, bigMoney, engineBot, moneyPlus, runBot } from './bots.js';

const quick = process.argv.includes('--quick');
const N = quick ? 300 : Number(process.argv[2] || 3000);

// Monte Carlo bot: at each buy, try every affordable candidate, roll the rest of the game out
// K times with a base policy, and keep the one with the best mean score.
function makeMonteCarlo(base, K = Number(process.env.MCK || 6)) {
  let salt = 0;
  return function mc(G) {
    if (G.day >= DAYS) return base(G); // last day: greedy is fine
    const cands = [null, ...[...G.market, 'pearl', 'obsidian', 'totem', 'idol', 'heart']
      .filter(id => G.supply[id] > 0 && cardCost(G, id) <= G.coins),
      ...G.worksMarket.filter(id => workCost(G, id) <= G.coins).map(id => 'work:' + id)];
    let best = null, bestV = -Infinity;
    for (const id of cands) {
      let tot = 0;
      for (let k = 0; k < K; k++) {
        const H = cloneGame(G, `mc${salt++}`);
        if (id && id.startsWith('work:')) buyWork(H, id.slice(5)); else if (id) buyCard(H, id);
        // finish remaining buys this turn with base policy
        while (H.buys > 0) { const p = base(H); if (!p || !buyCard(H, p)) break; }
        endDay(H);
        while (H.phase !== 'over') {
          while (H.pending) resolvePrompt(H);
          playTurn(H, base);
          while (H.pending) resolvePrompt(H);
          endDay(H);
        }
        tot += score(H);
      }
      const v = tot / K;
      if (process.env.DEBUGMC) console.log(`  day ${G.day} cand ${id}: ${v.toFixed(1)}`);
      if (v > bestV) { bestV = v; best = id; }
    }
    return best;
  };
}

const run = runBot;

function stats(name, scores) {
  scores.sort((a, b) => a - b);
  const q = (p) => scores[Math.floor(p * (scores.length - 1))];
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  console.log(`${name.padEnd(10)} n=${scores.length} mean=${mean.toFixed(1)} p10=${q(0.1)} p50=${q(0.5)} p90=${q(0.9)} max=${scores[scores.length - 1]}`);
}

if (process.argv.includes('--trace')) {
  const seed = process.argv[process.argv.indexOf('--trace') + 1];
  const strat = process.argv.includes('--mcbot') ? makeMonteCarlo(engineBot) : engineBot;
  const G = run(seed, strat);
  for (const l of G.log) console.log(`D${l.day}: ${l.msg}`);
  console.log('score', score(G), 'bought', G.stats.bought);
  process.exit(0);
}
if (process.argv.includes('--mc')) {
  const M = quick ? 10 : Number(process.argv[process.argv.indexOf('--mc') + 1] || 100);
  const mcE = [], mcM = [], bmS = [];
  for (let i = 0; i < M; i++) {
    const seed = `sim-${i}`;
    mcE.push(score(run(seed, makeMonteCarlo(engineBot))));
    mcM.push(score(run(seed, makeMonteCarlo(moneyPlus))));
    bmS.push(score(run(seed, bigMoney)));
  }
  stats('bigmoney', bmS);
  stats('mc-engine', mcE);
  stats('mc-money', mcM);
  process.exit(0);
}
const bm = [], en = [], mp = [], best = [];
for (let i = 0; i < N; i++) {
  const seed = `sim-${i}`;
  const a = score(run(seed, bigMoney));
  const b = score(run(seed, engineBot));
  const m = score(run(seed, moneyPlus));
  bm.push(a); en.push(b); mp.push(m); best.push(Math.max(a, b, m));
}
stats('bigmoney', bm);
stats('engine', en);
stats('moneyplus', mp);
stats('best-of', best);
if (!quick) {
  const counts = {};
  for (let i = 0; i < best.length; i++) { const r = rating(bm[i], best[i]).name; counts[r] = (counts[r] || 0) + 1; }
  console.log('Rating of plain Big Money vs par:', counts);
}
console.log('OK');
