// Euchre bots and the coach. Every decision comes with a plain-language reason, so the same code
// drives the computer players and explains suggestions to the human.
import {
  SUITS, SUIT_INFO, ALL_CARDS, sameCard, sister, team, partnerOf, isRight, isLeft, isTrump, effSuit, power,
  legalCards, currentWinner, cardName, suitName, orderUp, pass, callSuit, discard, playCard, actor, trickSize,
} from './engine.js';

export const THRESH = { order: 6, call: 5.5, alone: 10 };
const TV = { 14: 2.0, 13: 1.6, 12: 1.3, 10: 1.1, 9: 1.0 };

export function cardBidValue(c, t) {
  if (isRight(c, t)) return 3;
  if (isLeft(c, t)) return 2.5;
  if (isTrump(c, t)) return TV[c.rank];
  return c.rank === 14 ? 1 : 0;
}
export function handValue(hand, t) {
  let v = 0, trumps = 0;
  const suits = new Set();
  for (const c of hand) { v += cardBidValue(c, t); if (isTrump(c, t)) trumps++; else suits.add(c.suit); }
  if (trumps >= 2) for (const s of SUITS) if (s !== t && !suits.has(s)) v += 0.5; // a void lets you trump in
  return v;
}
function describe(hand, t) {
  const parts = [];
  for (const c of hand.filter((c) => isTrump(c, t)).sort((a, b) => power(b, t, t) - power(a, t, t))) {
    parts.push(isRight(c, t) ? `the right bower (${cardName(c)})` : isLeft(c, t) ? `the left bower (${cardName(c)})` : cardName(c));
  }
  const aces = hand.filter((c) => !isTrump(c, t) && c.rank === 14).map(cardName);
  const trumpTxt = parts.length ? `${parts.length} trump: ${parts.join(', ')}` : 'no trump';
  return aces.length ? `${trumpTxt}, plus ${aces.join(' and ')}` : trumpTxt;
}
function aloneOk(hand, t, v) {
  const trumps = hand.filter((c) => isTrump(c, t));
  const hasR = trumps.some((c) => isRight(c, t)), hasL = trumps.some((c) => isLeft(c, t));
  const hasA = trumps.some((c) => !isRight(c, t) && !isLeft(c, t) && c.rank === 14);
  const losers = hand.filter((c) => !isTrump(c, t) && c.rank !== 14).length;
  return v >= THRESH.alone && hasR && (hasL || hasA) && trumps.length >= 3 && losers <= 1;
}

export function chooseDiscard(hand, t) {
  const non = hand.filter((c) => !isTrump(c, t));
  if (!non.length) return hand.slice().sort((a, b) => power(a, t, t) - power(b, t, t))[0];
  const count = {};
  for (const c of non) count[c.suit] = (count[c.suit] || 0) + 1;
  const singles = non.filter((c) => count[c.suit] === 1 && c.rank !== 14);
  if (singles.length) return singles.sort((a, b) => a.rank - b.rank)[0];
  const nonAce = non.filter((c) => c.rank !== 14);
  return (nonAce.length ? nonAce : non).sort((a, b) => a.rank - b.rank)[0];
}
export function discardReason(hand, t, c) {
  if (isTrump(c, t)) return `Every card you hold is trump, so let go of the lowest one, the ${cardName(c)}.`;
  const same = hand.filter((x) => !isTrump(x, t) && x.suit === c.suit).length;
  if (same === 1) return `Discard the ${cardName(c)}. It's your only ${SUIT_INFO[c.suit].one}, so you'll be void in ${suitName(c.suit).toLowerCase()} and can trump them.`;
  return `Discard the ${cardName(c)}, your weakest card outside trump. Keep trump and aces.`;
}

