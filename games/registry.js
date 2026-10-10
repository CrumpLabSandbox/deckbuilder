// Every game on the platform. The hub reads this to build its menu.
// To add a game: create games/<slug>/index.html and add an entry here.
export const GAMES = [
  {
    slug: 'ashfall',
    title: 'Ashfall',
    tagline: 'Twelve days to save an island before the mountain buries it.',
    description:
      'A solo deckbuilder. Build an engine from guild cards, chase Relics for points, ' +
      'and survive the daily Omens. The market changes with each Age, so what you ' +
      'do not buy now is gone for good.',
    tags: ['solo', '12 turns', 'ages', 'daily seed'],
    players: '1',
    length: '10-15 min',
    status: 'playable',
  },
  {
    slug: 'tenure',
    title: 'Tenure',
    tagline: 'Research, Teaching, Service, Prestige. Pick a lane, or pick four.',
    description:
      'A 2-4 player deckbuilder about academic life, hot-seat or against bots. Publish cards ' +
      'to your CV for seniority, drop committee work on the juniors, and race for first-come ' +
      'Honors. Eight asymmetric roles, from Graduate Student to Provost, balanced by simulation.',
    tags: ['2-4 players', 'hot-seat', 'bots', 'asymmetric roles'],
    players: '2-4',
    length: '20-30 min',
    status: 'playable',
  },
];
