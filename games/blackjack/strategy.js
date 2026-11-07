// Basic strategy for 4-8 decks, dealer stands on soft 17 (or hits, via h17), double after split,
// late surrender. Used by the bots and by the hint panel, with a plain-language reason.
import { total, cardValue, legal, current } from './engine.js';

// Dealer up-card index: 2..10 and 11 for an ace.
const up = (G) => { const v = cardValue(G.dealer.cards[0]); return v; };
// Approximate chance the dealer busts, by up card (6 decks, stands on soft 17).
export const BUST = { 2: 35, 3: 37, 4: 40, 5: 42, 6: 42, 7: 26, 8: 24, 9: 23, 10: 21, 11: 12 };
const upName = (u) => (u === 11 ? 'an ace' : u === 8 ? 'an 8' : `a ${u}`);

export function recommend(G) {
  const c = current(G);
  if (!c) return null;
  const { h } = c, L = legal(G), u = up(G), t = total(h.cards), two = h.cards.length === 2;
  const pair = two && cardValue(h.cards[0]) === cardValue(h.cards[1]) ? cardValue(h.cards[0]) : null;
  const weak = u >= 2 && u <= 6, bust = BUST[u];
  const say = (action, why) => ({ action, why });
  const dbl = (why, fallback = 'hit', fbWhy = '') => (L.double ? say('double', why) : say(fallback, fbWhy || why));

  // Surrender first (late surrender, first two cards only).
  if (L.surrender && !pair) {
    if (t.t === 16 && !t.soft && u >= 9) return say('surrender', `Hard 16 against ${upName(u)} loses more than half the time whatever you do. Giving up half the bet is the cheapest option.`);
    if (t.t === 15 && !t.soft && u === 10) return say('surrender', 'Hard 15 against a 10 is one of the worst hands in the game. Surrendering loses less on average than playing it out.');
  }
  if (G.opts.h17 && L.surrender && !pair && t.t === 17 && !t.soft && u === 11) return say('surrender', 'When the dealer hits soft 17, hard 17 against an ace is worth surrendering.');
  // Pairs.
  if (pair && L.split) {
    if (pair === 11) return say('split', 'Always split aces: two hands starting with 11 are far better than one soft 12.');
    if (pair === 8) return say('split', 'Always split 8s: 16 is the worst total, while each 8 can grow into a decent hand.');
    if (pair === 9 && u !== 7 && u !== 10 && u !== 11) return say('split', `Split 9s against ${upName(u)}: two hands starting with 9 beat a single 18 here.`);
    if (pair === 7 && u <= 7) return say('split', `Split 7s against ${upName(u)}: 14 is weak, and each 7 has a fair chance against this card.`);
    if (pair === 6 && u <= 6) return say('split', `Split 6s against ${upName(u)}: the dealer is likely to bust (about ${bust}%), so put more money out.`);
    if (pair === 4 && (u === 5 || u === 6) && G.opts.das) return say('split', `Split 4s against ${upName(u)}: each hand can be doubled after the split, against the dealer's weakest cards.`);
    if ((pair === 2 || pair === 3) && u <= 7) return say('split', `Split ${pair}s against ${upName(u)}: each hand starts better than a weak ${pair * 2}.`);
  }
  // Soft totals.
  if (t.soft) {
    if (t.t >= 20) return say('stand', `Soft ${t.t} is a strong hand. Stand.`);
    if (t.t === 19) return G.opts.h17 && u === 6 && L.double ? say('double', 'Against a 6 when the dealer hits soft 17, soft 19 is worth doubling.') : say('stand', 'Soft 19 is strong enough to stand on.');
    if (t.t === 18) {
      if (u >= 3 && u <= 6) return L.double ? say('double', `Soft 18 against ${upName(u)}: you can't bust with one card and the dealer often busts (about ${bust}%), so double.`) : say('stand', `Soft 18 against ${upName(u)}: doubling would be best, but you can't now, so stand.`);
      if (u === 2 || u === 7 || u === 8) return say('stand', `Soft 18 against ${upName(u)} is a fair favourite. Stand.`);
      return say('hit', `Soft 18 against ${upName(u)} is behind: the dealer often reaches 19 or 20. Hit; an ace counts as 1 if you go over.`);
    }
    if (t.t === 17) return u >= 3 && u <= 6 ? dbl(`Soft 17 against ${upName(u)}: double while the dealer is weak.`, 'hit', 'Soft 17 is never good enough to stand on. Hit: you cannot bust.') : say('hit', 'Soft 17 is never good enough to stand on. Hit: you cannot bust.');
    if (t.t >= 15) return u >= 4 && u <= 6 ? dbl(`Soft ${t.t} against ${upName(u)}: double and let the dealer bust.`) : say('hit', `Soft ${t.t}: hit. You can't bust with one card.`);
    return u >= 5 && u <= 6 ? dbl(`Soft ${t.t} against ${upName(u)}: double against the dealer's weakest cards.`) : say('hit', `Soft ${t.t}: hit. You can't bust with one card.`);
  }
  // Hard totals.
  if (t.t >= 17) return say('stand', `Hard ${t.t}: stand. Any card above ${21 - t.t} busts you.`);
  if (t.t >= 13) return weak ? say('stand', `Hard ${t.t} against ${upName(u)}: stand and let the dealer take the risk; they bust about ${bust}% of the time.`) : say('hit', `Hard ${t.t} against ${upName(u)}: the dealer will usually make 17 or more, so standing loses. Hit.`);
  if (t.t === 12) return u >= 4 && u <= 6 ? say('stand', `12 against ${upName(u)}: stand. The dealer busts about ${bust}% of the time.`) : say('hit', `12 against ${upName(u)}: hit. Only a 10-value card (4 in 13) busts you.`);
  if (t.t === 11) return u <= 10 || G.opts.h17 ? dbl(`11 against ${upName(u)}: double. A 10-value card makes 21.`) : say('hit', '11 against an ace: hit rather than double.');
  if (t.t === 10) return u <= 9 ? dbl(`10 against ${upName(u)}: double. You're the favourite.`) : say('hit', `10 against ${upName(u)}: hit; the dealer's card is too strong to double.`);
  if (t.t === 9) return u >= 3 && u <= 6 ? dbl(`9 against ${upName(u)}: double against a weak dealer card.`) : say('hit', '9: hit.');
  return say('hit', `${t.t}: hit. You can't bust.`);
}
export const BASIC = recommend;
