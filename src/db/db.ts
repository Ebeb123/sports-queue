// db/db.ts
import * as SQLite from 'expo-sqlite';

// ============================ Types ============================
export const LEVELS = ['Beginner', 'Intermediate', 'Advance', 'Pro'] as const;
export type Level = (typeof LEVELS)[number];

export type QueueStatus = 'waiting' | 'playing' | 'paused' | 'resting' | 'left';
export type CourtStatus = 'open' | 'occupied' | 'closed';
export type MatchType = 'singles' | 'doubles';

export type Player = {
  player_id: number;
  name: string;
  level: Level;
  total_wins: number;
  total_losses: number;
};

// Row for the matchmaking engine (waiting players only).
export type WaitingPlayer = {
  entry_id: number;
  player_id: number;
  name: string;
  level: Level;
  total_wins: number;
  total_losses: number;
  waiting_since: string;
  games_played: number;
  last_finished: string | null;
};

// Row for the Queue screen (any active status).
export type QueueRow = {
  entry_id: number;
  player_id: number;
  name: string;
  level: Level;
  status: QueueStatus;
  waiting_since: string;
  games_played: number;
};

export type Court = {
  court_id: number;
  name: string;
  status: CourtStatus;
  current_match_id: number | null;
};

// ============================ Open DB ============================
const db = SQLite.openDatabaseSync('queue.db');

// ============================ Schema ============================
const SCHEMA_VERSION = 1;

