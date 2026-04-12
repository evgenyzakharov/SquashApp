import { describe, it, expect } from 'vitest';
import { recalculateFrom } from '../src/core/recalculate';
import type { Match } from '../src/core/types';

function makeMatch(order: number, p1: string, p2: string, s1: number, s2: number, eloBefore1: number, eloBefore2: number, eloAfter1: number, eloAfter2: number): Match {
  return {
    id: `m${order}`,
    orderNumber: order,
    date: '2025-01-01',
    player1Id: p1,
    player2Id: p2,
    score1: s1,
    score2: s2,
    eloBeforeP1: eloBefore1,
    eloBeforeP2: eloBefore2,
    eloAfterP1: eloAfter1,
    eloAfterP2: eloAfter2,
  };
}

describe('recalculateFrom', () => {
  it('recalculates Elo for matches after a deleted match', () => {
    // 3 matches: A beats B, B beats C, A beats C
    // If we delete match 2 (B beats C), match 3 should be recalculated
    // using ratings from match 1 (not match 2)
    const matches: Match[] = [
      makeMatch(1, 'a', 'b', 11, 5, 1000, 1000, 1010, 990),
      // match 2 deleted (was b vs c, 11:5)
      makeMatch(3, 'a', 'c', 11, 5, 1010, 990, 1012, 988),
      // ^ elo_before/after are stale, will be recalculated
    ];

    const baseRatings = { a: 1010, b: 990, c: 1000 }; // ratings after match 1
    const { updatedMatches, newSnapshots } = recalculateFrom(3, matches, baseRatings);

    expect(updatedMatches).toHaveLength(1);

    const m3 = updatedMatches[0];
    // match 3: a(1010) vs c(1000), a wins
    expect(m3.eloBeforeP1).toBe(1010); // a's rating from base
    expect(m3.eloBeforeP2).toBe(1000); // c's rating from base (not from deleted match 2)
    // After: a should gain less than 10 (since a is higher rated)
    expect(m3.eloAfterP1).toBeGreaterThan(1010);
    expect(m3.eloAfterP2).toBeLessThan(1000);

    expect(newSnapshots).toHaveLength(1);
    expect(newSnapshots[0].matchId).toBe('m3');
    expect(newSnapshots[0].ratings.a).toBe(m3.eloAfterP1);
    expect(newSnapshots[0].ratings.c).toBe(m3.eloAfterP2);
  });

  it('recalculates chain of multiple matches', () => {
    const matches: Match[] = [
      makeMatch(1, 'a', 'b', 11, 5, 1000, 1000, 1010, 990),
      // match 2 deleted
      makeMatch(3, 'a', 'c', 11, 5, 0, 0, 0, 0),
      makeMatch(4, 'b', 'c', 11, 5, 0, 0, 0, 0),
    ];

    const baseRatings = { a: 1010, b: 990, c: 1000 };
    const { updatedMatches, newSnapshots } = recalculateFrom(3, matches, baseRatings);

    expect(updatedMatches).toHaveLength(2);
    expect(newSnapshots).toHaveLength(2);

    // Match 3: a vs c, a wins. Base: a=1010, c=1000
    const m3 = updatedMatches[0];
    expect(m3.eloBeforeP1).toBe(1010);
    expect(m3.eloBeforeP2).toBe(1000);

    // Match 4: b vs c, b wins. Uses c's rating AFTER match 3
    const m4 = updatedMatches[1];
    expect(m4.eloBeforeP1).toBe(990); // b unchanged since match 1
    expect(m4.eloBeforeP2).toBe(m3.eloAfterP2); // c's rating after match 3

    // Snapshots should cascade
    expect(newSnapshots[1].ratings.a).toBe(m3.eloAfterP1);
    expect(newSnapshots[1].ratings.b).toBe(m4.eloAfterP1);
    expect(newSnapshots[1].ratings.c).toBe(m4.eloAfterP2);
  });

  it('handles empty matches after deletion', () => {
    const { updatedMatches, newSnapshots } = recalculateFrom(5, [], { a: 1000 });
    expect(updatedMatches).toHaveLength(0);
    expect(newSnapshots).toHaveLength(0);
  });

  it('skips matches before startFromOrder', () => {
    const matches: Match[] = [
      makeMatch(1, 'a', 'b', 11, 5, 1000, 1000, 1010, 990),
      makeMatch(3, 'a', 'b', 5, 11, 0, 0, 0, 0),
    ];

    const { updatedMatches } = recalculateFrom(3, matches, { a: 1010, b: 990 });
    expect(updatedMatches).toHaveLength(1);
    expect(updatedMatches[0].id).toBe('m3');
  });
});
