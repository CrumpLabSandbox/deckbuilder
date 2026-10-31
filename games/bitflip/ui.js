import { newGame, cur, goalColor, goalPattern, rowFull, rowMatches, canPlaceSlot, placeFromHand, voteFromHand, returnFromHand, pickUp, placePendingVote, returnPendingVotes, playAction, canEndTurn, endTurn, ACTION_INFO } from './engine.js';
import { botTurn, STRATEGIES } from './bots.js';
import { todaySeed } from '../../platform/rng.js';

const app = document.getElementById('app'), modalRoot = document.getElementById('modal-root');
let G = null, sel = null, armed = null, passScreen = false, botTimer = null;
// sel: { kind:'hand', colour } | { kind:'vote', colour }  (a block picked from hand or pending jackpot votes)
// armed: { action:'bitflip'|'recount', ...stage }

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k === 'onclick') el.onclick = v; else if (k === 'onchange') el.onchange = v;
    else if (k === 'html') el.innerHTML = v; else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  }
  for (const c of children.flat()) { if (c === null || c === undefined || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return el;
}
const blk = (c, attrs = {}) => h('div', { ...attrs, class: `blk ${c} ${attrs.class || ''}` });
const cname = (c) => (c === 'W' ? 'white' : c === 'B' ? 'black' : 'wild');

function startGame(spec) { G = newGame(spec); sel = null; armed = null; passScreen = false; afterChange(); }
function act(fn) { fn(); sel = null; afterChange(); }
function humans() { return G.players.filter(p => p.kind === 'human').length; }
function afterChange() {
  if (G.over) { render(); showEnd(); return; }
  if (cur(G).kind === 'bot') { render(); clearTimeout(botTimer); botTimer = setTimeout(() => { botTurn(G); afterChange(); }, 450); return; }
  render();
}

function render() {
  app.replaceChildren(); modalRoot.replaceChildren();
  if (!G) { app.append(renderSetup()); return; }
  const p = cur(G), me = p.kind === 'human' && !passScreen;
  app.append(h('div', { class: 'status' },
    h('div', {}, h('b', {}, `Round ${G.round}`), ` · ${G.goalDeck} goal cards left · bag ${G.bag.W} white, ${G.bag.B} black`, G.finalRound ? h('span', { style: 'color:var(--accent)' }, ' · last round') : null),
    h('div', {}, 'Turn: ', h('b', {}, p.name), p.kind === 'bot' ? h('span', { class: 'thinking' }, ' · thinking…') : null)));
  app.append(renderPlayers(me));
  const main = h('div', { class: 'main' }), left = h('div'), right = h('div');
  left.append(renderGoals(me));
  left.append(renderBoard(p, me));
  right.append(renderSide(p, me));
  right.append(renderLog());
  main.append(left, right); app.append(main);
  if (passScreen) modalRoot.replaceChildren(h('div', { class: 'overlay pass' }, h('div', { class: 'modal', style: 'max-width:420px;text-align:center' }, h('h2', {}, `Pass to ${p.name}`), h('button', { class: 'primary', onclick: () => { passScreen = false; render(); } }, `I'm ${p.name}`))));
}

function renderPlayers(me) {
  const wrap = h('div', { class: 'players' });
  for (const q of G.players) {
    const box = h('div', { class: `pbox ${q === cur(G) ? 'current' : ''}` });
    box.append(h('span', { class: 'score' }, q.score), h('b', {}, q.name), h('div', { class: 'muted' }, `${q.kind === 'bot' ? 'bot · ' : ''}${q.actions.length} action card${q.actions.length === 1 ? '' : 's'} · ${q.stats.votes} votes`));
    const mb = h('div', { class: 'mini-board' });
    for (const w of G.widths) {
      const r = h('div', { class: 'r' });
      for (let i = 0; i < w; i++) {
        const c = q.board[w][i];
        const flippable = me && armed && armed.action === 'bitflip' && c !== null;
        r.append(h('div', { class: `c ${c || ''} ${flippable ? 'flippable' : ''}`, onclick: flippable ? () => act(() => { playAction(G, 'bitflip', { target: 'board', player: q.idx, w, i }); armed = null; }) : null }));
      }
      mb.append(r);
    }
    box.append(mb);
    wrap.append(box);
  }
  return wrap;
}

function renderGoals(me) {
  const sec = h('section', { class: 'panel' });
  const hint = sel ? `Click a goal card to vote ${cname(sel.colour)} on it.` : armed ? (armed.action === 'bitflip' ? 'Bit Flip: click a goal card or a block on any board.' : 'Recount: click a goal card, then choose the colour to remove.') : 'The goal cards show the colour with more votes on them; a tie keeps the printed face.';
  sec.append(h('h3', {}, 'Goals', h('span', { class: 'hint' }, hint)));
  for (const w of G.widths) {
    const row = h('div', { class: 'goalrow' }, h('div', { class: 'lbl' }, `${w}-bit · ${G.opts.points[w]} pts`));
    for (let i = 0; i < w; i++) {
      const g = G.goals[w][i], col = goalColor(G, w, i);
      const target = me && (sel || armed);
      const el = h('div', { class: `goal ${col} ${g.ghost ? 'ghost' : ''} ${target ? 'target' : ''}`, title: g.ghost ? 'Ghost goal: the votes alone decide; a tie is wild' : `Printed ${cname(g.face)}; votes decide` },
        h('div', { class: 'face' }, col === 'X' ? '?' : col),
        h('div', { class: 'votes' }, h('span', { class: 'vw' }, g.votes.W), h('span', { class: 'vb' }, g.votes.B)));
      if (target) el.onclick = () => onGoalClick(w, i);
      row.append(el);
    }
    sec.append(row);
  }
  return sec;
}

function onGoalClick(w, i) {
  if (sel && sel.kind === 'hand') return act(() => voteFromHand(G, w, i, sel.colour));
  if (sel && sel.kind === 'vote') return act(() => placePendingVote(G, w, i));
  if (armed && armed.action === 'bitflip') return act(() => { playAction(G, 'bitflip', { target: 'goal', w, i }); armed = null; });
  if (armed && armed.action === 'recount') { armed = { action: 'recount', w, i }; render(); }
}

function renderBoard(p, me) {
  const sec = h('section', { class: 'panel' });
  sec.append(h('h3', {}, `Memory · ${p.name}`, h('span', { class: 'hint' }, 'Pick up a block from the hand, then click an empty slot. Click a placed block in an unfinished row to pick it back up.')));
  if (G.mustReturn > 0 && me) sec.append(h('div', { class: 'banner' }, `Priming: return ${G.mustReturn} block${G.mustReturn > 1 ? 's' : ''} to the bag. Click a hand block to return it.`));
  if (G.pendingVotes.length && me) sec.append(h('div', { class: 'banner' }, `Jackpot! Place these ${G.pendingVotes.length} block${G.pendingVotes.length > 1 ? 's' : ''} on goal cards as votes, or return them to the bag.`));
  for (const w of G.widths) {
    const full = rowFull(p, w), how = rowMatches(G, p, w);
    const reg = h('div', { class: `register ${how ? 'matching' : ''}` }, h('div', { class: 'lbl' }, `${w}-bit${full ? ' · locked' : ''}`));
    const cells = h('div', { class: 'cells' });
    for (let i = 0; i < w; i++) {
      const c = p.board[w][i];
      if (c === null) {
        const ok = me && sel && sel.kind === 'hand' && canPlaceSlot(G, p, w, i);
        cells.append(h('div', { class: `slot ${ok ? 'target' : ''}`, onclick: ok ? () => act(() => placeFromHand(G, w, i, sel.colour)) : null }));
      } else {
        const canPick = me && !full && !sel && !armed;
        const slot = h('div', { class: `slot ${full ? 'locked' : ''}` }, blk(c, { class: canPick ? 'clickable' : '', onclick: canPick ? () => act(() => pickUp(G, w, i)) : null }));
        cells.append(slot);
      }
    }
    reg.append(cells);
    const goal = goalPattern(G, w).map(c => c === 'X' ? '?' : c).join('');
    reg.append(h('div', { class: 'pts' }, `goal ${goal}` + (p.secret && p.secret.width === w && me ? ` · secret ${p.secret.pattern.join('')}` : '')));
    sec.append(reg);
  }
  // hand
  sec.append(h('h3', { style: 'margin-top:12px' }, 'Hand'));
  const hand = h('div', { class: 'hand' });
  if (!G.hand.length && !G.pendingVotes.length) hand.append(h('span', { class: 'empty' }, 'Nothing to place.'));
  G.hand.forEach((c, k) => {
    const isSel = sel && sel.kind === 'hand' && sel.colour === c && sel.k === k;
    hand.append(blk(c, { class: `${me ? 'clickable' : ''} ${isSel ? 'selected' : ''}`, onclick: !me ? null : () => {
      if (G.mustReturn > 0) return act(() => returnFromHand(G, c));
      sel = isSel ? null : { kind: 'hand', colour: c, k }; armed = null; render();
    } }));
  });
  G.pendingVotes.forEach((c, k) => {
    const isSel = sel && sel.kind === 'vote' && k === 0;
    hand.append(blk(c, { class: `${me && k === 0 ? 'clickable' : ''} ${isSel ? 'selected' : ''}`, title: 'Jackpot vote: place on a goal card', onclick: me && k === 0 ? () => { sel = isSel ? null : { kind: 'vote', colour: c }; armed = null; render(); } : null }));
  });
  if (G.pendingVotes.length && me) hand.append(h('button', { onclick: () => act(() => returnPendingVotes(G)) }, 'Return the rest to the bag'));
  sec.append(hand);
  const ctrl = h('div', { class: 'controls' });
  if (me && p.actions.length) {
    const row = h('div', { class: 'actions-row' });
    p.actions.forEach((a, k) => {
      const isArmed = armed && armed.action === a;
      row.append(h('div', { class: `acard ${isArmed ? 'armed' : ''}`, onclick: () => {
        if (a === 'rehearsal' || a === 'priming') return act(() => playAction(G, a));
        armed = isArmed ? null : { action: a }; sel = null; render();
      } }, h('b', {}, ACTION_INFO[a].name), ACTION_INFO[a].text));
    });
    ctrl.append(row);
  }
  if (armed && armed.action === 'recount' && armed.w !== undefined) {
    ctrl.append(h('span', {}, `Recount goal ${armed.w}.${armed.i + 1}: remove `),
      h('button', { onclick: () => act(() => { playAction(G, 'recount', { w: armed.w, i: armed.i, colour: 'W' }); armed = null; }) }, 'white votes'),
      h('button', { onclick: () => act(() => { playAction(G, 'recount', { w: armed.w, i: armed.i, colour: 'B' }); armed = null; }) }, 'black votes'));
  }
  ctrl.append(h('span', { class: 'spacer' }));
  ctrl.append(h('button', { class: 'primary', disabled: !me || !canEndTurn(G), title: canEndTurn(G) ? '' : 'Place every block in your hand first', onclick: () => { act(() => endTurn(G)); if (!G.over && cur(G).kind === 'human' && humans() > 1) { passScreen = true; render(); } } }, 'End turn'));
  sec.append(ctrl);
  return sec;
}

function renderSide(p, me) {
  const sec = h('section', { class: 'panel' });
  sec.append(h('h3', {}, 'Secret pattern'));
  if (me && p.secret) sec.append(h('div', { class: 'secret' }, `${p.secret.width}-bit: `, ...p.secret.pattern.map(c => blk(c, { class: 'small' })), h('span', { class: 'muted' }, ' · scores like the public goal, nobody can vote it away')));
  else sec.append(h('div', { class: 'muted', style: 'font-size:0.85rem' }, p.secret ? 'Hidden.' : 'None left.'));
  sec.append(h('h3', { style: 'margin-top:12px' }, 'Rules in brief'));
  sec.append(h('div', { class: 'muted', style: 'font-size:0.8rem;line-height:1.4' },
    'Draw 2. Place them on your board or vote with them on goal cards. Rearrange unfinished rows freely. A full row locks; if it matches its goal or your secret it scores at once (3 / 6 / 10), clears, and the goal is redealt. A full 4-row that scores gives you its four blocks as votes. ',
    G.opts.overwrite ? 'When your vote flips a goal card, old-colour blocks in that position of unfinished rows are erased and you keep one. ' : '',
    'When the goal deck runs out, finish the round; goals that can\'t be redealt are decided by their votes alone (a tie is wild).'));
  return sec;
}

function renderLog() {
  const sec = h('section', { class: 'panel' }, h('h3', {}, 'Log'));
  const log = h('div', { class: 'log' }); let last = -1;
  for (const e of G.log.slice(-60)) { if (e.round !== last) { log.append(h('div', { class: 'd' }, `Round ${e.round}`)); last = e.round; } log.append(h('p', {}, e.msg)); }
  sec.append(log); requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  return sec;
}

function renderSetup() {
  const seats = [{ name: 'You', kind: 'human' }, { name: 'Ada', kind: 'bot' }, { name: 'Claude S.', kind: 'bot' }, { name: 'Grace', kind: 'bot' }, { name: 'Alan', kind: 'bot' }];
  let count = 4;
  const opts = { overwrite: 'capture', columns: false };
  const seedInput = h('input', { type: 'text', placeholder: 'seed (optional)', style: 'width:150px' });
  const seatsEl = h('div');
  const drawSeats = () => { seatsEl.replaceChildren(); for (let i = 0; i < count; i++) { const s = seats[i]; const kind = h('select', { onchange: (e) => { s.kind = e.target.value; } }, h('option', { value: 'human' }, 'Human'), h('option', { value: 'bot' }, 'Bot')); kind.value = s.kind; seatsEl.append(h('div', { class: 'seat' }, h('input', { type: 'text', value: s.name, onchange: (e) => { s.name = e.target.value; } }), kind)); } };
  drawSeats();
  const countSel = h('select', { onchange: (e) => { count = Number(e.target.value); drawSeats(); } }, ...[2, 3, 4, 5].map(n => h('option', { value: n }, `${n} players`))); countSel.value = 4;
  const interf = h('select', { onchange: (e) => { opts.overwrite = e.target.value === 'on' ? 'capture' : false; } }, h('option', { value: 'on' }, 'Interference on (capture 1)'), h('option', { value: 'off' }, 'Interference off'));
  const cols = h('select', { onchange: (e) => { opts.columns = e.target.value === 'on'; } }, h('option', { value: 'off' }, 'Rows only'), h('option', { value: 'on' }, 'Rows and columns (experimental)'));
  return h('div', { class: 'overlay' }, h('div', { class: 'modal' }, h('h2', {}, 'Bit Flip'),
    h('p', { class: 'sub' }, 'Draw blocks from the bag. Commit them to memory, or spend them changing what the world will ask for. Lock in a pattern, then vote it true.'),
    h('div', { class: 'opts' }, countSel, seedInput, interf, cols),
    seatsEl,
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { const seed = seedInput.value.trim() || `${todaySeed()}-${Math.random().toString(36).slice(2, 6)}`; const players = seats.slice(0, count).map(s => ({ ...s, strategy: STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)] })); startGame({ seed, players, options: opts }); } }, 'Start'), h('button', { onclick: showRules }, 'Rules'), h('a', { href: 'rules.html' }, h('button', {}, 'Printable rules')))));
}

