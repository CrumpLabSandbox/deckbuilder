import { newGame, ask, canAsk, askableTargets, ranksIn, count, rankName, rankWord, totalBooks, SUIT_INFO } from './engine.js';
import { botTurn } from './bots.js';

const app = document.getElementById('app'), modalRoot = document.getElementById('modal-root');
const SPEED = { slow: 1500, normal: 950, fast: 400 };
let G = null, timer = null, speed = 'normal', viewer = null, passTo = null, picked = null, memoryHelp = false;

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k === 'onclick') el.onclick = v; else if (k === 'onchange') el.onchange = v;
    else if (k === 'html') el.innerHTML = v; else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  }
  for (const c of children.flat()) { if (c === null || c === undefined || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return el;
}
const cardEl = (c, classes = '') => { const s = SUIT_INFO[c.suit]; return h('div', { class: `pcard ${s.red ? 'red' : ''} ${classes}` }, h('div', { class: 'corner' }, rankName(c.rank), h('br'), s.glyph), h('div', { class: 'pip' }, s.glyph), h('div', { class: 'corner', style: 'transform:rotate(180deg);align-self:flex-end' }, rankName(c.rank), h('br'), s.glyph)); };
const humans = () => G.players.filter((p) => p.kind === 'human').map((p) => p.idx);
const name = (p) => G.players[p].name;

// ---------------- flow ----------------
function after() {
  clearTimeout(timer);
  if (G && G.phase !== 'over') {
    const p = G.turn;
    if (G.players[p].kind === 'human' && p !== viewer) {
      if (humans().length > 1) { passTo = p; viewer = null; } else viewer = p;
    }
  }
  render();
  if (!G) return;
  if (G.phase === 'over') { showEnd(); return; }
  if (G.players[G.turn].kind === 'bot') timer = setTimeout(() => { botTurn(G); after(); }, SPEED[speed]);
}
function start(cfg) {
  G = newGame({ seed: Date.now().toString(36), players: cfg.players });
  viewer = humans()[0] ?? null; passTo = null; picked = null;
  if (G.players[G.turn].kind === 'human') viewer = G.turn;
  modalRoot.replaceChildren();
  after();
}
function doAsk(target) {
  if (picked === null || !canAsk(G, target, picked)) return;
  ask(G, target, picked);
  picked = null;
  after();
}

// ---------------- render ----------------
function render() {
  app.replaceChildren();
  if (!G) { app.append(renderSetup()); return; }
  const p = G.turn;
  app.append(h('div', { class: 'status' },
    h('div', {}, h('b', {}, G.phase === 'over' ? 'Game over' : G.players[p].name === 'You' ? 'Your turn' : `${name(p)}'s turn`), G.players[p].kind === 'bot' && G.phase !== 'over' ? h('span', { class: 'muted' }, ' · thinking…') : null),
    h('div', {}, `${G.deck.length} cards in the pond · ${totalBooks(G)} of 13 books made`),
    h('label', { class: 'toggle', title: 'Show what everyone is known to be holding, from what was asked at the table' }, (() => { const i = h('input', { type: 'checkbox', onchange: (e) => { memoryHelp = e.target.checked; render(); } }); i.checked = memoryHelp; return i; })(), 'Memory help')));
  app.append(renderPlayers(), renderPond(), renderHand(), renderLog());
  if (passTo !== null) modalRoot.replaceChildren(h('div', { class: 'overlay pass' }, h('div', { class: 'modal', style: 'max-width:420px;text-align:center' },
    h('h2', {}, `Pass to ${name(passTo)}`), h('p', { class: 'sub' }, 'Keep your cards hidden from everyone else.'),
    h('button', { class: 'primary', onclick: () => { viewer = passTo; passTo = null; modalRoot.replaceChildren(); render(); } }, `I'm ${name(passTo)}`))));
}

function renderPlayers() {
  const wrap = h('div', { class: 'players' });
  const asking = viewer === G.turn && G.phase === 'ask' && passTo === null && picked !== null;
  for (const pl of G.players) {
    const canTarget = asking && pl.idx !== G.turn && pl.hand.length > 0;
    const backs = h('div', { class: 'backs' });
    for (let i = 0; i < pl.hand.length; i++) backs.append(h('div', { class: 'back' }));
    const lastAsk = [...G.log].reverse().find((e) => e.kind === 'ask' && e.msg.startsWith(`${pl.name}:`) && e.turn === G.turnNo);
    const known = Object.entries(G.seen[pl.idx]).filter(([, v]) => v.n > 0).map(([r, v]) => `${v.n}× ${rankName(Number(r))}`);
    wrap.append(h('div', { class: `pbox ${G.turn === pl.idx && G.phase !== 'over' ? 'turn' : ''} ${canTarget ? 'target' : ''}`, onclick: canTarget ? () => doAsk(pl.idx) : null, title: canTarget ? `Ask ${pl.name} for ${rankWord(picked)}` : '' },
      h('div', { class: 'name' }, h('b', {}, pl.name), h('span', { class: 'muted' }, `${pl.hand.length} card${pl.hand.length === 1 ? '' : 's'}${pl.kind === 'bot' ? ` · ${pl.level} bot` : ''}`)),
      backs,
      h('div', { class: 'books' }, pl.books.length ? pl.books.map((r) => h('span', { class: 'book', title: `Book of ${rankWord(r)}` }, rankName(r))) : h('span', { class: 'muted', style: 'font-size:0.75rem' }, 'no books yet')),
      lastAsk ? h('div', { class: 'bubble' }, lastAsk.msg.slice(pl.name.length + 2)) : null,
      memoryHelp && known.length && pl.idx !== viewer ? h('div', { class: 'knows' }, `Known to hold: ${known.join(', ')}`) : null,
      canTarget ? h('div', { style: 'color:var(--good);font-size:0.85rem' }, `Ask ${pl.name} for ${rankWord(picked)}`) : null));
  }
  return wrap;
}

function renderPond() {
  const L = G.last;
  let msg = 'Ask someone for a rank you hold. Get all four of a rank to make a book.', small = '';
  if (L) {
    const asker = name(L.p), target = name(L.target), you = (p) => G.players[p].name === 'You';
    if (L.type === 'got') { msg = `${asker} asked ${you(L.target) ? 'you' : target} for ${rankWord(L.rank)} and got ${L.n}.`; small = `${you(L.p) ? 'You go' : `${asker} goes`} again.`; }
    else if (L.type === 'wish') { msg = `${asker} asked ${you(L.target) ? 'you' : target} for ${rankWord(L.rank)}. Go fish… and drew one!`; small = 'Fishing up the card you asked for means another turn.'; }
    else if (L.type === 'fish') { msg = `${asker} asked ${you(L.target) ? 'you' : target} for ${rankWord(L.rank)}. Go fish!`; small = viewer === L.p ? `You drew the ${rankName(L.card.rank)}${SUIT_INFO[L.card.suit].glyph}.` : `${asker} drew a card.`; }
    else if (L.type === 'empty') { msg = `${asker} asked ${you(L.target) ? 'you' : target} for ${rankWord(L.rank)}. Go fish, but the pond is empty.`; }
  }
  return h('div', { class: 'pond' }, h('div', { class: 'pile' }, G.deck.length ? h('div', { class: 'back' }) : h('div', { class: 'muted' }, 'empty'), `pond: ${G.deck.length}`), h('div', { class: 'msg' }, msg, small ? h('small', {}, small) : null));
}

function renderHand() {
  const sec = h('section', { class: 'panel' });
  if (viewer === null) { sec.append(h('h3', {}, 'Hand'), h('div', { class: 'muted' }, 'Hidden.')); return sec; }
  const me = G.players[viewer], mine = G.turn === viewer && G.phase === 'ask' && passTo === null;
  sec.append(h('h3', {}, `Your hand${G.players.filter((p) => p.kind === 'human').length > 1 ? ` · ${me.name}` : ''}`, h('span', { class: 'hint' }, mine ? (picked === null ? 'Step 1: click a rank you hold.' : `Step 2: click a player to ask them for ${rankWord(picked)}.`) : 'Wait for your turn.')));
  const hand = h('div', { class: 'hand' });
  const freshUid = G.last && G.last.p === viewer && G.last.card ? G.last.card.uid : null;
  for (const r of ranksIn(me.hand)) {
    const cards = me.hand.filter((c) => c.rank === r).sort((a, b) => a.suit.localeCompare(b.suit));
    hand.append(h('div', { class: `group ${mine ? 'clickable' : ''} ${picked === r ? 'selected' : ''}`, onclick: mine ? () => { picked = picked === r ? null : r; render(); } : null },
      h('div', { class: 'stack' }, ...cards.map((c) => cardEl(c, c.uid === freshUid ? 'fresh' : ''))), h('div', { class: 'lbl' }, `${cards.length} ${rankWord(r, cards.length)}`)));
  }
  if (!me.hand.length) hand.append(h('div', { class: 'muted' }, 'No cards in hand.'));
  sec.append(hand);
  if (mine && picked !== null) {
    sec.append(h('div', { class: 'asks' }, h('span', {}, `Ask for ${rankWord(picked)}:`),
      ...askableTargets(G, viewer).map((q) => h('button', { class: 'primary', onclick: () => doAsk(q) }, `Ask ${name(q)}`)),
      h('button', { onclick: () => { picked = null; render(); } }, 'Cancel')));
  }
  if (me.books.length) sec.append(h('div', { style: 'margin-top:8px' }, h('span', { class: 'muted' }, 'Your books: '), ...me.books.map((r) => h('span', { class: 'book', style: 'margin-right:4px' }, rankName(r)))));
  return sec;
}

function renderLog() {
  const sec = h('section', { class: 'panel' }, h('h3', {}, 'Table talk'));
  const log = h('div', { class: 'log' });
  for (const e of G.log.slice(-60)) log.append(h('p', { class: e.kind }, e.msg));
  sec.append(log);
  requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  return sec;
}

function showEnd() {
  const ranked = G.players.slice().sort((a, b) => b.books.length - a.books.length);
  const m = h('div', { class: 'modal', style: 'max-width:480px' }, h('h2', {}, `${G.winners.map(name).join(' and ')} win${G.winners.length === 1 && name(G.winners[0]) !== 'You' ? 's' : ''}!`));
  const t = h('table', { class: 'ranking' });
  for (const p of ranked) t.append(h('tr', {}, h('td', {}, p.name), h('td', {}, `${p.books.length} book${p.books.length === 1 ? '' : 's'}`), h('td', {}, p.books.map(rankName).join(' '))));
  m.append(t, h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { G = null; modalRoot.replaceChildren(); render(); } }, 'Play again'), h('button', { onclick: () => modalRoot.replaceChildren() }, 'Look at the table')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

function renderSetup() {
  const names = ['You', 'Finn', 'Marina', 'Gil', 'Coral', 'Reed'];
  const seats = names.map((n, i) => ({ name: n, kind: i === 0 ? 'human' : 'bot', level: 'normal' }));
  let count = 3;
  const seatsEl = h('div');
  const draw = () => {
    seatsEl.replaceChildren();
    for (let i = 0; i < count; i++) {
      const s = seats[i];
      const kind = h('select', { onchange: (e) => { s.kind = e.target.value; draw(); } }, h('option', { value: 'human' }, 'Person'), h('option', { value: 'bot' }, 'Bot'));
      kind.value = s.kind;
      const lvl = h('select', { onchange: (e) => { s.level = e.target.value; }, disabled: s.kind === 'human' }, h('option', { value: 'easy' }, 'Easy (forgetful)'), h('option', { value: 'normal' }, 'Normal'), h('option', { value: 'hard' }, 'Hard (remembers all)'));
      lvl.value = s.level;
      seatsEl.append(h('div', { class: 'seat' }, h('input', { type: 'text', value: s.name, onchange: (e) => { s.name = e.target.value; } }), kind, lvl));
    }
  };
  draw();
  const countSel = h('select', { onchange: (e) => { count = Number(e.target.value); draw(); } }, ...[2, 3, 4, 5, 6].map((n) => h('option', { value: n }, `${n} players`)));
  countSel.value = 3;
  const spd = h('select', { onchange: (e) => { speed = e.target.value; } }, h('option', { value: 'slow' }, 'Slow'), h('option', { value: 'normal' }, 'Normal'), h('option', { value: 'fast' }, 'Fast'));
  spd.value = speed;
  return h('div', { class: 'overlay' }, h('div', { class: 'modal' }, h('h2', {}, 'Go Fish'),
    h('p', { class: 'sub' }, 'Ask for cards, go fishing, and collect books of four. Play together on one device (pass it between turns) and fill empty seats with bots.'),
    h('div', { class: 'opts' }, countSel, spd), seatsEl,
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => start({ players: seats.slice(0, count).map((s) => ({ ...s })) }) }, 'Deal'), h('button', { onclick: showRules }, 'Rules'))));
}

