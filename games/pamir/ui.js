// Pax Pamir table UI with a switchable teaching mode. Seat 0 is the human.
import {
  newGame, act, cur, ruler, ruledBy, tribes, armies, influence, cylindersInPlay, blockCounts, dominant, courtLimit,
  handLimit, shelter, purchaseCost, bribeFor, canPurchase, canPlay, canUseCard, isFreeAction, findCourtCard, courtRing,
  spyTargets, roadOptions, battleSites, taxSources, needsDiscard, cname, GIFT_COSTS, TOTAL_CHECKS,
  REGIONS, REGION_INFO, BORDERS, bordersOf, borderBetween, COALITIONS, COALITION_INFO, SUITS, SUIT_INFO, IMPACTS, ACTIONS,
} from './engine.js';
import { botStep, bestAction, explain, describe } from './bots.js';

const app = document.getElementById('app'), modalRoot = document.getElementById('modal-root');
const ME = 0;
const PCOL = ['#6fb4e8', '#e07ac0', '#f0a04b', '#9ad06a', '#b9a3f0'];
const SPEED = { slow: 1200, normal: 650, fast: 220 };
const LAYOUT = { persia: [95, 215], transcaspia: [255, 72], herat: [255, 215], kabul: [430, 140], kandahar: [400, 305], punjab: [575, 240] };
let G = null, timer = null, speed = 'normal', dialog = null, tipIdx = null, lastSeenLog = 0;
let teach = true;
try { teach = localStorage.getItem('pamir.teach') !== 'off'; } catch { /* default on */ }

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k === 'onclick') el.onclick = v; else if (k === 'onchange') el.onchange = v;
    else if (k === 'html') el.innerHTML = v; else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  }
  for (const c of children.flat()) { if (c === null || c === undefined || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return el;
}
const svg = (tag, attrs = {}, ...children) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children.flat()) if (c !== null && c !== undefined) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};
const cchip = (c) => h('span', { class: 'chip', style: `background:${COALITION_INFO[c].color}` }, COALITION_INFO[c].name);
const schip = (s) => h('span', { class: 'chip', style: `background:${SUIT_INFO[s].color};color:#fff` }, SUIT_INFO[s].name);
const pname = (p) => G.players[p].name;
const myTurn = () => G && G.turn === ME && G.phase !== 'over';
function setTeach(v) { teach = v; try { localStorage.setItem('pamir.teach', v ? 'on' : 'off'); } catch { /* ignore */ } if (!v) tipIdx = null; render(); }

// ---------------- flow ----------------
function after() {
  clearTimeout(timer);
  render();
  if (!G) return;
  if (G.phase === 'over') { showEnd(); return; }
  if (G.players[G.turn].kind === 'bot') timer = setTimeout(() => { botStep(G); after(); }, SPEED[speed]);
}
function doAct(a) { dialog = null; modalRoot.replaceChildren(); if (act(G, a)) after(); else render(); }
function start(cfg) {
  const coal = COALITIONS.filter((c) => c !== cfg.loyalty);
  const names = ['You', 'Dost', 'Shuja', 'Ranjit', 'Zaman'];
  const players = Array.from({ length: cfg.count }, (_, i) => ({ name: names[i], kind: i === 0 ? 'human' : 'bot', level: cfg.level, loyalty: i === 0 ? cfg.loyalty : coal[(i - 1) % 2] }));
  G = newGame({ seed: Date.now().toString(36), players });
  lastSeenLog = 0;
  tipIdx = teach ? 0 : null;
  modalRoot.replaceChildren();
  after();
}

// ---------------- render ----------------
function render() {
  app.replaceChildren();
  if (!G) { app.append(renderSetup()); return; }
  app.append(renderStatus());
  const left = h('div', {}, h('div', { class: 'toprow' }, renderMap(), renderMarket()), renderMine(), renderPlayers());
  const right = h('div', {}, teach ? renderTeach() : renderTeachOff(), renderLog());
  app.append(h('div', { class: 'grid' }, left, right));
  if (dialog) renderDialog();
  if (teach && tipIdx !== null) { const area = TIPS[tipIdx].area; if (area) document.querySelectorAll(`[data-area="${area}"]`).forEach((el) => el.classList.add('spot')); }
}

function renderStatus() {
  const b = blockCounts(G), d = dominant(G), max = Math.max(4, ...Object.values(b));
  const bars = h('div', { class: 'bars' }, ...COALITIONS.map((c) => h('div', { class: 'bar', title: `${COALITION_INFO[c].name}: ${b[c]} blocks (armies + roads) on the map` },
    h('div', { class: 'fill', style: `height:${4 + 38 * b[c] / max}px;background:${COALITION_INFO[c].color}` }), `${b[c]}`)));
  const inMarket = G.market.flat().filter((s) => s && s.card.kind === 'dominance').length;
  const p = G.turn;
  return h('div', { class: 'status', 'data-area': 'status' },
    h('div', { class: 'who' }, h('b', {}, G.phase === 'over' ? 'Game over' : p === ME ? 'Your turn' : `${pname(p)}'s turn`), ' ',
      G.players[p].kind === 'bot' && G.phase !== 'over' ? h('span', { class: 'thinking' }, 'thinking…') : h('span', { class: 'pips', title: 'Actions left this turn' }, '●'.repeat(G.actionsLeft) + '○'.repeat(2 - G.actionsLeft))),
    h('div', {}, 'Favored suit: ', schip(G.favored), h('span', { class: 'muted' }, ' (its card actions are free)')),
    h('div', {}, `Dominance Checks: ${G.checks} of ${TOTAL_CHECKS} resolved`, inMarket ? h('span', { style: 'color:var(--accent)' }, ` · ${inMarket} in the market now`) : '', ` · deck ${G.deck.length}`),
    h('div', { class: 'dommeter', 'data-area': 'dominance' }, bars, h('div', { style: 'font-size:0.8rem;max-width:150px' }, d ? h('span', {}, cchip(d), ' would be dominant') : 'No coalition leads by 4 yet')));
}

