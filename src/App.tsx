import { useState, useEffect, useCallback } from 'react';
import type { Player, Match, RatingSnapshot } from './core/types';
import { fetchPlayers, fetchAllPlayers, fetchMatches, fetchRatingSnapshots, addMatch, addRatingSnapshot, deleteMatch, deleteSnapshotsByMatchIds, updateMatchElo, updateMatchOrder } from './db/api';
import { calculateNewRatings } from './core/elo';
import { DEFAULT_INITIAL_RATING } from './core/types';
import { getQueue, getQueueSize, clearQueue } from './core/offlineQueue';
import { recalculateFrom } from './core/recalculate';
import { Dashboard } from './components/Dashboard';
import { MatchHistory } from './components/MatchHistory';
import { AddMatch } from './components/AddMatch';
import { Scheduler } from './components/Scheduler';
import { HeadToHead } from './components/HeadToHead';
import { Settings } from './components/Settings';
import './App.css';

type Tab = 'dashboard' | 'history' | 'add' | 'scheduler' | 'h2h';

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [players, setPlayers] = useState<Player[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [snapshots, setSnapshots] = useState<RatingSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [offlineCount, setOfflineCount] = useState(getQueueSize());
  const [syncing, setSyncing] = useState(false);

  const refreshOfflineCount = useCallback(() => {
    setOfflineCount(getQueueSize());
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [p, ap, m, s] = await Promise.all([
        fetchPlayers(),
        fetchAllPlayers(),
        fetchMatches(),
        fetchRatingSnapshots(),
      ]);
      setPlayers(p);
      setAllPlayers(ap);
      setMatches(m);
      setSnapshots(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  const syncOffline = useCallback(async () => {
    const queue = getQueue();
    if (queue.length === 0) return;
    if (!navigator.onLine) return;

    setSyncing(true);
    try {
      // Reload fresh data first
      const [p, m, s] = await Promise.all([
        fetchPlayers(),
        fetchMatches(),
        fetchRatingSnapshots(),
      ]);

      const ratings: Record<string, number> = {};
      for (const pl of p) ratings[pl.id] = DEFAULT_INITIAL_RATING;
      if (s.length > 0) {
        const latest = s[s.length - 1];
        for (const [id, r] of Object.entries(latest.ratings)) ratings[id] = r;
      }
      let maxOrder = m.reduce((max, mt) => Math.max(max, mt.orderNumber ?? 0), 0);

      for (const om of queue) {
        const rA = ratings[om.player1Id] ?? DEFAULT_INITIAL_RATING;
        const rB = ratings[om.player2Id] ?? DEFAULT_INITIAL_RATING;
        const elo = calculateNewRatings(rA, rB, om.score1, om.score2);

        maxOrder++;
        const matchId = `${om.date}-${String(maxOrder).padStart(5, '0')}`;

        await addMatch({
          id: matchId,
          orderNumber: maxOrder,
          date: om.date,
          player1Id: om.player1Id,
          player2Id: om.player2Id,
          score1: om.score1,
          score2: om.score2,
          eloBeforeP1: rA,
          eloBeforeP2: rB,
          eloAfterP1: elo.newRatingA,
          eloAfterP2: elo.newRatingB,
        });

        ratings[om.player1Id] = elo.newRatingA;
        ratings[om.player2Id] = elo.newRatingB;

        await addRatingSnapshot({
          date: om.date,
          matchId,
          ratings: { ...ratings },
        });
      }

      clearQueue();
      refreshOfflineCount();
      await loadData();
    } catch {
      // Will retry on next online event
    } finally {
      setSyncing(false);
    }
  }, [loadData, refreshOfflineCount]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleOnline = () => { syncOffline(); };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncOffline]);

  const handleDeleteMatch = useCallback(async (matchId: string) => {
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;

    const orderNum = match.orderNumber ?? 0;

    // Collect match IDs to delete snapshots for: the deleted match + all after it
    const affectedMatchIds = matches
      .filter((m) => (m.orderNumber ?? 0) >= orderNum)
      .map((m) => m.id);

    // Delete snapshots first (FK constraint), then the match
    await deleteSnapshotsByMatchIds(affectedMatchIds);
    await deleteMatch(matchId);

    // Get base ratings: from the snapshot just before the deleted match
    const remainingMatches = matches.filter((m) => m.id !== matchId);
    const matchesBefore = remainingMatches.filter((m) => (m.orderNumber ?? 0) < orderNum);

    let baseRatings: Record<string, number> = {};
    for (const p of allPlayers) baseRatings[p.id] = DEFAULT_INITIAL_RATING;

    if (matchesBefore.length > 0) {
      const lastBefore = matchesBefore[matchesBefore.length - 1];
      const snap = snapshots.find((s) => s.matchId === lastBefore.id);
      if (snap) baseRatings = { ...baseRatings, ...snap.ratings };
    }

    // Recalculate all matches after the deleted one
    const matchesAfter = remainingMatches.filter((m) => (m.orderNumber ?? 0) > orderNum);
    if (matchesAfter.length > 0) {
      const { updatedMatches, newSnapshots } = recalculateFrom(
        orderNum + 1,
        remainingMatches,
        baseRatings,
      );

      // Update each match's Elo in DB
      for (const um of updatedMatches) {
        await updateMatchElo(um);
      }

      // Re-add snapshots
      for (const ns of newSnapshots) {
        await addRatingSnapshot(ns);
      }
    }

    await loadData();
  }, [matches, allPlayers, snapshots, loadData]);

  /**
   * Insert new matches at the correct chronological position and recalculate.
   * Raw matches: just date, player IDs, scores (no Elo, no order).
   */
  const handleAddMatches = useCallback(async (
    rawMatches: { date: string; player1Id: string; player2Id: string; score1: number; score2: number }[],
  ): Promise<string[]> => {
    if (rawMatches.length === 0) return [];
    try {

    const date = rawMatches[0].date;

    // Find insertion point: after the last match with date <= this date
    const insertAfterIdx = matches.reduce((lastIdx, m, idx) => {
      return m.date <= date ? idx : lastIdx;
    }, -1);

    const insertAfterOrder = insertAfterIdx >= 0
      ? (matches[insertAfterIdx].orderNumber ?? 0)
      : 0;

    // Matches that need order_number shift and Elo recalculation
    const matchesAfter = matches.filter((m) => (m.orderNumber ?? 0) > insertAfterOrder);
    const affectedIds = matchesAfter.map((m) => m.id);

    // Delete snapshots for all affected matches (will be recreated)
    if (affectedIds.length > 0) {
      await deleteSnapshotsByMatchIds(affectedIds);
    }

    // Shift order_numbers of existing matches after insertion point
    const shift = rawMatches.length;
    for (const m of matchesAfter) {
      await updateMatchOrder(m.id, (m.orderNumber ?? 0) + shift);
    }

    // Get base ratings at insertion point
    let baseRatings: Record<string, number> = {};
    for (const p of allPlayers) baseRatings[p.id] = DEFAULT_INITIAL_RATING;

    if (insertAfterIdx >= 0) {
      const snap = snapshots.find((s) => s.matchId === matches[insertAfterIdx].id);
      if (snap) baseRatings = { ...baseRatings, ...snap.ratings };
    }

    // Insert new matches with correct Elo
    const ratings = { ...baseRatings };
    const results: string[] = [];

    for (let i = 0; i < rawMatches.length; i++) {
      const rm = rawMatches[i];
      const orderNum = insertAfterOrder + i + 1;
      // Use global orderNum as ID suffix — guaranteed unique across all matches
      const matchId = `${rm.date}-${String(orderNum).padStart(5, '0')}`;

      const rA = ratings[rm.player1Id] ?? DEFAULT_INITIAL_RATING;
      const rB = ratings[rm.player2Id] ?? DEFAULT_INITIAL_RATING;
      const elo = calculateNewRatings(rA, rB, rm.score1, rm.score2);

      ratings[rm.player1Id] = elo.newRatingA;
      ratings[rm.player2Id] = elo.newRatingB;

      await addMatch({
        id: matchId,
        orderNumber: orderNum,
        date: rm.date,
        player1Id: rm.player1Id,
        player2Id: rm.player2Id,
        score1: rm.score1,
        score2: rm.score2,
        eloBeforeP1: rA,
        eloBeforeP2: rB,
        eloAfterP1: elo.newRatingA,
        eloAfterP2: elo.newRatingB,
      });

      await addRatingSnapshot({
        date: rm.date,
        matchId,
        ratings: { ...ratings },
      });

      results.push(
        `${rm.player1Id} ${rm.score1}:${rm.score2} ${rm.player2Id} | Elo: ${rA}→${elo.newRatingA}, ${rB}→${elo.newRatingB}`,
      );
    }

    // Recalculate shifted matches with updated base ratings
    if (matchesAfter.length > 0) {
      const shiftedMatches = matchesAfter.map((m) => ({
        ...m,
        orderNumber: (m.orderNumber ?? 0) + shift,
      }));

      const { updatedMatches, newSnapshots } = recalculateFrom(
        insertAfterOrder + shift + 1,
        shiftedMatches,
        ratings,
      );

      for (const um of updatedMatches) {
        await updateMatchElo(um);
      }
      for (const ns of newSnapshots) {
        await addRatingSnapshot(ns);
      }
    }

    await loadData();
    return results;
  } catch (err) {
    // Refresh state so in-memory matches/snapshots stay in sync with DB
    // even if the operation partially succeeded before failing.
    try { await loadData(); } catch { /* ignore secondary error */ }
    const msg = err instanceof Error
      ? err.message
      : (err as { message?: string })?.message
        ?? (err as { error?: string })?.error
        ?? JSON.stringify(err);
    throw new Error(msg);
  }
  }, [matches, allPlayers, snapshots, loadData]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Рейтинг' },
    { key: 'history', label: 'История' },
    { key: 'add', label: '+ Матч' },
    { key: 'h2h', label: 'H2H' },
    { key: 'scheduler', label: 'Расписание' },
  ];

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-row">
          <h1>Squash Club</h1>
          {offlineCount > 0 && (
            <button
              className="offline-badge"
              onClick={syncOffline}
              disabled={syncing}
              title="Нажмите для синхронизации"
            >
              {syncing ? 'Синк...' : `${offlineCount} офлайн`}
            </button>
          )}
          <button
            className="settings-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="Настройки"
          >
            ⚙
          </button>
        </div>
        {showSettings && (
          <Settings
            allPlayers={allPlayers}
            onChanged={loadData}
            onClose={() => setShowSettings(false)}
          />
        )}
        <nav className="tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {loading && <div className="loading">Загрузка...</div>}
        {error && <div className="error">Ошибка: {error}</div>}
        {!loading && !error && (
          <>
            {tab === 'dashboard' && (
              <Dashboard players={players} matches={matches} snapshots={snapshots} />
            )}
            {tab === 'history' && (
              <MatchHistory players={allPlayers} matches={matches} onDeleteMatch={handleDeleteMatch} />
            )}
            {tab === 'add' && (
              <AddMatch
                players={players}
                matches={matches}
                snapshots={snapshots}
                onMatchAdded={loadData}
                onOfflineChange={refreshOfflineCount}
                onAddMatches={handleAddMatches}
              />
            )}
            {tab === 'h2h' && (
              <HeadToHead players={allPlayers} matches={matches} snapshots={snapshots} />
            )}
            {tab === 'scheduler' && (
              <Scheduler players={players} snapshots={snapshots} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
