import { describe, it, expect, beforeEach } from 'vitest';
import { getQueue, addToQueue, clearQueue, getQueueSize } from '../src/core/offlineQueue';
import type { OfflineMatch } from '../src/core/offlineQueue';

// ─── localStorage mock ────────────────────────────────────

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// ─── Helpers ──────────────────────────────────────────────

const match = (n: number): OfflineMatch => ({
  date: '2026-06-01',
  player1Id: `p${n}a`,
  player2Id: `p${n}b`,
  score1: n,
  score2: 11,
});

// ─── Tests ────────────────────────────────────────────────

describe('offlineQueue', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('getQueue returns empty array when nothing stored', () => {
    expect(getQueue()).toEqual([]);
  });

  it('getQueueSize returns 0 when empty', () => {
    expect(getQueueSize()).toBe(0);
  });

  it('addToQueue adds a match and getQueue returns it', () => {
    addToQueue(match(1));
    const q = getQueue();
    expect(q).toHaveLength(1);
    expect(q[0].player1Id).toBe('p1a');
  });

  it('addToQueue preserves order of multiple matches', () => {
    addToQueue(match(1));
    addToQueue(match(2));
    addToQueue(match(3));
    const q = getQueue();
    expect(q).toHaveLength(3);
    expect(q.map((m) => m.score1)).toEqual([1, 2, 3]);
  });

  it('getQueueSize returns correct count', () => {
    addToQueue(match(1));
    addToQueue(match(2));
    expect(getQueueSize()).toBe(2);
  });

  it('clearQueue empties the queue', () => {
    addToQueue(match(1));
    addToQueue(match(2));
    clearQueue();
    expect(getQueue()).toEqual([]);
    expect(getQueueSize()).toBe(0);
  });

  it('clearQueue on empty queue does not throw', () => {
    expect(() => clearQueue()).not.toThrow();
  });

  it('getQueue returns empty array when localStorage contains invalid JSON', () => {
    localStorageMock.setItem('squash_offline_queue', 'not-valid-json{{{');
    expect(getQueue()).toEqual([]);
  });

  it('addToQueue after clearQueue starts fresh', () => {
    addToQueue(match(1));
    clearQueue();
    addToQueue(match(2));
    const q = getQueue();
    expect(q).toHaveLength(1);
    expect(q[0].score1).toBe(2);
  });

  it('stores all match fields correctly', () => {
    const m: OfflineMatch = {
      date: '2026-06-15',
      player1Id: 'alice',
      player2Id: 'bob',
      score1: 11,
      score2: 7,
    };
    addToQueue(m);
    expect(getQueue()[0]).toEqual(m);
  });
});
