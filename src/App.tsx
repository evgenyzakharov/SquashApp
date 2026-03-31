import { useState, useEffect, useCallback } from 'react';
import type { Player, Match, RatingSnapshot } from './core/types';
import { fetchPlayers, fetchAllPlayers, fetchMatches, fetchRatingSnapshots } from './db/api';
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

  useEffect(() => {
    loadData();
  }, [loadData]);

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