export function bidAdvice(G, p) {
  const h = G.hand, hand = G.players[p].hand;
  if (G.phase === 'bid1') {
    const t = h.upcard.suit, up = cardName(h.upcard);
    let v, evalHand, context;
    if (p === G.dealer) {
      const full = [...hand, h.upcard];
      const d = chooseDiscard(full, t);
      evalHand = full.filter((c) => c !== d);
      v = handValue(evalHand, t);
      context = `As dealer you'd pick up the ${up} and discard the ${cardName(d)}, leaving ${describe(evalHand, t)}.`;
    } else {
      evalHand = hand;
      const base = handValue(hand, t), upv = cardBidValue(h.upcard, t);
      if (team(p) === team(G.dealer)) { v = base + upv * 0.7; context = `You hold ${describe(hand, t)}, and your partner deals, so the ${up} would join your side.`; }
      else { v = base - upv * 0.6; context = `You hold ${describe(hand, t)}, but the dealer is on the other team and would get the ${up}.`; }
    }
    const order = v >= THRESH.order;
    const alone = order && aloneOk(evalHand, t, v);
    const what = p === G.dealer ? 'pick it up' : 'order it up';
    const reason = `${context} In ${suitName(t).toLowerCase()} that's worth about ${v.toFixed(1)}; around ${THRESH.order} is enough to ${what}.` +
      (alone ? ' It is strong enough to try alone for 4 points.' : order ? '' : ' Pass and see what happens.');
    return { action: order ? 'order' : 'pass', alone, value: v, suit: t, reason };
  }
  if (G.phase === 'bid2') {
    let best = null;
    for (const s of SUITS) if (s !== h.upcard.suit) { const v = handValue(hand, s); if (!best || v > best.v) best = { s, v }; }
    const forced = G.opts.stickTheDealer && p === G.dealer;
    const call = best.v >= THRESH.call || forced;
    const alone = call && aloneOk(hand, best.s, best.v);
    let reason = `Your best suit is ${suitName(best.s).toLowerCase()}: ${describe(hand, best.s)}, worth about ${best.v.toFixed(1)}. Around ${THRESH.call} is enough to name it.`;
    if (forced && best.v < THRESH.call) reason = `Stick the dealer: you must name a suit. Pick your best one, ${suitName(best.s).toLowerCase()} (${describe(hand, best.s)}).`;
    else if (!call) reason += ' Pass.';
    else if (alone) reason += ' Strong enough to go alone.';
    return { action: call ? 'call' : 'pass', alone, value: best.v, suit: best.s, reason };
  }
  return null;
}

// Cards this player cannot see: not in their hand, not yet played, not the turned-down up card, not their own discard.
function unseen(G, p) {
  const h = G.hand, mine = G.players[p].hand;
  return ALL_CARDS.filter((c) => !mine.some((x) => sameCard(x, c)) && !h.played.some((x) => sameCard(x, c))
    && !(!h.pickedUp && sameCard(h.upcard, c)) && !(p === G.dealer && h.discarded && sameCard(h.discarded, c)));
}
function isBoss(G, p, card) {
  const t = G.hand.trump, s = effSuit(card, t);
  return !unseen(G, p).some((c) => effSuit(c, t) === s && power(c, t, s) > power(card, t, s));
}

