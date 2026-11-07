import {
  newGame, setBet, bettors, deal, insure, needsInsurance, act, legal, current, dealerStep, nextRound, rebuy,
  total, describeTotal, rankName, trueCount, SUIT_INFO, isNatural,
} from './engine.js';
import { recommend, BUST } from './strategy.js';

const app = document.getElementById('app'), modalRoot = document.getElementById('modal-root');
const SPEED = { slow: 1100, normal: 700, fast: 280 };
let G = null, timer = null, speed = 'normal', hints = true, showCount = false;
try { hints = localStorage.getItem('bj.hints') !== 'off'; showCount = localStorage.getItem('bj.count') === 'on'; } catch { /* defaults */ }
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k === 'onclick') el.onclick = v; else if (k === 'onchange') el.onchange = v;
    else if (k === 'html') el.innerHTML = v; else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  }
  for (const c of children.flat()) { if (c === null || c === undefined || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return el;
}
const cardEl = (c) => { const s = SUIT_INFO[c.suit]; return h('div', { class: `pcard ${s.red ? 'red' : ''}` }, h('div', { class: 'corner' }, rankName(c.rank), h('br'), s.glyph), h('div', { class: 'pip' }, s.glyph), h('div', { class: 'corner', style: 'transform:rotate(180deg);align-self:flex-end' }, rankName(c.rank), h('br'), s.glyph)); };
const back = () => h('div', { class: 'pcard back' });
const LABEL = { hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split', surrender: 'Surrender' };
const RES = { win: 'WIN', lose: 'LOSE', push: 'PUSH', bust: 'BUST', blackjack: 'BLACKJACK', surrender: 'SURRENDER' };

// ---------------- flow ----------------
function after() {
  clearTimeout(timer);
  render();
  if (!G) return;
  if (G.phase === 'insurance') {
    const bot = needsInsurance(G).find((p) => p.kind === 'bot');
    if (bot) timer = setTimeout(() => { insure(G, bot.idx, false); after(); }, SPEED[speed]);
  } else if (G.phase === 'play') {
    const c = current(G);
    if (c && c.pl.kind === 'bot') timer = setTimeout(() => { act(G, recommend(G).action); after(); }, SPEED[speed]);
  } else if (G.phase === 'dealer') {
    timer = setTimeout(() => { dealerStep(G); after(); }, SPEED[speed]);
  }
}
function start(cfg) {
  G = newGame({ seed: Date.now().toString(36), players: cfg.seats, options: cfg.options });
  modalRoot.replaceChildren();
  after();
}

// ---------------- render ----------------
function render() {
  app.replaceChildren();
  if (!G) { app.append(renderSetup()); return; }
  app.append(renderFelt(), renderActions(), renderSeats());
  app.append(h('div', { class: 'two' }, renderHelp(), renderLog()));
}

function renderFelt() {
  const d = G.dealer, showing = !d.hidden;
  const cards = h('div', { class: 'cards' });
  d.cards.forEach((c, i) => cards.append(i === 1 && d.hidden ? back() : cardEl(c)));
  let sub = 'Place your bets.';
  if (d.cards.length) sub = showing ? describeTotal(d.cards) : `showing ${rankName(d.cards[0].rank)}`;
  const o = G.opts;
  const shoePct = Math.round(100 * G.shoe.length / (52 * o.decks));
  return h('div', { class: 'felt' },
    h('div', { class: 'dealer' }, h('div', { class: 'label' }, 'Dealer'), cards, h('div', { class: 'sub' }, sub)),
    h('div', { class: 'tablebar' },
      h('span', { class: 'rules' }, `${o.decks} deck${o.decks === 1 ? '' : 's'} · dealer ${o.h17 ? 'hits' : 'stands on'} soft 17 · blackjack pays 3 to 2${o.surrender ? ' · late surrender' : ''} · bets ${o.minBet}–${o.maxBet}`),
      h('span', {}, `shoe ${shoePct}% left`, showCount ? ` · running count ${G.count >= 0 ? '+' : ''}${G.count} · true count ${trueCount(G) >= 0 ? '+' : ''}${trueCount(G).toFixed(1)}` : '')));
}

function renderActions() {
  const wrap = h('div', { class: 'actions' });
  if (G.phase === 'betting') {
    const ok = bettors(G).length > 0;
    wrap.append(h('button', { class: 'primary', disabled: !ok, onclick: () => { deal(G); after(); } }, ok ? 'Deal' : 'Place a bet to deal'));
  } else if (G.phase === 'insurance') {
    const who = needsInsurance(G).find((p) => p.kind === 'human');
    if (who) {
      const cost = Math.floor(who.hands[0].bet / 2);
      wrap.append(h('span', { style: 'align-self:center' }, `${who.name}: insurance for ${cost}? (pays 2 to 1 if the dealer has blackjack)`),
        h('button', { class: hints ? '' : '', onclick: () => { insure(G, who.idx, true); after(); } }, 'Take insurance'),
        h('button', { class: hints ? 'rec' : '', onclick: () => { insure(G, who.idx, false); after(); } }, 'No insurance'));
    } else wrap.append(h('span', { class: 'muted' }, 'Waiting for insurance decisions…'));
  } else if (G.phase === 'play') {
    const c = current(G);
    if (c && c.pl.kind === 'human') {
      const L = legal(G), rec = hints ? recommend(G) : null;
      wrap.append(h('span', { style: 'align-self:center;font-family:var(--font-display)' }, `${c.pl.name}${c.pl.hands.length > 1 ? `, hand ${G.turn.h + 1}` : ''}: ${describeTotal(c.h.cards)}`));
      for (const a of ['hit', 'stand', 'double', 'split', 'surrender']) if (L[a]) wrap.append(h('button', { class: `${a === 'stand' || a === 'hit' ? 'primary' : ''} ${rec && rec.action === a ? 'rec' : ''}`, onclick: () => { act(G, a); after(); }, title: rec && rec.action === a ? 'Basic strategy' : '' }, LABEL[a]));
    } else if (c) wrap.append(h('span', { class: 'muted' }, `${c.pl.name} is thinking…`));
  } else if (G.phase === 'dealer') {
    wrap.append(h('span', { class: 'muted' }, 'Dealer plays…'));
  } else if (G.phase === 'settled') {
    wrap.append(h('button', { class: 'primary', onclick: () => { nextRound(G); after(); } }, 'Next hand'));
  }
  return wrap;
}

function renderSeats() {
  const wrap = h('div', { class: 'seats' });
  for (const pl of G.players) {
    const isTurn = G.phase === 'play' && G.turn && G.turn.p === pl.idx;
    const box = h('div', { class: `seat ${isTurn ? 'turn' : ''}` }, h('div', { class: 'top' }, h('b', {}, pl.name), h('span', { class: 'bank' }, `${pl.bank} chips`)));
    if (G.phase === 'betting') {
      if (pl.kind === 'human') {
        box.append(h('div', { class: 'betline' }, pl.bet >= G.opts.minBet ? `Bet: ${pl.bet}` : 'Sitting out this hand (no bet)'));
        const chips = h('div', { class: 'chips' });
        for (const v of [5, 25, 100, 500]) chips.append(h('div', { class: `chip c${v}`, title: `Add ${v}`, onclick: () => { setBet(G, pl.idx, pl.bet + v); render(); } }, v));
        chips.append(h('button', { onclick: () => { setBet(G, pl.idx, 0); render(); } }, 'Clear'));
        box.append(chips);
        if (pl.bank < G.opts.minBet) box.append(h('button', { onclick: () => { rebuy(G, pl.idx); render(); } }, `Buy ${G.opts.bankroll} more chips`));
      } else box.append(h('div', { class: 'betline muted' }, `Bot (basic strategy) · bets ${pl.bet}`));
      if (pl.net) box.append(h('div', { class: 'muted', style: 'font-size:0.8rem' }, `Last hand: ${pl.net > 0 ? '+' : ''}${pl.net}`));
    } else {
      if (!pl.hands.length) box.append(h('div', { class: 'muted' }, 'Sitting out'));
      pl.hands.forEach((hd, i) => {
        const active = isTurn && G.turn.h === i;
        const cards = h('div', { class: 'cards' }, ...hd.cards.map(cardEl));
        const resTxt = hd.result ? (hd.result === 'win' ? `WIN +${hd.bet}` : hd.result === 'blackjack' ? `BLACKJACK +${hd.payout}` : hd.result === 'push' ? 'PUSH' : hd.result === 'surrender' ? `SURRENDER −${-hd.payout}` : `${RES[hd.result]} −${hd.bet}`) : '';
        box.append(h('div', { class: `hand ${active ? 'active' : ''}` }, cards,
          h('div', { class: 'info' }, h('span', {}, `${describeTotal(hd.cards)}${hd.doubled ? ' · doubled' : ''}`), h('span', {}, `bet ${hd.bet}`), hd.result ? h('span', { class: `res ${hd.result}` }, resTxt) : null)));
      });
      if (pl.insurance) box.append(h('div', { class: 'muted', style: 'font-size:0.8rem' }, `Insurance ${pl.insurance}`));
      if (G.phase === 'settled') box.append(h('div', { style: `font-weight:600;color:${pl.net > 0 ? 'var(--good)' : pl.net < 0 ? 'var(--bad)' : 'var(--muted)'}` }, pl.hands.length ? `This hand: ${pl.net > 0 ? '+' : ''}${pl.net}` : ''));
    }
    wrap.append(box);
  }
  return wrap;
}

function renderHelp() {
  const sec = h('section', { class: `panel ${hints ? 'hint' : ''}` });
  const hb = h('input', { type: 'checkbox', onchange: (e) => { hints = e.target.checked; save('bj.hints', hints ? 'on' : 'off'); render(); } }); hb.checked = hints;
  const cb = h('input', { type: 'checkbox', onchange: (e) => { showCount = e.target.checked; save('bj.count', showCount ? 'on' : 'off'); render(); } }); cb.checked = showCount;
  sec.append(h('h3', {}, 'Strategy help', h('label', { class: 'toggle', style: 'margin-left:auto' }, hb, 'hints'), h('label', { class: 'toggle' }, cb, 'card count')));
  if (!hints) { sec.append(h('div', { class: 'muted', style: 'font-size:0.85rem' }, 'Hints are off. Turn them on to see the basic-strategy play for each hand and why.')); return sec; }
  if (G.phase === 'play') {
    const c = current(G);
    if (c && c.pl.kind === 'human') {
      const r = recommend(G);
      sec.append(h('div', {}, h('b', {}, `Basic strategy: ${LABEL[r.action]}. `), r.why), h('div', { class: 'muted', style: 'font-size:0.8rem;margin-top:6px' }, `With ${rankName(G.dealer.cards[0].rank)} showing, the dealer busts about ${BUST[Math.min(11, G.dealer.cards[0].rank === 1 ? 11 : Math.min(10, G.dealer.cards[0].rank))]}% of the time.`));
      return sec;
    }
  }
  if (G.phase === 'insurance') { sec.append(h('div', {}, h('b', {}, 'Basic strategy: no insurance. '), 'Insurance is a side bet that the dealer has a 10 underneath. That happens less than a third of the time, but the bet only pays 2 to 1, so it loses money in the long run.')); return sec; }
  if (G.phase === 'betting') { sec.append(h('div', { style: 'font-size:0.88rem' }, 'Click chips to build each person’s bet, then Deal. A seat with no bet sits the hand out.', showCount ? ' Counters raise their bet when the true count is high (more 10s and aces left).' : '')); return sec; }
  sec.append(h('div', { class: 'muted', style: 'font-size:0.85rem' }, 'Basic strategy is the mathematically best way to play each hand. Following it cuts the house edge to about half a percent.'));
  return sec;
}

function renderLog() {
  const sec = h('section', { class: 'panel' }, h('h3', {}, 'Table'));
  const log = h('div', { class: 'log' });
  for (const e of G.log.slice(-50)) log.append(h('p', { class: e.kind }, e.msg));
  sec.append(log);
  requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  return sec;
}

// ---------------- setup and rules ----------------
function renderSetup() {
  const names = ['You', 'Player 2', 'Player 3', 'Player 4', 'Player 5'];
  const seats = names.map((n, i) => ({ name: n, kind: i === 0 ? 'human' : 'bot' }));
  const cfg = { count: 3, decks: 6, h17: false, surrender: true, bankroll: 1000 };
  const seatsEl = h('div');
  const draw = () => {
    seatsEl.replaceChildren();
    for (let i = 0; i < cfg.count; i++) {
      const s = seats[i];
      const kind = h('select', { onchange: (e) => { s.kind = e.target.value; } }, h('option', { value: 'human' }, 'Person'), h('option', { value: 'bot' }, 'Bot'));
      kind.value = s.kind;
      seatsEl.append(h('div', { class: 'seatrow' }, h('input', { type: 'text', value: s.name, onchange: (e) => { s.name = e.target.value; } }), kind));
    }
  };
  draw();
  const sel = (opts, val, set) => { const s = h('select', { onchange: (e) => set(e.target.value) }, ...opts.map(([v, l]) => h('option', { value: v }, l))); s.value = String(val); return s; };
  return h('div', { class: 'overlay' }, h('div', { class: 'modal' },
    h('h2', {}, 'Blackjack'), h('p', { class: 'sub' }, 'Everyone plays against the dealer, so you can share one device: each seat takes its turn in order. Fill spare seats with bots that play perfect basic strategy. Chips are pretend.'),
    h('div', { class: 'opts' },
      'Seats', sel([1, 2, 3, 4, 5].map((n) => [n, `${n} seat${n === 1 ? '' : 's'}`]), 3, (v) => { cfg.count = Number(v); draw(); }),
      'Decks', sel([[1, '1 deck'], [2, '2 decks'], [6, '6 decks (standard)'], [8, '8 decks']], 6, (v) => { cfg.decks = Number(v); }),
      'Soft 17', sel([['s17', 'Dealer stands on soft 17'], ['h17', 'Dealer hits soft 17']], 's17', (v) => { cfg.h17 = v === 'h17'; }),
      'Surrender', sel([['yes', 'Late surrender allowed'], ['no', 'No surrender']], 'yes', (v) => { cfg.surrender = v === 'yes'; }),
      'Chips', sel([[500, '500 each'], [1000, '1,000 each'], [5000, '5,000 each']], 1000, (v) => { cfg.bankroll = Number(v); }),
      'Speed', sel([['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']], speed, (v) => { speed = v; })),
    seatsEl,
    h('div', { class: 'rowbtns' }, h('button', { class: 'primary', onclick: () => start({ seats: seats.slice(0, cfg.count).map((s) => ({ ...s })), options: { decks: cfg.decks, h17: cfg.h17, surrender: cfg.surrender, bankroll: cfg.bankroll } }) }, 'Sit down'), h('button', { onclick: showRules }, 'Rules & strategy'))));
}

function strategyTable() {
  // Built from the same function the hints use, so the chart always matches the advice.
  const ups = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1];
  const mk = (r, s = 'S') => ({ rank: r, suit: s, uid: Math.random() });
  const code = (cards, upRank) => {
    const fake = { opts: G ? G.opts : { h17: false, surrender: true, das: true, maxHands: 4 }, dealer: { cards: [mk(upRank)] }, phase: 'play', turn: { p: 0, h: 0 },
      players: [{ bank: 1e9, hands: [{ cards, bet: 10, fromSplit: false }] }] };
    const r = recommend(fake);
    return { hit: 'H', stand: 'S', double: 'D', split: 'P', surrender: 'R' }[r.action];
  };
  const t = h('table', { class: 'bs' }, h('tr', {}, h('th', {}, ''), ...ups.map((u) => h('th', {}, rankName(u)))));
  const row = (label, cards) => t.append(h('tr', {}, h('th', {}, label), ...ups.map((u) => { const c = code(cards, u); return h('td', { class: c }, c); })));
  for (let n = 8; n <= 17; n++) row(`${n}`, n <= 11 ? [mk(n - 6), mk(6, 'H')] : [mk(10), mk(n - 10, 'H')]);
  for (let s = 2; s <= 9; s++) row(`A,${s}`, [mk(1), mk(s, 'H')]);
  for (const p of [2, 3, 4, 6, 7, 8, 9, 1]) row(`${rankName(p)},${rankName(p)}`, [mk(p), mk(p, 'H')]);
  return t;
}
function showRules() {
  const m = h('div', { class: 'modal' }, h('h2', {}, 'Rules and basic strategy'), h('div', { class: 'rules', html: `
    <h4>Goal</h4><p>Beat the dealer: finish closer to 21 without going over. Number cards count their value, face cards 10, and an ace 1 or 11.</p>
    <h4>A round</h4><ol>
      <li>Each seat bets (minimum 10). Everyone gets two cards face up; the dealer gets one up and one face down.</li>
      <li>An ace and a 10-value card is a <b>blackjack</b>: it pays 3 to 2, unless the dealer has one too (a push).</li>
      <li>If the dealer shows an ace you may buy <b>insurance</b> for half your bet; it pays 2 to 1 if the dealer has blackjack. With an ace or 10 showing, the dealer checks for blackjack before anyone plays.</li>
      <li>In turn, each hand can <b>hit</b> (take a card), <b>stand</b>, <b>double</b> (double the bet on the first two cards and take exactly one card), <b>split</b> a pair into two hands (each with its own bet, up to four hands; split aces get one card each), or <b>surrender</b> its first two cards for half the bet back.</li>
      <li>The dealer then reveals and draws to 17 or more (standing on soft 17 unless the table says otherwise).</li>
      <li>Beat the dealer or have the dealer bust: win 1 to 1. Tie: push. Bust: you lose, even if the dealer busts too.</li></ol>
    <h4>Basic strategy chart</h4><p>Your hand down the side, the dealer's up card across the top. H hit, S stand, D double (hit if you can't), P split, R surrender (hit if you can't). This is the same advice the hints and bots use.</p>` }));
  m.append(strategyTable(), h('div', { class: 'rowbtns' }, h('button', { class: 'primary', onclick: () => { modalRoot.replaceChildren(); if (G) render(); } }, 'Close')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

document.getElementById('btn-rules').onclick = showRules;
document.getElementById('btn-new').onclick = () => { clearTimeout(timer); G = null; modalRoot.replaceChildren(); render(); };
render();
