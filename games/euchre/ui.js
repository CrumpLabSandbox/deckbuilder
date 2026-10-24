// Euchre table UI. You are South; Pat (North) is your partner; Lefty (West) and Righty (East) oppose.
import {
  newGame, actor, orderUp, pass, canPass, callSuit, discard, playCard, collect, nextHand, legalCards, ledSuit,
  isTrump, isRight, isLeft, effSuit, power, team, partnerOf, sister, cardName, rankName, suitName, teamName,
  SUITS, SUIT_INFO,
} from './engine.js';
import { botAct, bidAdvice, playAdvice, chooseDiscard, discardReason, THRESH } from './bots.js';

const app = document.getElementById('app'), modalRoot = document.getElementById('modal-root');
const ME = 0, POS = ['south', 'west', 'north', 'east'];
const SPEEDS = { slow: { bot: 1100, trick: 2600 }, normal: { bot: 650, trick: 1600 }, fast: { bot: 250, trick: 800 } };
let G = null, timer = null, coach = true, speed = 'normal', goAlone = false;

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k === 'onclick') el.onclick = v; else if (k === 'onchange') el.onchange = v;
    else if (k === 'html') el.innerHTML = v; else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  }
  for (const c of children.flat()) { if (c === null || c === undefined || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return el;
}
const glyph = (s) => h('span', { class: SUIT_INFO[s].color === 'red' ? 'red' : '' }, SUIT_INFO[s].glyph);

function cardEl(c, { classes = '', onclick, title, trump, compact = false } = {}) {
  const s = SUIT_INFO[c.suit];
  const el = h('div', { class: `pcard ${s.color === 'red' ? 'redc' : ''} ${classes}`, title: title || cardName(c) },
    h('div', { class: 'corner' }, rankName(c.rank), h('br'), s.glyph),
    h('div', { class: 'pip' }, s.glyph),
    h('div', { class: 'corner', style: 'transform:rotate(180deg);align-self:flex-end' }, rankName(c.rank), h('br'), s.glyph));
  if (trump && isRight(c, trump)) el.append(h('div', { class: 'badge' }, compact ? 'R' : 'RIGHT'));
  else if (trump && isLeft(c, trump)) el.append(h('div', { class: 'badge l' }, compact ? 'L' : 'LEFT'));
  if (onclick) el.onclick = onclick;
  return el;
}

// ---------- flow ----------
function schedule() {
  clearTimeout(timer);
  if (!G || G.phase === 'over' || G.phase === 'handover') return;
  if (G.phase === 'trickdone') { timer = setTimeout(() => { collect(G); after(); }, SPEEDS[speed].trick); return; }
  const a = actor(G);
  if (a !== null && G.players[a].kind === 'bot') timer = setTimeout(() => { botAct(G); after(); }, SPEEDS[speed].bot);
}
function after() {
  render();
  if (G && (G.phase === 'handover' || G.phase === 'over')) showHandEnd();
  schedule();
}
function humanDo(fn) { if (fn()) { goAlone = false; after(); } }

function start(opts) {
  G = newGame({ seed: opts.seed, options: { stickTheDealer: opts.stick, target: opts.target },
    players: [{ name: 'You', kind: 'human' }, { name: 'Lefty' }, { name: 'Pat' }, { name: 'Righty' }] });
  modalRoot.replaceChildren();
  after();
}

// ---------- render ----------
function render() {
  app.replaceChildren();
  if (!G) { app.append(renderSetup()); return; }
  app.append(renderScore());
  const main = h('div', { class: 'main' });
  const left = h('div', {}, renderTable(), renderMine());
  const right = h('div', { class: 'side' }, renderCoach(), renderLog());
  main.append(left, right);
  app.append(main);
}

function renderScore() {
  const hd = G.hand;
  let mid;
  if (hd.trump) {
    mid = h('div', { class: 'mid' }, h('div', { class: 'trump' }, 'Trump ', glyph(hd.trump), ` ${suitName(hd.trump)}`),
      h('div', { class: 'muted' }, `called by ${G.players[hd.maker].name}${hd.alone ? ', alone' : ''} · tricks: us ${hd.won[0]}, them ${hd.won[1]}`));
  } else {
    mid = h('div', { class: 'mid' }, h('div', { class: 'trump' }, G.phase === 'bid2' ? 'Bidding, round 2' : 'Bidding, round 1'),
      h('div', { class: 'muted' }, `${G.players[G.dealer].name} dealt · hand ${G.handNo}`));
  }
  return h('div', { class: 'scorebar' },
    h('div', { class: 'team us' }, h('b', {}, G.scores[0]), h('span', {}, 'You & Pat')),
    mid,
    h('div', { class: 'team right' }, h('span', {}, 'Lefty & Righty'), h('b', {}, G.scores[1]), h('span', { class: 'muted' }, ` · to ${G.opts.target}`)));
}

function seatBox(p) {
  const hd = G.hand, pl = G.players[p];
  const chips = [];
  if (p === G.dealer) chips.push(h('span', { class: 'chip dealer' }, 'dealer'));
  if (p === hd.maker) chips.push(h('span', { class: 'chip maker' }, hd.alone ? 'called · alone' : 'called trump'));
  if (p === partnerOf(ME)) chips.push(h('span', { class: 'chip partner' }, 'your partner'));
  if (p === hd.out) chips.push(h('span', { class: 'chip' }, 'sitting out'));
  const turn = actor(G) === p;
  const box = h('div', { class: `seat ${POS[p]} ${p === hd.out ? 'out' : ''}` });
  box.append(h('div', { class: `who ${turn ? 'turn' : ''}` }, h('b', {}, pl.name), ...chips));
  if (p !== ME) {
    const backs = h('div', { class: 'backs' });
    for (let i = 0; i < pl.hand.length; i++) backs.append(h('div', { class: 'back' }));
    box.append(backs);
  }
  const bid = [...hd.bids].reverse().find((b) => b.p === p);
  if ((G.phase === 'bid1' || G.phase === 'bid2' || G.phase === 'discard') && bid) box.append(h('div', { class: 'bubble' }, bid.text));
  return box;
}

function renderTable() {
  const t = h('div', { class: 'table' });
  for (const p of [2, 1, 3, 0]) t.append(seatBox(p));
  const c = h('div', { class: 'center' });
  const hd = G.hand;
  if (G.phase === 'bid1' || G.phase === 'bid2') {
    c.append(h('div', { class: 'upcard-wrap' },
      cardEl(hd.upcard, { classes: G.phase === 'bid2' ? 'turned' : '' }),
      h('div', { class: 'kitty' }, h('div', { class: 'backs' }, h('div', { class: 'back' }), h('div', { class: 'back' }), h('div', { class: 'back' })), 'kitty')));
    c.append(h('div', { class: 'note' }, G.phase === 'bid1'
      ? `Should ${suitName(hd.upcard.suit).toLowerCase()} be trump? Each player in turn orders it up or passes.`
      : `${suitName(hd.upcard.suit)} were turned down. Each player may name another suit.`));
  } else if (G.phase === 'discard') {
    c.append(h('div', { class: 'note' }, `${G.players[G.dealer].name} picked up the ${cardName(hd.upcard)} and is discarding.`));
  } else if (hd.trick) {
    const showing = G.phase === 'trickdone' || G.phase === 'handover' || G.phase === 'over' ? hd.lastTrick : null;
    const cards = showing ? showing.cards : hd.trick.cards;
    const grid = h('div', { class: 'trickgrid' });
    for (const e of cards) grid.append(h('div', { class: `pos-${POS[e.p]}` }, cardEl(e.card, { trump: hd.trump, classes: showing && showing.winner === e.p ? 'win' : '' })));
    c.append(grid);
    if (showing) c.append(h('div', { class: 'note' }, `${G.players[showing.winner].name} win${showing.winner === ME ? '' : 's'} the trick: ${showing.reason}.`));
    else if (cards.length) c.append(h('div', { class: 'note' }, `${suitName(ledSuit(G))} led${ledSuit(G) === hd.trump ? ' (trump)' : ''}. Follow suit if you can.`));
  }
  t.append(c);
  return t;
}

function sortHand(cards, t) {
  const order = t ? [t, ...SUITS.filter((s) => s !== t)] : SUITS;
  // keep colours alternating where possible
  const key = (c) => order.indexOf(effSuit(c, t));
  return cards.slice().sort((a, b) => key(a) - key(b) || power(b, t, effSuit(b, t)) - power(a, t, effSuit(a, t)) || b.rank - a.rank);
}

function suggestion() {
  if (!coach || actor(G) !== ME) return null;
  if (G.phase === 'play') return playAdvice(G, ME);
  if (G.phase === 'discard') { const c = chooseDiscard(G.players[ME].hand, G.hand.trump); return { uid: c.uid, reason: discardReason(G.players[ME].hand, G.hand.trump, c) }; }
  return null;
}

function renderMine() {
  const hd = G.hand, me = G.players[ME], my = actor(G) === ME;
  const sec = h('div', { class: 'myhand' });
  let hint = 'Your hand.';
  if (G.phase === 'play' && my) hint = ledSuit(G) ? `Your turn. ${suitName(ledSuit(G))} were led: follow suit if you can.` : 'Your lead: play any card.';
  if (G.phase === 'discard' && my) hint = 'Click a card to discard it.';
  if (hd.out === ME) hint = 'Pat is going alone. You sit this hand out.';
  sec.append(h('h3', {}, 'Your hand', h('span', { class: 'hint' }, hint)));
  if (G.phase === 'discard' && my) sec.append(h('div', { class: 'banner' }, `You picked up the ${cardName(hd.upcard)}. Now discard one card, face down, to get back to five.`));
  const sug = suggestion();
  const legal = G.phase === 'play' && my ? legalCards(G, ME).map((c) => c.uid) : [];
  const row = h('div', { class: 'handrow' });
  for (const c of sortHand(me.hand, hd.trump)) {
    let classes = '', onclick = null, title = cardName(c);
    if (G.phase === 'play' && my) {
      if (legal.includes(c.uid)) { classes = 'legal'; onclick = () => humanDo(() => playCard(G, c.uid)); }
      else { classes = 'illegal'; title = `You must follow ${suitName(ledSuit(G)).toLowerCase()}`; }
    } else if (G.phase === 'discard' && my) { classes = 'legal'; onclick = () => humanDo(() => discard(G, c.uid)); }
    if (sug && sug.uid === c.uid) classes += ' suggest';
    if (hd.out === ME) classes += ' dim';
    row.append(cardEl(c, { classes, onclick, title, trump: hd.trump }));
  }
  sec.append(row);
  if (my && (G.phase === 'bid1' || G.phase === 'bid2')) sec.append(renderBid());
  return sec;
}

function renderBid() {
  const hd = G.hand, panel = h('div', { class: 'bidpanel' });
  const aloneBox = h('input', { type: 'checkbox', onchange: (e) => { goAlone = e.target.checked; } });
  aloneBox.checked = goAlone;
  const alone = h('label', { title: 'Your partner sits out. Take all five tricks for 4 points.' }, aloneBox, 'Go alone');
  const dealerTxt = G.dealer === ME ? 'You are the dealer.' : G.dealer === partnerOf(ME) ? 'Pat (your partner) is the dealer.' : `${G.players[G.dealer].name} (an opponent) is the dealer.`;
  if (G.phase === 'bid1') {
    const up = cardName(hd.upcard), s = hd.upcard.suit;
    panel.append(h('div', { class: 'prompt' }, `${dealerTxt} Make ${suitName(s).toLowerCase()} trump? `,
      G.dealer === ME ? `If you do, you pick up the ${up} and discard.` : `If you do, the dealer picks up the ${up}.`));
    panel.append(h('button', { class: 'primary', onclick: () => humanDo(() => orderUp(G, goAlone)) }, G.dealer === ME ? 'Pick it up' : 'Order it up'),
      h('button', { onclick: () => humanDo(() => pass(G)) }, 'Pass'), alone);
  } else {
    const stuck = !canPass(G);
    panel.append(h('div', { class: 'prompt' }, `${dealerTxt} Name any suit except ${suitName(hd.upcard.suit).toLowerCase()}, or pass.`,
      stuck ? ' Stick the dealer: everyone passed, so you must name a suit.' : ''));
    for (const s of SUITS) if (s !== hd.upcard.suit) panel.append(h('button', { class: 'suit', onclick: () => humanDo(() => callSuit(G, s, goAlone)) }, glyph(s), ` ${suitName(s)}`));
    panel.append(h('button', { onclick: () => humanDo(() => pass(G)), disabled: stuck }, 'Pass'), alone);
  }
  return panel;
}

function renderCoach() {
  const sec = h('section', { class: 'coach' });
  const box = h('input', { type: 'checkbox', onchange: (e) => { coach = e.target.checked; render(); } });
  box.checked = coach;
  sec.append(h('h3', {}, 'Coach', h('label', { class: 'hint', style: 'display:flex;gap:6px;align-items:center;margin-left:auto' }, box, 'show advice')));
  const hd = G.hand, my = actor(G) === ME;
  if (coach) {
    if (my && (G.phase === 'bid1' || G.phase === 'bid2')) {
      const a = bidAdvice(G, ME);
      const say = a.action === 'pass' ? 'Pass' : G.phase === 'bid1' ? (G.dealer === ME ? 'Pick it up' : 'Order it up') : `Name ${suitName(a.suit).toLowerCase()}`;
      sec.append(h('div', { class: 'advice' }, h('b', {}, `Suggest: ${say}${a.alone ? ', alone' : ''}. `), a.reason));
    } else if (my) {
      const s = suggestion();
      if (s) sec.append(h('div', { class: 'advice' }, h('b', {}, 'Suggest: '), s.reason, h('div', { class: 'muted' }, 'The suggested card has a dashed green outline.')));
    } else if (hd.out === ME) {
      sec.append(h('div', { class: 'muted' }, 'Your partner is going alone. Watch how they play: a lone hand needs all five tricks for 4 points.'));
    } else {
      sec.append(h('div', { class: 'muted' }, G.phase === 'trickdone' ? 'Watch which card won and why; the reason is on the table.' : 'Waiting for the other players.'));
    }
  }
  // Trump guide.
  const t = hd.trump || (G.phase === 'bid1' ? hd.upcard.suit : null);
  if (t) {
    const order = [{ suit: t, rank: 11 }, { suit: sister(t), rank: 11 }, ...[14, 13, 12, 10, 9].map((r) => ({ suit: t, rank: r }))];
    const row = h('div', { class: 'order' });
    for (const c of order) row.append(cardEl(c, { trump: t, compact: true }));
    sec.append(h('h3', { style: 'margin-top:12px' }, hd.trump ? 'Trump, highest to lowest' : `If ${suitName(t).toLowerCase()} were trump`));
    sec.append(row);
    sec.append(h('div', { class: 'small-print' }, `The J${SUIT_INFO[t].glyph} is the right bower and the J${SUIT_INFO[sister(t)].glyph} (same colour) is the left bower. The left bower counts as a ${SUIT_INFO[t].one}, not a ${SUIT_INFO[sister(t)].one}. Any trump beats any card of another suit; otherwise the highest card of the suit led wins.`));
  } else if (G.phase === 'bid2') {
    sec.append(h('div', { class: 'small-print', style: 'margin-top:8px' }, 'Whichever suit is named, its jack becomes the right bower and the other jack of the same colour becomes the left bower.'));
  }
  return sec;
}

function renderLog() {
  const sec = h('section', {}, h('h3', {}, 'Table talk'));
  const log = h('div', { class: 'log' });
  for (const e of G.log.filter((e) => e.hand >= G.handNo - 1).slice(-60)) log.append(h('p', { class: e.kind }, e.msg));
  sec.append(log);
  requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  return sec;
}

function showHandEnd() {
  const r = G.hand.result;
  const m = h('div', { class: 'modal', style: 'max-width:520px' });
  m.append(h('h2', {}, r.kind), h('p', {}, r.text));
  m.append(h('div', { class: 'bigscore' }, `You & Pat ${G.scores[0]} — ${G.scores[1]} Lefty & Righty`));
  const scoring = 'Scoring: the team that called trump scores 1 for 3 or 4 tricks, 2 for all five, 4 for all five alone. If they take fewer than 3 they are euchred and the other team scores 2.';
  m.append(h('p', { class: 'muted', style: 'font-size:0.85rem' }, scoring));
  if (G.phase === 'over') {
    m.append(h('h2', { style: 'margin-top:10px' }, G.winner === 0 ? 'You and Pat win the game!' : 'Lefty and Righty win the game.'));
    m.append(h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { G = null; modalRoot.replaceChildren(); render(); } }, 'New game')));
  } else {
    m.append(h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { modalRoot.replaceChildren(); nextHand(G); after(); } }, 'Deal the next hand'),
      h('button', { onclick: () => modalRoot.replaceChildren() }, 'Look at the table first')));
  }
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