function renderMap() {
  const sec = h('section', { class: 'panel map', 'data-area': 'map' }, h('h3', {}, 'The map', h('span', { class: 'hint' }, '■ armies and ═ roads belong to coalitions; ● tribes belong to players.')));
  const s = svg('svg', { viewBox: '0 0 660 370' });
  for (const bd of BORDERS) {
    const [x1, y1] = LAYOUT[bd.a], [x2, y2] = LAYOUT[bd.b];
    s.append(svg('line', { class: 'border', x1, y1, x2, y2 }));
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    let k = 0;
    for (const c of COALITIONS) {
      const n = G.map.roads[bd.id][c];
      if (!n) continue;
      s.append(svg('rect', { x: mx - 14 + k * 16, y: my - 7, width: 14, height: 14, rx: 2, fill: COALITION_INFO[c].color, stroke: '#111' }));
      s.append(svg('text', { x: mx - 7 + k * 16, y: my + 4, 'text-anchor': 'middle', style: 'font:700 10px sans-serif;fill:#111' }, `${n}`));
      k++;
    }
  }
  for (const r of REGIONS) {
    const [cx, cy] = LAYOUT[r], ru = ruler(G, r);
    const g = svg('g', { class: `region ${ru !== null ? 'ruled' : ''}` });
    g.append(svg('rect', { class: 'bg', x: cx - 78, y: cy - 46, width: 156, height: 92, rx: 12, style: ru !== null ? `stroke:${PCOL[ru]}` : '' }));
    g.append(svg('text', { x: cx - 70, y: cy - 28 }, REGION_INFO[r].name));
    g.append(svg('text', { class: 'small', x: cx - 70, y: cy - 13, style: ru !== null ? `fill:${PCOL[ru]}` : '' }, ru !== null ? `Ruled by ${pname(ru)}` : 'No ruler'));
    let k = 0;
    for (const c of COALITIONS) {
      const n = armies(G, r, c); if (!n) continue;
      g.append(svg('rect', { x: cx - 70 + k * 34, y: cy - 4, width: 16, height: 16, rx: 2, fill: COALITION_INFO[c].color, stroke: '#111' }));
      g.append(svg('text', { class: 'small', x: cx - 51 + k * 34, y: cy + 9 }, `×${n}`));
      k++;
    }
    k = 0;
    G.players.forEach((p) => {
      const n = tribes(G, r, p.idx); if (!n) return;
      g.append(svg('circle', { cx: cx - 62 + k * 30, cy: cy + 28, r: 7, fill: PCOL[p.idx], stroke: '#111' }));
      g.append(svg('text', { class: 'small', x: cx - 52 + k * 30, y: cy + 32 }, `×${n}`));
      k++;
    });
    s.append(g);
  }
  sec.append(s);
  return sec;
}

function cardEl(card, { classes = '', onclick, court = null, owner = null, title } = {}) {
  if (card.kind === 'event') {
    return h('div', { class: `pcard event ${classes}`, onclick, title: title || '' },
      h('div', { class: 'band', style: 'background:#6c5a8c' }, 'Event'), h('div', { class: 'nm' }, card.name),
      h('div', { class: 'evtxt' }, h('b', {}, 'If bought: '), card.purchased), h('div', { class: 'evtxt' }, h('b', {}, 'If it leaves the market: '), card.discarded));
  }
  if (card.kind === 'dominance') {
    return h('div', { class: `pcard dominance ${classes}`, onclick, title: title || '' },
      h('div', { class: 'band', style: 'background:#9a3a33' }, 'Dominance Check'),
      h('div', { class: 'evtxt' }, 'Scored when bought, or when it leaves the market at the left. A coalition 4+ blocks ahead of each other is dominant: its loyal players score by influence (5/3/1). Otherwise everyone scores by cylinders in play (3/1).'));
  }
  const el = h('div', { class: `pcard ${classes} ${onclick ? 'clickable' : ''}`, onclick, title: title || `${card.name}: ${SUIT_INFO[card.suit].name}, rank ${card.rank}. ${SUIT_INFO[card.suit].effect}` },
    h('div', { class: 'band', style: `background:${SUIT_INFO[card.suit].color}` }, h('span', {}, SUIT_INFO[card.suit].name), h('span', { class: 'stars' }, '★'.repeat(card.rank))),
    h('div', { class: 'nm' }, card.name), h('div', { class: 'rg' }, REGION_INFO[card.region].name));
  el.append(h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'when played'), ...card.impacts.map((i) => h('span', { class: 'imp', title: `${IMPACTS[i].name}: ${IMPACTS[i].text}` }, `${IMPACTS[i].icon} ${IMPACTS[i].name}`))));
  const acts = h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'card actions'));
  for (const t of card.actions) {
    const can = court && owner === ME && myTurn() && G.phase === 'action' && canUseCard(G, ME, card.uid, t);
    const used = court && G.used.includes(card.uid) && owner === G.turn;
    const free = court && isFreeAction(G, court);
    acts.append(h('span', { class: `actbtn ${can ? 'can' : ''} ${can && free ? 'free' : ''} ${used ? 'used' : ''}`, title: `${ACTIONS[t].name}${free ? ' (free: favored suit)' : ''}: ${ACTIONS[t].text}`,
      onclick: can ? (e) => { e.stopPropagation(); startCardAction(card.uid, t); } : null }, `${ACTIONS[t].icon} ${ACTIONS[t].name}`));
  }
  el.append(acts);
  const flags = [];
  if (card.patriot) flags.push(h('span', {}, 'Patriot: ', cchip(card.patriot)));
  if (card.prize) flags.push(h('span', {}, ' Prize: ', cchip(card.prize)));
  if (court && court.leverage) flags.push(h('span', { title: 'Leveraged: discarding this card costs 2 rupees per leverage' }, ' ¤ leveraged'));
  if (flags.length) el.append(h('div', { class: 'flags' }, ...flags));
  if (court) {
    const sp = Object.entries(court.spies).filter(([, n]) => n > 0);
    if (sp.length) el.append(h('div', { class: 'spies' }, ...sp.map(([q, n]) => h('span', { style: `background:${PCOL[q]}`, title: `${pname(Number(q))}'s spies` }, `👁${n}`))));
  }
  return el;
}

