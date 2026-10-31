// Fox in the Forest, party variant: 4-5 players, humans (hot-seat) and bots.
import {
  newGame, actor, legalCards, playCard, foxSwap, woodcut, collect, nextRound, trickWinner, trumpSuit,
  bandFor, cardName, short, SUIT_INFO, ABILITY,
} from './engine.js';
import { botAct, choosePlay } from './bots.js';

const app = document.getElementById('app'), modalRoot = document.getElementById('modal-root');
const SPEEDS = { slow: { bot: 1000, trick: 2600 }, normal: { bot: 550, trick: 1700 }, fast: { bot: 200, trick: 800 } };
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
function cardEl(c, { classes = '', onclick, tag } = {}) {
  const s = SUIT_INFO[c.suit], ab = ABILITY[c.rank];
  const el = h('div', { class: `fcard ${s.cls} ${classes}`, title: ab ? `${cardName(c)}: ${ab.text}` : cardName(c) },
    h('div', { class: 'top' }, h('span', { class: 'rank' }, c.rank), h('span', { class: 'sg' }, s.glyph)));
  if (ab) el.append(h('div', { class: 'ab' }, ab.icon), h('div', { class: 'abn' }, ab.name));
  else el.append(h('div', { class: 'big' }, s.glyph));
  if (tag) el.append(h('div', { class: `tag ${tag.cls}` }, tag.text));
  if (onclick) { el.onclick = onclick; el.classList.add('clickable'); }
  return el;
}
const humans = () => G.players.filter((p) => p.kind === 'human').map((p) => p.idx);
const initial = (p) => (p.name === 'You' ? 'Y' : p.name[0].toUpperCase());

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
  if (!G) return;
  const a = actor(G);
  if (a === null || G.players[a].kind !== 'human' || a === viewer) return;
  if (humans().length > 1) passTo = a; else viewer = a;
}
function act(fn) { if (fn()) { routeViewer(); after(); } }
function start(cfg) {
  G = newGame({ seed: Date.now().toString(36), players: cfg.players, options: { rounds: cfg.rounds === 'each' ? null : Number(cfg.rounds) } });
  viewer = humans()[0] ?? 0; passTo = null;
  routeViewer();
  if (passTo !== null && humans().length > 1 && G.turnCount === undefined) { /* first human gets the device */ viewer = passTo; passTo = null; }
  modalRoot.replaceChildren();
  after();
}

// ---------- render ----------
function render() {
  app.replaceChildren();
  if (!G) { app.append(renderSetup()); return; }
  app.append(h('div', { class: 'scorebar multi' },
    h('div', { class: 'mid' }, `Round ${G.round} of ${G.rounds} · ${G.players[G.dealer].name} dealt · ${G.n} suits, 10 tricks`),
    h('div', { class: 'scores' }, ...G.players.map((p) => h('span', {}, `${p.name} `, h('b', {}, p.score))))));
  const main = h('div', { class: 'main' });
  main.append(h('div', {}, renderOpps(), renderTable(), renderMeter(), renderHand()), h('div', {}, renderBands(), renderAbilities(), renderLog()));
  app.append(main);
  if (passTo !== null) {
    modalRoot.replaceChildren(h('div', { class: 'overlay pass' }, h('div', { class: 'modal', style: 'max-width:420px;text-align:center' },
      h('h2', {}, `Pass to ${G.players[passTo].name}`), h('p', { class: 'sub' }, 'Hands are hidden until then.'),
      h('button', { class: 'primary', onclick: () => { viewer = passTo; passTo = null; modalRoot.replaceChildren(); render(); } }, `I'm ${G.players[passTo].name}`))));
  }
}

function renderOpps() {
  const wrap = h('div', { class: 'opps' });
  for (const p of G.players) {
    if (p.idx === viewer) continue;
    const backs = h('div', { class: 'backs' });
    for (let i = 0; i < p.hand.length; i++) backs.append(h('div', { class: 'back' }));
    wrap.append(h('div', { class: `pbox ${actor(G) === p.idx ? 'turn' : ''}` },
      h('span', { class: 'score' }, p.score), h('b', {}, p.name), p.kind === 'bot' ? h('span', { class: 'muted' }, ` · ${p.level}`) : null,
      h('div', { class: 'muted' }, `${p.tricks} trick${p.tricks === 1 ? '' : 's'} (${bandFor(G, p.tricks).name}) · ${p.treasure} treasure`), backs));
  }
  return wrap;
}

