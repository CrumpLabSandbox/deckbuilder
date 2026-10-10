// Balance simulation for Tenure. node games/tenure/sim.mjs [games] [players]
// --quick runs a small CI sanity check.
import { newGame, cur, standing, ROLES, HONORS } from './engine.js';
import { botTurn, STRATEGIES } from './bots.js';
import { makeRng } from '../../platform/rng.js';

const quick = process.argv.includes('--quick');
const N = quick ? 60 : Number(process.argv[2] || 2000);
const NP = Number(process.argv[3] || 3);
const roleIds = Object.keys(ROLES);

export function playGame(seed, specs) {
  const G = newGame({ seed, players: specs });
  let guard = 0;
  while (G.phase !== 'over') {
    botTurn(G);
    if (++guard > 2000) throw new Error('runaway game ' + seed);
  }
  return G;
}

const tally = (map, k, win, st) => { const e = map[k] || (map[k] = { n: 0, wins: 0, st: 0 }); e.n++; e.wins += win; e.st += st; };
const byRole = {}, byStrat = {}, byRoleStrat = {}, bySeat = {};
let honorWins = 0, totalYears = 0;
const honorCounts = {};
const pick = makeRng('setup-' + N + '-' + NP);

for (let g = 0; g < N; g++) {
  const roles = pick.shuffle(roleIds).slice(0, NP);
  const specs = roles.map(r => ({ role: r, kind: 'bot', strategy: pick.pick(STRATEGIES) }));
  const G = playGame(`sim-${g}`, specs);
  totalYears += G.year;
  if (G.endReason.includes('honors')) honorWins++;
  for (const [id, owner] of Object.entries(G.honors)) if (owner !== null) honorCounts[id] = (honorCounts[id] || 0) + 1;
  for (const p of G.players) {
    const win = G.winner === p.idx ? 1 : 0;
    const st = standing(p);
    tally(byRole, p.roleId, win, st);
    tally(byStrat, p.strategy, win, st);
    tally(byRoleStrat, p.roleId + '/' + p.strategy, win, st);
    tally(bySeat, 'seat' + p.idx, win, st);
  }
}

function report(title, map) {
  console.log(`\n${title}`);
  const rows = Object.entries(map).sort((a, b) => b[1].wins / b[1].n - a[1].wins / a[1].n);
  for (const [k, e] of rows) console.log(`  ${k.padEnd(20)} games=${String(e.n).padStart(5)} win=${(100 * e.wins / e.n).toFixed(1).padStart(5)}%  mean standing=${(e.st / e.n).toFixed(1)}`);
}
console.log(`Tenure sim: ${N} games, ${NP} players, fair share = ${(100 / NP).toFixed(1)}%`);
console.log(`Ended by 5 honors: ${(100 * honorWins / N).toFixed(0)}%, mean length ${(totalYears / N).toFixed(1)} years`);
report('By role', byRole);
{
  const rates = Object.entries(byRole).map(([k, e]) => [k, 100 * e.wins / e.n]);
  const fair = 100 / NP;
  const worst = rates.reduce((m, [k, r]) => Math.abs(r - fair) > Math.abs(m[1] - fair) ? [k, r] : m, ['', fair]);
  console.log(`  role spread: ${Math.min(...rates.map(r => r[1])).toFixed(1)}%..${Math.max(...rates.map(r => r[1])).toFixed(1)}% (fair ${fair.toFixed(1)}%, worst ${worst[0]} ${(worst[1] - fair).toFixed(1)})`);
}
report('By strategy', byStrat);
report('By seat', bySeat);
if (!quick) {
  console.log('\nHonor claim frequency');
  for (const h of HONORS) console.log(`  ${h.name.padEnd(26)} ${(100 * (honorCounts[h.id] || 0) / N).toFixed(0)}%`);
  const rows = Object.entries(byRoleStrat).filter(([, e]) => e.n >= 40).sort((a, b) => b[1].wins / b[1].n - a[1].wins / a[1].n);
  console.log('\nBest and worst role/strategy pairs');
  for (const [k, e] of [...rows.slice(0, 6), ...rows.slice(-6)]) console.log(`  ${k.padEnd(22)} win=${(100 * e.wins / e.n).toFixed(1)}% (n=${e.n})`);
}
console.log('\nOK');