function renderMarket() {
  const sec = h('section', { class: 'panel', 'data-area': 'market' });
  const mil = G.favored === 'military';
  sec.append(h('h3', {}, 'Market', h('span', { class: 'hint' }, `Cost = column${mil ? ' × 2 (military is favored)' : ''}. You pay by putting rupees on the cards to the left.`)));
  const m = h('div', { class: 'market' });
  for (const row of [0, 1]) for (let c = 0; c < 6; c++) {
    const s = G.market[row][c];
    const can = s && myTurn() && G.phase === 'action' && canPurchase(G, ME, row, c);
    const sug = suggestionFor('purchase', (a) => a.row === row && a.col === c);
    m.append(h('div', { class: 'mslot' }, h('div', { class: 'cost' }, `cost ${purchaseCost(G, c)}`),
      s ? cardEl(s.card, { classes: `${can ? 'buyable' : (myTurn() ? 'dim' : '')} ${sug ? 'suggest' : ''}`, onclick: can ? () => doAct({ type: 'purchase', row, col: c }) : null }) : h('div', { class: 'muted' }, 'empty'),
      h('div', { class: 'coins', title: 'Rupees on this card: you collect them when you buy it' }, s && s.rupees ? `+${s.rupees} rupee${s.rupees === 1 ? '' : 's'}` : '')));
  }
  sec.append(m);
  return sec;
}

function renderMine() {
  const pl = G.players[ME];
  const sec = h('section', { class: 'panel', 'data-area': 'hand' });
  sec.append(h('h3', {}, `Your hand (${pl.hand.length}/${handLimit(G, ME)})`, h('span', { class: 'hint' }, 'Click a card to play it into your court (one action).')));
  if (myTurn() && G.phase === 'discard') sec.append(h('div', { class: 'banner' }, needsDiscard(G) === 'court' ? `Your court has ${pl.court.length} cards but your limit is ${courtLimit(G, ME)}. Click a court card below to discard it.` : `Your hand has ${pl.hand.length} cards but your limit is ${handLimit(G, ME)}. Click a hand card to discard it.`));
  const hand = h('div', { class: 'hand' });
  for (const c of pl.hand) {
    const can = myTurn() && G.phase === 'action' && canPlay(G, ME, c.uid);
    const disc = myTurn() && G.phase === 'discard' && needsDiscard(G) === 'hand';
    const b = bribeFor(G, ME, c);
    const sug = suggestionFor('play', (a) => a.uid === c.uid) || suggestionFor('discard', (a) => a.uid === c.uid);
    hand.append(cardEl(c, { classes: `${can || disc ? '' : myTurn() ? 'dim' : ''} ${sug ? 'suggest' : ''}`, title: b.amount ? `Playing this costs a bribe of ${b.amount} to ${pname(b.to)}, who rules ${REGION_INFO[c.region].name}.` : undefined,
      onclick: can ? () => { dialog = { kind: 'play', uid: c.uid, side: 'right', roads: [], spies: [] }; render(); } : disc ? () => doAct({ type: 'discard', uid: c.uid }) : null }));
  }
  if (!pl.hand.length) hand.append(h('span', { class: 'muted' }, 'No cards in hand. Buy some from the market.'));
  sec.append(hand);
  const ctr = h('div', { class: 'controls' });
  if (myTurn() && G.phase === 'action') ctr.append(h('button', { class: 'primary', onclick: () => doAct({ type: 'endTurn' }) }, G.actionsLeft ? `End turn (${G.actionsLeft} action${G.actionsLeft === 1 ? '' : 's'} unused)` : 'End turn'));
  if (teach) ctr.append(h('button', { onclick: () => { tipIdx = 0; render(); } }, 'Replay the tour'));
  sec.append(ctr);
  return sec;
}

function renderPlayers() {
  const sec = h('section', { class: 'panel', 'data-area': 'players' }, h('h3', {}, 'Players and courts', h('span', { class: 'hint' }, 'A court card’s actions can each be used once per turn.')));
  G.players.forEach((p) => {
    const box = h('div', { class: `player ${G.turn === p.idx ? 'current' : ''}` });
    box.append(h('div', { class: 'head' }, h('span', { class: 'dot', style: `background:${PCOL[p.idx]}` }), h('b', {}, p.name), cchip(p.loyalty),
      h('span', { title: 'Victory points' }, `⭐ ${p.points} pts`), h('span', { title: 'Rupees (money)' }, `🪙 ${p.rupees}`),
      h('span', { title: 'Influence = 1 + gifts + prizes + patriots of your coalition' }, `influence ${influence(G, p.idx)}`),
      h('span', { title: 'Cylinders in play (tribes, spies, gifts) score when no coalition is dominant' }, `cylinders in play ${cylindersInPlay(G, p.idx)}`),
      h('span', { class: 'gifts', title: 'Gift spaces (2, 4, 6 rupees)' }, 'gifts ', ...p.gifts.map((g) => h('span', { style: g ? `background:${PCOL[p.idx]}` : '' }))),
      p.prizes.length ? h('span', {}, `prizes ${p.prizes.length}`) : null,
      p.idx !== ME ? h('span', { class: 'muted' }, `hand ${p.hand.length}`) : null,
      h('span', { class: 'muted' }, `court ${p.court.length}/${courtLimit(G, p.idx)} · shelter ${shelter(G, p.idx)}`)));
    const row = h('div', { class: 'courtrow' });
    for (const cc of p.court) {
      const disc = p.idx === ME && myTurn() && G.phase === 'discard' && needsDiscard(G) === 'court';
      const sug = p.idx === ME && (suggestionFor('discard', (a) => a.uid === cc.card.uid) || (G.phase === 'action' && suggestionFor(null, (a) => a.card === cc.card.uid)));
      row.append(cardEl(cc.card, { court: cc, owner: p.idx, classes: `mini ${sug ? 'suggest' : ''}`, onclick: disc ? () => doAct({ type: 'discard', uid: cc.card.uid }) : null }));
    }
    if (!p.court.length) row.append(h('span', { class: 'muted', style: 'font-size:0.8rem' }, 'Empty court.'));
    box.append(row);
    sec.append(box);
  });
  return sec;
}

