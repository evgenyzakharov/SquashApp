import { useMemo } from 'react';
import type { Player, Match, RatingSnapshot } from '../core/types';
import { calculateAllStats } from '../core/stats';

interface Props {
  players: Player[];
  matches: Match[];
  snapshots: RatingSnapshot[];
}

export function Dashboard({ players, matches, snapshots }: Props) {
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

  if (players.length === 0) {
    return <p>Нет игроков. Добавьте игроков в Supabase.</p>;
  }

  return (
    <div>
      <h2 className="section-title">Рейтинг игроков</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Игрок</th>
              <th>Рейтинг</th>
              <th>Пик50</th>
              <th>Дата пика</th>
              <th>Игр</th>
              <th>Побед</th>
              <th>Win%</th>
              <th>Очк.+</th>
              <th>Очк.-</th>
              <th>Ø очк.+</th>
              <th>Ø очк.-</th>
              <th>Ø разн.</th>
              <th>% розыгр.</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr key={s.playerId}>
                <td>{i + 1}</td>
                <td><strong>{playerNames.get(s.playerId) ?? s.playerId}</strong></td>
                <td><strong>{s.currentRating}</strong></td>
                <td>{s.peakRating}</td>
                <td>{s.peakDate ?? '—'}</td>
                <td>{s.games}</td>
                <td>{s.wins}</td>
                <td>{(s.winPercent * 100).toFixed(0)}%</td>
                <td>{s.pointsWon}</td>
                <td>{s.pointsLost}</td>
                <td>{s.avgPointsWon.toFixed(1)}</td>
                <td>{s.avgPointsLost.toFixed(1)}</td>
                <td className={s.avgDifference >= 0 ? 'stat-positive' : 'stat-negative'}>
                  {s.avgDifference >= 0 ? '+' : ''}{s.avgDifference.toFixed(2)}
                </td>
                <td>{(s.rallyWinPercent * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