function renderTable() {
  const t = trumpSuit(G);
  const wrap = h('div', { class: 'table' });
  wrap.append(h('div', { class: 'decree' }, h('div', { class: 'label' }, 'Decree'), cardEl(G.decree),
    h('div', {}, `Trump: ${SUIT_INFO[t].glyph} ${SUIT_INFO[t].name}`), h('div', { class: 'deckpile' }, h('div', { class: 'back' }), `deck ${G.deck.length}`)));
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
    if (showing.swan) msg += ` ${G.players[showing.next].name} lost with the Swan and leads next.`;
    zone.append(h('div', { class: 'note' }, msg));
  } else if (cards.length) {
    const led = cards[0].card;
    zone.append(h('div', { class: 'note' }, led.rank === 11 && cards.length < G.n
      ? `The Monarch was led: anyone with ${SUIT_INFO[led.suit].name.toLowerCase()} must play the 1 or their highest one.`
      : `${SUIT_INFO[led.suit].name} led. Follow suit if you can.`));
  }
  wrap.append(zone);
  return wrap;
}

function renderMeter() {
  const me = G.players[viewer];
  const sec = h('section', { class: 'panel' });
  const b = bandFor(G, me.tricks);
  sec.append(h('h3', {}, 'Tricks this round', h('span', { class: 'hint' }, `${me.name}: ${me.tricks} (${b.name}, ${b.pts} pts)`)));
  const m = h('div', { class: 'meter m10' });
  for (let t = 0; t <= 10; t++) {
    const bb = bandFor(G, t);
    const cls = bb.name === 'Humble' ? 'humble' : bb.name === 'Defeated' ? 'def' : bb.name === 'Victorious' ? 'vic' : 'greedy';
    const here = G.players.filter((p) => p.tricks === t);
    m.append(h('div', { class: `cell ${cls}`, title: `${t} tricks: ${bb.name}, ${bb.pts} points` }, t,
      here.length ? h('div', { class: 'mk many' }, here.map((p) => (p.idx === viewer ? '▲' : initial(p))).join('')) : null));
  }
  sec.append(m);
  return sec;
}

