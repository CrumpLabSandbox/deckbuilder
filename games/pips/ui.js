import { newGame, cur, playCard, playAll, buy, canBuy, canRefresh, refreshRow, endTurn, resolvePending, cost, tier, vp, effectText, cardName, score, deckSize, faceHeartsLeft, SUIT_INFO, rankName, MAX_ROUNDS } from './engine.js';
import { botTurn, STRATEGIES } from './bots.js';
import { todaySeed } from '../../platform/rng.js';

const app = document.getElementById('app'), modalRoot = document.getElementById('modal-root');
let G = null, selected = new Set(), passScreen = false, botTimer = null, showLog = true;

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k === 'onclick') el.onclick = v; else if (k === 'onchange') el.onchange = v;
    else if (k === 'html') el.innerHTML = v; else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  }
  for (const c of children.flat()) { if (c === null || c === undefined || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return el;
}

function cardEl(c, { onclick, classes = '', mini = false, showCost = false } = {}) {
  const s = SUIT_INFO[c.suit];
  const el = h('div', { class: `pcard ${s.color} ${classes} ${mini ? 'mini' : ''} ${onclick ? 'clickable' : ''}`, title: `${cardName(c)}: ${effectText(c)}` },
    h('div', { class: 'corner' }, rankName(c.rank), h('br'), s.glyph),
    h('div', { class: 'pip' }, s.glyph),
    mini ? null : h('div', { class: 'eff' }, effectText(c)),
    h('div', { class: 'corner bottom' }, rankName(c.rank), h('br'), s.glyph));
  if (showCost) el.append(h('div', { class: 'costb' }, cost(c)));
  if (onclick) el.onclick = onclick;
  return el;
}

function startGame(spec) { G = newGame(spec); selected = new Set(); passScreen = false; afterChange(); }
function act(fn) { fn(); afterChange(); }
function humans() { return G.players.filter(p => p.kind === 'human').length; }
function afterChange() {
  if (G.phase === 'over') { render(); showEnd(); return; }
  if (cur(G).kind === 'bot' && !G.pending) { render(); clearTimeout(botTimer); botTimer = setTimeout(() => { botTurn(G); afterChange(); }, 300); return; }
  render();
}

function render() {
  app.replaceChildren(); modalRoot.replaceChildren();
  if (!G) { app.append(renderSetup()); return; }
  const p = cur(G), me = p.kind === 'human' && !passScreen;
  app.append(h('section', { class: 'panel' }, h('div', { style: 'display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px' },
    h('div', {}, h('b', { style: 'font-family:var(--font-display);font-size:1.2rem' }, `Round ${G.round} of ${MAX_ROUNDS}`), ` · ${faceHeartsLeft(G)} face hearts left · ${G.deck.length} cards in the market deck`, G.finalRound ? h('span', { style: 'color:var(--accent)' }, ' · last round') : null),
    h('div', {}, 'Turn: ', h('b', {}, p.name), p.kind === 'bot' ? h('span', { class: 'thinking' }, ' is thinking…') : null))));
  const players = h('div', { class: 'players' });
  for (const q of G.players) players.append(h('div', { class: `pbox ${q === p ? 'current' : ''}` }, h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline' }, h('b', {}, q.name), h('span', { class: 'pts' }, score(q))),
    h('div', { class: 'meta' }, `${q.kind === 'bot' ? 'bot · ' : ''}${deckSize(q)} cards · deck ${q.deck.length} · discard ${q.discard.length}`)));
  app.append(players);
  const main = h('div', { class: 'main' }), left = h('div'), right = h('div');
  // table
  const tbl = h('section', { class: 'panel' });
  const playRow = h('div', { class: 'row', 'data-empty': 'Nothing played yet.' }); if (!p.play.length) playRow.classList.add('empty');
  for (const c of p.play) playRow.append(cardEl(c, { mini: true }));
  tbl.append(h('h3', {}, 'In play'), playRow);
  tbl.append(h('h3', { style: 'margin-top:12px' }, `Hand · ${p.name}`, h('span', { class: 'hint' }, 'Click cards to play them, or Play all.')));
  const hand = h('div', { class: 'row', 'data-empty': 'Hand is empty.' }); if (!p.hand.length) hand.classList.add('empty');
  for (const c of p.hand.slice().sort((a, b) => a.suit.localeCompare(b.suit) || a.rank - b.rank)) hand.append(cardEl(c, { onclick: me ? () => act(() => playCard(G, c.uid)) : null, classes: me ? '' : 'dim' }));
  tbl.append(hand);
  tbl.append(h('div', { class: 'controls' }, h('div', { class: 'coins' }, `🪙 ${G.coins} `, h('small', {}, 'coins')),
    h('button', { onclick: () => act(() => playAll(G)), disabled: !me || !p.hand.length }, 'Play all'),
    h('button', { onclick: () => act(() => refreshRow(G)), disabled: !me || !canRefresh(G), title: 'Only if you bought nothing this turn' }, 'Refresh market'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'primary', onclick: () => { act(() => endTurn(G)); if (G.phase !== 'over' && cur(G).kind === 'human' && humans() > 1) { passScreen = true; render(); } }, disabled: !me || !!G.pending }, 'End turn')));
  left.append(tbl);
  // market
  const mk = h('section', { class: 'panel' });
  mk.append(h('h3', {}, 'Market', h('span', { class: 'hint' }, 'Numbers cost 4, Aces 6, faces 7. Buy as many as you can afford.')));
  const row = h('div', { class: 'row', 'data-empty': 'The market is empty.' }); if (!G.row.length) row.classList.add('empty');
  G.row.forEach((c, i) => { const ok = me && canBuy(G, i); row.append(cardEl(c, { showCost: true, classes: ok ? 'affordable' : (me ? 'dim' : ''), onclick: ok ? () => act(() => buy(G, i)) : null })); });
  mk.append(row);
  left.append(mk);
  // right: deck summary + log
  const own = [...p.deck, ...p.hand, ...p.discard, ...p.play];
  const bySuit = {}; for (const c of own) { const k = tier(c) === 'basic' ? 'basics' : SUIT_INFO[c.suit].name + (tier(c) === 'face' ? ' (face)' : tier(c) === 'ace' ? ' (ace)' : ''); bySuit[k] = (bySuit[k] || 0) + 1; }
  right.append(h('section', { class: 'panel' }, h('h3', {}, `Deck · ${p.name}`), h('div', { class: 'muted', style: 'font-size:0.85rem' }, Object.entries(bySuit).map(([k, n]) => `${n}× ${k}`).join(' · ') || 'empty')));
  const lg = h('section', { class: 'panel' });
  lg.append(h('h3', {}, 'Log', h('button', { style: 'margin-left:auto;padding:2px 8px;font-size:0.75rem', onclick: () => { showLog = !showLog; render(); } }, showLog ? 'hide' : 'show')));
  if (showLog) { const log = h('div', { class: 'log' }); let last = -1; for (const e of G.log.slice(-100)) { if (e.round !== last) { log.append(h('div', { class: 'd' }, `Round ${e.round}`)); last = e.round; } log.append(h('p', {}, e.msg)); } lg.append(log); requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; }); }
  right.append(lg);
  main.append(left, right); app.append(main);
  if (G.pending && p.kind === 'human') renderPending();
  if (passScreen) modalRoot.replaceChildren(h('div', { class: 'overlay' }, h('div', { class: 'modal', style: 'max-width:420px;text-align:center' }, h('h2', {}, `Pass to ${p.name}`), h('button', { class: 'primary', onclick: () => { passScreen = false; render(); } }, `I'm ${p.name}`))));
}