export function initDatabase(): void {
  db.execSync('PRAGMA journal_mode = WAL;');
  db.execSync('PRAGMA foreign_keys = ON;');

  // players is preserved across schema changes — never dropped.
  db.execSync(`
    CREATE TABLE IF NOT EXISTS players (
      player_id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      level        TEXT NOT NULL
                     CHECK (level IN ('Beginner','Intermediate','Advance','Pro')),
      total_wins   INTEGER NOT NULL DEFAULT 0,
      total_losses INTEGER NOT NULL DEFAULT 0
    );
  `);

  // One-time migration: drop any stale queue tables (e.g. an old `sessions`
  // table without `status`) and rebuild them. Runs once; user_version gates
  // it off afterward. Does NOT touch players.
  const versionRow = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionRow ? versionRow.user_version : 0;
  if (currentVersion < SCHEMA_VERSION) {
    db.execSync(`
      DROP TABLE IF EXISTS match_players;
      DROP TABLE IF EXISTS matches;
      DROP TABLE IF EXISTS queue_entries;
      DROP TABLE IF EXISTS courts;
      DROP TABLE IF EXISTS sessions;
    `);
    db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }

  db.execSync(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at   TEXT,
      status     TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','ended'))
    );

    CREATE TABLE IF NOT EXISTS courts (
      court_id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','occupied','closed')),
      current_match_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS queue_entries (
      entry_id      INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    INTEGER NOT NULL REFERENCES sessions(session_id),
      player_id     INTEGER NOT NULL REFERENCES players(player_id),
      status        TEXT NOT NULL DEFAULT 'waiting'
                      CHECK (status IN ('waiting','playing','paused','resting','left')),
      waiting_since TEXT NOT NULL DEFAULT (datetime('now')),
      games_played  INTEGER NOT NULL DEFAULT 0,
      last_finished TEXT,
      UNIQUE (session_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      match_id     INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   INTEGER NOT NULL REFERENCES sessions(session_id),
      court_id     INTEGER NOT NULL REFERENCES courts(court_id),
      match_type   TEXT NOT NULL DEFAULT 'doubles'
                     CHECK (match_type IN ('singles','doubles')),
      status       TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','completed','cancelled')),
      started_at   TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at     TEXT,
      winning_team INTEGER
    );

    CREATE TABLE IF NOT EXISTS match_players (
      match_id  INTEGER NOT NULL REFERENCES matches(match_id),
      player_id INTEGER NOT NULL REFERENCES players(player_id),
      team      INTEGER NOT NULL CHECK (team IN (1,2)),
      PRIMARY KEY (match_id, player_id)
    );
  `);

  ensureActiveSession();
  seedCourtsIfEmpty();
}

// ============================ Session bootstrap ============================
export function getActiveSessionId(): number {
  const row = db.getFirstSync<{ session_id: number }>(
    `SELECT session_id FROM sessions WHERE status = 'active'
     ORDER BY session_id DESC LIMIT 1`
  );
  return row ? row.session_id : ensureActiveSession();
}

function ensureActiveSession(): number {
  const existing = db.getFirstSync<{ session_id: number }>(
    `SELECT session_id FROM sessions WHERE status = 'active'
     ORDER BY session_id DESC LIMIT 1`
  );
  if (existing) return existing.session_id;
  const res = db.runSync(`INSERT INTO sessions (status) VALUES ('active')`);
  return res.lastInsertRowId as number;
}

function seedCourtsIfEmpty(): void {
  const row = db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM courts`);
  if (row && row.c === 0) {
    db.runSync(`INSERT INTO courts (name, status) VALUES ('Court 1', 'open')`);
    db.runSync(`INSERT INTO courts (name, status) VALUES ('Court 2', 'open')`);
  }
}

// ============================ Players ============================
export function addPlayer(name: string, level: Level): void {
  db.runSync(
    `INSERT INTO players (name, level, total_wins, total_losses)
     VALUES (?, ?, 0, 0)`,
    name,
    level
  );
}

export function getAllPlayers(): Player[] {
  return db.getAllSync<Player>(
    `SELECT player_id, name, level, total_wins, total_losses
     FROM players ORDER BY name COLLATE NOCASE`
  );
}

// ============================ Queue mutations ============================
export function enqueuePlayer(playerId: number): void {
  const sessionId = getActiveSessionId();
  db.runSync(
    `INSERT INTO queue_entries (session_id, player_id, status, waiting_since)
     VALUES (?, ?, 'waiting', datetime('now'))
     ON CONFLICT(session_id, player_id) DO UPDATE SET
       status = 'waiting',
       waiting_since = datetime('now')
     WHERE queue_entries.status = 'left'`,
    sessionId,
    playerId
  );
}

export function pausePlayer(entryId: number): void {
  // waiting_since intentionally unchanged, so priority is preserved.
  db.runSync(`UPDATE queue_entries SET status = 'paused' WHERE entry_id = ?`, entryId);
}

export function resumePlayer(entryId: number): void {
  db.runSync(`UPDATE queue_entries SET status = 'waiting' WHERE entry_id = ?`, entryId);
}

export function leaveQueue(entryId: number): void {
  db.runSync(`UPDATE queue_entries SET status = 'left' WHERE entry_id = ?`, entryId);
}

// ============================ Queue reads ============================
export function getQueue(): QueueRow[] {
  const sessionId = getActiveSessionId();
  return db.getAllSync<QueueRow>(
    `SELECT q.entry_id, q.player_id, p.name, p.level, q.status,
            q.waiting_since, q.games_played
     FROM queue_entries q
     JOIN players p ON p.player_id = q.player_id
     WHERE q.session_id = ? AND q.status != 'left'
     ORDER BY q.waiting_since ASC`,
    sessionId
  );
}

export function getWaitingPlayers(): WaitingPlayer[] {
  const sessionId = getActiveSessionId();
  return db.getAllSync<WaitingPlayer>(
    `SELECT q.entry_id, q.player_id, p.name, p.level,
            p.total_wins, p.total_losses,
            q.waiting_since, q.games_played, q.last_finished
     FROM queue_entries q
     JOIN players p ON p.player_id = q.player_id
     WHERE q.session_id = ? AND q.status = 'waiting'
     ORDER BY q.waiting_since ASC`,
    sessionId
  );
}

export function getPlayersNotQueued(): Player[] {
  const sessionId = getActiveSessionId();
  return db.getAllSync<Player>(
    `SELECT p.player_id, p.name, p.level, p.total_wins, p.total_losses
     FROM players p
     WHERE p.player_id NOT IN (
       SELECT player_id FROM queue_entries
       WHERE session_id = ?
         AND status IN ('waiting','paused','playing','resting')
     )
     ORDER BY p.name COLLATE NOCASE`,
    sessionId
  );
}

// ============================ Courts ============================
export function getCourts(): Court[] {
  return db.getAllSync<Court>(
    `SELECT court_id, name, status, current_match_id FROM courts ORDER BY court_id`
  );
}

export function getOpenCourts(): Court[] {
  return db.getAllSync<Court>(
    `SELECT court_id, name, status, current_match_id
     FROM courts WHERE status = 'open' ORDER BY court_id`
  );
}

// ============================ Matches ============================
export function createMatch(
  courtId: number,
  matchType: MatchType,
  team1: number[],
  team2: number[]
): number {
  const sessionId = getActiveSessionId();
  let matchId = 0;
  db.withTransactionSync(() => {
    const res = db.runSync(
      `INSERT INTO matches (session_id, court_id, match_type, status)
       VALUES (?, ?, ?, 'active')`,
      sessionId,
      courtId,
      matchType
    );
    matchId = res.lastInsertRowId as number;

    const place = (pid: number, team: number) => {
      db.runSync(
        `INSERT INTO match_players (match_id, player_id, team) VALUES (?, ?, ?)`,
        matchId,
        pid,
        team
      );
      db.runSync(
        `UPDATE queue_entries SET status = 'playing'
         WHERE session_id = ? AND player_id = ?`,
        sessionId,
        pid
      );
    };
    team1.forEach((pid) => place(pid, 1));
    team2.forEach((pid) => place(pid, 2));

    db.runSync(
      `UPDATE courts SET status = 'occupied', current_match_id = ?
       WHERE court_id = ?`,
      matchId,
      courtId
    );
  });
  return matchId;
}

// ============================ Init on import ============================
// Runs schema setup as soon as this module is first imported.
initDatabase();

export { db };

// ============================ Active matches + ending ============================
export type ActiveMatchTeamMember = { player_id: number; name: string };

export type ActiveMatch = {
  match_id: number;
  court_id: number;
  court_name: string;
  match_type: MatchType;
  started_at: string;
  team1: ActiveMatchTeamMember[];
  team2: ActiveMatchTeamMember[];
};

export function getActiveMatches(): ActiveMatch[] {
  const sessionId = getActiveSessionId();
  const rows = db.getAllSync<{
    match_id: number;
    court_id: number;
    court_name: string;
    match_type: MatchType;
    started_at: string;
  }>(
    `SELECT m.match_id, m.court_id, c.name AS court_name, m.match_type, m.started_at
     FROM matches m
     JOIN courts c ON c.court_id = m.court_id
     WHERE m.session_id = ? AND m.status = 'active'
     ORDER BY m.court_id`,
    sessionId
  );

  return rows.map((m) => {
    const members = db.getAllSync<{ player_id: number; name: string; team: number }>(
      `SELECT mp.player_id, p.name, mp.team
       FROM match_players mp
       JOIN players p ON p.player_id = mp.player_id
       WHERE mp.match_id = ?`,
      m.match_id
    );
    return {
      match_id: m.match_id,
      court_id: m.court_id,
      court_name: m.court_name,
      match_type: m.match_type,
      started_at: m.started_at,
      team1: members.filter((x) => x.team === 1).map(({ player_id, name }) => ({ player_id, name })),
      team2: members.filter((x) => x.team === 2).map(({ player_id, name }) => ({ player_id, name })),
    };
  });
}

// End a match: record the winner, update lifetime W/L, then re-queue every
// player as 'waiting' with games_played +1 and a fresh rest/wait timestamp,
// and free the court.
export function endMatch(matchId: number, winningTeam: 1 | 2): void {
  const sessionId = getActiveSessionId();
  db.withTransactionSync(() => {
    const match = db.getFirstSync<{ court_id: number }>(
      `SELECT court_id FROM matches WHERE match_id = ?`,
      matchId
    );

    const members = db.getAllSync<{ player_id: number; team: number }>(
      `SELECT player_id, team FROM match_players WHERE match_id = ?`,
      matchId
    );

    for (const mp of members) {
      const won = mp.team === winningTeam;
      db.runSync(
        `UPDATE players
         SET total_wins = total_wins + ?, total_losses = total_losses + ?
         WHERE player_id = ?`,
        won ? 1 : 0,
        won ? 0 : 1,
        mp.player_id
      );
      // Back into the queue: +1 game, reset wait clock, stamp finish time
      // (last_finished drives the minimum-rest filter in matchmaking).
      db.runSync(
        `UPDATE queue_entries
         SET status = 'waiting',
             games_played = games_played + 1,
             last_finished = datetime('now'),
             waiting_since = datetime('now')
         WHERE session_id = ? AND player_id = ?`,
        sessionId,
        mp.player_id
      );
    }

    db.runSync(
      `UPDATE matches
       SET status = 'completed', winning_team = ?, ended_at = datetime('now')
       WHERE match_id = ?`,
      winningTeam,
      matchId
    );

    if (match) {
      db.runSync(
        `UPDATE courts SET status = 'open', current_match_id = NULL WHERE court_id = ?`,
        match.court_id
      );
    }
  });
}

// ============================ Session reset + court management ============================

// Start a fresh session: end the current one, cancel any active matches,
// free all occupied courts, and open a new empty session. Lifetime W/L on
// players is untouched; per-session game counts reset because they live on
// the old session's queue_entries.
export function startNewSession(): number {
  let newId = 0;
  db.withTransactionSync(() => {
    db.runSync(
      `UPDATE matches SET status = 'cancelled', ended_at = datetime('now')
       WHERE status = 'active'`
    );
    db.runSync(
      `UPDATE courts
       SET status = CASE WHEN status = 'occupied' THEN 'open' ELSE status END,
           current_match_id = NULL`
    );
    db.runSync(
      `UPDATE sessions SET status = 'ended', ended_at = datetime('now')
       WHERE status = 'active'`
    );
    const res = db.runSync(`INSERT INTO sessions (status) VALUES ('active')`);
    newId = res.lastInsertRowId as number;
  });
  return newId;
}

export function addCourt(name: string): void {
  db.runSync(`INSERT INTO courts (name, status) VALUES (?, 'open')`, name);
}

export function setCourtStatus(courtId: number, status: CourtStatus): void {
  db.runSync(`UPDATE courts SET status = ? WHERE court_id = ?`, status, courtId);
}

// ============================ Settings (persisted config) ============================
import type { MatchConfig } from '../logic/matchmaking';

let settingsReady = false;

function ensureSettings(): void {
  if (settingsReady) return;
  db.execSync(
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`
  );
  const defaults: Record<string, string> = {
    players_per_match: '4',
    match_type: 'doubles',
    min_rest_min: '5',
    match_limit_min: '15',
  };
  for (const [k, v] of Object.entries(defaults)) {
    db.runSync(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, k, v);
  }
  settingsReady = true;
}

export function getAppConfig(): { matchConfig: MatchConfig; matchLimitMin: number } {
  ensureSettings();
  const rows = db.getAllSync<{ key: string; value: string }>(`SELECT key, value FROM settings`);
  const map: Record<string, string> = {};
  rows.forEach((r) => (map[r.key] = r.value));
  return {
    matchConfig: {
      playersPerMatch: 4,  // doubles
      matchType: 'doubles',
      wGames: 0,           // no games weighting — fairness is by wait time
      wWait: 1,            // longest waiting plays soonest
      minRestMin: 0,       // rest removed
    },
    matchLimitMin: parseInt(map.match_limit_min ?? '15', 10),
  };
}

// ---- Edit / delete players ----
export function updatePlayer(playerId: number, name: string, level: Level): void {
  db.runSync(`UPDATE players SET name = ?, level = ? WHERE player_id = ?`, name, level, playerId);
}

export function deletePlayer(playerId: number): { ok: boolean; reason?: string } {
  const inMatch = db.getFirstSync(
    `SELECT 1 FROM match_players mp
     JOIN matches m ON m.match_id = mp.match_id
     WHERE mp.player_id = ? AND m.status = 'active' LIMIT 1`,
    playerId
  );
  if (inMatch) return { ok: false, reason: 'This player is in an active match. End the match first.' };

  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM match_players WHERE player_id = ?`, playerId);
    db.runSync(`DELETE FROM queue_entries WHERE player_id = ?`, playerId);
    db.runSync(`DELETE FROM players WHERE player_id = ?`, playerId);
  });
  return { ok: true };
}

