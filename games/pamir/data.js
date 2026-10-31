// Pax Pamir (Second Edition) rules on an ORIGINAL card set. The published cards (names, text, art)
// belong to their designer; these are generated to the same structure: suit, rank (stars), region,
// impact icons, card actions, patriots and prizes. Deterministic so every game uses the same deck.
import { makeRng } from '../../platform/rng.js';

export const REGIONS = ['persia', 'transcaspia', 'herat', 'kabul', 'kandahar', 'punjab'];
export const REGION_INFO = {
  persia: { name: 'Persia', x: 70, y: 200 },
  transcaspia: { name: 'Transcaspia', x: 250, y: 70 },
  herat: { name: 'Herat', x: 230, y: 210 },
  kabul: { name: 'Kabul', x: 410, y: 130 },
  kandahar: { name: 'Kandahar', x: 360, y: 300 },
  punjab: { name: 'Punjab', x: 560, y: 230 },
};
// Shared borders (roads sit on these). Best understanding of the published map.
export const BORDERS = [
  ['persia', 'transcaspia'], ['persia', 'herat'], ['transcaspia', 'herat'], ['transcaspia', 'kabul'],
  ['herat', 'kabul'], ['herat', 'kandahar'], ['kabul', 'kandahar'], ['kabul', 'punjab'], ['kandahar', 'punjab'],
].map(([a, b]) => ({ id: `${a}-${b}`, a, b }));
export const bordersOf = (r) => BORDERS.filter((b) => b.a === r || b.b === r);
export const borderBetween = (a, b) => BORDERS.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));

export const COALITIONS = ['afghan', 'british', 'russian'];
export const COALITION_INFO = {
  afghan: { name: 'Afghan', color: '#4f9a5a' },
  british: { name: 'British', color: '#c4524a' },
  russian: { name: 'Russian', color: '#d6b13c' },
};
export const SUITS = ['political', 'intelligence', 'economic', 'military'];
export const SUIT_INFO = {
  political: { name: 'Political', color: '#8d6ad8', effect: 'Each political star raises your court limit by 1.' },
  intelligence: { name: 'Intelligence', color: '#4f8dc9', effect: 'Each intelligence star raises your hand limit by 1.' },
  economic: { name: 'Economic', color: '#d9a521', effect: 'Each economic star shelters 1 rupee from taxation.' },
  military: { name: 'Military', color: '#c4524a', effect: 'While military is favored, purchases cost double.' },
};
export const IMPACTS = {
  army: { icon: '■', name: 'Army', text: 'Place an army of your coalition in this card’s region.' },
  road: { icon: '═', name: 'Road', text: 'Place a road of your coalition on a border of this card’s region.' },
  tribe: { icon: '●', name: 'Tribe', text: 'Place one of your cylinders in this card’s region as a tribe.' },
  spy: { icon: '👁', name: 'Spy', text: 'Place one of your cylinders as a spy on any court card (anyone’s) of this card’s region.' },
  leverage: { icon: '¤', name: 'Leverage', text: 'Gain 2 rupees now. When this card is discarded, you must pay 2 rupees back.' },
  favor: { icon: '★', name: 'Favor', text: 'This card’s suit becomes the favored suit.' },
};
export const ACTIONS = {
  tax: { icon: '💲', name: 'Tax', text: 'Take rupees up to this card’s rank from market cards, or from players with a court card in a region you rule (above their tax shelter).' },
  gift: { icon: '🎁', name: 'Gift', text: 'Pay 2, 4 or 6 rupees to place a cylinder on your next gift space: +1 influence.' },
  build: { icon: '🏗', name: 'Build', text: 'Pay 2 rupees each for up to 3 armies (in regions you rule) or roads (on their borders).' },
  move: { icon: '➜', name: 'Move', text: 'Make moves equal to rank: an army crosses a border along a road of its coalition, or a spy steps to a neighbouring court card.' },
  betray: { icon: '🗡', name: 'Betray', text: 'Pay 2 rupees to discard a court card where you have a spy. You may keep it as a prize.' },
  battle: { icon: '⚔', name: 'Battle', text: 'At a region (limited by your coalition’s armies there) or a card (limited by your spies on it), remove enemy pieces up to rank.' },
};

