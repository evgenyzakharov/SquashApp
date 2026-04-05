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
