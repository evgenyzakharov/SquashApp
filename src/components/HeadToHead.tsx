import { useMemo } from 'react';
import type { Player, Match } from '../core/types';
import { buildHeadToHead } from '../core/stats';

interface Props {
  players: Player[];
  matches: Match[];
}

export function HeadToHead({ players, matches }: Props) {
  const h2h = useMemo(() => buildHeadToHead(players, matches), [players, matches]);

  if (players.length === 0) {
    return <p>Нет данных</p>;
  }

  return (
    <div>
      <h2 className="section-title">Head-to-Head (% побед)</h2>
      <div className="matrix-table" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th></th>
              {players.map((p) => (
                <th key={p.id}>{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.name}</strong></td>
                {players.map((col) => {
                  if (row.id === col.id) {
                    return <td key={col.id} className="self">—</td>;
                  }
                  const winPct = h2h.get(row.id)?.get(col.id) ?? 0;
                  const pct = (winPct * 100).toFixed(0);
                  const bg = winPct > 0.5
                    ? `rgba(22, 163, 74, ${winPct * 0.3})`
                    : winPct < 0.5
                      ? `rgba(220, 38, 38, ${(1 - winPct) * 0.3})`
                      : undefined;
                  return (
                    <td key={col.id} style={{ background: bg }}>
                      {pct}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