function renderSetup() {
  const o = { stick: true, target: 10 };
  const sel = (opts, val, set) => { const s = h('select', { onchange: (e) => set(e.target.value) }, ...opts.map(([v, l]) => h('option', { value: v }, l))); s.value = val; return s; };
  return h('div', { class: 'overlay' }, h('div', { class: 'modal' },
    h('h2', {}, 'Euchre'),
    h('p', { class: 'sub' }, 'The classic four-player trick-taking game. You sit South with your partner Pat across the table, against Lefty and Righty. The coach explains every bid and play if you want it.'),
    h('div', { class: 'opts' },
      'Coach', sel([['on', 'On: suggest and explain every move'], ['off', 'Off']], 'on', (v) => { coach = v === 'on'; }),
      'Stick the dealer', sel([['on', 'On: if everyone passes twice, the dealer must name trump'], ['off', 'Off: throw the hand in and redeal']], 'on', (v) => { o.stick = v === 'on'; }),
      'Play to', sel([['10', '10 points (standard)'], ['5', '5 points (quick)']], '10', (v) => { o.target = Number(v); }),
      'Speed', sel([['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']], speed, (v) => { speed = v; })),
    h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: () => start({ ...o, seed: `${Date.now().toString(36)}` }) }, 'Deal'),
      h('button', { onclick: showRules }, 'How to play'),
      h('a', { href: 'rules.html' }, h('button', {}, 'Printable cheat sheet')))));
}

