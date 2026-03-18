export interface Player {
  id: string;
  name: string;
}

export interface Match {
  id: string;
  date: string; // ISO date "2025-10-05"
  player1Id: string;
  player2Id: string;
  score1: number;
  score2: number;
  eloBeforeP1: number;
  eloBeforeP2: number;
  eloAfterP1: number;
  eloAfterP2: number;
}

export interface RatingSnapshot {
  date: string;
  matchId: string;
  ratings: Record<string, number>; // playerId → rating
}

export interface PlayerStats {
  playerId: string;
  games: number;
  wins: number;
  winPercent: number;
  pointsWon: number;
  pointsLost: number;
  avgPointsWon: number;
  avgPointsLost: number;
  avgDifference: number;
  rallyWinPercent: number;
  currentRating: number;
  peakRating: number;
}

export interface ScheduleInput {
  players: { id: string; name: string; rating: number }[];
  courts: number;
  slotMinutes: number;
  totalMinutes: number;
}

export interface ScheduleRound {
  round: number;
  matches: { player1Id: string; player2Id: string; court: number }[];
  resting: string[]; // playerIds sitting out
}

export interface Schedule {
  rounds: ScheduleRound[];
  totalRounds: number;
  isFullRoundRobin: boolean;
}

export const DEFAULT_K_FACTOR = 32;
export const DEFAULT_INITIAL_RATING = 1000;
