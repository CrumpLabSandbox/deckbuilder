// Tenure browser UI. Game rules live in engine.js; bots in bots.js.
import {
  newGame, cur, playCard, playAll, buyRow, buyBasic, canBuyRow, canBuyBasic, publish, canPublish,
  claimHonor, canClaim, endTurn, resolvePending, cardCost, cvIcons, standing, honorPoints, eligibleHonors,
  CARDS, HONORS, ROLES, TRACKS, TRACK_INFO, MAX_YEARS, HONORS_TO_WIN, BASICS,
} from './engine.js';
import { botTurn } from './bots.js';
import { todaySeed } from '../../platform/rng.js';

const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
let G = null;
let selected = new Set();
let showLog = true;
let passScreen = false;   // hot-seat: waiting for the next human to take the device
let botTimer = null;

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'onclick') el.onclick = v;
    else if (k === 'onchange') el.onchange = v;
    else if (k === 'html') el.innerHTML = v;
    else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
const glyphs = (icons) => icons.map(i => TRACK_INFO[i].glyph).join(' ');
const needText = (need) => Object.entries(need).map(([t, v]) => `${TRACK_INFO[t].glyph} ${v}`).join(' · ');

function cardEl(def, { cost, onclick, classes = '', mini = false, costChanged = false, count } = {}) {
  const el = h('div', { class: `card ${def.icons.map(i => 'i-' + i).join(' ')} ${def.junk ? 'junk' : ''} ${classes} ${mini ? 'mini' : ''} ${onclick ? 'clickable' : ''}`, title: def.text });
  el.append(h('div', { class: 'band' }));
  el.append(h('div', { class: 'name' }, def.name));
  if (def.cost || cost !== undefined) el.append(h('div', { class: `cost ${costChanged ? 'changed' : ''}` }, cost ?? def.cost));
  el.append(h('div', { class: 'icons' }, glyphs(def.icons)));
  if (!mini) {
    el.append(h('div', { class: 'text' }, def.text));
    const foot = [];
    if (def.era) foot.push(`Era ${def.era}`);
    if (def.basic) foot.push('basic');
    if (count !== undefined) foot.push(`×${count}`);
    el.append(h('div', { class: 'foot' }, foot.join(' · ')));
  }
  if (onclick) el.onclick = onclick;
  return el;
}

// ---------- flow ----------
function startGame(spec) {
  G = newGame(spec);
  selected = new Set();
  passScreen = false;
  modalRoot.replaceChildren();
  afterChange();
}

function act(fn) { fn(); afterChange(); }

function afterChange() {
  if (G.phase === 'over') { render(); showEnd(); return; }
  const p = cur(G);
  if (p.kind === 'bot' && !G.pending) {
    render();
    clearTimeout(botTimer);
    botTimer = setTimeout(() => { botTurn(G); afterChange(); }, 350);
    return;
  }
  render();
}

function humans() { return G.players.filter(p => p.kind === 'human').length; }

// ---------- render ----------
function render() {
  app.replaceChildren();
  modalRoot.replaceChildren();
  if (!G) { app.append(renderSetup()); return; }
  app.append(renderHeader());
  app.append(renderPlayers());
  const main = h('div', { class: 'main' });
  const left = h('div');
  left.append(renderTable());
  left.append(renderMarket());
  left.append(renderHonors());
  const right = h('div');
  right.append(renderCv());
  right.append(renderLog());
  main.append(left, right);
  app.append(main);
  if (G.pending && cur(G).kind === 'human') renderPending();
  if (passScreen) renderPass();
}

function renderHeader() {
  const p = cur(G);
  const era = G.era;
  return h('section', { class: 'panel' },
    h('div', { style: 'display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:baseline' },
      h('div', {}, h('b', { style: 'font-family:var(--font-display);font-size:1.2rem' }, `Year ${G.year} of ${MAX_YEARS}`), ` · Era ${era} · `, h('span', { class: 'muted' }, `game ${G.seed}`),
        G.finalRound ? h('span', { style: 'color:var(--accent)' }, ' · final year: someone holds 5 honors') : null),
      h('div', {}, `Turn: `, h('b', {}, p.name), ` (${p.role.name})`, p.kind === 'bot' ? h('span', { class: 'thinking' }, ' is thinking…') : null)));
}