const ROLES = {
  political: [['Village Elder', 'Hill Chief', 'Qazi'], ['Tribal Khan', 'Sardar', 'Mirza'], ['Court Vizier', 'Royal Regent']],
  intelligence: [['Courier', 'Runner', 'Listener'], ['Agent', 'Informant', 'Cipher Clerk'], ['Spymaster', 'Master of Whispers']],
  economic: [['Caravan Trader', 'Moneylender', 'Salt Merchant'], ['Bazaar Banker', 'Toll Keeper', 'Silk Factor'], ['Merchant Prince', 'Treasurer']],
  military: [['Border Riders', 'Musketeers', 'Scouts'], ['Garrison Captain', 'Cavalry Leader', 'Artillery Master'], ['Warlord', 'Field Marshal']],
};
const BASE = {
  political: { impacts: [['tribe'], ['tribe', 'tribe'], ['tribe', 'favor'], ['tribe', 'army']], actions: [['gift', 'tax'], ['build', 'gift'], ['tax'], ['build']] },
  intelligence: { impacts: [['spy'], ['spy', 'spy'], ['spy', 'favor'], ['spy', 'tribe']], actions: [['betray', 'move'], ['move', 'battle'], ['betray'], ['move']] },
  economic: { impacts: [['leverage', 'tribe'], ['tribe', 'road'], ['leverage', 'favor'], ['tribe']], actions: [['tax', 'gift'], ['tax', 'build'], ['gift'], ['tax']] },
  military: { impacts: [['army'], ['army', 'road'], ['army', 'favor'], ['road', 'road']], actions: [['battle', 'move'], ['build', 'battle'], ['battle'], ['move', 'build']] },
};

export function buildCourtCards() {
  const rng = makeRng('pamir-original-cards-v1');
  const cards = [];
  let id = 0;
  for (const region of REGIONS) {
    // 16 cards per region: 4 per suit, ranks 1,1,2,3 within each suit.
    for (const suit of SUITS) {
      [1, 1, 2, 3].forEach((rank, k) => {
        const base = BASE[suit];
        const impacts = base.impacts[(k + REGIONS.indexOf(region)) % base.impacts.length].slice();
        const actions = base.actions[(k + REGIONS.indexOf(region) * 3) % base.actions.length].slice();
        if (rank === 3 && actions.length === 1) {
          const extra = ['build', 'move', 'battle', 'tax', 'gift', 'betray'].find((x) => !actions.includes(x) && (suit !== 'economic' || x !== 'battle'));
          actions.push(extra);
        }
        const roleList = ROLES[suit][rank - 1];
        const role = roleList[(REGIONS.indexOf(region) + k) % roleList.length];
        const card = { id: ++id, kind: 'court', name: `${REGION_INFO[region].name} ${role}`, suit, rank, region, impacts, actions, patriot: null, prize: null };
        // Patriots: some political cards are tied to a coalition; prizes: some cards are worth keeping when betrayed.
        if (suit === 'political' && k >= 2) card.patriot = COALITIONS[(REGIONS.indexOf(region) + k) % 3];
        if ((suit === 'military' || suit === 'intelligence') && k === 3) card.prize = COALITIONS[(REGIONS.indexOf(region) + (suit === 'military' ? 1 : 2)) % 3];
        cards.push(card);
      });
    }
  }
  // Make names unique.
  const seen = {};
  for (const c of cards) { seen[c.name] = (seen[c.name] || 0) + 1; if (seen[c.name] > 1) c.name += ` ${['', '', 'II', 'III', 'IV'][seen[c.name]]}`; }
  rng.next();
  return cards;
}

// Original events, built like the published ones: an effect if purchased, and one if discarded from the market.
export const EVENTS = [
  { key: 'caravans', name: 'Caravan Season', purchased: 'Gain 3 rupees.', discarded: 'Every player gains 1 rupee.' },
  { key: 'skirmish', name: 'Border Skirmish', purchased: 'Military becomes the favored suit.', discarded: 'Remove one army from the region with the most armies.' },
  { key: 'durbar', name: 'Grand Durbar', purchased: 'Political becomes the favored suit.', discarded: 'Each player with a political card in court gains 1 rupee.' },
  { key: 'whispers', name: 'Whispers in the Bazaar', purchased: 'Intelligence becomes the favored suit.', discarded: 'Every spy on the board returns to its owner.' },
  { key: 'boom', name: 'Market Boom', purchased: 'Economic becomes the favored suit.', discarded: 'Place 1 rupee on each card in the top market row.' },
  { key: 'amnesty', name: 'Amnesty', purchased: 'Place a tribe in any region.', discarded: 'Nothing happens.' },
];
