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
];
