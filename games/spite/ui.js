import { newGame, cur, other, payoffTop, sideTop, pileValue, canPlay, play, canDiscard, discard, canPass, pass, cardName, rankName, isWild, SUIT_INFO, SIDE_STACKS, TOP_VALUE } from './engine.js';
import { botTurn } from './bots.js';
import { todaySeed } from '../../platform/rng.js';

const app = document.getElementById('app'), modalRoot = document.getElementById('modal-root');
let G = null, sel = null, passScreen = false, botTimer = null;

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k === 'onclick') el.onclick = v; else if (k === 'onchange') el.onchange = v;
    else if (k === 'html') el.innerHTML = v; else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  }
  for (const c of children.flat()) { if (c === null || c === undefined || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return el;
}
function cardEl(c, { onclick, classes = '', count } = {}) {
  let el;
  if (c === null) el = h('div', { class: `pcard empty ${classes}` }, 'empty');
  else if (c === 'back') el = h('div', { class: `pcard back ${classes}` });
  else { const s = SUIT_INFO[c.suit]; el = h('div', { class: `pcard ${s.color} ${isWild(c) ? 'wild' : ''} ${classes}`, title: cardName(c) }, h('div', { class: 'corner' }, rankName(c.rank), h('br'), s.glyph), h('div', { class: 'pip' }, s.glyph), h('div', { class: 'corner', style: 'transform:rotate(180deg);align-self:flex-end' }, rankName(c.rank), h('br'), s.glyph)); }
  if (count !== undefined) el.append(h('div', { class: 'count' }, count));
  if (onclick) { el.onclick = onclick; el.classList.add('clickable'); }
  return el;
}

function startGame(spec) { G = newGame(spec); sel = null; passScreen = false; afterChange(); }
function act(fn) { fn(); sel = null; afterChange(); }
function afterChange() {
  if (G.phase === 'over') { render(); showEnd(); return; }
  if (cur(G).kind === 'bot') { render(); clearTimeout(botTimer); botTimer = setTimeout(() => { botTurn(G); afterChange(); }, 500); return; }
  render();
}
function humans() { return G.players.filter(p => p.kind === 'human').length; }
const sameSrc = (a, b) => a && b && a.from === b.from && a.uid === b.uid && a.i === b.i;

function render() {
  app.replaceChildren(); modalRoot.replaceChildren();
  if (!G) { app.append(renderSetup()); return; }
  const me = cur(G), opp = other(G);
  const myTurn = me.kind === 'human' && !passScreen;
  app.append(h('div', { class: 'status' }, h('div', {}, h('b', {}, `${me.name}'s turn`), me.kind === 'bot' ? h('span', { class: 'thinking' }, ' · thinking…') : h('span', { class: 'muted' }, sel ? ' · now click a center pile to play, or a side stack to discard and end your turn' : ' · click a card to pick it up')),
    h('div', { class: 'muted' }, `turn ${G.turnCount} · stock ${G.stock.length} · game ${G.seed}`)));
  app.append(renderPlayer(opp, false));
  // center
  const cen = h('section', { class: 'panel' });
  cen.append(h('h3', {}, 'Center piles', h('span', { class: 'hint' }, 'Build Ace to Queen. Kings are wild. A finished pile is cleared.')));
  const cr = h('div', { class: 'center-row' });
  G.center.forEach((pile, k) => {
    const top = pile[pile.length - 1] || null;
    const ok = myTurn && sel && canPlay(G, sel, k);
    const w = h('div', {}, cardEl(top, { count: pile.length ? pileValue(pile) : undefined, classes: ok ? 'target' : '', onclick: ok ? () => act(() => play(G, sel, k)) : null }),
      h('div', { class: 'needs' }, pileValue(pile) >= TOP_VALUE ? 'done' : `needs ${rankName(pileValue(pile) + 1)}`));
    cr.append(w);
  });
  cr.append(h('div', { class: 'group', style: 'margin-left:auto' }, h('div', { class: 'lbl' }, 'stock'), cardEl(G.stock.length ? 'back' : null, { count: G.stock.length })));
  cen.append(cr);
  app.append(cen);
  app.append(renderPlayer(me, myTurn));
  const lg = h('section', { class: 'panel' }, h('h3', {}, 'Log'));
  const log = h('div', { class: 'log' }); for (const e of G.log.slice(-40)) log.append(h('p', {}, e.msg)); lg.append(log);
  requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  app.append(lg);
  if (passScreen) modalRoot.replaceChildren(h('div', { class: 'overlay pass' }, h('div', { class: 'modal', style: 'max-width:420px;text-align:center' }, h('h2', {}, `Pass to ${me.name}`), h('button', { class: 'primary', onclick: () => { passScreen = false; render(); } }, `I'm ${me.name}`))));
}

function renderPlayer(p, mine) {
  const sec = h('section', { class: `panel ${p === cur(G) ? 'active' : ''}` });
  sec.append(h('h3', {}, p.name, h('span', { class: 'hint' }, `${p.kind === 'bot' ? 'bot · ' : ''}${p.payoff.length} pay-off cards left · ${p.hand.length} in hand`)));
  const zone = h('div', { class: 'zone' });
  // pay-off
  const pt = payoffTop(p);
  const pSel = mine && sel && sel.from === 'payoff';
  zone.append(h('div', { class: 'group' }, h('div', { class: 'lbl' }, 'pay-off'), cardEl(pt, { count: p.payoff.length, classes: pSel ? 'selected' : '', onclick: mine && pt ? () => { sel = pSel ? null : { from: 'payoff' }; render(); } : null })));
  // side stacks
  const sides = h('div', { class: 'row' });
  for (let i = 0; i < SIDE_STACKS; i++) {
    const t = sideTop(p, i);
    const sSel = mine && sel && sel.from === 'side' && sel.i === i;
    const canDrop = mine && sel && sel.from === 'hand' && canDiscard(G, sel.uid, i);
    sides.append(cardEl(t, { count: p.side[i].length || undefined, classes: `${sSel ? 'selected' : ''} ${canDrop ? 'target' : ''}`,
      onclick: !mine ? null : canDrop ? () => act(() => discard(G, sel.uid, i)) : t ? () => { sel = sSel ? null : { from: 'side', i }; render(); } : null }));
  }
  zone.append(h('div', { class: 'group' }, h('div', { class: 'lbl' }, 'side stacks'), sides));
  // hand
  const hand = h('div', { class: 'row' });
  const hidden = p.kind === 'human' && humans() > 1 && (p !== cur(G) || passScreen);
  if (hidden) { for (let i = 0; i < p.hand.length; i++) hand.append(cardEl('back')); }
  else if (p.kind === 'bot') { for (let i = 0; i < p.hand.length; i++) hand.append(cardEl('back')); }
  else for (const c of p.hand.slice().sort((a, b) => a.rank - b.rank)) { const s = { from: 'hand', uid: c.uid }; const isSel = sameSrc(sel, s); hand.append(cardEl(c, { classes: isSel ? 'selected' : '', onclick: mine ? () => { sel = isSel ? null : s; render(); } : null })); }
  zone.append(h('div', { class: 'group' }, h('div', { class: 'lbl' }, 'hand'), hand));
  sec.append(zone);
  if (mine) sec.append(h('div', { class: 'controls' }, h('span', { class: 'muted', style: 'font-size:0.85rem' }, 'Your turn ends when you discard a hand card onto a side stack.'), h('span', { class: 'spacer' }),
    canPass(G) ? h('button', { class: 'primary', onclick: () => act(() => pass(G)) }, 'Pass (no cards to discard)') : null));
  return sec;
}

function renderSetup() {
  const seats = [{ name: 'You', kind: 'human' }, { name: 'Malice', kind: 'bot' }];
  const seedInput = h('input', { type: 'text', placeholder: 'seed (optional)', style: 'width:160px' });
  const seatsEl = h('div');
  for (const s of seats) { const kind = h('select', { onchange: (e) => { s.kind = e.target.value; } }, h('option', { value: 'human' }, 'Human'), h('option', { value: 'bot' }, 'Bot')); kind.value = s.kind; seatsEl.append(h('div', { class: 'seat' }, h('input', { type: 'text', value: s.name, onchange: (e) => { s.name = e.target.value; } }), kind)); }
  return h('div', { class: 'overlay' }, h('div', { class: 'modal' }, h('h2', {}, 'Spite and Malice'),
    h('p', { class: 'sub' }, 'The two-player competitive patience, also called Cat and Mouse. Empty your pay-off pile before your opponent does, and make it hard for them.'),
    seatsEl, h('div', { style: 'margin:8px 0' }, seedInput),
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { const seed = seedInput.value.trim() || `${todaySeed()}-${Math.random().toString(36).slice(2, 6)}`; startGame({ seed, players: seats.map(s => ({ ...s })) }); } }, 'Deal'), h('button', { onclick: showRules }, 'Rules'))));
}

