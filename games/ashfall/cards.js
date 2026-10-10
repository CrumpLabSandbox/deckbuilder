// Card and Omen definitions for Ashfall.
// Effects are plain functions: effect(G, api, self). They may call api.prompt() to ask
// the player for a choice; the engine pauses until resolvePending() is called.

export const ICONS = {
  tide: { glyph: '🌊', name: 'Tide' },
  forge: { glyph: '⚒️', name: 'Forge' },
  lore: { glyph: '📜', name: 'Lore' },
  flame: { glyph: '🔥', name: 'Flame' },
};

export const DAYS = 15;
export const HAND_SIZE = 5;
export const AGES = [
  { n: 1, name: 'Tremors', days: [1, 5] },
  { n: 2, name: 'Eruption', days: [6, 10] },
  { n: 3, name: 'Ashfall', days: [11, 15] },
];
export const KINGDOM_PILE = 4;
export const KINGDOM_PICKS = 6;

const C = {};
function def(id, card) { C[id] = { id, icons: [], types: [], ...card }; }

// ---------- Basics (always in the market) ----------
def('shell', { name: 'Shell', types: ['treasure'], cost: 0, coin: 1, pile: 40,
  text: '+1 Coin.' });
def('pearl', { name: 'Pearl', types: ['treasure'], cost: 3, coin: 2, pile: 40,
  text: '+2 Coin.' });
def('obsidian', { name: 'Obsidian', types: ['treasure'], cost: 6, coin: 3, pile: 40,
  text: '+3 Coin.' });
def('totem', { name: 'Totem', types: ['relic'], cost: 2, vp: 1, pile: 8,
  text: '1 Relic point.' });
def('idol', { name: 'Idol', types: ['relic'], cost: 5, vp: 3, pile: 8,
  text: '3 Relic points.' });
def('heart', { name: 'Heart of the Mountain', types: ['relic'], cost: 8, vp: 6, pile: 6,
  text: '6 Relic points.' });
def('cinder', { name: 'Cinder', types: ['cinder'], cost: 0, vp: -1, pile: 99, market: false,
  text: '-1 point. Does nothing. Ash in your deck.' });

// ---------- Age I: Tremors (cost 2-4) ----------
def('netmaker', { name: 'Netmaker', age: 1, cost: 2, types: ['action'], icons: ['tide'],
  text: '+1 Card, +1 Action, +1 Buy.',
  effect(G, a) { a.draw(1); a.actions(1); a.buys(1); } });
def('cinder_rite', { name: 'Cinder Rite', age: 1, cost: 2, types: ['action'], icons: ['flame'],
  text: '+3 Coin. Gain a Cinder.',
  effect(G, a) { a.coins(3); a.gain('cinder'); } });
def('fisher', { name: 'Fisher', age: 1, cost: 3, types: ['action'], icons: ['tide'],
  text: '+2 Coin, +1 Buy. +1 Coin per other Tide icon in play.',
  effect(G, a, self) { a.coins(2 + a.otherIcons('tide', self)); a.buys(1); } });
def('lookout', { name: 'Lookout', age: 1, cost: 3, types: ['action'], icons: ['tide', 'lore'],
  text: '+1 Card, +1 Action. Look at the top 2 cards of your deck; discard any number of them.',
  effect(G, a) {
    a.draw(1); a.actions(1);
    const top = a.peek(2);
    if (!top.length) return;
    a.prompt({ text: 'Lookout: discard any of the top cards of your deck?', cards: top, min: 0, max: 2,
      okLabel: 'Discard chosen', skipLabel: 'Leave them',
      resolve(chosen) { for (const u of chosen) a.discardFromDeck(u); } });
  } });
def('elder', { name: 'Village Elder', age: 1, cost: 3, types: ['action'], icons: ['lore'],
  text: '+1 Card, +2 Actions.',
  effect(G, a) { a.draw(1); a.actions(2); } });
def('apprentice', { name: 'Apprentice', age: 1, cost: 3, types: ['action'], icons: ['forge'],
  text: '+1 Card, +1 Action. +1 Coin per other Forge icon in play (max 2).',
  effect(G, a, self) { a.draw(1); a.actions(1); a.coins(Math.min(2, a.otherIcons('forge', self))); } });
def('priest', { name: 'Priest', age: 1, cost: 4, types: ['action'], icons: ['lore'],
  text: '+1 Action. Trash up to 2 cards from your hand.',
  effect(G, a) {
    a.actions(1);
    a.prompt({ text: 'Priest: trash up to 2 cards from your hand.', cards: G.hand, min: 0, max: 2,
      okLabel: 'Trash', resolve(chosen) { for (const u of chosen) a.trashFromHand(u); } });
  } });
