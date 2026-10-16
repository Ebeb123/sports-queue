// ---------------------------------------------------------------------------
// DEMO DATA  (web demo only)
// ---------------------------------------------------------------------------
// Fills an empty database with fictional players and a few finished games so
// portfolio visitors see a working queue straight away. Every name is made up.
// ---------------------------------------------------------------------------
import { addPlayer, getAllPlayers, enqueuePlayer, getQueue, getCourts, createMatch, endMatch, type Level } from './db';

const DEMO_PLAYERS: [string, Level][] = [
  ['Shuttle Sam', 'Pro'], ['Smash Sofia', 'Pro'], ['Dropshot Dan', 'Advance'], ['Net Nina', 'Advance'],
  ['Lob Leo', 'Intermediate'], ['Rally Rina', 'Intermediate'], ['Clear Carlo', 'Intermediate'], ['Drive Dina', 'Advance'],
  ['Spin Paolo', 'Beginner'], ['Serve Sarah', 'Beginner'], ['Feint Fely', 'Intermediate'], ['Killshot Ken', 'Pro'],
  ['Block Bea', 'Beginner'], ['Push Pia', 'Intermediate'], ['Flick Felix', 'Advance'], ['Wristy Wes', 'Beginner'],
];

export function seedDemoIfEmpty(): boolean {
  if (getAllPlayers().length > 0) return false;

  DEMO_PLAYERS.forEach(([name, level]) => addPlayer(name, level));
  const players = getAllPlayers();
  const byName = (n: string) => players.find((p) => p.name === n)!.player_id;

  // 12 of the 16 players checked in tonight
  DEMO_PLAYERS.slice(0, 12).forEach(([name]) => enqueuePlayer(byName(name)));

  const courts = getCourts();
  const court1 = courts[0].court_id;
  const court2 = courts.length > 1 ? courts[1].court_id : court1;

  // A few finished games so the win/loss stats aren't empty
  const games: [string[], string[], 1 | 2][] = [
    [['Shuttle Sam', 'Lob Leo'], ['Smash Sofia', 'Rally Rina'], 2],
    [['Dropshot Dan', 'Net Nina'], ['Clear Carlo', 'Drive Dina'], 1],
    [['Killshot Ken', 'Serve Sarah'], ['Spin Paolo', 'Feint Fely'], 1],
    [['Smash Sofia', 'Drive Dina'], ['Shuttle Sam', 'Net Nina'], 1],
  ];
  games.forEach(([t1, t2, win], i) => {
    const id = createMatch(i % 2 === 0 ? court1 : court2, 'doubles', t1.map(byName), t2.map(byName));
    endMatch(id, win);
  });

  // One game in progress right now on Court 1
  createMatch(court1, 'doubles', [byName('Lob Leo'), byName('Rally Rina')], [byName('Clear Carlo'), byName('Feint Fely')]);

  return getQueue().length > 0;
}
