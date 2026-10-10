// Ashfall browser UI. All game logic lives in engine.js; this file only renders state and
// forwards clicks.
import {
  newGame, chooseFounder, playCard, playAllTreasures, buyCard, buyWork, endDay, resolvePending,
  canPlay, canBuy, canBuyWork, cardCost, workCost, score, scoreBreakdown, rating, currentOmen,
  nextOmen, isShielded, CARDS, WORKS, OMENS, DAYS, AGES, ageForDay,
} from './engine.js';
import { ICONS } from './cards.js';
import { parForSeed } from './bots.js';
import { todaySeed } from '../../platform/rng.js';

const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const STORE_KEY = 'ashfall.results.v1';

let G = null;
let par = null;
let selected = new Set();   // uids selected in a pending prompt
let showLog = true;

// ---------- persistence ----------
function loadResults() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; } }
function saveResult(r) {
  const all = loadResults();
  all.unshift(r);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(all.slice(0, 50))); } catch { /* ignore */ }
}

// ---------- helpers ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'onclick') el.onclick = v;
    else if (k === 'html') el.innerHTML = v;
    else if (v !== null && v !== undefined) el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
const iconStr = (icons) => icons.map(i => ICONS[i].glyph).join(' ');
function iconTitle(icons) { return icons.map(i => ICONS[i].name).join(', '); }

function cardEl(def, { cost, uid, onclick, classes = '', count, mini = false, costChanged = false } = {}) {
  const types = def.types.map(t => 't-' + t).join(' ');
  const el = h('div', { class: `card ${types} ${classes} ${mini ? 'mini' : ''} ${onclick ? 'clickable' : ''}`, title: def.text });
  el.append(h('div', { class: 'band' }));
  el.append(h('div', { class: 'name' }, def.name));
  el.append(h('div', { class: `cost ${costChanged ? 'changed' : ''}` }, cost ?? def.cost));
  el.append(h('div', { class: 'icons', title: iconTitle(def.icons) }, iconStr(def.icons)));
  if (!mini) {
    el.append(h('div', { class: 'text' }, def.text));
    const left = def.types.join(' · ') + (count !== undefined ? ` · ${count >= 30 ? '∞' : '×' + count}` : '');
    const foot = h('div', { class: 'foot' }, h('span', {}, left));
    if (def.vp) foot.append(h('span', { class: 'vp' }, `${def.vp} pt`));
    el.append(foot);
  }
  if (onclick) el.onclick = onclick;
  if (uid !== undefined) el.dataset.uid = uid;
  return el;
}

function workEl(id, { onclick, classes = '', cost, costChanged = false } = {}) {
  const w = WORKS[id];
  const def = { name: w.name, types: ['work'], icons: [], text: w.text, cost: w.cost, vp: w.vp };
  return cardEl(def, { onclick, classes, cost, costChanged });
}

// ---------- game lifecycle ----------
function startGame(seed) {
  G = newGame(seed);
  par = parForSeed(seed);
  selected = new Set();
  render();
}

function finish() {
  const sc = score(G);
  const r = rating(sc, par.score);
  saveResult({ seed: G.seed, score: sc, par: par.score, rating: r.name, when: Date.now() });
  showEndModal(sc, r);
}

function act(fn) {
  fn();
  if (G.phase === 'over') { render(); finish(); return; }
  render();
}

// ---------- render ----------
function render() {
  app.replaceChildren();
  if (!G) { app.append(renderStart()); return; }
  if (G.phase === 'founder') { app.append(renderFounder()); return; }
  app.append(renderStatus());
  const main = h('div', { class: 'main' });
  const left = h('div');
  left.append(renderTable());
  left.append(renderMarket());
  const right = h('div');
  right.append(renderIsland());
  right.append(renderLog());
  main.append(left, right);
  app.append(main);
  renderPending();
}

