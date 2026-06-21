const STORAGE_KEY = 'squash_offline_queue';

export interface OfflineMatch {
  date: string;
  player1Id: string;
  player2Id: string;
  score1: number;
  score2: number;
}

export function getQueue(): OfflineMatch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addToQueue(match: OfflineMatch): void {
  const queue = getQueue();
  queue.push(match);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function clearQueue(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getQueueSize(): number {
  return getQueue().length;
}

/**
 * Returns true when an error is caused by a network problem rather than a
 * server-side or validation error. Covers both navigator.onLine === false and
 * the (very common on mobile) case where the browser reports it's online but the
 * request still fails — weak signal, captive portal, dropped connection, etc.
 *
 * Treat network errors as "queue offline, do NOT touch app state": calling
 * loadData() after one would just fail again and blank the whole UI.
 */
export function isNetworkError(err: unknown): boolean {
  if (!navigator.onLine) return true;
  if (err instanceof TypeError) return true; // "Failed to fetch" / "NetworkError"

  // Supabase / PostgREST reject with plain objects (not Error instances), e.g.
  // { message: "TypeError: Failed to fetch", details: "...", code: "" }.
  // String(obj) would be "[object Object]" and miss the message — read it explicitly.
  let raw = '';
  if (err instanceof Error) {
    raw = err.message;
  } else if (typeof err === 'object' && err !== null) {
    const o = err as { message?: unknown; details?: unknown };
    raw = `${o.message ?? ''} ${o.details ?? ''}`;
  } else {
    raw = String(err);
  }

  const msg = raw.toLowerCase();
  return msg.includes('failed to fetch')
    || msg.includes('network')
    || msg.includes('networkerror')
    || msg.includes('fetch');
}