def('smelter', { name: 'Smelter', age: 1, cost: 4, types: ['action'], icons: ['forge'],
  text: '+3 Coin. +1 Coin per other Forge icon in play.',
  effect(G, a, self) { a.coins(3 + a.otherIcons('forge', self)); } });
def('storyteller', { name: 'Storyteller', age: 1, cost: 4, types: ['action'], icons: ['lore'],
  text: '+1 Card, +1 Action. +1 Card per other Lore icon in play (max 2).',
  effect(G, a, self) { a.draw(1); a.actions(1); a.draw(Math.min(2, a.otherIcons('lore', self))); } });

// ---------- Age II: Eruption (cost 4-6) ----------
def('harbor', { name: 'Harbor', age: 2, cost: 4, types: ['action'], icons: ['tide'],
  text: '+1 Card, +1 Action, +1 Coin.',
  effect(G, a) { a.draw(1); a.actions(1); a.coins(1); } });
def('shipwright', { name: 'Shipwright', age: 2, cost: 5, types: ['action'], icons: ['tide', 'forge'],
  text: '+2 Cards, +1 Action.',
  effect(G, a) { a.draw(2); a.actions(1); } });
def('forgemaster', { name: 'Forgemaster', age: 2, cost: 5, types: ['action'], icons: ['forge'],
  text: '+3 Coin, +1 Buy. +1 Coin per other Forge icon in play.',
  effect(G, a, self) { a.coins(3 + a.otherIcons('forge', self)); a.buys(1); } });
def('oracle', { name: 'Oracle', age: 2, cost: 5, types: ['action'], icons: ['lore'],
  text: '+1 Card, +1 Action. Look at the top 3 cards of your deck. Put one into your hand and discard the rest.',
  effect(G, a) {
    a.draw(1); a.actions(1);
    const top = a.peek(3);
    if (!top.length) return;
    a.prompt({ text: 'Oracle: choose one card to put into your hand. The rest are discarded.',
      cards: top, min: 1, max: 1, okLabel: 'Take it',
      resolve(chosen) {
        for (const c of top) { if (chosen.includes(c.uid)) a.deckToHand(c.uid); else a.discardFromDeck(c.uid); }
      } });
  } });
def('lavasmith', { name: 'Lavasmith', age: 2, cost: 5, types: ['action'], icons: ['flame', 'forge'],
  text: '+4 Coin. Gain a Cinder.',
  effect(G, a) { a.coins(4); a.gain('cinder'); } });
def('ritualist', { name: 'Ritualist', age: 2, cost: 5, types: ['action'], icons: ['lore', 'flame'],
  text: '+1 Action. Trash up to 2 cards from your hand. +1 Coin per card trashed, +2 instead if it was a Cinder.',
  effect(G, a) {
    a.actions(1);
    a.prompt({ text: 'Ritualist: trash up to 2 cards from your hand.', cards: G.hand, min: 0, max: 2,
      okLabel: 'Trash',
      resolve(chosen) {
        for (const u of chosen) { const c = a.trashFromHand(u); a.coins(c.id === 'cinder' ? 2 : 1); }
      } });
  } });
def('fair', { name: 'Harvest Fair', age: 2, cost: 5, types: ['action'], icons: ['forge', 'tide'],
  text: '+2 Actions, +2 Coin, +1 Buy.',
  effect(G, a) { a.actions(2); a.coins(2); a.buys(1); } });
def('relic_hunter', { name: 'Relic Hunter', age: 2, cost: 5, types: ['action'], icons: ['tide', 'lore'],
  text: '+1 Card, +1 Action, +1 Coin. Relics cost 1 less this day.',
  effect(G, a) { a.draw(1); a.actions(1); a.coins(1); G.relicDiscount += 1; } });
def('guild_hall', { name: 'Guild Hall', age: 2, cost: 6, types: ['action'], icons: ['lore'],
  text: '+3 Cards, +1 Action.',
  effect(G, a) { a.draw(3); a.actions(1); } });

// ---------- Age III: Ashfall (cost 6-8) ----------
def('fleet', { name: 'Fleet', age: 3, cost: 6, types: ['action'], icons: ['tide', 'tide'],
  text: '+2 Cards, +1 Action, +1 Buy.',
  effect(G, a) { a.draw(2); a.actions(1); a.buys(1); } });