function renderLog() {
  const sec = h('section', { class: 'panel' }, h('h3', {}, 'Log'));
  const log = h('div', { class: 'log' });
  for (const e of G.log.slice(-90)) log.append(h('p', { class: e.kind }, e.msg));
  sec.append(log);
  requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  return sec;
}

// ---------------- human card actions ----------------
function startCardAction(uid, type) {
  if (type === 'tax' || type === 'gift') { doAct({ type, card: uid }); return; }
  dialog = { kind: type, card: uid, pieces: [], moves: [], target: null, takePrize: false, site: null };
  render();
}
function renderDialog() {
  const d = dialog, pl = G.players[ME];
  const m = h('div', { class: 'modal' });
  const close = h('button', { onclick: () => { dialog = null; modalRoot.replaceChildren(); render(); } }, 'Cancel');
  const note = (txt) => (teach ? h('p', { class: 'sub', style: 'color:var(--good)' }, '🎓 ', txt) : null);
  if (d.kind === 'play') {
    const c = pl.hand.find((x) => x.uid === d.uid), b = bribeFor(G, ME, c);
    m.append(h('h2', {}, `Play ${c.name}`), cardEl(c));
    if (b.amount) m.append(h('p', {}, `Bribe: ${b.amount} rupees to ${pname(b.to)}, who rules ${REGION_INFO[c.region].name}.`));
    if (c.patriot && c.patriot !== pl.loyalty) m.append(h('p', { style: 'color:var(--bad)' }, `This is a ${COALITION_INFO[c.patriot].name} patriot. Playing it switches your loyalty to ${COALITION_INFO[c.patriot].name}: you lose your gifts and your ${COALITION_INFO[pl.loyalty].name} patriots and prizes.`));
    m.append(note('Playing a card uses an action. Each icon under "when played" happens now, top to bottom. The card then sits in your court, and its card actions can be used from your next action on.'));
    m.append(h('div', { class: 'choice' }, h('b', {}, 'Place it at which end of your court?'),
      h('div', { class: 'controls' }, ...['left', 'right'].map((s) => h('button', { class: d.side === s ? 'on' : '', onclick: () => { d.side = s; render(); } }, s === 'left' ? 'Left end' : 'Right end')))));
    let ri = 0, si = 0;
    for (const imp of c.impacts) {
      if (imp === 'road') {
        const k = ri++, opts = roadOptions(c.region);
        d.roads[k] = d.roads[k] || opts[0];
        m.append(h('div', { class: 'choice' }, h('b', {}, `Road ${k + 1}: which border of ${REGION_INFO[c.region].name}?`),
          ...opts.map((o) => h('button', { class: d.roads[k] === o ? 'on' : '', onclick: () => { d.roads[k] = o; render(); } }, o.split('-').map((r) => REGION_INFO[r].name).join(' – ')))));
      }
      if (imp === 'spy') {
        const k = si++, opts = spyTargets(G, c.region);
        if (!opts.length) { m.append(h('p', { class: 'muted' }, `Spy ${k + 1}: there is no ${REGION_INFO[c.region].name} card in any court yet, so this spy is not placed.`)); continue; }
        d.spies[k] = d.spies[k] || opts[0];
        m.append(h('div', { class: 'choice' }, h('b', {}, `Spy ${k + 1}: on which ${REGION_INFO[c.region].name} court card?`),
          ...opts.map((o) => { const f = findCourtCard(G, o); return h('button', { class: d.spies[k] === o ? 'on' : '', onclick: () => { d.spies[k] = o; render(); } }, `${f.cc.card.name} (${pname(f.owner)}'s court)`); })));
      }
    }
    m.append(h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => doAct({ type: 'play', uid: c.uid, side: d.side, roads: d.roads, spies: d.spies }) }, 'Play it'), close));
  } else if (d.kind === 'build') {
    const f = findCourtCard(G, d.card), ruled = ruledBy(G, ME), max = Math.min(3, Math.floor(pl.rupees / 2));
    m.append(h('h2', {}, `Build with ${f.cc.card.name}`), h('p', { class: 'sub' }, `2 rupees per piece, up to ${max}. Armies go in regions you rule; roads go on their borders. Pieces are ${COALITION_INFO[pl.loyalty].name}.`));
    m.append(note('Blocks (armies and roads) are what make a coalition dominant at a Dominance Check. Armies also count toward ruling a region for every player loyal to that coalition.'));
    const add = (pc) => { if (d.pieces.length < max) { d.pieces.push(pc); render(); } };
    m.append(h('div', { class: 'choice' }, ...ruled.map((r) => h('button', { onclick: () => add({ kind: 'army', region: r }) }, `+ army in ${REGION_INFO[r].name}`)),
      ...[...new Set(ruled.flatMap((r) => bordersOf(r).map((b) => b.id)))].map((b) => h('button', { onclick: () => add({ kind: 'road', border: b }) }, `+ road on ${b.split('-').map((r) => REGION_INFO[r].name).join(' – ')}`))));
    m.append(h('p', {}, `Chosen (${d.pieces.length}): ${d.pieces.map((x) => (x.kind === 'army' ? `army ${REGION_INFO[x.region].name}` : `road ${x.border}`)).join(', ') || 'nothing yet'} · cost ${2 * d.pieces.length}`));
    m.append(h('div', { class: 'actions' }, h('button', { class: 'primary', disabled: !d.pieces.length, onclick: () => doAct({ type: 'build', card: d.card, pieces: d.pieces }) }, 'Build'), h('button', { onclick: () => { d.pieces = []; render(); } }, 'Clear'), close));
  } else if (d.kind === 'move') {
    const f = findCourtCard(G, d.card), rank = f.cc.card.rank;
    m.append(h('h2', {}, `Move with ${f.cc.card.name}`), h('p', { class: 'sub' }, `Up to ${rank} move${rank === 1 ? '' : 's'}. Armies cross a border only along a road of their own coalition. Spies step to the next or previous card in the ring of all courts.`));
    m.append(note('Moving armies concentrates force for battles and for ruling. Moving spies sets up betrayals, and a spy on a card also lets you battle there.'));
    const opts = moveOptions(d.moves);
    m.append(h('div', { class: 'choice' }, ...(d.moves.length >= rank ? [h('span', { class: 'muted' }, 'No moves left.')] : opts.length ? opts.map((o) => h('button', { onclick: () => { d.moves.push(o.m); render(); } }, o.label)) : [h('span', { class: 'muted' }, 'No legal moves from here.')])));
    m.append(h('p', {}, `Chosen: ${d.moves.map((x) => (x.kind === 'army' ? `army ${REGION_INFO[x.from].name}→${REGION_INFO[x.to].name}` : 'spy step')).join(', ') || 'nothing yet'}`));
    m.append(h('div', { class: 'actions' }, h('button', { class: 'primary', disabled: !d.moves.length, onclick: () => doAct({ type: 'move', card: d.card, moves: d.moves }) }, 'Move'), h('button', { onclick: () => { d.moves = []; render(); } }, 'Clear'), close));
  } else if (d.kind === 'betray') {
    const f = findCourtCard(G, d.card);
    const targets = G.players.flatMap((q) => q.court.filter((cc) => cc.spies[ME] && cc.card.uid !== d.card).map((cc) => ({ cc, owner: q.idx })));
    m.append(h('h2', {}, `Betray with ${f.cc.card.name}`), h('p', { class: 'sub' }, 'Pay 2 rupees to discard a court card where you have a spy. If it shows a prize, you may keep it: +1 influence for that coalition (and if it is not your coalition, you must switch loyalty to keep it).'));
    m.append(note('Betrayal can trigger the Overthrow rule: if a political card is discarded and its owner has no other political card for that region, their tribes there are removed too.'));
    m.append(h('div', { class: 'choice' }, ...(targets.length ? targets.map((t) => h('button', { class: d.target === t.cc.card.uid ? 'on' : '', onclick: () => { d.target = t.cc.card.uid; d.takePrize = false; render(); } }, `${t.cc.card.name} (${pname(t.owner)})${t.cc.card.prize ? ` · prize: ${COALITION_INFO[t.cc.card.prize].name}` : ''}`)) : [h('span', { class: 'muted' }, 'You have no spies on other cards.')])));
    const tc = d.target && findCourtCard(G, d.target);
    if (tc && tc.cc.card.prize) m.append(h('label', { class: 'toggle' }, (() => { const i = h('input', { type: 'checkbox', onchange: (e) => { d.takePrize = e.target.checked; render(); } }); i.checked = d.takePrize; return i; })(), `Keep it as a ${COALITION_INFO[tc.cc.card.prize].name} prize${tc.cc.card.prize !== pl.loyalty ? ' (switches your loyalty!)' : ''}`));
    m.append(h('div', { class: 'actions' }, h('button', { class: 'primary', disabled: !d.target || pl.rupees < 2, onclick: () => doAct({ type: 'betray', card: d.card, target: d.target, takePrize: d.takePrize }) }, 'Betray (2 rupees)'), close));
  } else if (d.kind === 'battle') {
    const f = findCourtCard(G, d.card), sites = battleSites(G, ME);
    m.append(h('h2', {}, `Battle with ${f.cc.card.name}`), h('p', { class: 'sub' }, `Remove up to ${f.cc.card.rank} enemy pieces at one site, but no more than your coalition’s armies there (region) or your spies there (card). Pieces of your own coalition are safe. Enemy armies go first, then tribes, then roads.`));
    m.append(note('Battles knock enemy coalitions down before a Dominance Check, and removing a player’s last tribe in a region also discards their political cards there (Overthrow).'));
    m.append(h('div', { class: 'choice' }, ...(sites.length ? sites.map((s) => { const key = s.region || s.card; return h('button', { class: d.site === key ? 'on' : '', onclick: () => { d.site = key; render(); } }, s.region ? `${REGION_INFO[s.region].name}: remove up to ${Math.min(f.cc.card.rank, s.limit)} of ${s.enemies} enemy pieces` : `${findCourtCard(G, s.card).cc.card.name}: remove up to ${Math.min(f.cc.card.rank, s.limit)} enemy spies`); }) : [h('span', { class: 'muted' }, 'Nowhere to battle.')])));
    m.append(h('div', { class: 'actions' }, h('button', { class: 'primary', disabled: !d.site, onclick: () => doAct({ type: 'battle', card: d.card, site: REGIONS.includes(d.site) ? { region: d.site } : { card: d.site } }) }, 'Battle'), close));
  }
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}
function moveOptions(chosen) {
  const c = G.players[ME].loyalty;
  const arm = Object.fromEntries(REGIONS.map((r) => [r, armies(G, r, c)]));
  const ring = courtRing(G);
  const spies = Object.fromEntries(ring.map((u) => [u, findCourtCard(G, u).cc.spies[ME] || 0]));
  for (const m of chosen) { if (m.kind === 'army') { arm[m.from]--; arm[m.to]++; } else { spies[m.from]--; spies[m.to]++; } }
  const out = [];
  for (const b of BORDERS) if (G.map.roads[b.id][c]) {
    if (arm[b.a] > 0) out.push({ m: { kind: 'army', from: b.a, to: b.b }, label: `Army ${REGION_INFO[b.a].name} → ${REGION_INFO[b.b].name}` });
    if (arm[b.b] > 0) out.push({ m: { kind: 'army', from: b.b, to: b.a }, label: `Army ${REGION_INFO[b.b].name} → ${REGION_INFO[b.a].name}` });
  }
  ring.forEach((u, i) => {
    if (!spies[u]) return;
    for (const j of [(i + 1) % ring.length, (i - 1 + ring.length) % ring.length]) if (ring[j] !== u) out.push({ m: { kind: 'spy', from: u, to: ring[j] }, label: `Spy: ${findCourtCard(G, u).cc.card.name} → ${findCourtCard(G, ring[j]).cc.card.name}` });
  });
  return out;
}