function renderPlayers() {
  const wrap = h('div', { class: 'players' });
  for (const p of G.players) {
    const box = h('div', { class: `pbox ${p === cur(G) ? 'current' : ''}` });
    box.append(h('div', { class: 'who' }, h('b', {}, p.name), h('span', { class: 'role' }, `${p.role.name}${p.kind === 'bot' ? ' · bot' : ''}`)));
    const tr = h('div', { class: 'tracks' });
    for (const t of TRACKS) tr.append(h('div', { class: `track ${t}` }, h('div', { class: 'v' }, p.points[t]), h('div', { class: 'k' }, TRACK_INFO[t].glyph)));
    box.append(tr);
    const cv = TRACKS.map(t => cvIcons(p, t) ? `${TRACK_INFO[t].glyph}${cvIcons(p, t)}` : '').filter(Boolean).join(' ');
    box.append(h('div', { class: 'meta' },
      h('span', { class: 'honors-mini', title: p.honors.map(id => HONORS.find(x => x.id === id).name).join(', ') }, `★ ${p.honors.length} honors (+${honorPoints(p)})`),
      h('span', {}, `standing ${standing(p)}`)));
    box.append(h('div', { class: 'meta' }, h('span', { title: 'Icons on CV' }, `CV: ${cv || 'none'}`), h('span', {}, `deck ${p.deck.length} · hand ${p.hand.length} · discard ${p.discard.length}`)));
    box.append(h('div', { class: 'meta', style: 'margin-top:4px' }, h('span', { title: p.role.perk }, p.role.perk)));
    wrap.append(box);
  }
  return wrap;
}

function renderTable() {
  const p = cur(G);
  const me = p.kind === 'human' && !passScreen;
  const sec = h('section', { class: 'panel' });
  const playRow = h('div', { class: 'row', 'data-empty': 'Nothing played yet.' });
  if (!p.play.length) playRow.classList.add('empty');
  for (const c of p.play) {
    const ok = me && canPublish(G, c.uid);
    playRow.append(cardEl(CARDS[c.id], { mini: true, classes: ok ? 'publishable' : '', onclick: ok ? () => act(() => publish(G, c.uid)) : null }));
  }
  sec.append(h('h3', {}, 'In play', h('span', { class: 'hint' }, G.ts.published ? 'Published this turn.' : 'Click a played card to publish it to your CV (once per turn).')), playRow);

  sec.append(h('h3', { style: 'margin-top:12px' }, `Hand · ${p.name}`, h('span', { class: 'hint' }, 'Click a card to play it. Play everything, then recruit.')));
  const hand = h('div', { class: 'row', 'data-empty': 'Hand is empty.' });
  if (!p.hand.length) hand.classList.add('empty');
  const order = p.hand.slice().sort((a, b) => CARDS[b.id].cost - CARDS[a.id].cost);
  for (const c of order) hand.append(cardEl(CARDS[c.id], { onclick: me ? () => act(() => playCard(G, c.uid)) : null, classes: me ? '' : 'dim' }));
  sec.append(hand);

  sec.append(h('div', { class: 'controls' },
    h('div', { class: 'effort' }, `⚡ ${G.ts.energy} `, h('small', {}, 'Effort to spend')),
    h('button', { onclick: () => act(() => playAll(G)), disabled: !me || !p.hand.length }, 'Play all'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'primary', onclick: () => onEndTurn(), disabled: !me || !!G.pending }, 'End turn')));
  return sec;
}

function onEndTurn() {
  act(() => endTurn(G));
  if (G.phase !== 'over' && cur(G).kind === 'human' && humans() > 1) { passScreen = true; render(); }
}

function renderMarket() {
  const p = cur(G);
  const me = p.kind === 'human' && !passScreen;
  const sec = h('section', { class: 'panel' });
  sec.append(h('h3', {}, 'The Journal', h('span', { class: 'hint' }, `Era ${G.era} cards. ${G.eraDecks[G.era].length} left in the Era ${G.era} deck.`)));
  const row = h('div', { class: 'row' });
  G.row.forEach((c, i) => {
    const d = CARDS[c.id], cost = cardCost(G, p, c.id);
    const ok = me && canBuyRow(G, i);
    row.append(cardEl(d, { cost, costChanged: cost !== d.cost, classes: ok ? 'affordable' : 'dim', onclick: ok ? () => act(() => buyRow(G, i)) : null }));
  });
  sec.append(row);
  sec.append(h('h3', { style: 'margin-top:12px' }, 'Basics', h('span', { class: 'hint' }, 'Always available.')));
  const basics = h('div', { class: 'row' });
  for (const id of BASICS) {
    const d = CARDS[id], cost = cardCost(G, p, id);
    const ok = me && canBuyBasic(G, id);
    basics.append(cardEl(d, { cost, costChanged: cost !== d.cost, count: G.supply[id], classes: G.supply[id] <= 0 ? 'dim' : ok ? 'affordable' : 'dim', onclick: ok ? () => act(() => buyBasic(G, id)) : null }));
  }
  sec.append(basics);
  return sec;
}