function showEnd() {
  const w = G.winner === null ? null : G.players[G.winner];
  const m = h('div', { class: 'modal' }, h('h2', {}, w ? `${w.name} wins` : 'A draw'), h('p', { class: 'sub' }, G.endReason),
    h('p', {}, G.players.map(p => `${p.name}: ${p.payoff.length} pay-off cards left`).join(' · ')),
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { G = null; render(); } }, 'New game'), h('button', { onclick: () => modalRoot.replaceChildren() }, 'Look at the table')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

function showRules() {
  const m = h('div', { class: 'modal' }, h('h2', {}, 'How to play'), h('div', { class: 'rules', html: `
    <p>Two standard packs shuffled together. Each player gets a face-down <b>pay-off pile</b> of 20 cards with the top card turned up. The rest is the stock. <b>The first player to play every card from their pay-off pile wins.</b></p>
    <h4>The center</h4>
    <p>Up to three <b>center piles</b> are built in order from Ace up to Queen, any suits. <b>Kings are wild</b> and stand for whatever card is needed. When a pile reaches Queen it is cleared and later shuffled back into the stock.</p>
    <h4>Your turn</h4>
    <ol>
      <li>Draw up to 5 cards in hand.</li>
      <li>Play as many cards as you like onto the center piles, from your hand, the top of your pay-off pile, or the top of any of your four <b>side stacks</b>. If you play all five hand cards, draw five more and keep going.</li>
      <li>End your turn by discarding one card from your hand onto any of your side stacks. Side stacks have no rules about what goes on what, but only the top card can be played later.</li>
    </ol>
    <h4>Spite, and malice</h4>
    <p>Watch the opponent's pay-off card. If a center pile sits one below it, they will play it next turn. Build past that number, or leave it stuck. If you have no cards in hand and nothing to draw, you pass; if neither player can move, the game ends and fewer pay-off cards wins.</p>
    <h4>Tips</h4>
    <ul>
      <li>Discard in descending runs on a side stack (9 on a 10, 8 on the 9) so they peel off in order later.</li>
      <li>Save Kings for the card you actually need, usually the pay-off card.</li>
      <li>An empty hand is a free redraw, so finishing your hand is often worth a small gift to the opponent.</li>
    </ul>` }),
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { modalRoot.replaceChildren(); if (G) render(); } }, 'Close')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

document.getElementById('btn-rules').onclick = showRules;
document.getElementById('btn-new').onclick = () => { clearTimeout(botTimer); G = null; render(); };
render();
