import type { ScheduleInput, Schedule, ScheduleRound } from './types';

interface PlayerWithRating {
  id: string;
  name: string;
  rating: number;
}

/**
 * Generate a schedule for a game day.
 *
 * If there's enough time for a full round-robin, uses circle method.
 * Otherwise, prioritizes matches between players with similar ratings.
 */
export function generateSchedule(input: ScheduleInput): Schedule {
  const { players, courts, slotMinutes, totalMinutes } = input;
  const n = players.length;

  if (n < 2) {
    return { rounds: [], totalRounds: 0, isFullRoundRobin: false };
  }

  const totalRounds = Math.floor(totalMinutes / slotMinutes);
  const roundRobinRounds = n % 2 === 0 ? n - 1 : n;
  const isFullRoundRobin = totalRounds >= roundRobinRounds;

  if (isFullRoundRobin) {
    // Full round-robin first, then fill remaining rounds with rating-based matches
    const rrRounds = generateCircleMethod(players, courts, roundRobinRounds);
    const remainingSlots = totalRounds - rrRounds.length;
    if (remainingSlots > 0) {
      const extraRounds = generateRatingBased(players, courts, remainingSlots, rrRounds.length);
      return {
        rounds: [...rrRounds, ...extraRounds],
        totalRounds,
        isFullRoundRobin: true,
      };
    }
    return {
      rounds: rrRounds,
      totalRounds,
      isFullRoundRobin: true,
    };
  }

  return {
    rounds: generateRatingBased(players, courts, totalRounds, 0),
    totalRounds,
    isFullRoundRobin: false,
  };
}

/**
 * Circle method for full round-robin.
 * Guarantees everyone plays everyone exactly once.
 */
function generateCircleMethod(
  players: PlayerWithRating[],
  courts: number,
  totalRounds: number,
): ScheduleRound[] {
  const n = players.length;
  const list = [...players];

  // If odd number, add a "bye" placeholder
  const hasBye = n % 2 !== 0;
  if (hasBye) {
    list.push({ id: '__bye__', name: 'Bye', rating: 0 });
  }

  const size = list.length;
  const rounds: ScheduleRound[] = [];

  // Circle method: fix first player, rotate the rest
  for (let round = 0; round < Math.min(size - 1, totalRounds); round++) {
    const matches: { player1Id: string; player2Id: string; court: number }[] = [];
    const resting: string[] = [];
    let courtNum = 1;

    for (let i = 0; i < size / 2; i++) {
      const p1 = list[i];
      const p2 = list[size - 1 - i];

      if (p1.id === '__bye__') {
        resting.push(p2.id);
        continue;
      }
      if (p2.id === '__bye__') {
        resting.push(p1.id);
        continue;
      }

      if (courtNum <= courts) {
        matches.push({ player1Id: p1.id, player2Id: p2.id, court: courtNum });
        courtNum++;
      } else {
        resting.push(p1.id, p2.id);
      }
    }

    rounds.push({ round: round + 1, matches, resting });

    // Rotate: keep list[0] fixed, rotate the rest
    const last = list.pop()!;
    list.splice(1, 0, last);
  }

  return rounds;
}

/**
 * Rating-based scheduling when time is limited.
 * Prioritizes matches between players with similar ratings.
 */
function generateRatingBased(
  players: PlayerWithRating[],
  courts: number,
  totalRounds: number,
  roundOffset: number = 0,
): ScheduleRound[] {
  const n = players.length;
  const matchesPerRound = Math.min(Math.floor(n / 2), courts);

  // Generate all possible pairs sorted by rating difference
  const allPairs: { p1: string; p2: string; diff: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      allPairs.push({
        p1: players[i].id,
        p2: players[j].id,
        diff: Math.abs(players[i].rating - players[j].rating),
      });
    }
  }
  allPairs.sort((a, b) => a.diff - b.diff);

  const playedPairs = new Set<string>();
  const gamesPlayed = new Map<string, number>();
  const restedLastRound = new Set<string>();
  const rounds: ScheduleRound[] = [];

  for (const p of players) {
    gamesPlayed.set(p.id, 0);
  }

  for (let round = 0; round < totalRounds; round++) {
    const usedPlayers = new Set<string>();
    const roundMatches: { player1Id: string; player2Id: string; court: number }[] = [];
    let courtNum = 1;

    // Sort candidates: prefer pairs where neither player rested last round
    // and both have fewer games played
    const candidates = allPairs
      .filter((pair) => {
        const key = pairKey(pair.p1, pair.p2);
        return !playedPairs.has(key);
      })
      .sort((a, b) => {
        // Primary: rating difference (already sorted)
        // Secondary: balance games played
        const aMax = Math.max(gamesPlayed.get(a.p1)!, gamesPlayed.get(a.p2)!);
        const bMax = Math.max(gamesPlayed.get(b.p1)!, gamesPlayed.get(b.p2)!);
        if (aMax !== bMax) return aMax - bMax;
        return a.diff - b.diff;
      });

    for (const pair of candidates) {
      if (courtNum > matchesPerRound) break;
      if (usedPlayers.has(pair.p1) || usedPlayers.has(pair.p2)) continue;

      roundMatches.push({ player1Id: pair.p1, player2Id: pair.p2, court: courtNum });
      usedPlayers.add(pair.p1);
      usedPlayers.add(pair.p2);
      playedPairs.add(pairKey(pair.p1, pair.p2));
      gamesPlayed.set(pair.p1, gamesPlayed.get(pair.p1)! + 1);
      gamesPlayed.set(pair.p2, gamesPlayed.get(pair.p2)! + 1);
      courtNum++;
    }

    // If no new pairs available, allow rematches prioritizing low-game-count players
    if (roundMatches.length < matchesPerRound) {
      const rematchCandidates = allPairs
        .filter(
          (pair) => !usedPlayers.has(pair.p1) && !usedPlayers.has(pair.p2),
        )
        .sort((a, b) => {
          const aMax = Math.max(gamesPlayed.get(a.p1)!, gamesPlayed.get(a.p2)!);
          const bMax = Math.max(gamesPlayed.get(b.p1)!, gamesPlayed.get(b.p2)!);
          if (aMax !== bMax) return aMax - bMax;
          return a.diff - b.diff;
        });

      for (const pair of rematchCandidates) {
        if (courtNum > matchesPerRound) break;
        if (usedPlayers.has(pair.p1) || usedPlayers.has(pair.p2)) continue;

        roundMatches.push({ player1Id: pair.p1, player2Id: pair.p2, court: courtNum });
        usedPlayers.add(pair.p1);
        usedPlayers.add(pair.p2);
        gamesPlayed.set(pair.p1, gamesPlayed.get(pair.p1)! + 1);
        gamesPlayed.set(pair.p2, gamesPlayed.get(pair.p2)! + 1);
        courtNum++;
      }
    }

    const resting = players
      .filter((p) => !usedPlayers.has(p.id))
      .map((p) => p.id);

    restedLastRound.clear();
    for (const id of resting) {
      restedLastRound.add(id);
    }

    rounds.push({ round: roundOffset + round + 1, matches: roundMatches, resting });
  }

  return rounds;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