function renderHonors() {
  const p = cur(G);
  const me = p.kind === 'human' && !passScreen;
  const sec = h('section', { class: 'panel' });
  sec.append(h('h3', {}, 'Honors', h('span', { class: 'hint' }, `First come, first served. One claim per turn. ${HONORS_TO_WIN} honors end the game at the end of the year.`)));
  const grid = h('div', { class: 'honors' });
  for (const hn of HONORS) {
    const owner = G.honors[hn.id];
    const ok = me && canClaim(G, hn.id);
    const el = h('div', { class: `honor ${hn.special ? 'special' : hn.track} ${owner !== null ? 'taken' : ''} ${ok ? 'eligible' : ''}`,
      onclick: ok ? () => act(() => claimHonor(G, hn.id)) : null },
      h('div', { class: 'hn' }, hn.name, ` (+${hn.value})`),
      h('div', { class: 'need' }, needText(hn.need)),
      owner !== null ? h('div', { class: 'owner' }, `★ ${G.players[owner].name}`) : ok ? h('div', { style: 'color:var(--good)' }, 'Claim') : null);
    grid.append(el);
  }
  sec.append(grid);
  return sec;
}

function renderCv() {
  const p = cur(G);
  const sec = h('section', { class: 'panel' });
  sec.append(h('h3', {}, `CV · ${p.name}`, h('span', { class: 'hint' }, 'Published cards. Their icons decide who is senior.')));
  const row = h('div', { class: 'row', 'data-empty': 'Nothing published yet.' });
  const cards = p.cv.filter(c => c.id !== 'role');
  if (!cards.length) row.classList.add('empty');
  for (const c of cards) row.append(cardEl(CARDS[c.id], { mini: true }));
  sec.append(row);
  const roleIcons = p.cv.filter(c => c.id === 'role').map(c => glyphs(c.icons)).join(' ');
  if (roleIcons) sec.append(h('div', { class: 'muted', style: 'font-size:0.8rem;margin-top:6px' }, `Role icons: ${roleIcons}`));
  const owned = [...p.deck, ...p.hand, ...p.discard, ...p.play];
  const counts = {};
  for (const c of owned) counts[c.id] = (counts[c.id] || 0) + 1;
  sec.append(h('div', { class: 'muted', style: 'font-size:0.8rem;margin-top:8px' },
    `Deck (${owned.length}): ` + Object.entries(counts).sort((a, b) => CARDS[b[0]].cost - CARDS[a[0]].cost).map(([id, n]) => `${n}× ${CARDS[id].name}`).join(' · ')));
  return sec;
}

function renderLog() {
  const sec = h('section', { class: 'panel' });
  sec.append(h('h3', {}, 'Minutes', h('button', { style: 'margin-left:auto;padding:2px 8px;font-size:0.75rem', onclick: () => { showLog = !showLog; render(); } }, showLog ? 'hide' : 'show')));
  if (showLog) {
    const log = h('div', { class: 'log' });
    let last = -1;
    for (const e of G.log.slice(-120)) {
      if (e.year !== last) { log.append(h('div', { class: 'd' }, `Year ${e.year}`)); last = e.year; }
      log.append(h('p', {}, e.msg));
    }
    sec.append(log);
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  }
  return sec;
}