function renderStart() {
  const results = loadResults();
  const daily = todaySeed();
  const input = h('input', { type: 'text', placeholder: 'custom seed', id: 'seed-input' });
  const box = h('div', { class: 'overlay' },
    h('div', { class: 'modal' },
      h('h2', {}, 'Ashfall'),
      h('p', { class: 'sub' }, 'The mountain wakes. You have fifteen days to build an engine, gather Relics, and get the island’s treasures onto the boats before the ash buries everything.'),
      h('div', { class: 'rules' },
        h('p', {}, h('b', {}, 'Each day'), ' you draw 5 cards, play Actions, spend Coins, and buy from the market. Cards you buy go to your discard pile and come back around when you reshuffle.'),
        h('p', {}, h('b', {}, 'Ages.'), ' Days 1–5 are Tremors, 6–10 Eruption, 11–15 Ashfall. Each Age brings its own market. When an Age ends, whatever you did not buy is gone.'),
        h('p', {}, h('b', {}, 'Omens.'), ' Something strikes every day. Tomorrow’s Omen is always forecast, so plan around it.'),
        h('p', {}, h('b', {}, 'Par.'), ' Every seed is also played by three rival captains. Beat the best of them.'),
      ),
      h('div', { class: 'actions' },
        h('button', { class: 'primary', onclick: () => startGame(daily) }, `Play today’s island (${daily})`),
        h('button', { onclick: () => startGame('r-' + Math.random().toString(36).slice(2, 8)) }, 'Random island'),
      ),
      h('div', { class: 'seedform' }, input,
        h('button', { onclick: () => { if (input.value.trim()) startGame(input.value.trim()); } }, 'Play seed')),
      results.length ? h('div', { class: 'history' },
        h('div', {}, 'Recent results'),
        h('table', {}, ...results.slice(0, 8).map(r => h('tr', {},
          h('td', {}, r.seed), h('td', {}, `${r.score} vs par ${r.par}`), h('td', {}, r.rating))))) : null,
    ));
  return box;
}

function renderFounder() {
  const wrap = h('div', { class: 'overlay' });
  const m = h('div', { class: 'modal' },
    h('h2', {}, 'Choose a Founder'),
    h('p', { class: 'sub' }, `Island ${G.seed}. One Age I card joins your starting deck of 7 Shells and 3 Totems. The rival captains’ par for this island is ${par.score}.`),
  );
  const row = h('div', { class: 'row' });
  for (const id of G.founderChoices) row.append(cardEl(CARDS[id], { onclick: () => act(() => chooseFounder(G, id)) }));
  m.append(row);
  m.append(h('div', { class: 'preview' }, renderPreview()));
  wrap.append(m);
  return wrap;
}

function renderPreview() {
  const d = h('details', {}, h('summary', {}, 'What is coming in later Ages'));
  for (const age of AGES.slice(1)) {
    d.append(h('div', { class: 'muted', style: 'margin-top:8px' }, `Age ${age.n}: ${age.name} (days ${age.days[0]}–${age.days[1]})`));
    const row = h('div', { class: 'row' });
    for (const id of G.kingdom[age.n]) row.append(cardEl(CARDS[id], { mini: true }));
    for (const id of G.worksByAge[age.n]) {
      const w = WORKS[id];
      row.append(cardEl({ name: w.name, types: ['work'], icons: [], text: w.text, cost: w.cost }, { mini: true }));
    }
    d.append(row);
  }
  return d;
}

function renderStatus() {
  const age = ageForDay(G.day);
  const omen = currentOmen(G);
  const omenId = G.omens[G.day - 1];
  const next = nextOmen(G);
  const nextId = G.omens[G.day];
  const sc = score(G);

  const omenBox = h('div', { class: 'box' },
    h('div', { class: 'label' }, `Day ${G.day} of ${DAYS} · Age ${age.n}: ${age.name} · Island ${G.seed}`),
    h('div', { class: 'omen-row' },
      h('div', { class: `omen ${isShielded(G, omenId) ? 'shielded' : omen.bad ? 'bad' : 'good'}` },
        h('div', {}, h('span', { class: 'glyph' }, omen.glyph), h('b', { class: 'name' }, `Today: ${omen.name}`)),
        h('div', { class: 'text' }, isShielded(G, omenId) ? 'Shielded by your Works.' : omen.text)),
      next ? h('div', { class: `omen ${isShielded(G, nextId) ? 'shielded' : next.bad ? 'bad' : 'good'}` },
        h('div', {}, h('span', { class: 'glyph' }, next.glyph), h('b', { class: 'name' }, `Tomorrow: ${next.name}`)),
        h('div', { class: 'text' }, isShielded(G, nextId) ? 'Shielded by your Works.' : next.text)) : h('div', { class: 'omen' }, h('b', {}, 'Last day'))),
    h('div', { class: 'progress' }, h('div', { style: `width:${(G.day / DAYS) * 100}%` })),
  );
  const res = h('div', { class: 'box' },
    h('div', { class: 'label' }, 'This day'),
    h('div', { class: 'resources' },
      h('div', { class: 'r' }, h('div', { class: 'v' }, G.actions), h('div', { class: 'k' }, 'Actions')),
      h('div', { class: 'r' }, h('div', { class: 'v' }, G.buys), h('div', { class: 'k' }, 'Buys')),
      h('div', { class: 'r' }, h('div', { class: 'v' }, G.coins), h('div', { class: 'k' }, 'Coins')),
      h('div', { class: 'r' }, h('div', { class: 'v' }, G.deck.length), h('div', { class: 'k' }, 'Deck')),
      h('div', { class: 'r' }, h('div', { class: 'v' }, G.discard.length), h('div', { class: 'k' }, 'Discard')),
    ));
  const scoreBox = h('div', { class: 'box score-box' },
    h('div', { class: 'label' }, 'Relic points'),
    h('div', { class: 'big' }, `${sc} `, h('span', { class: 'par' }, `· par ${par.score} (${par.name})`)),
    h('div', { class: 'muted', style: 'font-size:0.8rem' }, `${G.trash.length} trashed · ${countId('cinder')} Cinders in deck`),
  );
  return h('div', { class: 'status' }, omenBox, res, scoreBox);
}

