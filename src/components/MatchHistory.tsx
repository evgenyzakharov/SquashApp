import { useMemo, useState } from 'react';
import type { Player, Match } from '../core/types';

interface Props {
  players: Player[];
  matches: Match[];
}

export function MatchHistory({ players, matches }: Props) {
  const [filterPlayer, setFilterPlayer] = useState('');
  const [filterDate, setFilterDate] = useState('');

  const playerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of players) map.set(p.id, p.name);
    return map;
  }, [players]);

  const filtered = useMemo(() => {
    let result = [...matches].reverse(); // newest first
    if (filterPlayer) {
      result = result.filter(
        (m) => m.player1Id === filterPlayer || m.player2Id === filterPlayer,
      );
    }
    if (filterDate) {
      result = result.filter((m) => m.date === filterDate);
    }
    return result;
  }, [matches, filterPlayer, filterDate]);

  const uniqueDates = useMemo(() => {
    const dates = new Set(matches.map((m) => m.date));
    return [...dates].sort().reverse();
  }, [matches]);

  return (
    <div>
      <h2 className="section-title">История матчей</h2>

      <div className="filter-bar">
        <select value={filterPlayer} onChange={(e) => setFilterPlayer(e.target.value)}>
          <option value="">Все игроки</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
          <option value="">Все даты</option>
          {uniqueDates.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        {(filterPlayer || filterDate) && (
          <button className="btn" onClick={() => { setFilterPlayer(''); setFilterDate(''); }}>
            Сбросить
          </button>
        )}
      </div>

      <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Дата</th>
            <th>Игрок 1</th>
            <th>Счёт</th>
            <th>Игрок 2</th>
            <th>Elo до</th>
            <th>Elo после</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((m) => {
            const p1Won = m.score1 > m.score2;
            const p2Won = m.score2 > m.score1;
            const isDraw = m.score1 === m.score2;
            return (
              <tr key={m.id}>
                <td>{m.orderNumber}</td>
                <td>{m.date}</td>
                <td className={p1Won ? 'match-win' : isDraw ? 'match-draw' : 'match-loss'}>
                  {playerNames.get(m.player1Id) ?? m.player1Id}
                </td>
                <td>
                  <strong>{m.score1}</strong> : <strong>{m.score2}</strong>
                </td>
                <td className={p2Won ? 'match-win' : isDraw ? 'match-draw' : 'match-loss'}>
                  {playerNames.get(m.player2Id) ?? m.player2Id}
                </td>
                <td>{m.eloBeforeP1} / {m.eloBeforeP2}</td>
                <td>{m.eloAfterP1} / {m.eloAfterP2}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {filtered.length === 0 && (
        <p style={{ textAlign: 'center', padding: 20, color: '#6b7280' }}>
          Нет матчей
        </p>
      )}
    </div>
  );
}
