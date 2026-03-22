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
    expect(result.newRatingA).toBeGreaterThan(1041);
    expect(result.newRatingB).toBeLessThan(964);
  });

  it('uses K=20 by default', () => {
    // Equal ratings, win: change = 20 * (1 - 0.5) = 10
    const result = calculateNewRatings(1000, 1000, 11, 7);
    expect(result.newRatingA).toBe(1010);
    expect(result.newRatingB).toBe(990);
  });

  it('total rating is conserved (sum unchanged)', () => {
    const result = calculateNewRatings(1100, 900, 11, 5);
    expect(result.newRatingA + result.newRatingB).toBe(1100 + 900);
  });

  it('verified against club spreadsheet K=20 values', () => {
    // Match 469: Вадим(1115) vs Влад(1291) 5:11
    const r1 = calculateNewRatings(1115, 1291, 5, 11);
    expect(r1.newRatingA).toBe(1110);
    expect(r1.newRatingB).toBe(1296);

    // Match 470: Вадим(1110) vs Женя(1141) 11:2
    const r2 = calculateNewRatings(1110, 1141, 11, 2);
    expect(r2.newRatingA).toBe(1121);
    expect(r2.newRatingB).toBe(1130);
  });
});