// ---------------- teaching mode ----------------
const TIPS = [
  { area: null, title: 'Welcome to Pax Pamir', body: 'It is the 1820s. You lead a faction in Afghanistan and back one of three coalitions: Afghan, British or Russian. You score points only at the four <b>Dominance Checks</b> hidden in the deck. The first player 4 points ahead after a check wins; otherwise the leader after the fourth check wins.' },
  { area: 'map', title: 'The map', body: 'Six regions. <b>Armies</b> (squares) and <b>roads</b> (on the lines between regions) belong to the coalitions, not to players. <b>Tribes</b> (circles) are your own cylinders. You <b>rule</b> a region if you have at least one tribe there and more tribes plus armies of your coalition than anyone else.' },
  { area: 'players', title: 'Loyalty and influence', body: 'Your coloured chip shows your loyalty. <b>Influence</b> = 1 + your gifts + prizes + patriots of your coalition. If your coalition is dominant at a check, the loyal players score 5/3/1 by influence. Playing a patriot of another coalition switches your loyalty and costs you your gifts, prizes and old patriots.' },
  { area: 'market', title: 'The market', body: 'Buying a card costs its column (0 to 5, double while military is favored). You pay by placing 1 rupee on each card to its left, so cheap cards slowly gather rupees, and you collect any rupees on the card you buy. Events take effect when bought or when they leave the market. Buying a Dominance Check resolves it at once.' },
  { area: 'hand', title: 'Your hand and court', body: 'Playing a card from your hand puts it in your court and resolves its icons: armies, roads, tribes, spies, leverage (2 rupees now, repaid later) and favor (makes its suit favored). If another player rules the card’s region you must pay them a <b>bribe</b> equal to their tribes there. Hand limit is 2 + intelligence stars; court limit 3 + political stars.' },
  { area: 'status', title: 'Your turn: two actions', body: 'Each turn you get <b>2 actions</b>: buy a card, play a card, or use one card action from a court card (tax, gift, build, move, betray, battle). Each court card can act once per turn. Card actions on cards of the <b>favored suit are free</b>: they do not use up an action.' },
  { area: 'map', title: 'Rulers, bribes and taxes', body: 'Ruling a region lets you collect bribes from anyone playing cards there, build armies and roads there, and tax players who have a court card from a region you rule (above their tax shelter, which is their economic stars). Lose your last tribe in a region and your political cards there are discarded (<b>Overthrow</b>).' },
  { area: 'dominance', title: 'Dominance Checks', body: 'When a check resolves, count blocks (armies + roads) per coalition. If one coalition has <b>at least 4 more</b> than each other one, it is dominant: its loyal players score by influence, then all blocks leave the map. If not, everyone scores 3/1 by cylinders in play (tribes, spies, gifts). The final check scores double.' },
  { area: null, title: 'You’re ready', body: 'The panel below will explain what you can do each turn, suggest a move and say why. The suggested card has a dashed green outline. Turn teaching mode off with the switch at the top whenever you like.' },
];

