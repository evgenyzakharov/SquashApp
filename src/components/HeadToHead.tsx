import { useMemo } from 'react';
import type { Player, Match, RatingSnapshot } from '../core/types';
import { buildHeadToHead, buildExpectedWinMatrix } from '../core/stats';
import { DEFAULT_INITIAL_RATING } from '../core/types';

interface Props {
  players: Player[];
  matches: Match[];
  snapshots: RatingSnapshot[];
}

export function HeadToHead({ players, matches, snapshots }: Props) {
  const activePlayers = useMemo(() => players.filter((p) => !p.hidden), [players]);

  const h2h = useMemo(() => buildHeadToHead(activePlayers, matches), [activePlayers, matches]);

  const currentRatings = useMemo(() => {
    const ratings: Record<string, number> = {};
    for (const p of activePlayers) ratings[p.id] = DEFAULT_INITIAL_RATING;
    if (snapshots.length > 0) {
      const latest = snapshots[snapshots.length - 1];
      for (const [id, r] of Object.entries(latest.ratings)) ratings[id] = r;
    }
    return ratings;
  }, [activePlayers, snapshots]);

  const expected = useMemo(
    () => buildExpectedWinMatrix(activePlayers, currentRatings),
    [activePlayers, currentRatings],
  );

  if (activePlayers.length === 0) {
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
              {activePlayers.map((p) => (
                <th key={p.id}>{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activePlayers.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.name}</strong></td>
                {activePlayers.map((col) => {
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

      <h2 className="section-title" style={{ marginTop: 32 }}>DresdenBet — вероятность победы согласно рейтингу</h2>
      <div className="matrix-table" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th></th>
              {activePlayers.map((p) => (
                <th key={p.id}>{p.name} ({currentRatings[p.id]})</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activePlayers.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.name}</strong></td>
                {activePlayers.map((col) => {
                  if (row.id === col.id) {
                    return <td key={col.id} className="self">—</td>;
                  }
                  const prob = expected.get(row.id)?.get(col.id) ?? 0.5;
                  const pct = (prob * 100).toFixed(0);
                  const bg = prob > 0.5
                    ? `rgba(22, 163, 74, ${(prob - 0.5) * 0.6})`
                    : prob < 0.5
                      ? `rgba(220, 38, 38, ${(0.5 - prob) * 0.6})`
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
