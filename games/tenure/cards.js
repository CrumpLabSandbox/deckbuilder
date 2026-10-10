// Card, role and honor definitions for Tenure.
// Effect functions receive (G, a, self) where `a` is the engine's effect API for the active player.

export const TRACKS = ['research', 'teaching', 'service', 'prestige'];
export const TRACK_INFO = {
  research: { name: 'Research', glyph: '🔬', short: 'R' },
  teaching: { name: 'Teaching', glyph: '📚', short: 'T' },
  service: { name: 'Service', glyph: '🏛️', short: 'S' },
  prestige: { name: 'Prestige', glyph: '🏆', short: 'P' },
};
export const HAND_SIZE = 5;
export const MAX_YEARS = 10;
export const HONORS_TO_WIN = 5;
export const ROW_SIZE = 5;
export const ERA_YEARS = { 1: 1, 2: 4, 3: 7 }; // the year each era's deck becomes the draw source

const C = {};
function def(id, card) { C[id] = { id, icons: [], ...card }; }

// ---------- Starting cards (never in the row) ----------
def('coffee', { name: 'Coffee', cost: 0, text: '+1 Effort.', effect(G, a) { a.energy(1); } });
def('budget', { name: 'Budget Line', cost: 0, text: '+2 Effort.', effect(G, a) { a.energy(2); } });
def('pilot', { name: 'Pilot Study', cost: 0, icons: ['research'], text: '+1 Research.', effect(G, a) { a.pts('research', 1); } });
def('notes', { name: 'Lecture Notes', cost: 0, icons: ['teaching'], text: '+1 Teaching.', effect(G, a) { a.pts('teaching', 1); } });
def('memo', { name: 'Memo', cost: 0, icons: ['service'], text: '+1 Service.', effect(G, a) { a.pts('service', 1); } });
def('gala', { name: 'Gala Invitation', cost: 0, icons: ['prestige'], text: '+1 Prestige.', effect(G, a) { a.pts('prestige', 1); } });
def('email', { name: 'Email', cost: 0, text: 'Does nothing. Cannot be published. Someone put you on a committee.', effect() {}, junk: true });

// ---------- Basics (always available) ----------
def('ra', { name: 'Research Assistant', cost: 3, icons: ['research'], basic: true,
  text: '+2 Effort.', effect(G, a) { a.energy(2); } });
def('ta', { name: 'Teaching Assistant', cost: 3, icons: ['teaching'], basic: true,
  text: '+1 Effort, +1 Teaching.', effect(G, a) { a.energy(1); a.pts('teaching', 1); } });
def('grant', { name: 'Grant', cost: 6, icons: ['research'], basic: true,
  text: '+3 Effort, +1 Research.', effect(G, a) { a.energy(3); a.pts('research', 1); } });
def('sabbatical', { name: 'Sabbatical', cost: 7, icons: [], basic: true,
  text: '+1 to every track. Draw a card.', effect(G, a) { for (const t of TRACKS) a.pts(t, 1); a.draw(1); } });

// ---------- Era I (cost 2-4) ----------
def('seminar', { name: 'Seminar', era: 1, cost: 2, icons: ['teaching'],
  text: '+2 Teaching, +1 Effort. Share 📚: each opponent with at least as many 📚 on their CV as you also gets +1 Teaching; if anyone did, draw a card.',
  effect(G, a) { a.pts('teaching', 2); a.energy(1); a.share('teaching', (o) => a.ptsTo(o, 'teaching', 1)); } });
def('office_hours', { name: 'Office Hours', era: 1, cost: 2, icons: ['teaching'],
  text: '+1 Teaching, +1 Effort.', effect(G, a) { a.pts('teaching', 1); a.energy(1); } });
def('faculty_meeting', { name: 'Faculty Meeting', era: 1, cost: 2, icons: ['service'],
  text: '+1 Service, +1 Effort. Demand 🏛️: each opponent with fewer 🏛️ on their CV than you discards a card.',
  effect(G, a) { a.pts('service', 1); a.energy(1); a.demand('service', (o) => a.discardWorst(o)); } });
def('press', { name: 'Press Release', era: 1, cost: 3, icons: ['prestige'],
  text: '+1 Prestige, +1 Effort. Draw a card if you have a 🏆 on your CV.',
  effect(G, a) { a.pts('prestige', 1); a.energy(1); if (a.cvIcons('prestige') >= 1) a.draw(1); } });
def('notebook', { name: 'Lab Notebook', era: 1, cost: 3, icons: ['research'],
  text: '+1 Research. Draw a card.', effect(G, a) { a.pts('research', 1); a.draw(1); } });