def('pyre', { name: 'Pyre', age: 3, cost: 6, types: ['action'], icons: ['flame'],
  text: '+3 Coin. Trash up to 3 cards from your hand. +1 Coin per Cinder trashed.',
  effect(G, a) {
    a.coins(3);
    a.prompt({ text: 'Pyre: trash up to 3 cards from your hand.', cards: G.hand, min: 0, max: 3,
      okLabel: 'Trash',
      resolve(chosen) { for (const u of chosen) { const c = a.trashFromHand(u); if (c.id === 'cinder') a.coins(1); } } });
  } });
def('shrine', { name: 'Volcano Shrine', age: 3, cost: 6, types: ['action'], icons: ['flame', 'lore'],
  text: '+1 Card, +1 Action, +1 Coin. +1 Coin per other Flame icon in play.',
  effect(G, a, self) { a.draw(1); a.actions(1); a.coins(1 + a.otherIcons('flame', self)); } });
def('great_forge', { name: 'Great Forge', age: 3, cost: 7, types: ['action'], icons: ['forge', 'forge'],
  text: '+4 Coin, +1 Buy. +1 Coin per other Forge icon in play.',
  effect(G, a, self) { a.coins(4 + a.otherIcons('forge', self)); a.buys(1); } });
def('sage', { name: 'Sage', age: 3, cost: 7, types: ['action'], icons: ['lore', 'lore'],
  text: '+3 Cards, +1 Action. +1 Card per other Lore icon in play (max 2).',
  effect(G, a, self) { a.draw(3); a.actions(1); a.draw(Math.min(2, a.otherIcons('lore', self))); } });
def('heartstone', { name: 'Heartstone', age: 3, cost: 7, types: ['action', 'relic'], icons: ['flame'], vp: 3,
  text: '3 Relic points. +2 Coin.',
  effect(G, a) { a.coins(2); } });
def('chronicle', { name: 'Chronicle', age: 3, cost: 7, types: ['relic'], icons: ['lore'],
  text: 'Worth 1 Relic point per 2 Lore icons among all cards you own (counting this one).',
  vpFn(allCards) {
    let lore = 0;
    for (const c of allCards) lore += C[c.id].icons.filter(i => i === 'lore').length;
    return Math.floor(lore / 2);
  } });
def('beacon', { name: 'Beacon', age: 3, cost: 8, types: ['action', 'relic'], icons: ['tide'], vp: 4,
  text: '4 Relic points. +2 Cards, +1 Action.',
  effect(G, a) { a.draw(2); a.actions(1); } });

export const CARDS = C;
export const BASICS = ['shell', 'pearl', 'obsidian', 'totem', 'idol', 'heart'];
export const KINGDOM_BY_AGE = {
  1: Object.values(C).filter(c => c.age === 1).map(c => c.id),
  2: Object.values(C).filter(c => c.age === 2).map(c => c.id),
  3: Object.values(C).filter(c => c.age === 3).map(c => c.id),
};

// ---------- Omens ----------
// One Omen strikes at the start of each day. The next day's Omen is always forecast.
export const OMENS = {
  calm: { name: 'Calm', glyph: '☀️', text: 'A quiet day. Nothing happens.', bad: false },
  blessing: { name: 'Blessing', glyph: '🕊️', text: '+1 Coin and +1 Buy this day.', bad: false,
    apply(G, a) { a.coins(1); a.buys(1); } },
  ashfall: { name: 'Ashfall', glyph: '🌫️', text: 'Gain a Cinder.', bad: true,
    apply(G, a) { a.gain('cinder'); } },
  eruption: { name: 'Eruption', glyph: '🌋', text: 'Gain 2 Cinders.', bad: true,
    apply(G, a) { a.gain('cinder'); a.gain('cinder'); } },
  tremor: { name: 'Tremor', glyph: '〰️', text: 'Discard a card from your hand.', bad: true,
    apply(G, a) {
      a.prompt({ text: 'Tremor: discard a card from your hand.', cards: G.hand, min: 1, max: 1,
        okLabel: 'Discard', resolve(chosen) { a.discardFromHand(chosen[0]); } });
    } },
  quake: { name: 'Quake', glyph: '💥', text: 'You must trash a card from your hand.', bad: true,
    apply(G, a) {
      a.prompt({ text: 'Quake: you must trash a card from your hand.', cards: G.hand, min: 1, max: 1,
        okLabel: 'Trash', resolve(chosen) { a.trashFromHand(chosen[0]); } });
    } },
  toll: { name: 'Toll', glyph: '🪙', text: '-1 Coin this day.', bad: true,
    apply(G, a) { a.coins(-1); } },
  lava: { name: 'Lava Flow', glyph: '🟥', text: 'All cards cost 1 more this day.', bad: true },
  mourning: { name: 'Mourning', glyph: '🕯️', text: 'You start the day with 0 Actions.', bad: true,
    apply(G) { G.actions = 0; } },
  smoke: { name: 'Smoke', glyph: '💨', text: 'Your hand is only 4 cards this day.', bad: true },
};

