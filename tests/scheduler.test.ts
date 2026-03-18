import { describe, it, expect } from 'vitest';
import { generateSchedule } from '../src/core/scheduler';
import type { ScheduleInput } from '../src/core/types';

function makePlayers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    rating: 1000 + i * 50,
  }));
}

describe('generateSchedule', () => {
  it('returns empty schedule for less than 2 players', () => {
    const result = generateSchedule({
      players: [{ id: 'p1', name: 'Player 1', rating: 1000 }],
      courts: 1,
      slotMinutes: 15,
      totalMinutes: 60,
    });
    expect(result.rounds).toHaveLength(0);
  });

  it('generates full round-robin for 4 players with enough time', () => {
    const input: ScheduleInput = {
      players: makePlayers(4),
      courts: 2,
      slotMinutes: 15,
      totalMinutes: 60, // 4 rounds, need 3 for round-robin of 4
    };
    const result = generateSchedule(input);
    expect(result.isFullRoundRobin).toBe(true);
    expect(result.rounds.length).toBeGreaterThanOrEqual(3);
  });

  it('full round-robin: every pair plays at least once', () => {
    const players = makePlayers(4);
    const result = generateSchedule({
      players,
      courts: 2,
      slotMinutes: 15,
      totalMinutes: 45, // Exactly 3 rounds = full round-robin for 4 players
    });

    const playedPairs = new Set<string>();
    for (const round of result.rounds) {
      for (const match of round.matches) {
        const key = [match.player1Id, match.player2Id].sort().join(':');
        playedPairs.add(key);
      }
    }

    // C(4,2) = 6 pairs, all should be covered
    expect(playedPairs.size).toBe(6);
  });

  it('extra time after round-robin fills with more matches', () => {
    const players = makePlayers(4);
    // 3 rounds for RR + 3 extra = 6 total rounds
    const result = generateSchedule({
      players,
      courts: 2,
      slotMinutes: 10,
      totalMinutes: 60,
    });

    expect(result.isFullRoundRobin).toBe(true);
    expect(result.rounds.length).toBe(6);
    // Should have more than 6 total matches (RR gives 6, extra rounds add more)
    const totalMatches = result.rounds.reduce((sum, r) => sum + r.matches.length, 0);
    expect(totalMatches).toBeGreaterThan(6);
  });

  it('uses rating-based scheduling when time is limited', () => {
    const players = makePlayers(8);
    const result = generateSchedule({
      players,
      courts: 2,
      slotMinutes: 15,
      totalMinutes: 30, // Only 2 rounds, need 7 for full round-robin
    });
    expect(result.isFullRoundRobin).toBe(false);
    expect(result.rounds).toHaveLength(2);
  });

  it('respects court limits', () => {
    const players = makePlayers(6);
    const result = generateSchedule({
      players,
      courts: 1,
      slotMinutes: 15,
      totalMinutes: 120,
    });

    for (const round of result.rounds) {
      expect(round.matches.length).toBeLessThanOrEqual(1);
    }
  });

  it('handles odd number of players', () => {
    const players = makePlayers(5);
    const result = generateSchedule({
      players,
      courts: 2,
      slotMinutes: 15,
      totalMinutes: 120,
    });

    // With 5 players, someone should rest each round
    for (const round of result.rounds) {
      const playingCount = round.matches.length * 2;
      expect(playingCount + round.resting.length).toBe(5);
    }
  });

  it('no player appears twice in the same round', () => {
    const players = makePlayers(8);
    const result = generateSchedule({
      players,
      courts: 4,
      slotMinutes: 15,
      totalMinutes: 120,
    });

    for (const round of result.rounds) {
      const seen = new Set<string>();
      for (const match of round.matches) {
        expect(seen.has(match.player1Id)).toBe(false);
        expect(seen.has(match.player2Id)).toBe(false);
        seen.add(match.player1Id);
        seen.add(match.player2Id);
      }
    }
  });

  it('rating-based: closer-rated players are prioritized', () => {
    // Players with distinct ratings
    const players = [
      { id: 'low1', name: 'Low 1', rating: 700 },
      { id: 'low2', name: 'Low 2', rating: 750 },
      { id: 'high1', name: 'High 1', rating: 1200 },
      { id: 'high2', name: 'High 2', rating: 1250 },
    ];

    const result = generateSchedule({
      players,
      courts: 2,
      slotMinutes: 15,
      totalMinutes: 15, // Only 1 round
    });

    expect(result.isFullRoundRobin).toBe(false);
    const round1 = result.rounds[0];
    // Should pair low1-low2 and high1-high2 (closest ratings)
    const pairs = round1.matches.map((m) =>
      [m.player1Id, m.player2Id].sort().join(':'),
    );
    expect(pairs).toContain('low1:low2');
    expect(pairs).toContain('high1:high2');
  });
});