def('committee', { name: 'Committee Assignment', era: 1, cost: 3, icons: ['service'],
  text: '+2 Service. Demand 🏛️: each opponent with fewer 🏛️ on their CV than you gains an Email.',
  effect(G, a) { a.pts('service', 2); a.demand('service', (o) => a.gainCard(o, 'email')); } });
def('syllabus', { name: 'Syllabus', era: 1, cost: 3, icons: ['teaching'],
  text: '+2 Teaching. On your CV: +1 Teaching at the start of your turn.',
  effect(G, a) { a.pts('teaching', 2); }, onTurnStart(G, a) { a.pts('teaching', 1); } });
def('journal_club', { name: 'Journal Club', era: 1, cost: 3, icons: ['research'],
  text: '+1 Research per 🔬 you have (CV and in play, max 4).',
  effect(G, a) { a.pts('research', Math.min(4, a.icons('research'))); } });
def('talk', { name: 'Conference Talk', era: 1, cost: 4, icons: ['prestige'],
  text: '+1 Prestige, +1 Prestige per 🔬 you have (max 2).',
  effect(G, a) { a.pts('prestige', 1 + Math.min(2, a.icons('research'))); } });
def('inbox', { name: 'Inbox Zero', era: 1, cost: 2, icons: ['service'],
  text: '+1 Effort. Trash up to 2 cards from your hand.',
  effect(G, a) {
    a.energy(1);
    a.prompt({ text: 'Inbox Zero: trash up to 2 cards from your hand.', cards: a.hand(), min: 0, max: 2, okLabel: 'Trash',
      resolve(chosen) { for (const u of chosen) a.trashFromHand(u); } });
  } });

// ---------- Era II (cost 4-6) ----------
def('proposal', { name: 'Grant Proposal', era: 2, cost: 5, icons: ['research'],
  text: '+3 Effort, +1 Research. Share 🔬: opponents with at least as many 🔬 on their CV as you get +1 Research; if anyone did, draw a card.',
  effect(G, a) { a.energy(3); a.pts('research', 1); a.share('research', (o) => a.ptsTo(o, 'research', 1)); } });
def('textbook', { name: 'Textbook', era: 2, cost: 5, icons: ['teaching'],
  text: '+3 Teaching. On your CV: +1 Teaching and +1 Effort at the start of your turn.',
  effect(G, a) { a.pts('teaching', 3); }, onTurnStart(G, a) { a.pts('teaching', 1); a.energy(1); } });
def('search', { name: 'Search Committee', era: 2, cost: 5, icons: ['service'],
  text: '+2 Service. Demand 🏛️: each opponent with fewer 🏛️ on their CV than you loses 1 point from their highest track; if anyone did, +1 Service.',
  effect(G, a) { a.pts('service', 2); if (a.demand('service', (o) => a.loseHighest(o, 1))) a.pts('service', 1); } });
def('keynote', { name: 'Keynote', era: 2, cost: 6, icons: ['prestige'],
  text: '+2 Prestige, +1 Prestige per 4 Research you have (max 3).',
  effect(G, a) { a.pts('prestige', 2 + Math.min(3, Math.floor(a.points('research') / 4))); } });
def('lab', { name: 'Laboratory', era: 2, cost: 6, icons: ['research'],
  text: '+3 Research. Draw 2 cards.', effect(G, a) { a.pts('research', 3); a.draw(2); } });
def('mentorship', { name: 'Mentorship', era: 2, cost: 5, icons: ['teaching', 'research'],
  text: '+1 Teaching, +1 Research. +1 of each if you have 2 or more 📚.',
  effect(G, a) { const b = a.icons('teaching') >= 2 ? 2 : 1; a.pts('teaching', b); a.pts('research', b); } });
def('lunch', { name: "Dean's Lunch", era: 2, cost: 4, icons: ['service', 'prestige'],
  text: '+1 Service, +1 Prestige, +1 Effort.', effect(G, a) { a.pts('service', 1); a.pts('prestige', 1); a.energy(1); } });
def('reform', { name: 'Curriculum Reform', era: 2, cost: 5, icons: ['teaching', 'service'],
  text: '+3 Teaching. Demand 📚: each opponent with fewer 📚 on their CV than you loses 1 Teaching.',
  effect(G, a) { a.pts('teaching', 3); a.demand('teaching', (o) => a.ptsTo(o, 'teaching', -1)); } });
def('review', { name: 'Peer Review', era: 2, cost: 4, icons: ['research', 'service'],
  text: '+1 Research, +1 Service. Demand 🔬: each opponent with fewer 🔬 on their CV than you loses 1 Research.',
  effect(G, a) { a.pts('research', 1); a.pts('service', 1); a.demand('research', (o) => a.ptsTo(o, 'research', -1)); } });