function renderHand() {
  const me = G.players[viewer];
  const sec = h('section', { class: 'panel' });
  const mine = actor(G) === viewer && passTo === null && me.kind === 'human';
  let hint = 'Your hand.';
  if (mine && G.phase === 'play') hint = G.trick.cards.length ? 'Your turn: follow suit if you can. "wins" means it would win the trick so far.' : 'Your lead: play any card.';
  sec.append(h('h3', {}, `Hand · ${me.name}`, h('span', { class: 'hint' }, hint)));
  if (mine && G.phase === 'fox') sec.append(h('div', { class: 'banner' }, `🦊 Fox: click a card to swap it with the decree (the ${short(G.decree)}). Its suit becomes trump at once.`, h('button', { onclick: () => act(() => foxSwap(G, null)) }, 'Keep the decree')));
  if (mine && G.phase === 'woodcut') sec.append(h('div', { class: 'banner' }, `🪓 Woodcutter: you drew the ${cardName(G.pending.drawn)}. Click a card to put on the bottom of the deck.`));
  if (mine && G.phase === 'play') {
    sec.append(h('div', { class: 'controls', style: 'margin-bottom:8px' }, h('button', { onclick: () => { const lv = me.level; me.level = 'hard'; hintUid = choosePlay(G, viewer).uid; me.level = lv; render(); } }, 'Hint'),
      hintUid ? h('span', { class: 'muted', style: 'font-size:0.85rem' }, 'The hard bot would play the outlined card.') : null));
  }
  const legal = mine && G.phase === 'play' ? legalCards(G, viewer).map((c) => c.uid) : [];
  const row = h('div', { class: 'handrow' });
  const sorted = me.hand.slice().sort((a, b) => G.suits.indexOf(a.suit) - G.suits.indexOf(b.suit) || a.rank - b.rank);
  for (const c of sorted) {
    let classes = '', onclick = null, tag = null;
    if (mine && G.phase === 'play') {
      if (legal.includes(c.uid)) {
        onclick = () => act(() => playCard(G, c.uid));
        if (G.trick.cards.length) {
          const wins = trickWinner([...G.trick.cards, { p: viewer, card: c }], trumpSuit(G)).entry.p === viewer;
          tag = wins ? { cls: 'w', text: 'wins so far' } : { cls: 'l', text: 'loses' };
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

function renderBands() {
  const sec = h('section', { class: 'panel' }, h('h3', {}, `Scoring with ${G.n} players`));
  const t = h('table', { style: 'width:100%;font-size:0.85rem;border-collapse:collapse' });
  for (const b of G.bands) t.append(h('tr', {}, h('td', {}, b.from === b.to ? `${b.from}` : b.to >= 10 ? `${b.from}+` : `${b.from}–${b.to}`), h('td', {}, b.name), h('td', { style: 'text-align:right' }, `${b.pts} pts`)));
  sec.append(t, h('div', { class: 'muted', style: 'font-size:0.8rem;margin-top:6px' }, 'Plus 1 per Treasure (7) in tricks you win. Most points after everyone has dealt once wins.'));
  return sec;
}
function renderAbilities() {
  const sec = h('section', { class: 'panel' }, h('h3', {}, 'Odd cards'));
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
  const m = h('div', { class: 'modal', style: 'max-width:600px' });
  m.append(h('h2', {}, over ? `${G.winners.map((i) => G.players[i].name).join(' and ')} win${G.winners.length === 1 && G.players[G.winners[0]].name !== 'You' ? 's' : ''}!` : `End of round ${G.round} of ${G.rounds}`));
  const t = h('table', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Tricks'), h('th', {}, 'Band'), h('th', {}, 'Points'), h('th', {}, 'Treasure'), h('th', {}, 'Total')));
  G.players.forEach((p, i) => { const r = row[i]; t.append(h('tr', {}, h('td', {}, p.name), h('td', { class: 'num' }, r.tricks), h('td', {}, r.band), h('td', { class: 'num' }, r.base), h('td', { class: 'num' }, r.treasure), h('td', { class: 'num' }, h('b', {}, p.score)))); });
  m.append(t);
  m.append(h('div', { class: 'actions' }, over
    ? h('button', { class: 'primary', onclick: () => { G = null; modalRoot.replaceChildren(); render(); } }, 'New game')
    : h('button', { class: 'primary', onclick: () => { modalRoot.replaceChildren(); nextRound(G); routeViewer(); after(); } }, 'Deal the next round'),
  h('button', { onclick: () => modalRoot.replaceChildren() }, 'Look at the table')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

function renderSetup() {
  const names = ['You', 'Bramble', 'Hazel', 'Rowan', 'Wren'];
  const seats = names.map((n, i) => ({ name: n, kind: i === 0 ? 'human' : 'bot', level: 'normal' }));
  const cfg = { count: 4, rounds: 'each' };
  const seatsEl = h('div');
  const draw = () => {
    seatsEl.replaceChildren();
    for (let i = 0; i < cfg.count; i++) {
      const s = seats[i];
      const kind = h('select', { onchange: (e) => { s.kind = e.target.value; draw(); } }, h('option', { value: 'human' }, 'Human'), h('option', { value: 'bot' }, 'Bot'));
      kind.value = s.kind;
      const lvl = h('select', { onchange: (e) => { s.level = e.target.value; }, disabled: s.kind === 'human' }, h('option', { value: 'easy' }, 'Easy'), h('option', { value: 'normal' }, 'Normal'), h('option', { value: 'hard' }, 'Hard'));
      lvl.value = s.level;
      seatsEl.append(h('div', { class: 'seat' }, h('input', { type: 'text', value: s.name, onchange: (e) => { s.name = e.target.value; } }), kind, lvl));
    }
  };
  draw();
  const sel = (opts, val, set) => { const s = h('select', { onchange: (e) => set(e.target.value) }, ...opts.map(([v, l]) => h('option', { value: v }, l))); s.value = val; return s; };
  return h('div', { class: 'overlay' }, h('div', { class: 'modal' },
    h('h2', {}, 'Fox in the Forest: Party'),
    h('p', { class: 'sub' }, 'An experimental 4–5 player variant of the two-player game. One suit per player, ten tricks a round, and scoring bands re-tuned by simulation. Hot-seat for several people, or fill seats with bots.'),
    h('div', { class: 'opts' },
      'Players', sel([['4', '4 players (Bells, Keys, Moons, Acorns)'], ['5', '5 players (adds Stars)']], '4', (v) => { cfg.count = Number(v); draw(); }),
      'Length', sel([['each', 'Everyone deals once (fair)'], ['2', '2 rounds (quick)']], 'each', (v) => { cfg.rounds = v; }),
      'Speed', sel([['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']], speed, (v) => { speed = v; })),
    seatsEl,
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => start({ players: seats.slice(0, cfg.count).map((s) => ({ ...s })), rounds: cfg.rounds }) }, 'Deal'),
      h('button', { onclick: showRules }, 'Rules'), h('a', { href: '../fox/' }, h('button', {}, 'Two-player original')))));
}

function showRules() {
  const m = h('div', { class: 'modal' }, h('h2', {}, 'Party variant rules'), h('div', { class: 'rules', html: `
    <p>Everything works as in the two-player game except for the changes below.</p>
    <h4>Cards and deal</h4>
    <p>Use one suit per player: 🔔 Bells, 🗝️ Keys, 🌙 Moons and 🌰 Acorns for four players, plus ⭐ Stars for five. Each suit runs 1 to 11 with the usual powers. Deal 10 cards each, turn up the decree, and keep the rest as the deck (3 or 4 cards).</p>
    <h4>Play</h4>
    <p>The player left of the dealer leads; play goes clockwise; follow suit if you can. The highest trump wins, otherwise the highest card of the suit led. The winner leads the next trick.</p>
    <h4>Powers with more players</h4>
    <ul>
      <li><b>Swan:</b> if you lose the trick with it, you lead next. If two Swans lose, the first one played leads.</li>
      <li><b>Monarch:</b> when led, <i>every</i> other player who has that suit must play the 1 or their highest card of it.</li>
      <li><b>Witch:</b> counts as trump only if it is the only 9 in the trick, which is rarer with more players.</li>
      <li><b>Fox, Woodcutter, Treasure:</b> unchanged.</li>
    </ul>
    <h4>Scoring (10 tricks)</h4>
    <table><tr><th>Tricks</th><th>4 players</th><th>5 players</th></tr>
      <tr><td>0</td><td rowspan="2">Humble: 6</td><td>Humble: 6</td></tr>
      <tr><td>1</td><td>Defeated: 1</td></tr>
      <tr><td>2</td><td>Defeated: 2</td><td>Defeated: 2</td></tr>
      <tr><td>3</td><td rowspan="3">Victorious: 6</td><td rowspan="2">Victorious: 6</td></tr>
      <tr><td>4</td></tr>
      <tr><td>5</td><td rowspan="2">Greedy: 0</td></tr>
      <tr><td>6+</td><td>Greedy: 0</td></tr></table>
    <p>Plus 1 point per Treasure. Play until everyone has dealt once; most points wins.</p>
    <h4>Why these numbers</h4>
    <p>With ten tricks shared by four or five people the original bands don't fit, and if everyone tries to be Humble somebody gets stuck with all the tricks. These bands were chosen by simulating thousands of bot games so that Humble, Defeated and Victorious all happen often, Greedy is a real threat but not the usual outcome, and a stronger player wins far more than their share.</p>` }),
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { modalRoot.replaceChildren(); if (G) render(); } }, 'Close')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

document.getElementById('btn-rules').onclick = showRules;
document.getElementById('btn-new').onclick = () => { clearTimeout(timer); G = null; modalRoot.replaceChildren(); render(); };
render();