export function playAdvice(G, p) {
  const h = G.hand, t = h.trump, hand = G.players[p].hand, legal = legalCards(G, p), tr = h.trick.cards;
  const isT = (c) => isTrump(c, t);
  const T = suitName(t).toLowerCase();
  if (!tr.length) {
    // Leading.
    const trumps = legal.filter(isT).sort((a, b) => power(b, t, t) - power(a, t, t));
    const makers = team(p) === team(h.maker);
    if (makers && trumps.length) {
      const top = trumps[0];
      if (isBoss(G, p, top) && (p === h.maker || trumps.length >= 2))
        return { uid: top.uid, reason: `Your side made ${T}. Lead the ${cardName(top)}, the highest trump still out, to pull the other team's trump.` };
      if (h.maker === partnerOf(p)) return { uid: top.uid, reason: `Your partner called ${T}. Leading trump back to them helps clear the other team's trump.` };
    }
    const off = legal.filter((c) => !isT(c));
    const count = {};
    for (const c of off) count[c.suit] = (count[c.suit] || 0) + 1;
    const aces = off.filter((c) => c.rank === 14).sort((a, b) => count[a.suit] - count[b.suit]);
    if (aces.length) return { uid: aces[0].uid, reason: `Cash the ${cardName(aces[0])} now, before that suit runs out and gets trumped.` };
    if (off.length) {
      const c = off.slice().sort((a, b) => count[a.suit] - count[b.suit] || a.rank - b.rank)[0];
      return { uid: c.uid, reason: `No sure winner to lead, so lead a low card, the ${cardName(c)}, and let your partner try to win it.` };
    }
    const c = isBoss(G, p, trumps[0]) ? trumps[0] : trumps[trumps.length - 1];
    return { uid: c.uid, reason: `You only have trump left. Lead the ${cardName(c)}${c === trumps[0] ? ', which nobody can beat' : ', your lowest'}.` };
  }
  // Following.
  const led = effSuit(tr[0].card, t), ledName = SUIT_INFO[led].one;
  const win = currentWinner(G);
  const partnerWinning = win.p === partnerOf(p);
  const after = trickSize(G) - tr.length - 1;
  const following = legal.some((c) => effSuit(c, t) === led);
  const beats = legal.filter((c) => power(c, t, led) > power(win.card, t, led)).sort((a, b) => power(a, t, led) - power(b, t, led));
  const lowest = () => {
    if (following) return legal.slice().sort((a, b) => power(a, t, led) - power(b, t, led))[0];
    const non = legal.filter((c) => !isT(c));
    if (!non.length) return legal.slice().sort((a, b) => power(a, t, t) - power(b, t, t))[0];
    const count = {};
    for (const c of non) count[c.suit] = (count[c.suit] || 0) + 1;
    return non.slice().sort((a, b) => a.rank - b.rank || count[a.suit] - count[b.suit])[0];
  };
  const forced = legal.length === 1 && following && hand.length > 1;
  if (legal.length === 1) {
    const c = legal[0];
    return { uid: c.uid, reason: forced ? `The ${cardName(c)} is your only ${ledName}, and you must follow suit.` : `It's your last card.` };
  }
  if (partnerWinning) {
    const pc = win.card;
    const strong = after === 0 || isBoss(G, p, pc) || isT(pc) || pc.rank >= 13;
    if (strong || !beats.length) {
      const c = lowest();
      return { uid: c.uid, reason: `Your partner is winning with the ${cardName(pc)}${after === 0 ? '' : isBoss(G, p, pc) ? ', which nobody can beat' : ''}. Don't waste a good card: play the ${cardName(c)}.` };
    }
    const boss = beats.find((b) => isBoss(G, p, b));
    if (boss) return { uid: boss.uid, reason: `Your partner's ${cardName(pc)} could still be beaten. Make sure of the trick with the ${cardName(boss)}.` };
    const c = lowest();
    return { uid: c.uid, reason: `Your partner is winning; play low with the ${cardName(c)} and hope it holds.` };
  }
  if (beats.length) {
    const c = beats[0];
    if (isT(c) && led !== t) return { uid: c.uid, reason: `You're out of ${suitName(led).toLowerCase()}, so trump in with the ${cardName(c)}, the cheapest trump that wins.` };
    if (after === 0) return { uid: c.uid, reason: `You play last, so win with the ${cardName(c)}, the cheapest card that takes the trick.` };
    const boss = beats.find((b) => isBoss(G, p, b));
    if (boss && boss !== c) return { uid: boss.uid, reason: `Win with the ${cardName(boss)}, which nobody left can beat.` };
    return { uid: c.uid, reason: `Take the lead with the ${cardName(c)}.` };
  }
  const c = lowest();
  return following
    ? { uid: c.uid, reason: `You can't beat the ${cardName(win.card)}. Follow suit with your lowest ${ledName}, the ${cardName(c)}.` }
    : { uid: c.uid, reason: `You have no ${ledName} and can't win, so throw off your least useful card, the ${cardName(c)}.` };
}

export function botAct(G) {
  const p = actor(G);
  if (p === null) return false;
  if (G.phase === 'bid1' || G.phase === 'bid2') {
    const a = bidAdvice(G, p);
    if (a.action === 'order') return orderUp(G, a.alone);
    if (a.action === 'call') return callSuit(G, a.suit, a.alone);
    return pass(G);
  }
  if (G.phase === 'discard') return discard(G, chooseDiscard(G.players[p].hand, G.hand.trump).uid);
  if (G.phase === 'play') return playCard(G, playAdvice(G, p).uid);
  return false;
}
