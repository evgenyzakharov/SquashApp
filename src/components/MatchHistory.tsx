import { useMemo, useState } from 'react';
import type { Player, Match } from '../core/types';

interface Props {
  players: Player[];
  matches: Match[];
  onDeleteMatch?: (matchId: string) => Promise<void>;
}

// ─── Day winner helper ─────────────────────────────────────

function getDayWinnerLabel(dayMatches: Match[], playerNames: Map<string, string>): string {
  const winsMap = new Map<string, number>();
  for (const m of dayMatches) {
    if (m.score1 === m.score2) continue;
    const winnerId = m.score1 > m.score2 ? m.player1Id : m.player2Id;
    winsMap.set(winnerId, (winsMap.get(winnerId) ?? 0) + 1);
  }
  if (winsMap.size === 0) return '';

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
    return `🏆 ${playerNames.get(id) ?? id} ${w}–${losses}`;
  }

  const names = tied.map(([id]) => playerNames.get(id) ?? id).join(', ');
  return `🏆 ${names} (по ${maxWins})`;
}

// ─── Component ────────────────────────────────────────────

export function MatchHistory({ players, matches, onDeleteMatch }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  // Group filtered matches by date (order preserved — newest first)
  const groupedByDate = useMemo(() => {
    const groups: { date: string; dayMatches: Match[] }[] = [];
    for (const m of filtered) {
      const last = groups[groups.length - 1];
      if (last && last.date === m.date) {
        last.dayMatches.push(m);
      } else {
        groups.push({ date: m.date, dayMatches: [m] });
      }
    }
    return groups;
  }, [filtered]);

  // Day winners computed from ALL matches (not filtered) so filter by player
  // doesn't distort the winner count
  const allMatchesByDate = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of matches) {
      const arr = map.get(m.date) ?? [];
      arr.push(m);
      map.set(m.date, arr);
    }
    return map;
  }, [matches]);

  const fmtDateFull = (d: string) =>
    `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

  const colSpan = onDeleteMatch ? 8 : 7;

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
              {onDeleteMatch && <th></th>}
            </tr>
          </thead>
          <tbody>
            {groupedByDate.flatMap(({ date, dayMatches }) => {
              const allForDay = allMatchesByDate.get(date) ?? dayMatches;
              const winnerLabel = getDayWinnerLabel(allForDay, playerNames);
              return [
                // Day header row
                <tr key={`hdr-${date}`} className="day-header-row">
                  <td colSpan={colSpan}>
                    <span className="day-header-date">{fmtDateFull(date)}</span>
                    {winnerLabel && (
                      <span className="day-header-winner">{winnerLabel}</span>
                    )}
                  </td>
                </tr>,
                // Match rows
                ...dayMatches.map((m) => {
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
                      {onDeleteMatch && (
                        <td>
                          <button
                            className="btn-delete-match"
                            disabled={deletingId !== null}
                            onClick={async () => {
                              if (!confirm(`Удалить матч #${m.orderNumber}?`)) return;
                              setDeletingId(m.id);
                              try {
                                await onDeleteMatch(m.id);
                              } finally {
                                setDeletingId(null);
                              }
                            }}
                          >
                            {deletingId === m.id ? '...' : '✕'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                }),
              ];
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