function showEnd() {
  const w = G.players[G.winner];
  const m = h('div', { class: 'modal' }, h('h2', {}, `${w.name} wins`), h('p', { class: 'sub' }, G.endReason));
  const t = h('table', { class: 'ranking' }, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Player'), h('th', {}, 'Score'), h('th', {}, '2 / 3 / 4-registers'), h('th', {}, 'Votes'), h('th', {}, 'Secrets')));
  G.ranking.forEach((idx, i) => { const p = G.players[idx]; t.append(h('tr', {}, h('td', {}, i + 1), h('td', {}, p.name), h('td', {}, h('b', {}, p.score)), h('td', {}, `${p.stats.scored[2]} / ${p.stats.scored[3]} / ${p.stats.scored[4]}`), h('td', {}, p.stats.votes), h('td', {}, p.stats.secrets))); });
  m.append(t, h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { G = null; render(); } }, 'New game'), h('button', { onclick: () => modalRoot.replaceChildren() }, 'Look at the table')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

function showRules() {
  const m = h('div', { class: 'modal' }, h('h2', {}, 'How to play Bit Flip'), h('div', { class: 'rules', html: `
    <p>A bag of white and black blocks. Each player has three <b>registers</b>: rows of 2, 3 and 4 slots. In the middle are <b>goal cards</b> in rows of 2, 3 and 4, each showing white or black. <b>Fill a register so it matches its goal, left to right, and you score it: 3, 6 or 10 points.</b></p>
    <h4>Your turn</h4>
    <ol>
      <li><b>Draw two blocks</b> from the bag.</li>
      <li><b>Place every block</b>: into an empty slot of yours, or onto any goal card as a <b>vote</b>. You may also pick up blocks from your <i>unfinished</i> rows and place them again, anywhere.</li>
      <li>A row that becomes full <b>locks</b>. If it matches its goal (or your secret pattern) it <b>scores at once</b>, its blocks return to the bag, and the goal is redealt from the deck; the votes on the old goal go back in the bag too. If it doesn't match, it stays locked as a bet: it scores the moment the goal flips to match it.</li>
      <li>Scoring the <b>4-register</b> is a jackpot: its four blocks become your votes to place right away. Scoring a 3 or a 4 also draws you an <b>action card</b>.</li>
    </ol>
    <h4>Votes</h4>
    <p>A goal card shows the colour with more blocks on it; a tie keeps the printed face. One block is enough to flip a fresh card.</p>
    <h4>Interference</h4>
    <p>When <i>your</i> vote flips a goal card, every block of the old colour sitting in that position of an <i>unfinished</i> row is erased. Take one of them into your hand to place this turn; the rest go back in the bag. Locked rows and blocks already showing the new colour are safe.</p>
    <h4>Secret pattern</h4>
    <p>You hold one secret pattern (2, 3 or 4 bits). A register that matches your secret scores exactly as if it matched the goal. Nobody can vote it away. Draw a new secret when you use it.</p>
    <h4>Action cards</h4>
    <ul><li><b>Bit Flip</b>: flip one block on any board, or one goal card (its votes return to the bag).</li><li><b>Rehearsal</b>: draw 3 extra blocks and place them now.</li><li><b>Priming</b>: your next draw is 4, keep 2.</li><li><b>Recount</b>: return up to 2 blocks of one colour from a goal card to the bag.</li></ul>
    <h4>End</h4>
    <p>When the goal deck can't redeal a scored goal, everyone finishes the round. Such a goal keeps only its votes: the votes decide its colours, and a tied position is wild. Highest score wins; ties go to the player who spent fewer blocks on votes.</p>` }),
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => { modalRoot.replaceChildren(); if (G) render(); } }, 'Close')));
  modalRoot.replaceChildren(h('div', { class: 'overlay' }, m));
}

document.getElementById('btn-rules').onclick = showRules;
document.getElementById('btn-new').onclick = () => { clearTimeout(botTimer); G = null; render(); };
render();