function showRules() {
  const m = h('div', { class: 'modal' }, h('h2', {}, 'How to play Euchre'), h('div', { class: 'rules', html: `
    <p>Four players in two teams; partners sit across from each other. You and Pat against Lefty and Righty. First team to <b>10 points</b> wins.</p>
    <h4>The deck</h4>
    <p>24 cards: 9, 10, J, Q, K, A in each suit. Everyone gets five cards. One card is turned up on top of the four left over (the kitty).</p>
    <h4>Trump and the bowers</h4>
    <p>One suit becomes trump for the hand. Trump cards beat every card of the other suits. In trump, the order is:</p>
    <p><b>Right bower</b> (jack of trump) &gt; <b>Left bower</b> (the other jack of the same colour) &gt; A &gt; K &gt; Q &gt; 10 &gt; 9.</p>
    <p>The left bower <i>belongs to the trump suit</i> for the whole hand. If hearts are trump, the J♦ is a heart: you play it when hearts are led, and it isn't a diamond at all.</p>
    <h4>Bidding: choosing trump</h4>
    <ol>
      <li><b>Round 1.</b> Starting left of the dealer, each player may <b>order it up</b> (make the turned-up card's suit trump) or pass. If anyone orders it up, the dealer adds that card to their hand and discards one.</li>
      <li><b>Round 2.</b> If all four pass, the card is turned down. Starting left of the dealer again, each player may <b>name</b> any other suit as trump, or pass.</li>
      <li><b>Stick the dealer</b> (on by default here): if it gets back to the dealer in round 2, the dealer must name a suit.</li>
    </ol>
    <p>Whoever chooses trump makes their team the <b>makers</b>. They need at least 3 of the 5 tricks.</p>
    <h4>Going alone</h4>
    <p>When you choose trump you may <b>go alone</b>: your partner sits out and you play against both opponents. Take all five tricks for 4 points.</p>
    <h4>Playing the tricks</h4>
    <ul>
      <li>The player left of the dealer leads first. After that, whoever won the last trick leads.</li>
      <li>You <b>must follow suit</b> if you can (remember the left bower counts as trump). If you can't, play anything, including trump.</li>
      <li>The highest trump wins the trick. If no trump was played, the highest card of the suit led wins. Other suits can't win.</li>
    </ul>
    <h4>Scoring</h4>
    <table>
      <tr><th>Makers take</th><th>Points</th></tr>
      <tr><td>3 or 4 tricks</td><td>1 to the makers</td></tr>
      <tr><td>All 5 (a march)</td><td>2 to the makers</td></tr>
      <tr><td>All 5, alone</td><td>4 to the makers</td></tr>
      <tr><td>Fewer than 3 (euchred)</td><td>2 to the other team</td></tr>
    </table>
    <h4>Rules of thumb</h4>
    <ul>
      <li>Order up with about three trump, or two good trump and an off-suit ace. The bowers are worth the most.</li>
      <li>Be careful ordering when the dealer is an opponent: you hand them a trump.</li>
      <li>If your side made trump, lead trump to pull out the opponents' trump. On defence, lead aces or low side cards instead.</li>
      <li>If your partner is already winning the trick, play your lowest card.</li>
      <li>Make a suit void (get rid of every card in it) so you can trump it later.</li>
    </ul>` }),
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => modalRoot.replaceChildren() }, 'Close')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

document.getElementById('btn-rules').onclick = showRules;
document.getElementById('btn-new').onclick = () => { clearTimeout(timer); G = null; modalRoot.replaceChildren(); render(); };
render();
