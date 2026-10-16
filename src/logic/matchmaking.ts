// logic/matchmaking.ts
import type { WaitingPlayer, MatchType, Level } from '../db/db';

export type MatchConfig = {
  playersPerMatch: number;
  matchType: MatchType;
  wGames: number;
  wWait: number;
  minRestMin: number;
};

export const DEFAULT_CONFIG: MatchConfig = {
  playersPerMatch: 4,
  matchType: 'doubles',
  wGames: 0,
  wWait: 1,
  minRestMin: 0,
};

export type PartnerMap = Record<number, number[]>;

const LEVEL_ORDER: Level[] = ['Beginner', 'Intermediate', 'Advance', 'Pro'];

function parseSqlDate(s: string): Date {
  return new Date(s.replace(' ', 'T') + 'Z');
}
export function minutesSince(sqlDate: string, now: Date): number {
  return Math.max(0, (now.getTime() - parseSqlDate(sqlDate).getTime()) / 60000);
}
export function winRate(p: WaitingPlayer): number {
  const total = p.total_wins + p.total_losses;
  return total === 0 ? 0.5 : p.total_wins / total;
}
export function isRested(p: WaitingPlayer, now: Date, minRestMin: number): boolean {
  if (minRestMin <= 0 || !p.last_finished) return true;
  return minutesSince(p.last_finished, now) >= minRestMin;
}

export function priorityScore(p: WaitingPlayer, maxGames: number, now: Date, cfg: MatchConfig): number {
  const gamesDeficit = maxGames - p.games_played;
  const waitMin = minutesSince(p.waiting_since, now);
  return cfg.wGames * gamesDeficit + cfg.wWait * waitMin;
}

export function sortByPriority(pool: WaitingPlayer[], now: Date, cfg: MatchConfig): WaitingPlayer[] {
  const maxGames = pool.reduce((m, p) => Math.max(m, p.games_played), 0);
  return [...pool].sort((a, b) => {
    const diff = priorityScore(b, maxGames, now, cfg) - priorityScore(a, maxGames, now, cfg);
    if (diff !== 0) return diff;
    return parseSqlDate(a.waiting_since).getTime() - parseSqlDate(b.waiting_since).getTime();
  });
}

export function tiersByDistanceFrom(level: Level): Level[] {
  const anchorIdx = LEVEL_ORDER.indexOf(level);
  return LEVEL_ORDER.filter((l) => l !== level).sort((a, b) => {
    const da = Math.abs(LEVEL_ORDER.indexOf(a) - anchorIdx);
    const dbb = Math.abs(LEVEL_ORDER.indexOf(b) - anchorIdx);
    if (da !== dbb) return da - dbb;
    return LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b);
  });
}

// Order candidates for the anchor: closest today-win count first, then avoid
// recent group-mates, then keep the wait order (the list comes in wait order).
function orderForAnchor(list: WaitingPlayer[], anchor: WaitingPlayer, avoid: Set<number>): WaitingPlayer[] {
  return list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const da = Math.abs(a.p.session_wins - anchor.session_wins);
      const db = Math.abs(b.p.session_wins - anchor.session_wins);
      if (da !== db) return da - db;                       // nearest win count
      const aa = avoid.has(a.p.player_id) ? 1 : 0;
      const bb = avoid.has(b.p.player_id) ? 1 : 0;
      if (aa !== bb) return aa - bb;                       // not-recently-grouped first
      return a.i - b.i;                                    // longest wait first
    })
    .map((x) => x.p);
}

export function selectGroup(
  sorted: WaitingPlayer[],
  need: number,
  recent: PartnerMap = {}
): WaitingPlayer[] | null {
  if (sorted.length < need) return null;
  const anchor = sorted[0]; // longest-waiting player leads the next match
  const avoid = new Set(recent[anchor.player_id] ?? []);
  const group = [anchor];

  // Custom-group cohesion: keep a manually-grouped set together.
  if (anchor.group_id != null) {
    for (const p of sorted) {
      if (p !== anchor && p.group_id === anchor.group_id) {
        group.push(p);
        if (group.length === need) return group;
      }
    }
  }

  // Same level first, ordered by closeness of TODAY's wins to the anchor.
  const sameLevel = orderForAnchor(sorted.filter((p) => p.level === anchor.level && !group.includes(p)), anchor, avoid);
  for (const p of sameLevel) { group.push(p); if (group.length === need) return group; }

  // Spillover to nearest levels only when short, same win-closeness ordering.
  for (const lvl of tiersByDistanceFrom(anchor.level)) {
    const tier = orderForAnchor(sorted.filter((p) => p.level === lvl && !group.includes(p)), anchor, avoid);
    for (const p of tier) { group.push(p); if (group.length === need) return group; }
  }
  return group.length === need ? group : null;
}

function avgWinRate(team: WaitingPlayer[]): number {
  return team.reduce((s, p) => s + winRate(p), 0) / team.length;
}

function repeatPairs(t1: WaitingPlayer[], t2: WaitingPlayer[], partners: PartnerMap): number {
  const paired = (a: WaitingPlayer, b: WaitingPlayer) => (partners[a.player_id]?.includes(b.player_id) ? 1 : 0);
  let c = 0;
  if (t1.length === 2) c += paired(t1[0], t1[1]);
  if (t2.length === 2) c += paired(t2[0], t2[1]);
  return c;
}

export function balanceTeams(group: WaitingPlayer[], partners: PartnerMap = {}): { team1: WaitingPlayer[]; team2: WaitingPlayer[] } {
  if (group.length === 2) return { team1: [group[0]], team2: [group[1]] };
  const [a, b, c, d] = group;
  const splits: [WaitingPlayer[], WaitingPlayer[]][] = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
  let best = splits[0];
  let bestRep = Infinity;
  let bestDiff = Infinity;
  for (const [t1, t2] of splits) {
    const rep = repeatPairs(t1, t2, partners);
    const diff = Math.abs(avgWinRate(t1) - avgWinRate(t2));
    if (rep < bestRep || (rep === bestRep && diff < bestDiff)) {
      best = [t1, t2];
      bestRep = rep;
      bestDiff = diff;
    }
  }
  return { team1: best[0], team2: best[1] };
}

export type MatchPlan = { team1: WaitingPlayer[]; team2: WaitingPlayer[] };

export function planAutoQueue(
  pool: WaitingPlayer[],
  openCourtCount: number,
  now: Date,
  cfg: MatchConfig = DEFAULT_CONFIG,
  recent: PartnerMap = {}
): MatchPlan[] {
  const eligible = pool.filter((p) => isRested(p, now, cfg.minRestMin));
  let sorted = sortByPriority(eligible, now, cfg);
  const plans: MatchPlan[] = [];
  for (let court = 0; court < openCourtCount; court++) {
    if (sorted.length < cfg.playersPerMatch) break;
    const group = selectGroup(sorted, cfg.playersPerMatch, recent);
    if (!group) break;
    plans.push(balanceTeams(group, recent));
    const chosen = new Set(group.map((p) => p.player_id));
    sorted = sorted.filter((p) => !chosen.has(p.player_id));
  }
  return plans;
}

export function previewNextUp(
  pool: WaitingPlayer[],
  now: Date,
  cfg: MatchConfig = DEFAULT_CONFIG,
  recent: PartnerMap = {},
  openCourtCount = 1
): WaitingPlayer[] {
  const plans = planAutoQueue(pool, Math.max(1, openCourtCount), now, cfg, recent);
  if (plans.length === 0) return [];
  return [...plans[0].team1, ...plans[0].team2];
}