function countId(id) { return [...G.deck, ...G.hand, ...G.discard, ...G.play].filter(c => c.id === id).length; }

function renderMarket() {
  const sec = h('section', { class: 'panel' });
  const lava = G.omens[G.day - 1] === 'lava';
  sec.append(h('h3', {}, `Market · Age ${G.age}`, h('span', { class: 'hint' }, lava ? 'Lava Flow: everything costs 1 more today.' : 'Click a card to buy it.')));

  const works = h('div', { class: 'row' });
  for (const id of G.worksMarket) {
    const ok = canBuyWork(G, id);
    works.append(workEl(id, { cost: workCost(G, id), costChanged: lava, classes: ok ? 'affordable' : 'dim', onclick: ok ? () => act(() => buyWork(G, id)) : null }));
  }
  if (G.worksMarket.length) {
    sec.append(h('div', { class: 'muted', style: 'font-size:0.8rem;margin:4px 0' }, 'Works (built on the island, never shuffled into your deck; one of each)'));
    sec.append(works);
  }

  const king = h('div', { class: 'row', style: 'margin-top:10px' });
  for (const id of G.market) king.append(pileEl(id));
  sec.append(h('div', { class: 'muted', style: 'font-size:0.8rem;margin:4px 0' }, 'Guild cards (gone when the Age ends)'));
  sec.append(king);

  const basics = h('div', { class: 'row', style: 'margin-top:10px' });
  for (const id of ['shell', 'pearl', 'obsidian', 'totem', 'idol', 'heart']) basics.append(pileEl(id));
  sec.append(h('div', { class: 'muted', style: 'font-size:0.8rem;margin:4px 0' }, 'Treasures and Relics (always available)'));
  sec.append(basics);
  return sec;
}

function pileEl(id) {
  const def = CARDS[id];
  const cost = cardCost(G, id);
  const left = G.supply[id];
  const ok = canBuy(G, id);
  return cardEl(def, {
    cost, count: left, costChanged: cost !== def.cost,
    classes: left <= 0 ? 'soldout' : ok ? 'affordable' : 'dim',
    onclick: ok ? () => act(() => buyCard(G, id)) : null,
  });
}

function renderTable() {
  const sec = h('section', { class: 'panel' });
  const playRow = h('div', { class: 'row', 'data-empty': 'Nothing played yet.' });
  if (!G.play.length) playRow.classList.add('empty');
  for (const c of G.play) playRow.append(cardEl(CARDS[c.id], { mini: true }));
  sec.append(h('h3', {}, 'In play'), playRow);

  const hint = G.phase === 'action'
    ? (G.actions > 0 ? 'Action phase: play Action cards, or play treasures to move on.' : 'No Actions left: play treasures and buy.')
    : 'Buy phase: spend your coins, then end the day.';
  sec.append(h('h3', { style: 'margin-top:14px' }, 'Hand', h('span', { class: 'hint' }, hint)));
  const hand = h('div', { class: 'row', 'data-empty': 'Your hand is empty.' });
  if (!G.hand.length) hand.classList.add('empty');
  const order = G.hand.slice().sort((a, b) => typeRank(a.id) - typeRank(b.id) || CARDS[b.id].cost - CARDS[a.id].cost);
  for (const c of order) {
    const ok = canPlay(G, c.uid);
    hand.append(cardEl(CARDS[c.id], { uid: c.uid, classes: ok ? '' : 'dim', onclick: ok ? () => act(() => playCard(G, c.uid)) : null }));
  }
  sec.append(hand);

  const hasTreasure = G.hand.some(c => CARDS[c.id].types.includes('treasure'));
  const controls = h('div', { class: 'controls' },
    h('button', { onclick: () => act(() => playAllTreasures(G)), disabled: hasTreasure && !G.pending ? null : 'disabled' }, 'Play all treasures'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'primary', onclick: () => act(() => endDay(G)), disabled: G.pending ? 'disabled' : null }, G.day === DAYS ? 'End the last day' : `End day ${G.day}`),
  );
  sec.append(controls);
  return sec;
}