function suggestionCache() {
  if (!teach || !myTurn() || (G.phase !== 'action' && G.phase !== 'discard')) return null;
  const key = `${G.turnNo}:${G.phase}:${G.actionsLeft}:${G.used.length}:${G.players[ME].hand.length}:${G.players[ME].court.length}:${G.players[ME].rupees}`;
  if (suggestionCache.key !== key) { suggestionCache.key = key; const a = bestAction(G, ME); suggestionCache.val = { a, ...explain(G, ME, a) }; }
  return suggestionCache.val;
}
function suggestionFor(type, pred) {
  const s = suggestionCache();
  if (!s) return false;
  if (type && s.a.type !== type) return false;
  return pred(s.a);
}

function renderTeachOff() {
  return h('section', { class: 'panel' }, h('h3', {}, 'Teaching mode'), h('label', { class: 'toggle' }, (() => { const i = h('input', { type: 'checkbox', onchange: (e) => setTeach(e.target.checked) }); i.checked = false; return i; })(), 'Turn on guidance, suggestions and rule notes'));
}
function renderTeach() {
  const sec = h('section', { class: 'panel teach' });
  sec.append(h('h3', {}, '🎓 Teaching mode', h('label', { class: 'toggle', style: 'margin-left:auto' }, (() => { const i = h('input', { type: 'checkbox', onchange: (e) => setTeach(e.target.checked) }); i.checked = true; return i; })(), 'on')));
  if (tipIdx !== null) {
    const t = TIPS[tipIdx];
    sec.append(h('div', { class: 'tip' }, h('h4', {}, `${tipIdx + 1}/${TIPS.length} · ${t.title}`), h('p', { html: t.body }),
      h('div', { class: 'nav' }, tipIdx > 0 ? h('button', { onclick: () => { tipIdx--; render(); } }, 'Back') : null,
        tipIdx < TIPS.length - 1 ? h('button', { class: 'primary', onclick: () => { tipIdx++; render(); } }, 'Next') : h('button', { class: 'primary', onclick: () => { tipIdx = null; render(); } }, 'Start playing'),
        tipIdx < TIPS.length - 1 ? h('button', { onclick: () => { tipIdx = null; render(); } }, 'Skip the tour') : null)));
    return sec;
  }
  const pl = G.players[ME];
  if (myTurn() && G.phase === 'action') {
    const buy = G.market.flat().map((s, i) => s && canPurchase(G, ME, i < 6 ? 0 : 1, i % 6)).filter(Boolean).length;
    const playable = pl.hand.filter((c) => canPlay(G, ME, c.uid)).length;
    const acts = pl.court.flatMap((cc) => cc.card.actions.filter((t) => canUseCard(G, ME, cc.card.uid, t)).map((t) => `${ACTIONS[t].name}${isFreeAction(G, cc) ? ' (free)' : ''}`));
    sec.append(h('div', { class: 'tip' }, h('h4', {}, `Your turn: ${G.actionsLeft} action${G.actionsLeft === 1 ? '' : 's'} left`), h('ul', {},
      h('li', {}, buy ? `You can buy ${buy} market card${buy === 1 ? '' : 's'} (you have ${pl.rupees} rupees).` : `You can't afford anything in the market right now (${pl.rupees} rupees).`),
      h('li', {}, playable ? `You can play ${playable} card${playable === 1 ? '' : 's'} from your hand.` : pl.hand.length ? 'Your hand cards need bribes you can’t pay yet.' : 'Your hand is empty.'),
      h('li', {}, acts.length ? `Court actions ready: ${[...new Set(acts)].join(', ')}.` : 'No court card actions available.'),
      h('li', {}, `${SUIT_INFO[G.favored].name} is favored: actions on ${SUIT_INFO[G.favored].name.toLowerCase()} cards don't use an action.`))));
    sec.append(h('p', { style: 'font-size:0.86rem;margin:6px 0' }, h('b', {}, 'Big picture: '), outlook()));
  } else if (myTurn() && G.phase === 'discard') {
    sec.append(h('div', { class: 'tip' }, h('h4', {}, 'Cleanup'), h('p', {}, `At the end of your turn your court must fit your court limit (3 + political stars = ${courtLimit(G, ME)}) and your hand your hand limit (2 + intelligence stars = ${handLimit(G, ME)}). Choose what to discard.`)));
  } else if (G.phase !== 'over') {
    sec.append(h('div', { class: 'tip' }, h('h4', {}, `${pname(G.turn)} is taking their turn`), h('p', {}, 'Watch the log: each action is explained as it happens.')));
  }
  const s = suggestionCache();
  if (s) {
    sec.append(h('div', { class: 'coach' }, h('b', {}, 'Suggestion: '), s.text,
      s.why.length ? h('ul', {}, ...s.why.map((w) => h('li', {}, w))) : null,
      h('div', { class: 'nav' }, h('button', { class: 'primary', onclick: () => doSuggested(s.a) }, 'Do it'),
        h('span', { class: 'muted', style: 'font-size:0.8rem;align-self:center' }, 'Or choose your own move.'))));
  }
  const notes = ruleNotes();
  if (notes.length) sec.append(h('div', {}, h('h4', { style: 'margin:10px 0 4px;color:var(--good)' }, 'Rules that just came up'), h('ul', {}, ...notes.map((n) => h('li', { html: n })))));
  sec.append(h('details', {}, h('summary', {}, 'Glossary'), h('ul', {},
    h('li', {}, h('b', {}, 'Block: '), 'a coalition’s army or road. Blocks decide dominance.'),
    h('li', {}, h('b', {}, 'Cylinder: '), 'your own piece: a tribe on the map, a spy on a card, or a gift.'),
    h('li', {}, h('b', {}, 'Rank: '), 'a card’s stars (1-3): the strength of its tax, move and battle, and the stars it adds to its suit.'),
    h('li', {}, h('b', {}, 'Suits: '), 'Political (court limit), Intelligence (hand limit), Economic (tax shelter), Military (doubles purchase costs while favored).'),
    h('li', {}, h('b', {}, 'Patriot: '), 'a card loyal to one coalition; it adds influence, and playing one of another coalition switches your loyalty.'),
    h('li', {}, h('b', {}, 'Prize: '), 'a card you can keep after betraying it, for +1 influence with its coalition.'),
    h('li', {}, h('b', {}, 'Leverage: '), '2 rupees now; repay 2 when the card is discarded or lose hand cards.'))));
  return sec;
}
function doSuggested(a) {
  if (a.type === 'play') doAct(a);
  else doAct(a);
}
function outlook() {
  const pl = G.players[ME], b = blockCounts(G), mine = b[pl.loyalty], best = Math.max(...COALITIONS.filter((c) => c !== pl.loyalty).map((c) => b[c]));
  const d = dominant(G);
  if (d === pl.loyalty) return `${COALITION_INFO[d].name} would be dominant right now. Your influence (${influence(G, ME)}) decides your share, so gifts, patriots and prizes pay off. Buying a Dominance Check now would score it.`;
  if (d) return `${COALITION_INFO[d].name} would be dominant, and you are not loyal to it. Battle their blocks, build your own, or think about switching loyalty with a patriot.`;
  if (mine - best >= 2) return `${COALITION_INFO[pl.loyalty].name} is ${mine - best} blocks ahead; at 4 ahead it becomes dominant. Armies and roads help most now.`;
  return `No coalition is close to dominance. If a check happened now, players would score by cylinders in play (yours: ${cylindersInPlay(G, ME)}). Tribes, spies and gifts all count.`;
}
function ruleNotes() {
  const recent = G.log.slice(-25).map((e) => e.msg).join(' ');
  const notes = [];
  if (/bribe/.test(recent)) notes.push('<b>Bribes:</b> playing a card from a region someone else rules costs a bribe equal to their tribes there.');
  if (/Overthrow/.test(recent)) notes.push('<b>Overthrow:</b> losing your last tribe in a region discards your political cards there, and losing your last political card there removes your tribes.');
  if (/loyalty/.test(recent)) notes.push('<b>Changing loyalty:</b> you lose your gifts and any patriots and prizes of your old coalition.');
  if (/Dominance Check/.test(recent)) notes.push('<b>Dominance Check:</b> a coalition 4+ blocks ahead of each other is dominant and its players score by influence; otherwise everyone scores by cylinders in play.');
  if (/betrays/.test(recent)) notes.push('<b>Betray:</b> pay 2 to discard a card where you have a spy; a prize can be kept for influence.');
  if (/battles/.test(recent)) notes.push('<b>Battle:</b> remove enemy pieces up to the card’s rank, limited by your armies (region) or spies (card) at that site.');
  if (/taxes/.test(recent)) notes.push('<b>Tax:</b> take rupees from market cards, or from players with a court card in a region you rule, above their shelter.');
  if (/leverage/.test(recent)) notes.push('<b>Leverage:</b> when a leveraged card is discarded its owner repays 2 rupees per leverage, or loses hand cards.');
  return notes;
}

