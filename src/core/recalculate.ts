import type { Match, RatingSnapshot } from './types';
import { calculateNewRatings } from './elo';
import { DEFAULT_INITIAL_RATING } from './types';

export interface RecalculateResult {
  updatedMatches: Match[];
  newSnapshots: RatingSnapshot[];
}

/**
 * Recalculate Elo for all matches starting from a given order number.
 * Used after deleting a match to fix the chain.
 *
 * @param startFromOrder - the order_number of the first match to recalculate
 * @param allMatches - all matches (sorted by order_number, deleted match already removed)
 * @param baseRatings - ratings before the first match to recalculate
 */
export function recalculateFrom(
  startFromOrder: number,
  allMatches: Match[],
  baseRatings: Record<string, number>,
): RecalculateResult {
  const ratings = { ...baseRatings };
  const updatedMatches: Match[] = [];
  const newSnapshots: RatingSnapshot[] = [];

  for (const m of allMatches) {
    if ((m.orderNumber ?? 0) < startFromOrder) continue;

    const rA = ratings[m.player1Id] ?? DEFAULT_INITIAL_RATING;
    const rB = ratings[m.player2Id] ?? DEFAULT_INITIAL_RATING;
    const elo = calculateNewRatings(rA, rB, m.score1, m.score2);

    const updated: Match = {
      ...m,
      eloBeforeP1: rA,
      eloBeforeP2: rB,
      eloAfterP1: elo.newRatingA,
      eloAfterP2: elo.newRatingB,
    };

    ratings[m.player1Id] = elo.newRatingA;
    ratings[m.player2Id] = elo.newRatingB;

    updatedMatches.push(updated);
    newSnapshots.push({
      date: m.date,
      matchId: m.id,
      ratings: { ...ratings },
    });
  }

  return { updatedMatches, newSnapshots };
}
