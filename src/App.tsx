import { useState, useEffect, useCallback } from 'react';
import type { Player, Match, RatingSnapshot } from './core/types';
import { fetchPlayers, fetchAllPlayers, fetchMatches, fetchRatingSnapshots, addMatch, addRatingSnapshot } from './db/api';
import { calculateNewRatings } from './core/elo';
import { DEFAULT_INITIAL_RATING } from './core/types';
import { getQueue, getQueueSize, clearQueue } from './core/offlineQueue';
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
      let matchCount = m.length;

      for (const om of queue) {
        const rA = ratings[om.player1Id] ?? DEFAULT_INITIAL_RATING;
        const rB = ratings[om.player2Id] ?? DEFAULT_INITIAL_RATING;
        const elo = calculateNewRatings(rA, rB, om.score1, om.score2);

        maxOrder++;
        matchCount++;
        const matchId = `${om.date}-${String(matchCount).padStart(3, '0')}`;

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
              <MatchHistory players={allPlayers} matches={matches} />
            )}
            {tab === 'add' && (
              <AddMatch
                players={players}
                matches={matches}
                snapshots={snapshots}
                onMatchAdded={loadData}
                onOfflineChange={refreshOfflineCount}
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
