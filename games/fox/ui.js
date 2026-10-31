// The Fox in the Forest: browser table for one human against a bot, or two humans hot-seat.
import {
  newGame, actor, legalCards, playCard, foxSwap, woodcut, collect, nextRound, trickWinner, trumpSuit,
  roundPoints, bandName, cardName, short, other, SUIT_INFO, ABILITY, BANDS,
} from './engine.js';
import { botAct, choosePlay } from './bots.js';

const app = document.getElementById('app'), modalRoot = document.getElementById('modal-root');
const SPEEDS = { slow: { bot: 1100, trick: 2600 }, normal: { bot: 650, trick: 1700 }, fast: { bot: 250, trick: 800 } };
let G = null, timer = null, speed = 'normal', viewer = 0, passTo = null, hintUid = null;

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k === 'onclick') el.onclick = v; else if (k === 'onchange') el.onchange = v;
    else if (k === 'html') el.innerHTML = v; else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  }
  for (const c of children.flat()) { if (c === null || c === undefined || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return el;
}
function cardEl(c, { classes = '', onclick, tag, title } = {}) {
  const s = SUIT_INFO[c.suit], ab = ABILITY[c.rank];
  const el = h('div', { class: `fcard ${s.cls} ${classes}`, title: title || (ab ? `${cardName(c)}: ${ab.text}` : cardName(c)) },
    h('div', { class: 'top' }, h('span', { class: 'rank' }, c.rank), h('span', { class: 'sg' }, s.glyph)));
  if (ab) el.append(h('div', { class: 'ab' }, ab.icon), h('div', { class: 'abn' }, ab.name));
  else el.append(h('div', { class: 'big' }, s.glyph));
  if (tag) el.append(h('div', { class: `tag ${tag.cls}` }, tag.text));
  if (onclick) { el.onclick = onclick; el.classList.add('clickable'); }
  return el;
}
const humans = () => G.players.filter((p) => p.kind === 'human').map((p) => p.idx);
const opp = () => other(viewer);

// ---------- flow ----------
function after() {
  clearTimeout(timer);
  hintUid = null;
  render();
  if (!G) return;
  if (G.phase === 'roundover' || G.phase === 'over') { showRoundEnd(); return; }
  if (G.phase === 'trickdone') { timer = setTimeout(() => { collect(G); routeViewer(); after(); }, SPEEDS[speed].trick); return; }
  const a = actor(G);
  if (a !== null && G.players[a].kind === 'bot') timer = setTimeout(() => { botAct(G); routeViewer(); after(); }, SPEEDS[speed].bot);
}
function routeViewer() {
  const a = actor(G);
  if (a === null || G.players[a].kind !== 'human' || a === viewer) return;
  if (humans().length > 1) passTo = a; else viewer = a;
}
function act(fn) { if (fn()) { routeViewer(); after(); } }
function start(cfg) {
  const players = cfg.mode === 'hotseat'
    ? [{ name: cfg.name1 || 'Player 1', kind: 'human' }, { name: cfg.name2 || 'Player 2', kind: 'human' }]
    : [{ name: 'You', kind: 'human' }, { name: 'Bramble', kind: 'bot', level: cfg.level }];
  G = newGame({ seed: Date.now().toString(36), players, options: { target: cfg.target } });
  viewer = 0; passTo = null;
  routeViewer();
  if (passTo !== null) { viewer = passTo; passTo = null; }
  modalRoot.replaceChildren();
  after();
}

// ---------- render ----------
function render() {
  app.replaceChildren();
  if (!G) { app.append(renderSetup()); return; }
  const me = G.players[viewer], op = G.players[opp()];
  app.append(h('div', { class: 'scorebar' },
    h('div', { class: 'side' }, h('b', {}, me.score), h('span', {}, me.name)),
    h('div', { class: 'mid' }, `Round ${G.round} · first to ${G.opts.target}`, h('br'), `${G.players[G.dealer].name} dealt`),
    h('div', { class: 'side r' }, h('span', {}, op.name), h('b', {}, op.score))));
  const main = h('div', { class: 'main' });
  main.append(h('div', {}, renderOpp(), renderTable(), renderMeter(), renderHand()), h('div', {}, renderAbilities(), renderLog()));
  app.append(main);
  if (passTo !== null) {
    modalRoot.replaceChildren(h('div', { class: 'overlay pass' }, h('div', { class: 'modal', style: 'max-width:420px;text-align:center' },
      h('h2', {}, `Pass to ${G.players[passTo].name}`), h('p', { class: 'sub' }, 'Hands are hidden until then.'),
      h('button', { class: 'primary', onclick: () => { viewer = passTo; passTo = null; modalRoot.replaceChildren(); render(); } }, `I'm ${G.players[passTo].name}`))));
  }
}

function renderOpp() {
  const p = G.players[opp()];
  const backs = h('div', { class: 'backs' });
  for (let i = 0; i < p.hand.length; i++) backs.append(h('div', { class: 'back' }));
  return h('section', { class: 'panel' }, h('div', { class: 'opp' },
    h('div', { class: 'who' }, h('b', {}, p.name), p.kind === 'bot' ? h('span', { class: 'muted' }, ` · ${p.level} bot`) : null,
      actor(G) === p.idx ? h('span', { class: 'turnmark' }, p.kind === 'bot' ? '  · thinking…' : '  · their turn') : null),
    h('div', { class: 'muted' }, `${p.tricks} trick${p.tricks === 1 ? '' : 's'} · ${p.treasure} treasure`), backs));
}

function renderTable() {
  const t = trumpSuit(G);
  const wrap = h('div', { class: 'table' });
  wrap.append(h('div', { class: 'decree' }, h('div', { class: 'label' }, 'Decree'), cardEl(G.decree),
    h('div', {}, `Trump: ${SUIT_INFO[t].glyph} ${SUIT_INFO[t].name}`),
    h('div', { class: 'deckpile' }, h('div', { class: 'back' }), `deck ${G.deck.length}`)));
  const zone = h('div', { class: 'trickzone' });
  const showing = G.phase === 'trickdone' || G.phase === 'roundover' || G.phase === 'over' ? G.lastTrick : null;
  const cards = showing ? showing.cards : G.trick.cards;
  const row = h('div', { class: 'cards' });
  for (const e of cards) row.append(h('div', { class: 'slot' }, cardEl(e.card, { classes: showing && showing.winner === e.p ? 'win' : '' }), G.players[e.p].name));
  if (!cards.length) row.append(h('div', { class: 'slot' }, h('div', { class: 'muted' }, `${G.players[G.trick.leader].name} to lead`)));
  zone.append(row);
  if (showing) {
    let msg = `${G.players[showing.winner].name} win${G.players[showing.winner].name === 'You' ? '' : 's'}: ${showing.why}.`;
    if (showing.sevens) msg += ` +${showing.sevens} treasure.`;
    if (showing.swan) msg += ` The Swan lost, so its player leads next.`;
    zone.append(h('div', { class: 'note' }, msg));
  } else if (cards.length === 1) {
    const led = cards[0].card;
    zone.append(h('div', { class: 'note' }, led.rank === 11
      ? `The Monarch was led: if you have ${SUIT_INFO[led.suit].name.toLowerCase()}, you must play the 1 or your highest one.`
      : `${SUIT_INFO[led.suit].name} led. Follow suit if you can.`));
  }
  wrap.append(zone);
  return wrap;
}

function renderMeter() {
  const me = G.players[viewer], op = G.players[opp()];
  const sec = h('section', { class: 'panel' });
  sec.append(h('h3', {}, 'Tricks this round', h('span', { class: 'hint' }, `${me.name}: ${me.tricks} (${bandName(me.tricks)}, ${roundPoints(me.tricks)} pts) · ${op.name}: ${op.tricks} (${bandName(op.tricks)}, ${roundPoints(op.tricks)} pts)`)));
  const m = h('div', { class: 'meter' });
  for (let t = 0; t <= 13; t++) {
    const cls = t <= 3 ? 'humble' : t <= 6 ? 'def' : t <= 9 ? 'vic' : 'greedy';
    m.append(h('div', { class: `cell ${cls}`, title: `${t} tricks: ${bandName(t)}, ${roundPoints(t)} points` }, t,
      op.tricks === t ? h('div', { class: 'mk op' }, '▼') : null, me.tricks === t ? h('div', { class: 'mk me' }, '▲') : null));
  }
  sec.append(m);
  sec.append(h('div', { class: 'meter-legend' }, ...['Humble 0–3: 6 pts', 'Defeated 4/5/6: 1/2/3 pts', 'Victorious 7–9: 6 pts', 'Greedy 10+: 0 pts', `▲ ${me.name} · ▼ ${op.name}`].map((t) => h('span', {}, t))));
  return sec;
}

function renderHand() {
  const me = G.players[viewer];
  const sec = h('section', { class: 'panel' });
  const mine = actor(G) === viewer && passTo === null && me.kind === 'human';
  let hint = 'Your hand.';
  if (mine && G.phase === 'play') hint = G.trick.cards.length ? 'Your turn: follow suit if you can. Each card shows whether it would win.' : 'Your lead: play any card.';
  sec.append(h('h3', {}, `Hand · ${me.name}`, h('span', { class: 'hint' }, hint)));
  if (mine && G.phase === 'fox') {
    sec.append(h('div', { class: 'banner' }, `🦊 Fox: click a card to swap it with the decree (the ${short(G.decree)}). The card you put down sets the new trump suit, for this trick too.`,
      h('button', { onclick: () => act(() => foxSwap(G, null)) }, 'Keep the decree')));
  }
  if (mine && G.phase === 'woodcut') sec.append(h('div', { class: 'banner' }, `🪓 Woodcutter: you drew the ${cardName(G.pending.drawn)}. Click a card to put on the bottom of the deck.`));
  if (mine && G.phase === 'play' && me.kind === 'human') {
    sec.append(h('div', { class: 'controls', style: 'margin-bottom:8px' }, h('button', { onclick: () => { hintUid = choosePlayAs(viewer).uid; render(); } }, 'Hint'),
      hintUid ? h('span', { class: 'muted', style: 'font-size:0.85rem' }, 'The hard bot would play the outlined card.') : null));
  }
  const legal = mine && G.phase === 'play' ? legalCards(G, viewer).map((c) => c.uid) : [];
  const row = h('div', { class: 'handrow' });
  const sorted = me.hand.slice().sort((a, b) => a.suit.localeCompare(b.suit) || a.rank - b.rank);
  for (const c of sorted) {
    let classes = '', onclick = null, tag = null;
    if (mine && G.phase === 'play') {
      if (legal.includes(c.uid)) {
        onclick = () => act(() => playCard(G, c.uid));
        if (G.trick.cards.length) {
          const wins = trickWinner([...G.trick.cards, { p: viewer, card: c }], trumpSuit(G)).entry.p === viewer;
          tag = wins ? { cls: 'w', text: 'wins' } : { cls: 'l', text: 'loses' };
        }
      } else classes = 'illegal';
    } else if (mine && G.phase === 'fox') onclick = () => act(() => foxSwap(G, c.uid));
    else if (mine && G.phase === 'woodcut') { onclick = () => act(() => woodcut(G, c.uid)); if (c.uid === G.pending.drawn.uid) classes = 'drawn'; }
    if (hintUid === c.uid) classes += ' hint';
    row.append(cardEl(c, { classes, onclick, tag }));
  }
  sec.append(row);
  return sec;
}

function choosePlayAs(p) {
  const saved = G.players[p].level;
  G.players[p].level = 'hard';
  const savedSeed = G.rng;
  const c = choosePlay(G, p);
  G.players[p].level = saved; G.rng = savedSeed;
  return c;
}

function renderAbilities() {
  const sec = h('section', { class: 'panel' }, h('h3', {}, 'Odd cards have powers'));
  const box = h('div', { class: 'abilities' });
  for (const r of [1, 3, 5, 7, 9, 11]) box.append(h('div', {}, `${ABILITY[r].icon} `, h('b', {}, `${r} ${ABILITY[r].name}: `), ABILITY[r].text));
  sec.append(box);
  return sec;
}

function renderLog() {
  const sec = h('section', { class: 'panel' }, h('h3', {}, 'Log'));
  const log = h('div', { class: 'log' });
  for (const e of G.log.slice(-60)) log.append(h('p', { class: e.kind }, e.msg));
  sec.append(log);
  requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  return sec;
}

function showRoundEnd() {
  const row = G.history[G.history.length - 1];
  const over = G.phase === 'over';
  const m = h('div', { class: 'modal', style: 'max-width:560px' });
  m.append(h('h2', {}, over ? `${G.players[G.winner].name} win${G.players[G.winner].name === 'You' ? '' : 's'} the game!` : `End of round ${G.round}`));
  const t = h('table', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Tricks'), h('th', {}, 'Band'), h('th', {}, 'Points'), h('th', {}, 'Treasure'), h('th', {}, 'Total')));
  G.players.forEach((p, i) => { const r = row[i]; t.append(h('tr', {}, h('td', {}, p.name), h('td', { class: 'num' }, r.tricks), h('td', {}, r.band), h('td', { class: 'num' }, r.base), h('td', { class: 'num' }, r.treasure), h('td', { class: 'num' }, h('b', {}, p.score)))); });
  m.append(t);
  m.append(h('p', { class: 'muted', style: 'font-size:0.85rem;margin-top:8px' }, 'Humble (0–3 tricks) and Victorious (7–9) both score 6. Defeated scores 1, 2 or 3 for 4, 5 or 6 tricks. Greedy (10 or more) scores nothing.'));
  m.append(h('div', { class: 'actions' }, over
    ? h('button', { class: 'primary', onclick: () => { G = null; modalRoot.replaceChildren(); render(); } }, 'New game')
    : h('button', { class: 'primary', onclick: () => { modalRoot.replaceChildren(); nextRound(G); routeViewer(); if (passTo !== null && humans().length > 1) { /* pass screen shows */ } after(); } }, 'Deal the next round'),
  h('button', { onclick: () => modalRoot.replaceChildren() }, 'Look at the table')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

function renderSetup() {
  const cfg = { mode: 'bot', level: 'normal', target: 21, name1: 'Player 1', name2: 'Player 2' };
  const sel = (opts, val, set) => { const s = h('select', { onchange: (e) => set(e.target.value) }, ...opts.map(([v, l]) => h('option', { value: v }, l))); s.value = val; return s; };
  return h('div', { class: 'overlay' }, h('div', { class: 'modal' },
    h('h2', {}, 'The Fox in the Forest'),
    h('p', { class: 'sub' }, 'A two-player trick-taking game of fairy-tale cards. Win the right number of tricks, not the most: take too many and you are Greedy. Based on the game by Joshua Buergel.'),
    h('div', { class: 'opts' },
      'Opponent', sel([['bot', 'A bot'], ['hotseat', 'Another person (pass the device)']], 'bot', (v) => { cfg.mode = v; }),
      'Bot level', sel([['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], 'normal', (v) => { cfg.level = v; }),
      'Play to', sel([['21', '21 points (standard)'], ['12', '12 points (quick)']], '21', (v) => { cfg.target = Number(v); }),
      'Speed', sel([['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']], speed, (v) => { speed = v; })),
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => start(cfg) }, 'Deal'), h('button', { onclick: showRules }, 'Rules'),
      h('a', { href: 'rules.html' }, h('button', {}, 'Printable cheat sheet')))));
}

function showRules() {
  const m = h('div', { class: 'modal' }, h('h2', {}, 'How to play'), h('div', { class: 'rules', html: `
    <p>Two players. 33 cards in three suits (🔔 Bells, 🗝️ Keys, 🌙 Moons), numbered 1 to 11. First to <b>21 points</b> at the end of a round wins.</p>
    <h4>Each round</h4>
    <ol>
      <li>Deal 13 cards each. Turn the next card face up: it is the <b>decree card</b>, and its suit is <b>trump</b>. The rest form a small deck.</li>
      <li>The non-dealer leads the first trick. The other player must <b>follow suit</b> if they can; otherwise they may play anything.</li>
      <li>The highest trump wins the trick. With no trump, the higher card of the suit led wins. The winner leads the next trick.</li>
      <li>After 13 tricks, score the round. The dealer changes each round.</li>
    </ol>
    <h4>Scoring: don't be greedy</h4>
    <table><tr><th>Tricks won</th><th></th><th>Points</th></tr>
      <tr><td>0–3</td><td>Humble</td><td>6</td></tr><tr><td>4</td><td>Defeated</td><td>1</td></tr><tr><td>5</td><td>Defeated</td><td>2</td></tr>
      <tr><td>6</td><td>Defeated</td><td>3</td></tr><tr><td>7–9</td><td>Victorious</td><td>6</td></tr><tr><td>10–13</td><td>Greedy</td><td>0</td></tr></table>
    <p>Plus 1 point for each Treasure (7) in the tricks you won.</p>
    <h4>The odd cards</h4>
    <ul>
      <li><b>1 Swan:</b> if you play it and lose the trick, you lead the next trick.</li>
      <li><b>3 Fox:</b> when you play it, you may swap the decree card with a card from your hand. The new decree changes trump at once, for this trick too.</li>
      <li><b>5 Woodcutter:</b> when you play it, draw a card, then put any card from your hand on the bottom of the deck.</li>
      <li><b>7 Treasure:</b> whoever wins the trick scores 1 point for each 7 in it.</li>
      <li><b>9 Witch:</b> if it is the only 9 in the trick, it counts as trump.</li>
      <li><b>11 Monarch:</b> when you lead it, your opponent, if they have that suit, must play the 1 of it or their highest card of it.</li>
    </ul>
    <h4>Tips</h4>
    <ul><li>Decide early whether you're aiming for Humble or Victorious, and watch your opponent's count too.</li>
      <li>Spend high cards while you still want tricks; it's hard to stop winning once you hold only winners.</li>
      <li>The Swan is a way to keep the lead while losing a trick.</li></ul>` }),
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { modalRoot.replaceChildren(); if (G) render(); } }, 'Close')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

document.getElementById('btn-rules').onclick = showRules;
document.getElementById('btn-new').onclick = () => { clearTimeout(timer); G = null; modalRoot.replaceChildren(); render(); };
render();