function typeRank(id) {
  const t = CARDS[id].types;
  if (t.includes('action')) return 0;
  if (t.includes('treasure')) return 1;
  if (t.includes('relic')) return 2;
  return 3;
}

function renderIsland() {
  const sec = h('section', { class: 'panel' });
  sec.append(h('h3', {}, 'Your island'));
  const row = h('div', { class: 'row', 'data-empty': 'No Works built yet.' });
  if (!G.works.length) row.classList.add('empty');
  for (const id of G.works) row.append(h('span', { class: 'chip', title: WORKS[id].text }, WORKS[id].name, WORKS[id].vp ? h('span', { class: 'vp' }, `${WORKS[id].vp} pt`) : null));
  sec.append(row);
  // Deck composition
  const owned = [...G.deck, ...G.hand, ...G.discard, ...G.play];
  const counts = {};
  for (const c of owned) counts[c.id] = (counts[c.id] || 0) + 1;
  const list = Object.entries(counts).sort((a, b) => typeRank(a[0]) - typeRank(b[0]) || CARDS[b[0]].cost - CARDS[a[0]].cost)
    .map(([id, n]) => `${n}× ${CARDS[id].name}`).join(' · ');
  sec.append(h('div', { class: 'muted', style: 'font-size:0.8rem;margin-top:8px' }, `Deck (${owned.length} cards): ${list}`));
  sec.append(h('div', { class: 'preview' }, renderPreview()));
  return sec;
}

function renderLog() {
  const sec = h('section', { class: 'panel' });
  sec.append(h('h3', {}, 'Chronicle', h('button', { style: 'margin-left:auto;padding:2px 8px;font-size:0.75rem', onclick: () => { showLog = !showLog; render(); } }, showLog ? 'hide' : 'show')));
  if (showLog) {
    const log = h('div', { class: 'log' });
    let lastDay = -1;
    for (const e of G.log.slice(-80)) {
      if (e.day !== lastDay) { log.append(h('div', { class: 'd' }, e.day ? `Day ${e.day}` : 'Setup')); lastDay = e.day; }
      log.append(h('p', {}, e.msg));
    }
    sec.append(log);
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  }
  return sec;
}

function renderPending() {
  modalRoot.replaceChildren();
  const p = G.pending;
  if (!p) return;
  const m = h('div', { class: 'modal' });
  m.append(h('h2', { class: 'lava' }, 'Choose'));
  m.append(h('p', { class: 'sub' }, p.text, ` (${p.min === p.max ? `exactly ${p.min}` : `${p.min}–${p.max}`})`));
  const row = h('div', { class: 'row' });
  for (const c of p.cards) {
    const isSel = selected.has(c.uid);
    row.append(cardEl(CARDS[c.id], {
      uid: c.uid, classes: isSel ? 'selected' : '',
      onclick: () => {
        if (isSel) selected.delete(c.uid);
        else if (selected.size < p.max) selected.add(c.uid);
        renderPending();
      },
    }));
  }
  m.append(row);
  const ok = selected.size >= p.min && selected.size <= p.max;
  const actions = h('div', { class: 'actions' },
    h('button', { class: 'primary', disabled: ok ? null : 'disabled', onclick: () => { const s = [...selected]; selected = new Set(); act(() => resolvePending(G, s)); } }, p.okLabel || 'Confirm'),
  );
  if (p.min === 0) actions.append(h('button', { onclick: () => { selected = new Set(); act(() => resolvePending(G, [])); } }, p.skipLabel || 'Skip'));
  m.append(actions);
  modalRoot.append(h('div', { class: 'overlay' }, m));
}