// Delete many players at once. Players currently in an active match are skipped.
export function deletePlayers(ids: number[]): { deleted: number; skipped: number } {
  let deleted = 0;
  let skipped = 0;
  db.withTransactionSync(() => {
    for (const id of ids) {
      const inMatch = db.getFirstSync(
        `SELECT 1 FROM match_players mp
         JOIN matches m ON m.match_id = mp.match_id
         WHERE mp.player_id = ? AND m.status = 'active' LIMIT 1`,
        id
      );
      if (inMatch) {
        skipped++;
        continue;
      }
      db.runSync(`DELETE FROM match_players WHERE player_id = ?`, id);
      db.runSync(`DELETE FROM queue_entries WHERE player_id = ?`, id);
      db.runSync(`DELETE FROM players WHERE player_id = ?`, id);
      deleted++;
    }
  });
  return { deleted, skipped };
}

export function resetAllData(): void {
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM match_players`);
    db.runSync(`DELETE FROM matches`);
    db.runSync(`DELETE FROM queue_entries`);
    db.runSync(`DELETE FROM courts`);
    db.runSync(`DELETE FROM sessions`);
    db.runSync(`DELETE FROM players`);
    db.runSync(`DELETE FROM sqlite_sequence`);
  });
  ensureActiveSession();
  seedCourtsIfEmpty();
}

// ---- Remove a court ----
export function removeCourt(courtId: number): { ok: boolean; reason?: string } {
  const court = db.getFirstSync<{ status: string }>(`SELECT status FROM courts WHERE court_id = ?`, courtId);
  if (!court) return { ok: false, reason: 'Court not found.' };
  if (court.status === 'occupied') return { ok: false, reason: 'Court is in use. End its match first.' };

  db.withTransactionSync(() => {
    const ids = db.getAllSync<{ match_id: number }>(`SELECT match_id FROM matches WHERE court_id = ?`, courtId);
    ids.forEach((m) => db.runSync(`DELETE FROM match_players WHERE match_id = ?`, m.match_id));
    db.runSync(`DELETE FROM matches WHERE court_id = ?`, courtId);
    db.runSync(`DELETE FROM courts WHERE court_id = ?`, courtId);
  });
  return { ok: true };
}


export function getLastGroupmates(): Record<number, number[]> {
  const sessionId = getActiveSessionId();
  const rows = db.getAllSync<{ player_id: number; other: number }>(
    `SELECT mp.player_id, mp2.player_id AS other
     FROM match_players mp
     JOIN matches m ON m.match_id = mp.match_id
     JOIN match_players mp2 ON mp2.match_id = mp.match_id AND mp2.player_id <> mp.player_id
     WHERE m.session_id = ? AND m.status = 'completed'
       AND m.match_id = (
         SELECT MAX(m2.match_id) FROM matches m2
         JOIN match_players mp3 ON mp3.match_id = m2.match_id
         WHERE mp3.player_id = mp.player_id AND m2.session_id = ? AND m2.status = 'completed'
      )`,
    sessionId,
    sessionId
  );
  const map: Record<number, number[]> = {};
  for (const r of rows) (map[r.player_id] ??= []).push(r.other);
  return map;
}

export function setSetting(key: string, value: string): void {
  ensureSettings();
  db.runSync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value
  );
}