function renderPending() {
  const sp = G.pending;
  const m = h('div', { class: 'modal' }, h('h2', {}, 'Trash'), h('p', { class: 'sub' }, sp.text));
  const row = h('div', { class: 'row' });
  for (const c of sp.cards) { const isSel = selected.has(c.uid); row.append(cardEl(c, { classes: isSel ? 'selected' : '', onclick: () => { if (isSel) selected.delete(c.uid); else if (selected.size < sp.max) selected.add(c.uid); render(); } })); }
  m.append(row);
  m.append(h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { const s = [...selected]; selected = new Set(); act(() => resolvePending(G, s)); } }, selected.size ? `Trash ${selected.size}` : 'Trash nothing')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

function renderSetup() {
  const seats = [{ name: 'You', kind: 'human' }, { name: 'North', kind: 'bot' }, { name: 'East', kind: 'bot' }, { name: 'West', kind: 'bot' }];
  let count = 4;
  const seedInput = h('input', { type: 'text', placeholder: 'seed (optional)', style: 'width:160px' });
  const seatsEl = h('div');
  const drawSeats = () => { seatsEl.replaceChildren(); for (let i = 0; i < count; i++) { const s = seats[i]; const kind = h('select', { onchange: (e) => { s.kind = e.target.value; } }, h('option', { value: 'human' }, 'Human'), h('option', { value: 'bot' }, 'Bot')); kind.value = s.kind; seatsEl.append(h('div', { class: 'seat' }, h('input', { type: 'text', value: s.name, onchange: (e) => { s.name = e.target.value; } }), kind)); } };
  drawSeats();
  const countSel = h('select', { onchange: (e) => { count = Number(e.target.value); drawSeats(); } }, ...[2, 3, 4].map(n => h('option', { value: n }, `${n} players`))); countSel.value = 4;
  return h('div', { class: 'overlay' }, h('div', { class: 'modal' },
    h('h2', {}, 'Pips'),
    h('p', { class: 'sub' }, 'A deckbuilder you can play with two ordinary packs of cards. Suit is the job, rank is the size. Learn it in two minutes, play it in twenty.'),
    h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px' }, countSel, seedInput),
    seatsEl,
    h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: () => { const seed = seedInput.value.trim() || `${todaySeed()}-${Math.random().toString(36).slice(2, 6)}`; const players = seats.slice(0, count).map(s => ({ ...s, strategy: STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)] })); startGame({ seed, players }); } }, 'Deal'),
      h('button', { onclick: showRules }, 'Cheat sheet'),
      h('a', { href: 'rules.html' }, h('button', {}, 'Printable rules for real cards')))));
}

