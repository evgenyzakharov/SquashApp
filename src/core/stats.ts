import type { Match, Player, PlayerStats, RatingSnapshot } from './types';
import { calculateExpectedScore } from './elo';
import { DEFAULT_INITIAL_RATING } from './types';

/** Пик30 / дата пика are computed over matches within this many days. */
export const PEAK_WINDOW_DAYS = 30;

/** A player with no matches in this many days is considered "inactive" (out of the ranking). */
export const INACTIVE_DAYS = 30;

/**
 * Last match date for a player ("" if none). ISO dates compare lexicographically.
 */
export function getLastMatchDate(playerId: string, matches: Match[]): string {
  let last = '';
  for (const m of matches) {
    if ((m.player1Id === playerId || m.player2Id === playerId) && m.date > last) last = m.date;
  }
  return last;
}

/**
 * Date string (YYYY-MM-DD) `days` before `now`, in local TZ.
 */
export function cutoffDate(days: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('sv');
}

/**
 * Calculate full statistics for all players.
 * `now` is injectable so the peak window ("last 30 days") is deterministic in tests.
 */
export function calculateAllStats(
  players: Player[],
  matches: Match[],
  ratingSnapshots: RatingSnapshot[],
  now: Date = new Date(),
): PlayerStats[] {
  return players.map((player) => calculatePlayerStats(player, matches, ratingSnapshots, now));
}

/**
 * Calculate statistics for a single player.
 */
export function calculatePlayerStats(
  player: Player,
  matches: Match[],
  ratingSnapshots: RatingSnapshot[],
  now: Date = new Date(),
): PlayerStats {
  const playerMatches = matches.filter(
    (m) => m.player1Id === player.id || m.player2Id === player.id,
  );

  const games = playerMatches.length;
  let wins = 0;
  let pointsWon = 0;
  let pointsLost = 0;

  for (const m of playerMatches) {
    const isP1 = m.player1Id === player.id;
    const myScore = isP1 ? m.score1 : m.score2;
    const oppScore = isP1 ? m.score2 : m.score1;

    pointsWon += myScore;
    pointsLost += oppScore;

    if (myScore > oppScore) wins++;
  }

  const currentRating = getCurrentRating(player.id, ratingSnapshots);
  const { peakRating, peakDate } = getPeakRatingWithDate(player.id, matches, ratingSnapshots, now);

  let lastMatchDate: string | null = null;
  for (const m of playerMatches) {
    if (lastMatchDate === null || m.date > lastMatchDate) lastMatchDate = m.date;
  }

  return {
    playerId: player.id,
    games,
    wins,
    winPercent: games > 0 ? wins / games : 0,
    pointsWon,
    pointsLost,
    avgPointsWon: games > 0 ? pointsWon / games : 0,
    avgPointsLost: games > 0 ? pointsLost / games : 0,
    avgDifference: games > 0 ? (pointsWon - pointsLost) / games : 0,
    rallyWinPercent: pointsWon + pointsLost > 0 ? pointsWon / (pointsWon + pointsLost) : 0,
    currentRating,
    peakRating,
    peakDate,
    lastMatchDate,
  };
}

/**
 * Get current rating for a player from the latest snapshot.
 */
function getCurrentRating(playerId: string, snapshots: RatingSnapshot[]): number {
  if (snapshots.length === 0) return DEFAULT_INITIAL_RATING;
  const latest = snapshots[snapshots.length - 1];
  return latest.ratings[playerId] ?? DEFAULT_INITIAL_RATING;
}

/**
 * Get peak rating and date for a player over matches within the last
 * PEAK_WINDOW_DAYS days (relative to `now`). Uses eloAfterP1/P2 stored in each match.
 * Falls back to currentRating (no date) if the player has no matches in that window —
 * e.g. an inactive player, whose Пик30/дата пика the Dashboard shows as "—" anyway.
 *
 * A day-based window (rather than "last N matches") avoids the peak being polluted by a
 * rare player's very first games, where the rating sits near the 1000 starting value.
 */
function getPeakRatingWithDate(
  playerId: string,
  matches: Match[],
  snapshots: RatingSnapshot[],
  now: Date,
): { peakRating: number; peakDate: string | null } {
  const cutoffStr = cutoffDate(PEAK_WINDOW_DAYS, now);

  const playerMatches = matches.filter(
    (m) => (m.player1Id === playerId || m.player2Id === playerId) && m.date >= cutoffStr,
  );

  let peak = -Infinity;
  let peakDate: string | null = null;

  for (const m of playerMatches) {
    const r = m.player1Id === playerId ? m.eloAfterP1 : m.eloAfterP2;
    if (r > peak) { peak = r; peakDate = m.date; }
  }

  if (peak === -Infinity) {
    return { peakRating: getCurrentRating(playerId, snapshots), peakDate: null };
  }

  return { peakRating: peak, peakDate };
}

/**
 * Build head-to-head win percentage matrix.
 * Returns map: playerId → (opponentId → winPercent)
 */
export function buildHeadToHead(
  players: Player[],
  matches: Match[],
): Map<string, Map<string, number>> {
  const h2h = new Map<string, Map<string, number>>();

  for (const p of players) {
    h2h.set(p.id, new Map());
  }

  // Count wins for each pair
  const wins = new Map<string, Map<string, number>>();
  const games = new Map<string, Map<string, number>>();

  for (const p of players) {
    wins.set(p.id, new Map());
    games.set(p.id, new Map());
  }

  for (const m of matches) {
    const p1 = m.player1Id;
    const p2 = m.player2Id;

    // Skip matches involving players not in the list (e.g. hidden)
    if (!games.has(p1) || !games.has(p2)) continue;

    incrementMap(games.get(p1)!, p2);
    incrementMap(games.get(p2)!, p1);

    if (m.score1 > m.score2) {
      incrementMap(wins.get(p1)!, p2);
    } else if (m.score2 > m.score1) {
      incrementMap(wins.get(p2)!, p1);
    }
  }

  for (const p of players) {
    const pGames = games.get(p.id)!;
    const pWins = wins.get(p.id)!;
    const row = h2h.get(p.id)!;
    for (const opp of players) {
      if (p.id === opp.id) continue;
      const g = pGames.get(opp.id) ?? 0;
      const w = pWins.get(opp.id) ?? 0;
      row.set(opp.id, g > 0 ? w / g : 0);
    }
  }

  return h2h;
}

/**
 * Build expected win probability matrix based on current Elo ratings.
 */
export function buildExpectedWinMatrix(
  players: Player[],
  ratings: Record<string, number>,
): Map<string, Map<string, number>> {
  const matrix = new Map<string, Map<string, number>>();

  for (const p of players) {
    const row = new Map<string, number>();
    const rA = ratings[p.id] ?? DEFAULT_INITIAL_RATING;

    for (const opp of players) {
      if (p.id === opp.id) continue;
      const rB = ratings[opp.id] ?? DEFAULT_INITIAL_RATING;
      row.set(opp.id, calculateExpectedScore(rA, rB));
    }

    matrix.set(p.id, row);
  }

  return matrix;
}

function incrementMap(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}
