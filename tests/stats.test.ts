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

  it('gets peak rating over the last 30 days (Пик30)', () => {
    // Alice's matches: m1 (eloAfter=1016), m3 (eloAfter=999), m4 (eloAfter=999)
    // With `now` close to the matches, all fall in the 30-day window → peak 1016 on 2025-01-01
    const now = new Date('2025-01-15');
    const stats = calculatePlayerStats(players[0], matches, snapshots, now);
    expect(stats.peakRating).toBe(1016);
    expect(stats.peakDate).toBe('2025-01-01');

    // Player with no matches → falls back to currentRating, no date
    const newPlayer = { id: 'dave', name: 'Dave' };
    const noMatchStats = calculatePlayerStats(newPlayer, matches, snapshots, now);
    expect(noMatchStats.peakDate).toBeNull();
  });

  it('peak ignores matches older than 30 days (date-windowed, not last-N-matches)', () => {
    const p: Player = { id: 'p', name: 'P' };
    const ms: Match[] = [
      // High rating, but long ago → must be excluded
      {
        id: 'old', orderNumber: 1, date: '2025-01-01',
        player1Id: 'p', player2Id: 'x', score1: 11, score2: 0,
        eloBeforeP1: 1000, eloBeforeP2: 1000, eloAfterP1: 1200, eloAfterP2: 800,
      },
      // Recent, lower rating → this is the windowed peak
      {
        id: 'recent', orderNumber: 2, date: '2025-06-10',
        player1Id: 'p', player2Id: 'x', score1: 5, score2: 11,
        eloBeforeP1: 1200, eloBeforeP2: 800, eloAfterP1: 1100, eloAfterP2: 900,
      },
    ];
    const snaps: RatingSnapshot[] = [
      { date: '2025-06-10', matchId: 'recent', ratings: { p: 1100, x: 900 } },
    ];
    const now = new Date('2025-06-20'); // window starts 2025-05-21 → only 'recent' qualifies
    const stats = calculatePlayerStats(p, ms, snaps, now);
    expect(stats.peakRating).toBe(1100); // old 1200 excluded
    expect(stats.peakDate).toBe('2025-06-10');
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

describe('rating consistency: ratings tab must match last match in history', () => {
  it('current ratings equal elo_after of the last match for each player', () => {
    const allStats = calculateAllStats(players, matches, snapshots);

    for (const stat of allStats) {
      // Find the last match this player was in
      const playerMatches = matches.filter(
        (m) => m.player1Id === stat.playerId || m.player2Id === stat.playerId,
      );
      if (playerMatches.length === 0) continue;

      const lastMatch = playerMatches[playerMatches.length - 1];
      const isP1 = lastMatch.player1Id === stat.playerId;
      const eloAfterLastMatch = isP1 ? lastMatch.eloAfterP1 : lastMatch.eloAfterP2;

      expect(stat.currentRating).toBe(eloAfterLastMatch);
    }
  });

  it('current ratings match the latest snapshot', () => {
    const allStats = calculateAllStats(players, matches, snapshots);
    const latestSnapshot = snapshots[snapshots.length - 1];

    for (const stat of allStats) {
      const snapshotRating = latestSnapshot.ratings[stat.playerId];
      if (snapshotRating !== undefined) {
        expect(stat.currentRating).toBe(snapshotRating);
      }
    }
  });
});

describe('calculatePlayerStats edge cases', () => {
  it('pointsWon and pointsLost are totals, not averages', () => {
    const stats = calculatePlayerStats(players[0], matches, snapshots);
    // Alice: m1 (11:7), m3 (8:11), m4 (11:11)
    expect(stats.pointsWon).toBe(11 + 8 + 11);
    expect(stats.pointsLost).toBe(7 + 11 + 11);
  });

  it('rallyWinPercent is pointsWon / total points', () => {
    const stats = calculatePlayerStats(players[0], matches, snapshots);
    expect(stats.rallyWinPercent).toBeCloseTo(30 / (30 + 29));
  });

  it('peakDate is null when player has no snapshots', () => {
    const newPlayer: Player = { id: 'dave', name: 'Dave' };
    const stats = calculatePlayerStats(newPlayer, matches, snapshots);
    expect(stats.peakDate).toBeNull();
  });
});

describe('hidden players', () => {
  const activePlayers: Player[] = [
    { id: 'alice', name: 'Alice' },
    { id: 'carol', name: 'Carol' },
  ];
  // Bob is hidden — not in activePlayers but has matches

  it('calculateAllStats only returns stats for active (non-hidden) players', () => {
    const allStats = calculateAllStats(activePlayers, matches, snapshots);
    expect(allStats).toHaveLength(2);
    expect(allStats.map((s) => s.playerId)).toEqual(['alice', 'carol']);
  });

  it('active player stats still count matches against hidden players', () => {
    const allStats = calculateAllStats(activePlayers, matches, snapshots);
    const aliceStats = allStats.find((s) => s.playerId === 'alice')!;
    // Alice played 3 matches: m1 vs bob, m3 vs carol, m4 vs bob
    // All should be counted even though bob is hidden
    expect(aliceStats.games).toBe(3);
    expect(aliceStats.pointsWon).toBe(11 + 8 + 11);
  });

  it('h2h matrix only includes active players but counts all matches', () => {
    const h2h = buildHeadToHead(activePlayers, matches);
    // Matrix should only have alice and carol
    expect(h2h.has('alice')).toBe(true);
    expect(h2h.has('carol')).toBe(true);
    expect(h2h.has('bob')).toBe(false);

    // Alice vs Carol: 0 wins, 1 loss → 0%
    expect(h2h.get('alice')!.get('carol')).toBe(0);
    // Carol vs Alice: 1 win → 100%
    expect(h2h.get('carol')!.get('alice')).toBe(1);
    // No bob column in alice's row
    expect(h2h.get('alice')!.has('bob')).toBe(false);
  });

  it('expected win matrix only includes active players', () => {
    const ratings = { alice: 999, bob: 985, carol: 1016 };
    const matrix = buildExpectedWinMatrix(activePlayers, ratings);
    expect(matrix.has('alice')).toBe(true);
    expect(matrix.has('carol')).toBe(true);
    expect(matrix.has('bob')).toBe(false);
    expect(matrix.get('alice')!.has('bob')).toBe(false);
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