function renderPending() {
  const sp = G.pending;
  const m = h('div', { class: 'modal' });
  m.append(h('h2', {}, 'Choose'));
  m.append(h('p', { class: 'sub' }, sp.text, ` (${sp.min === sp.max ? `exactly ${sp.min}` : `${sp.min}–${sp.max}`})`));
  const row = h('div', { class: 'row' });
  for (const c of sp.cards) {
    const isSel = selected.has(c.uid);
    row.append(cardEl(CARDS[c.id], { classes: isSel ? 'selected' : '', onclick: () => { if (isSel) selected.delete(c.uid); else if (selected.size < sp.max) selected.add(c.uid); render(); } }));
  }
  m.append(row);
  const ok = selected.size >= sp.min && selected.size <= sp.max;
  const actions = h('div', { class: 'actions' },
    h('button', { class: 'primary', disabled: !ok, onclick: () => { const s = [...selected]; selected = new Set(); act(() => resolvePending(G, s)); } }, sp.okLabel || 'Confirm'));
  if (sp.min === 0) actions.append(h('button', { onclick: () => { selected = new Set(); act(() => resolvePending(G, [])); } }, sp.skipLabel || 'Skip'));
  m.append(actions);
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

function renderPass() {
  const p = cur(G);
  modalRoot.replaceChildren(h('div', { class: 'overlay' },
    h('div', { class: 'modal', style: 'max-width:480px;text-align:center' },
      h('h2', {}, `Pass to ${p.name}`),
      h('p', { class: 'sub' }, `${p.role.name}. Year ${G.year}.`),
      h('button', { class: 'primary', onclick: () => { passScreen = false; render(); } }, `I'm ${p.name}`))));
}

// ---------- setup ----------
function renderSetup() {
  const seats = [
    { name: 'You', kind: 'human', role: 'random' },
    { name: 'Dr. Okafor', kind: 'bot', role: 'random' },
    { name: 'Dr. Lindqvist', kind: 'bot', role: 'random' },
    { name: 'Dr. Mehta', kind: 'bot', role: 'random' },
  ];
  let count = 3;
  const seedInput = h('input', { type: 'text', placeholder: 'seed (optional)', style: 'width:160px' });
  const box = h('div', { class: 'modal' });
  const seatsEl = h('div');
  function drawSeats() {
    seatsEl.replaceChildren();
    for (let i = 0; i < count; i++) {
      const s = seats[i];
      const name = h('input', { type: 'text', value: s.name, onchange: (e) => { s.name = e.target.value; } });
      const kind = h('select', { onchange: (e) => { s.kind = e.target.value; } }, h('option', { value: 'human' }, 'Human'), h('option', { value: 'bot' }, 'Bot'));
      kind.value = s.kind;
      const role = h('select', { onchange: (e) => { s.role = e.target.value; } }, h('option', { value: 'random' }, 'Random role'),
        ...Object.entries(ROLES).map(([id, r]) => h('option', { value: id }, r.name)));
      role.value = s.role;
      seatsEl.append(h('div', { class: 'seat' }, name, kind, role));
    }
  }
  drawSeats();
  const countSel = h('select', { onchange: (e) => { count = Number(e.target.value); drawSeats(); } }, ...[2, 3, 4].map(n => h('option', { value: n }, `${n} players`)));
  countSel.value = 3;
  box.append(h('h2', {}, 'Tenure'));
  box.append(h('p', { class: 'sub' }, 'A deckbuilder about the academic life. Four ways to score: Research, Teaching, Service and Prestige. Publish cards to your CV to build seniority, race for Honors, and make the committee work land on someone else.'));
  box.append(h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px' }, countSel, seedInput));
  box.append(seatsEl);
  box.append(h('div', { class: 'actions' },
    h('button', { class: 'primary', onclick: () => {
      const seed = seedInput.value.trim() || `${todaySeed()}-${Math.random().toString(36).slice(2, 6)}`;
      const used = new Set();
      const pick = () => { const ids = Object.keys(ROLES).filter(r => !used.has(r)); return ids[Math.floor(Math.random() * ids.length)]; };
      const players = seats.slice(0, count).map(s => { const role = s.role === 'random' || used.has(s.role) ? pick() : s.role; used.add(role); return { name: s.name, kind: s.kind, role, strategy: 'adaptive' }; });
      // Bots get varied strategies so the table feels different each game.
      const strats = ['research', 'teaching', 'service', 'prestige', 'balanced', 'adaptive'];
      for (const p of players) if (p.kind === 'bot') p.strategy = strats[Math.floor(Math.random() * strats.length)];
      startGame({ seed, players });
    } }, 'Start the academic year'),
    h('button', { onclick: showRules }, 'How to play')));
  const grid = h('div', { class: 'rolegrid' });
  for (const [, r] of Object.entries(ROLES)) {
    const pts = Object.entries(r.points).map(([t, v]) => `${TRACK_INFO[t].glyph}${v}`).join(' ') || 'no points';
    grid.append(h('div', { class: 'rolecard' }, h('b', {}, r.name), h('div', {}, r.perk), h('div', { class: 'muted' }, `Starts with ${pts}; CV ${glyphs(r.cv) || 'empty'}; hand ${r.hand}.`)));
  }
  box.append(h('details', {}, h('summary', { class: 'muted', style: 'cursor:pointer;margin-top:10px' }, 'The roles'), grid));
  return h('div', { class: 'overlay' }, box);
}

function showEnd() {
  const m = h('div', { class: 'modal' });
  const w = G.players[G.winner];
  m.append(h('h2', {}, `${w.name} wins`));
  m.append(h('p', { class: 'sub' }, G.endReason));
  const t = h('table', { class: 'ranking' });
  t.append(h('tr', {}, h('th', {}, '#'), h('th', {}, 'Player'), h('th', {}, 'Role'), ...TRACKS.map(tr => h('th', {}, TRACK_INFO[tr].glyph)), h('th', {}, 'Honors'), h('th', {}, 'Standing')));
  G.ranking.forEach((idx, i) => {
    const p = G.players[idx];
    t.append(h('tr', {}, h('td', {}, i + 1), h('td', {}, p.name), h('td', {}, p.role.name), ...TRACKS.map(tr => h('td', { class: 'num' }, p.points[tr])),
      h('td', { class: 'num', title: p.honors.map(id => HONORS.find(x => x.id === id).name).join(', ') }, `${p.honors.length} (+${honorPoints(p)})`), h('td', { class: 'num' }, h('b', {}, standing(p)))));
  });
  m.append(t);
  m.append(h('div', { class: 'actions' },
    h('button', { class: 'primary', onclick: () => { G = null; render(); } }, 'New game'),
    h('button', { onclick: () => { modalRoot.replaceChildren(); } }, 'Look at the table')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

function showRules() {
  const m = h('div', { class: 'modal' });
  m.append(h('h2', {}, 'How to play Tenure'));
  m.append(h('div', { class: 'rules', html: `
    <p>Two to four players, each with their own deck and a role. The game lasts <b>10 years</b> (rounds), or ends at the end of the year in which someone holds <b>5 Honors</b>. Highest <b>standing</b> wins: Research + Teaching + Service + Prestige + the value of your Honors.</p>
    <h4>Your turn</h4>
    <ul>
      <li><b>Play</b> any number of cards from your hand. There is no action limit. Cards give points on the four tracks, Effort (⚡), card draw, or make demands of other players.</li>
      <li><b>Recruit</b> cards from the Journal row or the Basics with Effort. New cards go to your discard pile.</li>
      <li><b>Publish</b> one card you played this turn to your CV. It leaves your deck forever; its icons stay on your CV. Some cards do something every turn while on your CV.</li>
      <li><b>Claim</b> one Honor you qualify for. Honors are first come, first served.</li>
      <li>Discard your hand and the cards in play, then draw a new hand.</li>
    </ul>
    <h4>Icons and seniority</h4>
    <p>Cards carry icons: 🔬 Research, 📚 Teaching, 🏛️ Service, 🏆 Prestige. Icons on your CV are your seniority. <b>Demand</b> effects hit the opponents (at most two) with fewer of that icon on their CV than you. <b>Share</b> effects also benefit opponents with at least as many; if anyone shared, you get a bonus. Scaling effects ("per 🔬 you have") count your CV and the cards you have in play this turn.</p>
    <h4>Eras</h4>
    <p>The Journal draws from the Era I deck in years 1–3, Era II in years 4–6 and Era III from year 7, or sooner when a deck runs out. Later cards are dearer and stronger.</p>
    <h4>Roles</h4>
    <p>Everyone starts somewhere different: a Graduate Student with a big hand and nothing on their CV, a Provost who is immune to demands, a Dean with cheaper recruiting, and so on. Roles are balanced by simulation across thousands of games, so the asymmetry is flavour and strategy, not an advantage.</p>
    <h4>Tips</h4>
    <ul>
      <li>Publishing a starting card early (a Memo, a Pilot Study) thins your deck and starts your seniority.</li>
      <li>Emails do nothing and cannot be published. Inbox Zero or a Search Committee of your own is the cure.</li>
      <li>Low-tier Honors get sniped. If you can claim one, claim it.</li>
    </ul>` }));
  m.append(h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { modalRoot.replaceChildren(); if (G) render(); } }, 'Close')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

document.getElementById('btn-rules').onclick = showRules;
document.getElementById('btn-new').onclick = () => { clearTimeout(botTimer); G = null; render(); };
render();