def('alumni', { name: 'Alumni Dinner', era: 2, cost: 5, icons: ['prestige'],
  text: '+1 Prestige, +2 Effort. On your CV: +1 Effort at the start of your turn.',
  effect(G, a) { a.pts('prestige', 1); a.energy(2); }, onTurnStart(G, a) { a.energy(1); } });

// ---------- Era III (cost 6-8) ----------
def('endowed', { name: 'Endowed Lecture', era: 3, cost: 7, icons: ['teaching', 'prestige'],
  text: '+3 Teaching, +2 Prestige.', effect(G, a) { a.pts('teaching', 3); a.pts('prestige', 2); } });
def('nobel', { name: 'Prize Nomination', era: 3, cost: 8, icons: ['prestige'],
  text: '+2 Prestige, +1 Prestige per 🔬 and 🏆 you have (max 5).',
  effect(G, a) { a.pts('prestige', 2 + Math.min(5, a.icons('research') + a.icons('prestige'))); } });
def('center', { name: 'Center Director', era: 3, cost: 7, icons: ['service', 'research'],
  text: '+2 Service, +2 Research. Demand 🏛️: each opponent with fewer 🏛️ on their CV than you gives you 1 Research.',
  effect(G, a) { a.pts('service', 2); a.pts('research', 2); a.demand('service', (o) => { if (a.ptsTo(o, 'research', -1)) a.pts('research', 1); }); } });
def('legacy', { name: 'Legacy', era: 3, cost: 6, icons: ['prestige'],
  text: '+1 Prestige. Draw a card. On your CV at game end: +1 Prestige per 2 cards on your CV.',
  effect(G, a) { a.pts('prestige', 1); a.draw(1); }, onGameEnd(G, a, p) { a.ptsTo(p, 'prestige', Math.floor(p.cv.length / 2)); } });
def('breakthrough', { name: 'Breakthrough', era: 3, cost: 7, icons: ['research'],
  text: '+3 Research, +1 Research per 🔬 you have (max 5).',
  effect(G, a) { a.pts('research', 3 + Math.min(5, a.icons('research'))); } });
def('favor', { name: "Provost's Favor", era: 3, cost: 6, icons: ['service'],
  text: '+2 Service, +2 Effort. Share 🏛️: opponents with at least as many 🏛️ on their CV as you get +1 Service; if anyone did, +1 Prestige.',
  effect(G, a) { a.pts('service', 2); a.energy(2); a.share('service', (o) => a.ptsTo(o, 'service', 1), () => a.pts('prestige', 1)); } });
def('mooc', { name: 'Online Course', era: 3, cost: 6, icons: ['teaching'],
  text: '+3 Teaching, +1 Teaching per 📚 you have (max 4).',
  effect(G, a) { a.pts('teaching', 3 + Math.min(4, a.icons('teaching'))); } });
def('upress', { name: 'University Press', era: 3, cost: 7, icons: ['research', 'teaching'],
  text: '+2 Research, +2 Teaching. Draw a card.', effect(G, a) { a.pts('research', 2); a.pts('teaching', 2); a.draw(1); } });
def('strategic_plan', { name: 'Strategic Plan', era: 3, cost: 6, icons: ['service', 'prestige'],
  text: '+2 Service, +1 Prestige. Demand 🏛️: each opponent with fewer 🏛️ on their CV than you discards a card and gains an Email.',
  effect(G, a) { a.pts('service', 2); a.pts('prestige', 1); a.demand('service', (o) => { a.discardWorst(o); a.gainCard(o, 'email'); }); } });

export const CARDS = C;
export const BASICS = ['ra', 'ta', 'grant', 'sabbatical'];
export const ERA_DECKS = {
  1: Object.values(C).filter(c => c.era === 1).map(c => c.id),
  2: Object.values(C).filter(c => c.era === 2).map(c => c.id),
  3: Object.values(C).filter(c => c.era === 3).map(c => c.id),
};
export const COPIES = 2; // copies of each row card per era deck