function showEnd() {
  const m = h('div', { class: 'modal' }, h('h2', {}, `${G.players[G.winner].name} wins`), h('p', { class: 'sub' }, G.endReason));
  const t = h('table', { class: 'ranking' }, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Player'), h('th', {}, 'Points'), h('th', {}, 'Cards')));
  G.ranking.forEach((idx, i) => { const p = G.players[idx]; t.append(h('tr', {}, h('td', {}, i + 1), h('td', {}, p.name), h('td', {}, h('b', {}, score(p))), h('td', {}, deckSize(p)))); });
  m.append(t, h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { G = null; render(); } }, 'New game'), h('button', { onclick: () => modalRoot.replaceChildren() }, 'Look at the table')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

function showRules() {
  const m = h('div', { class: 'modal' }, h('h2', {}, 'Pips cheat sheet'), h('div', { html: `
    <table class="cheat">
      <tr><th>Card</th><th>Cost</th><th>When played</th></tr>
      <tr><td>2, 3, 4, 5 (any suit)</td><td>—</td><td>+1 coin. These are everyone's starting deck.</td></tr>
      <tr><td class="red">♦ 6–10</td><td>4</td><td>+2 coins</td></tr>
      <tr><td class="red">♦ J, Q, K</td><td>7</td><td>+3 coins</td></tr>
      <tr><td>♣ 6–10</td><td>4</td><td>+1 card, +1 coin</td></tr>
      <tr><td>♣ J, Q, K</td><td>7</td><td>+2 cards, +1 coin</td></tr>
      <tr><td>♠ 6–10</td><td>4</td><td>You may trash a card from your hand. +2 coins if you do.</td></tr>
      <tr><td>♠ J, Q, K</td><td>7</td><td>Trash up to 2 cards from your hand. +2 coins each.</td></tr>
      <tr><td class="red">♥ 6–10</td><td>4</td><td>Nothing. Worth 3 points at the end.</td></tr>
      <tr><td class="red">♥ J, Q, K</td><td>7</td><td>Nothing. Worth 6 points at the end.</td></tr>
      <tr><td>A (any suit)</td><td>6</td><td>+1 card, +2 coins</td></tr>
    </table>
    <p><b>Turn:</b> play your whole hand, buy any number of cards from the 5-card market, discard everything, draw 5. If you bought nothing you may clear the market and deal 5 new cards.</p>
    <p><b>End:</b> after the round in which the last face heart is bought, the market runs out, or round 12. Most points wins; ties go to the smaller deck.</p>` }),
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { modalRoot.replaceChildren(); if (G) render(); } }, 'Close')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

document.getElementById('btn-rules').onclick = showRules;
document.getElementById('btn-new').onclick = () => { clearTimeout(botTimer); G = null; render(); };
render();