function showRules() {
  const m = h('div', { class: 'modal' }, h('h2', {}, 'How to play Go Fish'), h('div', { class: 'rules', html: `
    <p>A standard 52-card deck. With 2 or 3 players everyone gets 7 cards; with 4 to 6, everyone gets 5. The rest is the <b>pond</b>.</p>
    <h4>Your turn</h4>
    <ol>
      <li>Ask one player for a rank you already hold: "Do you have any sevens?"</li>
      <li>If they do, they give you <b>all</b> of them and you ask again.</li>
      <li>If they don't, they say <b>"Go fish!"</b> and you draw from the pond. If you draw the rank you asked for, show it and go again. Otherwise the turn passes to the left.</li>
    </ol>
    <h4>Books</h4>
    <p>As soon as you have all four cards of a rank, lay them down as a <b>book</b>.</p>
    <h4>Running out</h4>
    <p>If you have no cards on your turn, draw one from the pond. When the pond is empty and a player can't ask, play moves on.</p>
    <h4>Winning</h4>
    <p>When all 13 books are down, whoever has the most books wins.</p>
    <h4>Tip</h4>
    <p>Listen to what everyone asks for. If someone asks for queens, they're holding at least one. Turn on <b>Memory help</b> to see what the table has given away.</p>` }),
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { modalRoot.replaceChildren(); if (G) render(); } }, 'Close')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

document.getElementById('btn-rules').onclick = showRules;
document.getElementById('btn-new').onclick = () => { clearTimeout(timer); G = null; modalRoot.replaceChildren(); render(); };
render();