// ---------- Honors ----------
// Claimed first-come, one per turn. Five Honors wins immediately.
export const HONORS = [
  { id: 'r1', name: 'First Paper', track: 'research', need: { research: 8 }, value: 4 },
  { id: 'r2', name: 'Major Grant', track: 'research', need: { research: 13 }, value: 6 },
  { id: 'r3', name: 'Field-Defining Work', track: 'research', need: { research: 20 }, value: 8 },
  { id: 't1', name: 'Teaching Award', track: 'teaching', need: { teaching: 9 }, value: 4 },
  { id: 't2', name: 'Full Classroom', track: 'teaching', need: { teaching: 14 }, value: 6 },
  { id: 't3', name: 'Beloved Professor', track: 'teaching', need: { teaching: 21 }, value: 8 },
  { id: 's1', name: 'Committee Chair', track: 'service', need: { service: 8 }, value: 4 },
  { id: 's2', name: 'Faculty Senate', track: 'service', need: { service: 13 }, value: 6 },
  { id: 's3', name: 'Pillar of the University', track: 'service', need: { service: 20 }, value: 8 },
  { id: 'p1', name: 'Local Notable', track: 'prestige', need: { prestige: 7 }, value: 4 },
  { id: 'p2', name: 'National Name', track: 'prestige', need: { prestige: 11 }, value: 6 },
  { id: 'p3', name: 'Household Name', track: 'prestige', need: { prestige: 16 }, value: 8 },
  { id: 'x_tenure', name: 'Tenure', special: true, need: { teaching: 10, service: 10 }, value: 6 },
  { id: 'x_star', name: 'Rising Star', special: true, need: { research: 10, prestige: 8 }, value: 6 },
  { id: 'x_public', name: 'Public Intellectual', special: true, need: { teaching: 8, prestige: 10 }, value: 6 },
  { id: 'x_builder', name: 'Lab Builder', special: true, need: { research: 8, service: 10 }, value: 6 },
  { id: 'x_renaissance', name: 'Renaissance Scholar', special: true, need: { research: 9, teaching: 9, service: 9, prestige: 9 }, value: 6 },
];
export const HONOR_BY_ID = Object.fromEntries(HONORS.map(h => [h.id, h]));

// ---------- Roles ----------
// Each role: starting deck, starting CV icons, starting points, hand size, and a perk.
export const ROLES = {
  student: { name: 'Graduate Student', hand: 6, cv: [], points: {},
    deck: { coffee: 7, pilot: 2, notes: 1 },
    perk: 'Hungry: your hand is 6 cards. Nobody expects anything of you yet: demands cannot make you discard or gain Emails.', shieldJunk: true },
  postdoc: { name: 'Postdoc', hand: 5, cv: ['research', 'research'], points: { research: 4 },
    deck: { coffee: 5, pilot: 3, budget: 2 },
    perk: 'Cards with 🔬 cost you 1 less.', discount: (card) => card.icons.includes('research') ? 1 : 0 },
  adjunct: { name: 'Adjunct', hand: 5, cv: ['teaching', 'teaching'], points: { teaching: 5 },
    deck: { coffee: 5, notes: 5 },
    perk: 'Whenever you play a card with 📚, +1 Teaching (at most twice per turn).',
    onPlay: (card, a, ts) => { if (card.icons.includes('teaching') && (ts.adjunct || 0) < 2) { ts.adjunct = (ts.adjunct || 0) + 1; a.pts('teaching', 1); } } },
  faculty: { name: 'Assistant Professor', hand: 5, cv: ['research', 'teaching'], points: { research: 2, teaching: 2 },
    deck: { coffee: 6, notes: 2, pilot: 2 },
    perk: 'Whenever you publish a card, +1 point in the track of its first icon and draw a card.',
    onPublish: (card, a) => { if (card.icons[0]) a.pts(card.icons[0], 1); a.draw(1); } },
  chair: { name: 'Department Chair', hand: 5, cv: ['service', 'service'], points: { service: 1 },
    deck: { coffee: 5, memo: 3, notes: 1, budget: 1 },
    perk: 'Whenever you play a card with 🏛️, +1 Effort (at most twice per turn).',
    onPlay: (card, a, ts) => { if (card.icons.includes('service') && (ts.chair || 0) < 2) { ts.chair = (ts.chair || 0) + 1; a.energy(1); } } },
  dean: { name: 'Dean', hand: 5, cv: ['service', 'prestige'], points: { service: 2, prestige: 2 },
    deck: { coffee: 4, budget: 3, memo: 2, gala: 1 },
    perk: 'Journal cards (not the basics) cost you 1 less.', discount: (card) => card.basic ? 0 : 1 },
  provost: { name: 'Provost', hand: 5, cv: ['prestige', 'service'], points: { prestige: 3, service: 1 },
    deck: { coffee: 4, budget: 3, gala: 2, memo: 1 },
    perk: 'Tenured: demands never affect you.', immune: true },
  coach: { name: 'Head Coach', hand: 5, cv: ['prestige'], points: { prestige: 3 },
    deck: { coffee: 5, budget: 3, gala: 2 },
    perk: 'Booster Club: +1 Effort at the start of your turn.',
    onTurnStart: (a) => a.energy(1) },
};
