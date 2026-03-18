import { describe, it, expect } from 'vitest';
import {
  calculatePlayerStats,
  calculateAllStats,
  buildHeadToHead,
  buildExpectedWinMatrix,
} from '../src/core/stats';
import type { Player, Match, RatingSnapshot } from '../src/core/types';

const players: Player[] = [
  { id: 'alice', name: 'Alice' },
  { id: 'bob', name: 'Bob' },
  { id: 'carol', name: 'Carol' },
];

const matches: Match[] = [
  {
    id: 'm1', orderNumber: 1, date: '2025-01-01',
    player1Id: 'alice', player2Id: 'bob',
    score1: 11, score2: 7,
    eloBeforeP1: 1000, eloBeforeP2: 1000,
    eloAfterP1: 1016, eloAfterP2: 984,
  },
  {
    id: 'm2', orderNumber: 2, date: '2025-01-02',
    player1Id: 'bob', player2Id: 'carol',
    score1: 11, score2: 9,
    eloBeforeP1: 984, eloBeforeP2: 1000,
    eloAfterP1: 985, eloAfterP2: 999,
  },
  {
    id: 'm3', orderNumber: 3, date: '2025-01-03',
    player1Id: 'alice', player2Id: 'carol',
    score1: 8, score2: 11,
    eloBeforeP1: 1016, eloBeforeP2: 999,
    eloAfterP1: 999, eloAfterP2: 1016,
  },
  {
    id: 'm4', orderNumber: 4, date: '2025-01-04',
    player1Id: 'alice', player2Id: 'bob',
    score1: 11, score2: 11,
    eloBeforeP1: 999, eloBeforeP2: 985,
    eloAfterP1: 999, eloAfterP2: 985,
  },
];

const snapshots: RatingSnapshot[] = [
  { date: '2025-01-01', matchId: 'm1', ratings: { alice: 1016, bob: 984, carol: 1000 } },
  { date: '2025-01-02', matchId: 'm2', ratings: { alice: 1016, bob: 985, carol: 999 } },
  { date: '2025-01-03', matchId: 'm3', ratings: { alice: 999, bob: 985, carol: 1016 } },
  { date: '2025-01-04', matchId: 'm4', ratings: { alice: 999, bob: 985, carol: 1016 } },
];

describe('calculatePlayerStats', () => {
  it('calculates Alice stats correctly', () => {
    const stats = calculatePlayerStats(players[0], matches, snapshots);
    expect(stats.playerId).toBe('alice');
    expect(stats.games).toBe(3); // m1, m3, m4
    expect(stats.wins).toBe(1); // m1 only (m4 is draw, m3 is loss)
    expect(stats.pointsWon).toBe(11 + 8 + 11); // 30
    expect(stats.pointsLost).toBe(7 + 11 + 11); // 29
  });

  it('calculates win percent correctly', () => {
    const stats = calculatePlayerStats(players[0], matches, snapshots);
    expect(stats.winPercent).toBeCloseTo(1 / 3);
  });

  it('calculates average points', () => {
    const stats = calculatePlayerStats(players[0], matches, snapshots);
    expect(stats.avgPointsWon).toBeCloseTo(30 / 3);
    expect(stats.avgPointsLost).toBeCloseTo(29 / 3);
  });

  it('gets current rating from latest snapshot', () => {
    const stats = calculatePlayerStats(players[0], matches, snapshots);
    expect(stats.currentRating).toBe(999);
  });

  it('gets peak rating', () => {
    const stats = calculatePlayerStats(players[0], matches, snapshots);
    expect(stats.peakRating).toBe(1016);
  });

  it('handles player with no matches', () => {
    const newPlayer: Player = { id: 'dave', name: 'Dave' };
    const stats = calculatePlayerStats(newPlayer, matches, snapshots);
    expect(stats.games).toBe(0);
    expect(stats.wins).toBe(0);
    expect(stats.winPercent).toBe(0);
    expect(stats.currentRating).toBe(1000);
  });
});

describe('calculateAllStats', () => {
  it('returns stats for all players', () => {
    const allStats = calculateAllStats(players, matches, snapshots);
    expect(allStats).toHaveLength(3);
    expect(allStats.map((s) => s.playerId)).toEqual(['alice', 'bob', 'carol']);
  });
});

describe('buildHeadToHead', () => {
  it('builds correct h2h matrix', () => {
    const h2h = buildHeadToHead(players, matches);

    // Alice vs Bob: 1 win, 0 losses, 1 draw → 1/2 = 50%
    // (draw doesn't count as a win)
    expect(h2h.get('alice')!.get('bob')).toBeCloseTo(1 / 2);

    // Bob vs Alice: 0 wins out of 2 games
    expect(h2h.get('bob')!.get('alice')).toBeCloseTo(0);

    // Alice vs Carol: 0 wins, 1 loss → 0%
    expect(h2h.get('alice')!.get('carol')).toBe(0);

    // Carol vs Alice: 1 win, 0 losses → 100%
    expect(h2h.get('carol')!.get('alice')).toBe(1);
  });

  it('returns 0 for unplayed matchups', () => {
    const sparseH2H = buildHeadToHead(
      [...players, { id: 'dave', name: 'Dave' }],
      matches,
    );
    expect(sparseH2H.get('dave')!.get('alice')).toBe(0);
  });
});

describe('buildExpectedWinMatrix', () => {
  it('returns expected probabilities based on ratings', () => {
    const ratings = { alice: 999, bob: 985, carol: 1016 };
    const matrix = buildExpectedWinMatrix(players, ratings);

    // Higher-rated player should have higher expected win prob
    expect(matrix.get('carol')!.get('alice')!).toBeGreaterThan(0.5);
    expect(matrix.get('carol')!.get('bob')!).toBeGreaterThan(0.5);

    // Symmetric
    const carolVsAlice = matrix.get('carol')!.get('alice')!;
    const aliceVsCarol = matrix.get('alice')!.get('carol')!;
    expect(carolVsAlice + aliceVsCarol).toBeCloseTo(1);
  });
});