// ---------------- setup, end, rules ----------------
function renderSetup() {
  const cfg = { count: 3, loyalty: 'afghan', level: 'normal' };
  const sel = (opts, val, set) => { const s = h('select', { onchange: (e) => set(e.target.value) }, ...opts.map(([v, l]) => h('option', { value: v }, l))); s.value = val; return s; };
  const tbox = h('input', { type: 'checkbox', onchange: (e) => { teach = e.target.checked; try { localStorage.setItem('pamir.teach', teach ? 'on' : 'off'); } catch { /* ignore */ } } });
  tbox.checked = teach;
  return h('div', { class: 'overlay' }, h('div', { class: 'modal' },
    h('h2', {}, 'Pax Pamir'), h('p', { class: 'sub' }, 'The second-edition rules of Cole Wehrle’s game of the Great Game in nineteenth-century Afghanistan, played with an original set of court cards built to the same structure. Teaching mode walks you through it and can be switched off at any time.'),
    h('div', { class: 'opts' },
      'Players', sel([['2', '2 (you + 1 bot)'], ['3', '3 (you + 2 bots)'], ['4', '4 (you + 3 bots)'], ['5', '5 (you + 4 bots)']], '3', (v) => { cfg.count = Number(v); }),
      'Your loyalty', sel(COALITIONS.map((c) => [c, COALITION_INFO[c].name]), 'afghan', (v) => { cfg.loyalty = v; }),
      'Bots', sel([['easy', 'Easy (random legal moves)'], ['normal', 'Normal (look one action ahead)']], 'normal', (v) => { cfg.level = v; }),
      'Speed', sel([['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']], speed, (v) => { speed = v; }),
      'Teaching mode', h('label', { class: 'toggle' }, tbox, 'Tour, turn guidance, suggestions and rule notes')),
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => start(cfg) }, 'Begin'), h('button', { onclick: showRules }, 'Rules'))));
}
function showEnd() {
  const ranked = G.players.slice().sort((a, b) => b.points - a.points || b.rupees - a.rupees);
  const m = h('div', { class: 'modal', style: 'max-width:540px' }, h('h2', {}, `${pname(G.winner)} win${G.winner === ME ? '' : 's'}`), h('p', { class: 'sub' }, G.endReason));
  const t = h('table', { style: 'width:100%;border-collapse:collapse' });
  for (const p of ranked) t.append(h('tr', {}, h('td', {}, p.name), h('td', {}, cchip(p.loyalty)), h('td', { style: 'text-align:right' }, h('b', {}, `${p.points} pts`)), h('td', { style: 'text-align:right' }, `${p.rupees} rupees`)));
  m.append(t, h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { G = null; modalRoot.replaceChildren(); render(); } }, 'New game'), h('button', { onclick: () => modalRoot.replaceChildren() }, 'Look at the board')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}
