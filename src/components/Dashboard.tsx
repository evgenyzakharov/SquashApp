import { useMemo } from 'react';
import type { Player, Match, RatingSnapshot } from '../core/types';
import { calculateAllStats } from '../core/stats';

interface Props {
  players: Player[];
  matches: Match[];
  snapshots: RatingSnapshot[];
  onPlayerClick: (playerId: string) => void;
}

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
              <th className="col-desktop">#</th>
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
            {stats.map((s, i) => (
              <tr key={s.playerId}>
                <td className="col-desktop">{i + 1}</td>
                <td>
                  <button
                    onClick={() => onPlayerClick(s.playerId)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, color: 'inherit', fontSize: 'inherit', textDecoration: 'underline dotted' }}
                  >
                    {playerNames.get(s.playerId) ?? s.playerId}
                  </button>
                </td>
                <td><strong>{s.currentRating}</strong></td>
                <td className="col-desktop">{s.peakRating}</td>
                <td className="col-desktop">{s.peakDate ? s.peakDate.slice(8, 10) + '.' + s.peakDate.slice(5, 7) : '—'}</td>
                <td className="col-desktop">{s.games}</td>
                <td>{(s.winPercent * 100).toFixed(0)}%</td>
                <td className={`col-desktop ${s.avgDifference >= 0 ? 'stat-positive' : 'stat-negative'}`}>
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
