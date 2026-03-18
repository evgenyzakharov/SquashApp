import { describe, it, expect } from 'vitest';
import { calculateExpectedScore, getActualScore, calculateNewRatings } from '../src/core/elo';

describe('calculateExpectedScore', () => {
  it('returns 0.5 for equal ratings', () => {
    expect(calculateExpectedScore(1000, 1000)).toBeCloseTo(0.5);
  });

  it('returns higher value for higher-rated player', () => {
    const expected = calculateExpectedScore(1200, 1000);
    expect(expected).toBeGreaterThan(0.5);
    expect(expected).toBeCloseTo(0.7597, 3);
  });

  it('returns lower value for lower-rated player', () => {
    const expected = calculateExpectedScore(1000, 1200);
    expect(expected).toBeLessThan(0.5);
    expect(expected).toBeCloseTo(0.2403, 3);
  });

  it('expected scores sum to 1', () => {
    const eA = calculateExpectedScore(1100, 950);
    const eB = calculateExpectedScore(950, 1100);
    expect(eA + eB).toBeCloseTo(1.0);
  });
});

describe('getActualScore', () => {
  it('returns 1 for a win', () => {
    expect(getActualScore(11, 7)).toBe(1);
  });

  it('returns 0 for a loss', () => {
    expect(getActualScore(7, 11)).toBe(0);
  });

  it('returns 0.5 for a draw', () => {
    expect(getActualScore(16, 16)).toBe(0.5);
  });
});

describe('calculateNewRatings', () => {
  it('winner gains and loser loses points', () => {
    const result = calculateNewRatings(1000, 1000, 11, 7);
    expect(result.newRatingA).toBeGreaterThan(1000);
    expect(result.newRatingB).toBeLessThan(1000);
  });

  it('rating changes are symmetric for equal ratings', () => {
    const result = calculateNewRatings(1000, 1000, 11, 7);
    const gainA = result.newRatingA - 1000;
    const lossB = 1000 - result.newRatingB;
    expect(gainA).toBe(lossB);
  });

  it('draw between equal ratings causes no change', () => {
    const result = calculateNewRatings(1000, 1000, 16, 16);
    expect(result.newRatingA).toBe(1000);
    expect(result.newRatingB).toBe(1000);
  });

  it('upset win gives more points', () => {
    // Lower-rated player wins
    const upset = calculateNewRatings(800, 1200, 11, 7);
    // Higher-rated player wins
    const expected = calculateNewRatings(1200, 800, 11, 7);
    const upsetGain = upset.newRatingA - 800;
    const expectedGain = expected.newRatingA - 1200;
    expect(upsetGain).toBeGreaterThan(expectedGain);
  });

  it('respects custom K factor', () => {
    const k16 = calculateNewRatings(1000, 1000, 11, 7, 16);
    const k32 = calculateNewRatings(1000, 1000, 11, 7, 32);
    const gain16 = k16.newRatingA - 1000;
    const gain32 = k32.newRatingA - 1000;
    expect(gain32).toBe(gain16 * 2);
  });

  it('matches real data from spreadsheet', () => {
    // From the spreadsheet: Вадим(1041) vs Вова(964), Вадим wins 16-14
    const result = calculateNewRatings(1041, 964, 16, 14);
    expect(result.expectedA).toBeCloseTo(0.61, 1);
    // Winner should gain ~12 points (K=32, actual=1, expected~0.61 → 32*(1-0.61)≈12)
    expect(result.newRatingA).toBeGreaterThan(1041);
    expect(result.newRatingB).toBeLessThan(964);
  });
});
