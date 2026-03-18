import { DEFAULT_K_FACTOR } from './types';

/**
 * Calculate expected score for player A against player B.
 * Returns value between 0 and 1.
 */
export function calculateExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Determine the actual score (0, 0.5, or 1) based on match scores.
 * Win = 1, Draw = 0.5, Loss = 0.
 */
export function getActualScore(scoreA: number, scoreB: number): number {
  if (scoreA > scoreB) return 1;
  if (scoreA < scoreB) return 0;
  return 0.5;
}

export interface EloResult {
  newRatingA: number;
  newRatingB: number;
  expectedA: number;
  expectedB: number;
}

/**
 * Calculate new Elo ratings for both players after a match.
 */
export function calculateNewRatings(
  ratingA: number,
  ratingB: number,
  scoreA: number,
  scoreB: number,
  K: number = DEFAULT_K_FACTOR,
): EloResult {
  const expectedA = calculateExpectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA;
  const actualA = getActualScore(scoreA, scoreB);
  const actualB = 1 - actualA;

  return {
    newRatingA: Math.round(ratingA + K * (actualA - expectedA)),
    newRatingB: Math.round(ratingB + K * (actualB - expectedB)),
    expectedA,
    expectedB,
  };
}
