import type { Match, Player, PlayerStats, RatingSnapshot } from './types';
import { calculateExpectedScore } from './elo';
import { DEFAULT_INITIAL_RATING } from './types';

/**
 * Calculate full statistics for all players.
 */
export function calculateAllStats(
  players: Player[],
  matches: Match[],
  ratingSnapshots: RatingSnapshot[],
): PlayerStats[] {
  return players.map((player) => calculatePlayerStats(player, matches, ratingSnapshots));
}

/**
 * Calculate statistics for a single player.
 */
export function calculatePlayerStats(
  player: Player,
  matches: Match[],
  ratingSnapshots: RatingSnapshot[],
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
  const { peakRating, peakDate } = getPeakRatingWithDate(player.id, ratingSnapshots);

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
 * Get peak (highest ever) rating and date for a player across all snapshots.
 */
function getPeakRatingWithDate(playerId: string, snapshots: RatingSnapshot[]): { peakRating: number; peakDate: string | null } {
  let peak = DEFAULT_INITIAL_RATING;
  let peakDate: string | null = null;
  for (const snap of snapshots) {
    const r = snap.ratings[playerId];
    if (r !== undefined && r > peak) {
      peak = r;
      peakDate = snap.date;
    }
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