// Which omens can appear in each age. Day 1 is always Calm.
export const OMEN_POOLS = {
  1: ['calm', 'calm', 'ashfall', 'tremor', 'toll', 'blessing', 'smoke'],
  2: ['calm', 'ashfall', 'tremor', 'lava', 'toll', 'quake', 'smoke', 'mourning', 'blessing'],
  3: ['calm', 'ashfall', 'eruption', 'lava', 'tremor', 'mourning', 'quake', 'smoke', 'toll', 'blessing'],
};

// ---------- Works ----------
// Works are island buildings. Buying one costs a Buy and coins, but it never enters your deck:
// it stays on the island and acts at the start of every day, or is worth points at the end.
// One copy of each; the three on offer vanish when the Age ends.
const W = {};
function work(id, w) { W[id] = { id, ...w }; }

work('weir', { name: 'Fish Weir', age: 1, cost: 3, text: 'Start of each day: +1 Coin.',
  onDay(G, a) { a.coins(1); } });
work('workshop', { name: 'Workshop', age: 1, cost: 4, text: 'Start of each day: +1 Buy.',
  onDay(G, a) { a.buys(1); } });
work('square', { name: 'Market Square', age: 1, cost: 5, text: 'Start of each day: +1 Card.',
  onDay(G, a) { a.draw(1); } });
work('trench', { name: 'Ash Trench', age: 1, cost: 4, text: 'Start of each day: trash a Cinder from your hand, if you have one.',
  onDay(G, a) { const c = G.hand.find(x => x.id === 'cinder'); if (c) a.trashFromHand(c.uid); } });
work('kiln', { name: 'Kiln', age: 1, cost: 3, text: 'Start of each day: +1 Coin per Cinder in your hand.',
  onDay(G, a) { a.coins(G.hand.filter(x => x.id === 'cinder').length); } });

work('seawall', { name: 'Sea Wall', age: 2, cost: 5, text: 'Tremor, Toll, Mourning and Smoke no longer affect you.',
  shields: ['tremor', 'toll', 'mourning', 'smoke'] });
work('charter', { name: 'Guild Charter', age: 2, cost: 6, text: 'Start of each day: +2 Coin.',
  onDay(G, a) { a.coins(2); } });
work('reliquary', { name: 'Reliquary', age: 2, cost: 6, text: 'Relics cost 1 less.',
  onDay(G) { G.relicDiscount += 1; } });
work('lighthouse', { name: 'Lighthouse', age: 2, cost: 7, text: 'Start of each day: +1 Card, +1 Action.',
  onDay(G, a) { a.draw(1); a.actions(1); } });
work('monument', { name: 'Monument', age: 2, cost: 6, text: 'Worth 3 points.', vp: 3 });

work('library', { name: 'Great Library', age: 3, cost: 8, text: 'Start of each day: +2 Cards.',
  onDay(G, a) { a.draw(2); } });
work('mine', { name: 'Obsidian Mine', age: 3, cost: 7, text: 'Start of each day: +3 Coin.',
  onDay(G, a) { a.coins(3); } });
work('ark', { name: 'The Ark', age: 3, cost: 8, text: 'Worth 6 points.', vp: 6 });
work('vault', { name: 'Relic Vault', age: 3, cost: 7, text: 'Worth 1 point per 2 Relic cards you own (counting Heartstone and Beacon).',
  vpFn(allCards) { return Math.floor(allCards.filter(c => C[c.id].types.includes('relic')).length / 2); } });
work('bell', { name: 'Warning Bell', age: 3, cost: 6, text: 'Ashfall and Eruption no longer affect you.',
  shields: ['ashfall', 'eruption'] });

export const WORKS = W;
export const WORKS_BY_AGE = {
  1: Object.values(W).filter(w => w.age === 1).map(w => w.id),
  2: Object.values(W).filter(w => w.age === 2).map(w => w.id),
  3: Object.values(W).filter(w => w.age === 3).map(w => w.id),
};
export const WORK_PICKS = 3;
