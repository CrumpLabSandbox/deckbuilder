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
  {
    slug: 'pips',
    title: 'Pips',
    tagline: 'A deckbuilder for two ordinary packs of cards.',
    description:
      'Suit is the job, rank is the size. Diamonds make money, Clubs draw, Spades cut junk, Hearts ' +
      'are points. Learn it in two minutes, play it in twenty with real cards, or deal a table here ' +
      'against bots. Comes with a printable rules sheet.',
    tags: ['2-4 players', 'real cards', 'printable rules', 'hot-seat', 'bots'],
    players: '2-4',
    length: '20 min',
    status: 'playable',
  },
  {
    slug: 'spite',
    title: 'Spite and Malice',
    tagline: 'The two-player competitive patience, also called Cat and Mouse.',
    description:
      'Empty your 20-card pay-off pile before your opponent does. Build shared piles from Ace to ' +
      'Queen, Kings wild, and use your four side stacks to bury what they need. Play against a bot ' +
      'or hot-seat with a friend.',
    tags: ['2 players', 'classic', 'bot', 'hot-seat'],
    players: '2',
    length: '15-25 min',
    status: 'playable',
  },
  {
    slug: 'bitflip',
    title: 'Bit Flip',
    tagline: 'Commit blocks to memory, or vote on what the world will ask for.',
    description:
      'A bag of white and black blocks, registers of 2, 3 and 4 bits, and goal cards the table ' +
      'votes on. Lock in a pattern and vote it true; flip a goal and overwrite everyone else\'s ' +
      'unfinished memory. 2-5 players, hot-seat or bots, balanced by simulation.',
    tags: ['2-5 players', 'original', 'printable rules', 'hot-seat', 'bots'],
    players: '2-5',
    length: '20 min',
    status: 'playable',
  },
  {
    slug: 'euchre',
    title: 'Euchre',
    tagline: 'The classic partnership trick-taker, with a coach at your elbow.',
    description:
      'You and your partner against two bots, standard rules: bowers, ordering up, going alone, ' +
      'stick the dealer, game to 10. A coach suggests every bid and play and says why, and there ' +
      'is a printable cheat sheet for the real table.',
    tags: ['4 players', 'classic', 'coach', 'bots', 'cheat sheet'],
    players: '1 + 3 bots',
    length: '15-25 min',
    status: 'playable',
  },
  {
    slug: 'take5',
    title: 'Take 5',
    tagline: 'Everyone plays at once; the sixth card takes the row.',
    description:
      'Based on 6 nimmt! 104 numbered cards, four rows, and simultaneous play. Lay the sixth card ' +
      'in a row and you take the five before it. Fewest bullheads when someone hits 66 wins. ' +
      '2-10 players against easy, normal or hard bots, or hot-seat.',
    tags: ['2-10 players', 'classic', 'bots', 'hot-seat'],
    players: '2-10',
    length: '15-25 min',
    status: 'playable',
  },
  {
    slug: 'fox',
    title: 'Fox in the Forest',
    tagline: 'A two-player trick-taker where winning too much loses.',
    description:
      'Based on The Fox in the Forest by Joshua Buergel. Three suits, a decree card for trump, and ' +
      'odd cards with powers: Swan, Fox, Woodcutter, Treasure, Witch, Monarch. Humble or Victorious ' +
      'both score; Greedy scores nothing. Against an easy, normal or hard bot, or hot-seat.',
    tags: ['2 players', 'trick-taking', 'bots', 'hot-seat', 'cheat sheet'],
    players: '2',
    length: '20-30 min',
    status: 'playable',
  },
  {
    slug: 'foxparty',
    title: 'Fox in the Forest: Party',
    tagline: 'An experimental 4-5 player variant of the two-player trick-taker.',
    description:
      'One suit per player (adding Acorns and Stars), ten tricks a round, and scoring bands re-tuned ' +
      'by simulation so Humble, Victorious and Greedy all still matter with more people at the table. ' +
      'Hot-seat or bots; everyone deals once.',
    tags: ['4-5 players', 'variant', 'trick-taking', 'bots', 'hot-seat'],
    players: '4-5',
    length: '30-45 min',
    status: 'wip',
  },
  {
    slug: 'pamir',
    title: 'Pax Pamir',
    tagline: 'The Great Game, with a teaching mode that walks you through it.',
    description:
      'The Pax Pamir (Second Edition) rules on an original card set: a two-row market, courts, ' +
      'tribes and spies, rulers and bribes, three coalitions and four Dominance Checks. Teaching ' +
      'mode gives a guided tour, explains your options each turn, suggests a move and says why. ' +
      'Switch it off any time. You against 1-4 bots.',
    tags: ['2-5 players', 'teaching mode', 'bots', 'heavy'],
    players: '1 + 1-4 bots',
    length: '45-90 min',
    status: 'playable',
  },
];
