import { useMemo } from 'react';
import type { Player, Match, RatingSnapshot, PlayerStats } from '../core/types';
import { calculateAllStats, cutoffDate, INACTIVE_DAYS } from '../core/stats';

interface Props {
  players: Player[];
  matches: Match[];
  snapshots: RatingSnapshot[];
  onPlayerClick: (playerId: string) => void;
}

// ─── Day winner helper ─────────────────────────────────────

function computeDayWinner(
  dayMatches: Match[],
  playerNames: Map<string, string>,
): { names: string[]; wins: number; losses: number | null; tie: boolean } | null {
  const winsMap = new Map<string, number>();
  for (const m of dayMatches) {
    if (m.score1 === m.score2) continue;
    const winnerId = m.score1 > m.score2 ? m.player1Id : m.player2Id;
    winsMap.set(winnerId, (winsMap.get(winnerId) ?? 0) + 1);
  }
  if (winsMap.size === 0) return null;

  const sorted = [...winsMap.entries()].sort((a, b) => b[1] - a[1]);
  const maxWins = sorted[0][1];
  const tied = sorted.filter(([, w]) => w === maxWins);

  if (tied.length === 1) {
    const [id, w] = tied[0];
    const losses = dayMatches.filter(
      (m) =>
        (m.player1Id === id && m.score2 > m.score1) ||
        (m.player2Id === id && m.score1 > m.score2),
    ).length;
    return { names: [playerNames.get(id) ?? id], wins: w, losses, tie: false };
  }

  return {
    names: tied.map(([id]) => playerNames.get(id) ?? id),
    wins: maxWins,
    losses: null,
    tie: true,
  };
}

// ─── Component ────────────────────────────────────────────

export function Dashboard({ players, matches, snapshots, onPlayerClick }: Props) {
  const stats = useMemo(
    () =>
      calculateAllStats(players, matches, snapshots).sort(
        (a, b) => b.currentRating - a.currentRating,
      ),
    [players, matches, snapshots],
  );

  const playerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of players) map.set(p.id, p.name);
    return map;
  }, [players]);

  // Today's winner — only shown if matches were played today
  const todayWinner = useMemo(() => {
    const today = new Date().toLocaleDateString('sv'); // YYYY-MM-DD in local TZ
    const todayMatches = matches.filter((m) => m.date === today);
    if (todayMatches.length === 0) return null;
    return computeDayWinner(todayMatches, playerNames);
  }, [matches, playerNames]);

  // Split into active / inactive by last match date
  const { activeStats, inactiveStats } = useMemo(() => {
    const cutoffStr = cutoffDate(INACTIVE_DAYS);
    const active: PlayerStats[] = [];
    const inactive: PlayerStats[] = [];
    for (const s of stats) {
      if (s.lastMatchDate && s.lastMatchDate >= cutoffStr) active.push(s);
      else inactive.push(s);
    }
    return { activeStats: active, inactiveStats: inactive };
  }, [stats]);

  const renderRow = (s: PlayerStats, rank: number | null, inactive: boolean) => (
    <tr key={s.playerId} className={inactive ? 'inactive-row' : undefined}>
      <td>{rank ?? '—'}</td>
      <td>
        <button
          onClick={() => onPlayerClick(s.playerId)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, color: 'inherit', fontSize: 'inherit', textDecoration: 'underline dotted' }}
        >
          {playerNames.get(s.playerId) ?? s.playerId}
        </button>
      </td>
      <td><strong>{s.currentRating}</strong></td>
      <td className="col-desktop">{inactive ? '—' : s.peakRating}</td>
      <td className="col-desktop">{inactive ? '—' : (s.peakDate ? s.peakDate.slice(8, 10) + '.' + s.peakDate.slice(5, 7) : '—')}</td>
      <td className="col-desktop">{s.games}</td>
      <td>{(s.winPercent * 100).toFixed(0)}%</td>
      <td className={`col-desktop ${s.avgDifference >= 0 ? 'stat-positive' : 'stat-negative'}`}>
        {s.avgDifference >= 0 ? '+' : ''}{s.avgDifference.toFixed(2)}
      </td>
      <td>{(s.rallyWinPercent * 100).toFixed(0)}%</td>
    </tr>
  );

  if (players.length === 0) {
    return <p>Нет игроков. Добавьте игроков в Supabase.</p>;
  }

  return (
    <div>
      <h2 className="section-title">Рейтинг игроков</h2>

      {/* Победитель дня */}
      {todayWinner && (
        <div style={{
          background: 'linear-gradient(135deg, #fef9c3 0%, #fde68a 100%)',
          border: '1px solid #fbbf24',
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{ fontSize: 26, lineHeight: 1 }}>🏆</span>
          <div>
            <div style={{ fontSize: 11, color: '#92400e', fontWeight: 500, marginBottom: 2 }}>
              {todayWinner.tie ? 'Победители дня' : 'Победитель дня'}
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#78350f' }}>
              {todayWinner.names.join(' · ')}
              {!todayWinner.tie && (
                <span style={{ fontWeight: 400, fontSize: 13, marginLeft: 8, color: '#92400e' }}>
                  {todayWinner.wins}–{todayWinner.losses}
                </span>
              )}
              {todayWinner.tie && (
                <span style={{ fontWeight: 400, fontSize: 13, marginLeft: 8, color: '#92400e' }}>
                  по {todayWinner.wins} {todayWinner.wins === 1 ? 'победе' : 'победы'}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Игрок</th>
              <th>Рейтинг</th>
              <th className="col-desktop">Пик30</th>
              <th className="col-desktop">Дата пика</th>
              <th className="col-desktop">Игр</th>
              <th>% Побед</th>
              <th className="col-desktop">Ø разн.</th>
              <th>% розыгр.</th>
            </tr>
          </thead>
          <tbody>
            {activeStats.map((s, i) => renderRow(s, i + 1, false))}
            {inactiveStats.length > 0 && (
              <tr className="inactive-divider-row">
                <td colSpan={9}>⏸ Не в строю · не играли больше месяца</td>
              </tr>
            )}
            {inactiveStats.map((s) => renderRow(s, null, true))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