function showRules() {
  const m = h('div', { class: 'modal' }, h('h2', {}, 'Rules summary'), h('div', { class: 'rules', html: `
    <p>This follows the rules of <i>Pax Pamir</i> (Second Edition) by Cole Wehrle. The court cards here are an original set with the same structure as the published ones; the published cards, their names and art belong to their designer.</p>
    <h4>Goal</h4><p>Score at the four Dominance Checks shuffled into the lower part of the deck. After any check, a player 4 or more points ahead of everyone wins. Otherwise the leader after the fourth check wins (ties: most rupees).</p>
    <h4>Your turn</h4><p>Take two actions: <b>buy</b> a market card, <b>play</b> a card from hand, or use one <b>card action</b> of a court card (each card once per turn). Card actions of the favored suit are free. Then clean up: discard down to your court limit (3 + political stars) and hand limit (2 + intelligence stars), events in the leftmost market column leave and take effect, and the market slides left and refills.</p>
    <h4>Buying</h4><p>Cost is the column number (0–5), doubled while military is favored. Pay by placing a rupee on each card to the left in the same row (the other row if that space is empty). Take any rupees on the card you buy. You can't buy a card you put a rupee on this turn. Events resolve when bought; a Dominance Check bought is resolved immediately.</p>
    <h4>Playing</h4><p>Put the card at either end of your court. If someone else rules its region, first pay them a bribe equal to their tribes there. Then resolve its icons: army, road (on a border of its region), tribe, spy (on any court card of that region), leverage (+2 rupees, repaid when discarded) and favor (its suit becomes favored). A patriot of another coalition switches your loyalty: you lose gifts and your old coalition's patriots and prizes.</p>
    <h4>Card actions</h4><ul>
      <li><b>Tax</b>: take up to rank rupees from market cards or from players with a court card in a region you rule (they keep rupees equal to their economic stars).</li>
      <li><b>Gift</b>: pay 2, 4 or 6 for your next gift space: +1 influence.</li>
      <li><b>Build</b>: 2 rupees each, up to 3 armies in regions you rule or roads on their borders.</li>
      <li><b>Move</b>: rank moves; armies cross borders along roads of their coalition; spies step around the ring of courts.</li>
      <li><b>Betray</b>: 2 rupees to discard a card where you have a spy; you may keep a prize.</li>
      <li><b>Battle</b>: remove enemy pieces at a region or card, up to rank and up to your coalition's armies (or your spies) there. Your coalition's pieces are safe.</li></ul>
    <h4>Rulers and Overthrow</h4><p>You rule a region with at least one tribe there and more tribes plus armies of your coalition than any other player. Losing your last tribe in a region discards your political cards there; losing your last political card for a region removes your tribes there.</p>
    <h4>Dominance Checks</h4><p>A coalition with at least 4 more blocks (armies + roads) than each other coalition is dominant: its loyal players score 5/3/1 by influence (1 + gifts + prizes + patriots), then all blocks leave the map. Otherwise all players score 3/1 by cylinders in play. Ties share the points of the places they cover. The fourth check scores double.</p>
    <h4>Notes on this version</h4><ul>
      <li>The map borders follow my best understanding of the published map: Persia–Transcaspia, Persia–Herat, Transcaspia–Herat, Transcaspia–Kabul, Herat–Kabul, Herat–Kandahar, Kabul–Kandahar, Kabul–Punjab, Kandahar–Punjab.</li>
      <li>The doubled purchase cost while military is favored comes from a community rules aid and could not be confirmed against the rulebook.</li>
      <li>House rule: once the deck runs out, each cleanup discards the leftmost card of each market row so the final check always arrives.</li>
      <li>Simplified: bribes are always paid in full; leverage repayment discards hand cards if you can't pay; the solo bot (Wakhan) is not included.</li></ul>` }),
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { modalRoot.replaceChildren(); if (G) render(); } }, 'Close')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

document.getElementById('btn-rules').onclick = showRules;
document.getElementById('btn-new').onclick = () => { clearTimeout(timer); G = null; dialog = null; modalRoot.replaceChildren(); render(); };
document.getElementById('btn-teach').onchange = (e) => setTeach(e.target.checked);
document.getElementById('btn-teach').checked = teach;
render();