function showEndModal(sc, r) {
  const m = h('div', { class: 'modal' });
  m.append(h('h2', {}, 'The mountain falls silent'));
  m.append(h('div', { class: 'rating' }, r.name));
  m.append(h('p', { class: 'sub' }, r.blurb));
  m.append(h('p', {}, h('b', {}, `${sc} points`), ` against a par of ${par.score} set by the ${par.name}. Island ${G.seed}.`));
  const t = h('table', { class: 'breakdown' });
  for (const b of scoreBreakdown(G)) t.append(h('tr', {}, h('td', {}, `${b.count}× ${b.name}`), h('td', {}, b.vp)));
  m.append(t);
  m.append(h('div', { class: 'actions' },
    h('button', { class: 'primary', onclick: () => { modalRoot.replaceChildren(); startGame(G.seed); } }, 'Replay this island'),
    h('button', { onclick: () => { modalRoot.replaceChildren(); startGame('r-' + Math.random().toString(36).slice(2, 8)); } }, 'Random island'),
    h('button', { onclick: () => { modalRoot.replaceChildren(); G = null; render(); } }, 'Back to start'),
  ));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

function showRules() {
  const m = h('div', { class: 'modal' });
  m.append(h('h2', {}, 'How to play Ashfall'));
  m.append(h('div', { class: 'rules', html: `
    <p>Ashfall is a solo deckbuilder. You have <b>15 days</b>. At the end, count the Relic points in your deck and on your island.</p>
    <h4>A day</h4>
    <ul>
      <li>You start with 1 Action, 1 Buy, and a hand of 5 cards. Your Works act first, then the day's Omen strikes.</li>
      <li><b>Action phase:</b> play Action cards one at a time. Each costs 1 Action unless it gives Actions back.</li>
      <li><b>Buy phase:</b> play Treasures for Coins (playing one ends the Action phase). Spend Coins to buy cards or build Works. Each purchase costs 1 Buy.</li>
      <li><b>End of day:</b> everything in hand and in play goes to your discard pile. Draw 5. When your deck runs out, shuffle the discard pile.</li>
    </ul>
    <h4>Ages</h4>
    <p>Days 1–5 are <b>Tremors</b>, 6–10 <b>Eruption</b>, 11–15 <b>Ashfall</b>. Each Age offers six Guild cards (4 copies each) and three Works (one each). When the Age ends, the unsold ones are gone forever. Later Ages are stronger and dearer, so your economy has to be ready in time.</p>
    <h4>Icons</h4>
    <p>Guild cards carry icons: 🌊 Tide, ⚒️ Forge, 📜 Lore, 🔥 Flame. Some cards grow stronger for each matching icon among the cards you have played this day. Chronicle and Relic Vault count things in your whole deck.</p>
    <h4>Works</h4>
    <p>Works are buildings. They never enter your deck, so they never dilute it. Most act at the start of every remaining day, some shield you from Omens, and a few are simply worth points.</p>
    <h4>Omens</h4>
    <p>Each day one Omen strikes, and tomorrow's is always forecast. Ashfall and Eruption hand you <b>Cinders</b>: dead cards worth −1 point. Trash them when you can.</p>
    <h4>Par and ratings</h4>
    <p>Three rival captains play every island with simple strategies. The best of their scores is par. Match par and you are <i>Survivors</i>; beat it by 4 for <i>Saved the Island</i>, by 10 for <i>Legend of the Mountain</i>.</p>
    <h4>Tips</h4>
    <ul>
      <li>Coins that do not buy anything are wasted. A Totem is better than nothing on the last two days.</li>
      <li>Terminal Actions (ones that do not give +Action) collide. Pair them with Village Elder or Harvest Fair.</li>
      <li>A Work bought early pays out every day. A Work bought on the last day of its Age is still available; a Work in the next Age is a gamble on reaching its cost in time.</li>
    </ul>` }));
  m.append(h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => modalRoot.replaceChildren() }, 'Close')));
  modalRoot.replaceChildren(h('div', { class: 'overlay', onclick: (e) => { if (e.target.classList.contains('overlay')) modalRoot.replaceChildren(); } }, m));
}

document.getElementById('btn-rules').onclick = showRules;
document.getElementById('btn-new').onclick = () => { modalRoot.replaceChildren(); G = null; render(); };

render();
