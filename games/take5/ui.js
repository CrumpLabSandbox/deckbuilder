import { newGame, chooseCard, step, pickRow, nextRound, preview, bulls, rowBulls, targetRow, botPickRow, waitingFor } from './engine.js';
import { botsChoose } from './bots.js';

const app = document.getElementById('app'), modalRoot = document.getElementById('modal-root');
const SPEEDS = { slow: 1100, normal: 700, fast: 300 };
let G = null, timer = null, speed = 'normal', viewer = null, passTo = null;

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k === 'onclick') el.onclick = v; else if (k === 'onchange') el.onchange = v;
    else if (k === 'html') el.innerHTML = v; else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  }
  for (const c of children.flat()) { if (c === null || c === undefined || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return el;
}
function cardEl(n, { classes = '', onclick, who, small = false } = {}) {
  const b = bulls(n);
  const el = h('div', { class: `ncard b${b} ${small ? 'small' : ''} ${classes}`, title: `${n}: ${b} bullhead${b === 1 ? '' : 's'}` },
    h('div', { class: 'num' }, n), h('div', { class: 'bulls' }, '🐮'.repeat(b)), h('div', { class: 'bn' }, small ? '' : `${b}`));
  if (who) el.append(h('div', { class: 'who' }, who));
  if (onclick) { el.onclick = onclick; el.classList.add('clickable'); }
  return el;
}
const humans = () => G.players.filter((p) => p.kind === 'human').map((p) => p.idx);

// ---------- flow ----------
function after() {
  clearTimeout(timer);
  if (!G) { render(); return; }
  if (G.phase === 'choose') {
    botsChoose(G);
    if (G.phase === 'choose') {
      const next = waitingFor(G).find((p) => G.players[p].kind === 'human');
      if (humans().length > 1 && next !== viewer) { passTo = next; viewer = null; }
      else viewer = next;
    }
  }
  if (G.phase === 'pickrow') {
    const p = G.pending.p;
    if (humans().length > 1 && viewer !== p) { passTo = p; viewer = null; } else viewer = p;
  }
  render();
  if (G.phase === 'resolve') timer = setTimeout(() => { step(G); after(); }, SPEEDS[speed]);
  if (G.phase === 'roundover' || G.phase === 'over') showRoundEnd();
}
function start(cfg) {
  G = newGame({ seed: Date.now().toString(36), players: cfg.players, options: { target: cfg.target } });
  viewer = null; passTo = null;
  modalRoot.replaceChildren();
  after();
}

// ---------- render ----------
function render() {
  app.replaceChildren();
  if (!G) { app.append(renderSetup()); return; }
  const waiting = G.phase === 'choose' ? waitingFor(G) : [];
  app.append(h('div', { class: 'status' },
    h('div', {}, h('b', {}, `Round ${G.round} · turn ${G.turn} of ${G.opts.handSize}`), h('span', { class: 'muted' }, ` · game ends when someone reaches ${G.opts.target}; fewest bullheads wins`)),
    h('div', { class: 'muted' }, G.phase === 'choose' ? `Waiting for ${waiting.map((p) => G.players[p].name).join(', ')}` : G.phase === 'resolve' ? 'Placing cards, lowest first…' : '')));
  const main = h('div', { class: 'main' });
  main.append(h('div', {}, renderRows(), renderReveal(), renderHand()), h('div', {}, renderPlayers(), renderLog()));
  app.append(main);
  if (passTo !== null) {
    const p = G.players[passTo];
    modalRoot.replaceChildren(h('div', { class: 'overlay' }, h('div', { class: 'modal', style: 'max-width:420px;text-align:center' },
      h('h2', {}, `Pass to ${p.name}`), h('p', { class: 'sub' }, G.phase === 'pickrow' ? 'You need to choose a row to take.' : 'Choose your card for this turn.'),
      h('button', { class: 'primary', onclick: () => { viewer = passTo; passTo = null; modalRoot.replaceChildren(); render(); } }, `I'm ${p.name}`))));
  }
}

function renderRows() {
  const sec = h('section', { class: 'panel' });
  const picking = G.phase === 'pickrow' && viewer === G.pending.p;
  sec.append(h('h3', {}, 'Rows', h('span', { class: 'hint' }, picking ? 'Click the row you want to take.' : 'A card goes on the row ending with the highest number below it. The sixth card takes the row.')));
  if (picking) sec.append(h('div', { class: 'banner' }, `Your ${G.pending.card} is lower than the end of every row, so you must take a row of your choice. Your card then starts that row.`));
  const cheapest = botPickRow(G);
  const rows = h('div', { class: 'rows' });
  G.rows.forEach((r, i) => {
    const pts = rowBulls(r);
    const row = h('div', { class: `row ${picking ? 'pickable' : ''} ${picking && i === cheapest ? 'cheapest' : ''}`, onclick: picking ? () => { pickRow(G, i); after(); } : null },
      h('div', { class: 'label' }, h('b', {}, `Row ${i + 1}`), h('br'), `${pts} 🐮`));
    const slots = h('div', { class: 'slots' });
    r.forEach((n, k) => slots.append(cardEl(n, { classes: G.last && G.last.row === i && k === r.length - 1 ? 'fresh' : '' })));
    for (let k = r.length; k < G.opts.rowMax; k++) slots.append(h('div', { class: 'slot' }));
    slots.append(h('div', { class: 'slot sixth' }, 'sixth card takes the row'));
    row.append(slots);
    rows.append(row);
  });
  sec.append(rows);
  if (G.last && G.last.took && (G.phase === 'resolve' || G.phase === 'choose')) {
    sec.append(h('div', { class: 'muted', style: 'margin-top:8px;font-size:0.88rem' }, `${G.players[G.last.p].name} took ${G.last.took.length} card${G.last.took.length === 1 ? '' : 's'} for ${G.last.pts} bullhead${G.last.pts === 1 ? '' : 's'} ${G.last.why}.`));
  }
  return sec;
}

function renderReveal() {
  const sec = h('section', { class: 'panel' });
  if (G.phase === 'resolve' || G.phase === 'pickrow') {
    sec.append(h('h3', {}, 'This turn', h('span', { class: 'hint' }, 'Everyone’s cards are placed from lowest to highest.')));
    const strip = h('div', { class: 'reveal-strip' });
    const doneCount = G.revealed.length - G.queue.length;
    G.revealed.forEach((e, k) => strip.append(cardEl(e.card, { small: true, who: G.players[e.p].name, classes: k < doneCount ? 'dim' : k === doneCount ? 'fresh' : '' })));
    sec.append(strip);
  } else {
    sec.append(h('h3', {}, 'This turn'), h('div', { class: 'muted', style: 'font-size:0.88rem' }, G.phase === 'choose' ? 'Everyone picks a card in secret. When all have chosen, the cards are revealed together.' : ''));
  }
  return sec;
}

function renderHand() {
  const sec = h('section', { class: 'panel' });
  const p = viewer !== null ? G.players[viewer] : G.players.find((q) => q.kind === 'human');
  if (!p) return sec;
  const canChoose = G.phase === 'choose' && viewer === p.idx && G.choices[p.idx] === undefined && passTo === null;
  const hidden = humans().length > 1 && viewer !== p.idx;
  sec.append(h('h3', {}, `Hand · ${p.name}`, h('span', { class: 'hint' }, canChoose ? 'Click a card to play it. The note under each card says where it would go if it were played alone.' : G.choices[p.idx] !== undefined ? `You chose ${G.choices[p.idx]}.` : '')));
  const hand = h('div', { class: 'hand' });
  if (hidden) { sec.append(h('div', { class: 'muted' }, 'Hidden until the device is passed.')); return sec; }
  for (const n of p.hand) {
    const pv = preview(G, n);
    let txt, cls;
    if (pv.kind === 'low') { txt = `lower than every row: take one (≥${pv.pts} 🐮)`; cls = 'bad'; }
    else if (pv.kind === 'sixth') { txt = `6th card on row ${pv.row + 1}: take ${pv.pts} 🐮`; cls = 'bad'; }
    else { txt = `row ${pv.row + 1}, card ${pv.pos}`; cls = pv.pos === 5 ? 'warn' : 'ok'; }
    hand.append(h('div', { class: 'hcard' }, cardEl(n, { classes: G.choices[p.idx] === n ? 'chosen' : '', onclick: canChoose ? () => { chooseCard(G, p.idx, n); viewer = null; after(); } : null }), h('div', { class: `pv ${cls}` }, txt)));
  }
  sec.append(hand);
  return sec;
}

function renderPlayers() {
  const sec = h('section', { class: 'panel players' }, h('h3', {}, 'Bullheads'));
  const t = h('table');
  const order = G.players.slice().sort((a, b) => a.score - b.score);
  for (const p of order) {
    const chose = G.phase === 'choose' && G.choices[p.idx] !== undefined;
    t.append(h('tr', { class: p.kind === 'human' ? 'me' : '' },
      h('td', {}, p.name, chose ? h('span', { class: 'tick' }, ' ✓') : null, p.kind === 'bot' ? h('span', { class: 'muted' }, ` · ${p.level}`) : null,
        h('div', { class: 'bar' }, h('div', { style: `width:${Math.min(100, 100 * p.score / G.opts.target)}%` }))),
      h('td', { class: 'num', title: 'this round' }, p.roundPts ? `+${p.roundPts}` : ''),
      h('td', { class: 'num' }, h('b', {}, p.score))));
  }
  sec.append(t);
  return sec;
}

function renderLog() {
  const sec = h('section', { class: 'panel' }, h('h3', {}, 'Log'));
  const log = h('div', { class: 'log' });
  for (const e of G.log.slice(-50)) log.append(h('p', { class: e.kind }, e.msg));
  sec.append(log);
  requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  return sec;
}

function showRoundEnd() {
  const over = G.phase === 'over';
  const m = h('div', { class: 'modal', style: 'max-width:560px' });
  m.append(h('h2', {}, over ? `${G.winners.map((i) => G.players[i].name).join(' and ')} win${G.winners.length === 1 && G.players[G.winners[0]].name !== 'You' ? 's' : ''}!` : `End of round ${G.round}`));
  m.append(h('p', { class: 'sub' }, over ? `Someone reached ${G.opts.target} bullheads. Fewest bullheads wins.` : 'Bullheads taken this round, and totals so far.'));
  const t = h('table', { class: 'sc' }, h('tr', {}, h('th', {}, 'Player'), h('th', {}, 'This round'), h('th', {}, 'Total')));
  for (const p of G.players.slice().sort((a, b) => a.score - b.score)) t.append(h('tr', {}, h('td', {}, p.name), h('td', { class: 'num' }, p.roundPts), h('td', { class: 'num' }, h('b', {}, p.score))));
  m.append(t);
  m.append(h('div', { class: 'actions' }, over
    ? h('button', { class: 'primary', onclick: () => { G = null; modalRoot.replaceChildren(); render(); } }, 'New game')
    : h('button', { class: 'primary', onclick: () => { modalRoot.replaceChildren(); nextRound(G); after(); } }, 'Deal the next round'),
  h('button', { onclick: () => modalRoot.replaceChildren() }, 'Look at the table')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

function renderSetup() {
  const names = ['You', 'Ada', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy'];
  const seats = names.map((n, i) => ({ name: n, kind: i === 0 ? 'human' : 'bot', level: 'normal' }));
  let count = 5, target = 66;
  const seatsEl = h('div');
  const draw = () => {
    seatsEl.replaceChildren();
    for (let i = 0; i < count; i++) {
      const s = seats[i];
      const kind = h('select', { onchange: (e) => { s.kind = e.target.value; draw(); } }, h('option', { value: 'human' }, 'Human'), h('option', { value: 'bot' }, 'Bot'));
      kind.value = s.kind;
      const lvl = h('select', { onchange: (e) => { s.level = e.target.value; }, disabled: s.kind === 'human' }, h('option', { value: 'easy' }, 'Easy'), h('option', { value: 'normal' }, 'Normal'), h('option', { value: 'hard' }, 'Hard'));
      lvl.value = s.level;
      seatsEl.append(h('div', { class: 'seat' }, h('input', { type: 'text', value: s.name, onchange: (e) => { s.name = e.target.value; } }), kind, lvl));
    }
  };
  draw();
  const countSel = h('select', { onchange: (e) => { count = Number(e.target.value); draw(); } }, ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => h('option', { value: n }, `${n} players`)));
  countSel.value = 5;
  const tgt = h('select', { onchange: (e) => { target = Number(e.target.value); } }, h('option', { value: 66 }, 'Play to 66 (standard)'), h('option', { value: 33 }, 'Play to 33 (quick)'));
  const spd = h('select', { onchange: (e) => { speed = e.target.value; } }, h('option', { value: 'slow' }, 'Slow'), h('option', { value: 'normal' }, 'Normal'), h('option', { value: 'fast' }, 'Fast'));
  spd.value = speed;
  return h('div', { class: 'overlay' }, h('div', { class: 'modal' },
    h('h2', {}, 'Take 5'),
    h('p', { class: 'sub' }, 'Everyone plays a card at the same time. Cards go onto four rows in number order, and whoever lays the sixth card in a row has to take the first five. Avoid bullheads. Based on 6 nimmt! by Wolfgang Kramer.'),
    h('div', { class: 'opts' }, countSel, tgt, spd), seatsEl,
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => start({ players: seats.slice(0, count).map((s) => ({ ...s })), target }) }, 'Deal'), h('button', { onclick: showRules }, 'Rules'))));
}

function showRules() {
  const m = h('div', { class: 'modal' }, h('h2', {}, 'How to play Take 5'), h('div', { class: 'rules', html: `
    <p>104 cards numbered 1 to 104. Each card has <b>bullheads</b> on it; bullheads are penalty points. <b>The game ends when someone reaches 66 bullheads, and the player with the fewest wins.</b></p>
    <h4>Bullheads</h4>
    <p>Most cards have 1. Cards ending in 5 have 2; multiples of 10 have 3; doubles (11, 22, 33…) have 5; and 55 has 7.</p>
    <h4>A round</h4>
    <p>Everyone gets 10 cards. Four cards start four rows. Then play 10 turns:</p>
    <ol>
      <li><b>Everyone chooses a card in secret</b>, then all are revealed together.</li>
      <li>Cards are placed one at a time, <b>lowest first</b>.</li>
      <li>Each card goes on the row whose last card is the <b>highest number lower than it</b>. (A 23 goes after a 20 rather than a 12.)</li>
      <li>If that row already has five cards, the sixth card <b>takes the row</b>: you collect those five cards (and their bullheads) and your card starts the row.</li>
      <li>If your card is <b>lower than the end of every row</b>, you must take any one row of your choice, and your card starts it.</li>
    </ol>
    <p>After 10 turns, count the bullheads each player took and add them to their total. Deal again until someone reaches 66.</p>
    <h4>Tips</h4>
    <ul>
      <li>A card that lands just above a row's end, with a small gap, is safe: nobody can slip in under it.</li>
      <li>The fifth position is dangerous for the next player, not for you; the sixth is the one that hurts.</li>
      <li>Very low cards can be used deliberately to grab a cheap row and reset the board.</li>
      <li>Remember which cards have been played: it tells you which gaps are still open.</li>
    </ul>` }),
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { modalRoot.replaceChildren(); if (G) render(); } }, 'Close')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

document.getElementById('btn-rules').onclick = showRules;
document.getElementById('btn-new').onclick = () => { clearTimeout(timer); G = null; modalRoot.replaceChildren(); render(); };
render();
