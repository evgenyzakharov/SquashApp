import { useMemo } from 'react';
import type { Player, Match, RatingSnapshot } from '../core/types';
import { DEFAULT_INITIAL_RATING } from '../core/types';

interface Props {
  player: Player;
  allPlayers: Player[];
  matches: Match[];
  snapshots: RatingSnapshot[];
  rank: number;
  onBack: () => void;
}

// ─── Sparkline SVG ────────────────────────────────────────

function RatingSparkline({ ratings }: { ratings: number[] }) {
  if (ratings.length < 2) return null;

  // Internal coordinate space — SVG renders at width:100%
  const W = 1000;
  const H = 56;
  const PAD = 6;

  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const range = max - min;

  const toX = (i: number) => PAD + (i / (ratings.length - 1)) * (W - PAD * 2);
  // When range=0 (flat rating) centre the line vertically instead of bottom
  const toY = (v: number) =>
    range === 0 ? H / 2 : PAD + (1 - (v - min) / range) * (H - PAD * 2);

  const pts = ratings.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`);
  const polyline = pts.join(' ');
  const fill = `${toX(0)},${H} ${polyline} ${toX(ratings.length - 1)},${H}`;

  const last = ratings[ratings.length - 1];
  const first = ratings[0];
  const color = last >= first ? '#22c55e' : '#ef4444';

  return (
    <div style={{ width: '100%' }}>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={fill} fill="url(#spark-grad)" />
        <polyline points={polyline} fill="none" stroke={color} strokeWidth="12" strokeLinejoin="round" />
        <circle cx={toX(ratings.length - 1)} cy={toY(last)} r="20" fill={color} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#999', marginTop: 2 }}>
        <span>{Math.round(ratings[0])}</span>
        <span>{Math.round(ratings[ratings.length - 1])}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

export function PlayerProfile({ player, allPlayers, matches, snapshots, rank, onBack }: Props) {
  const playerName = (id: string) => allPlayers.find(p => p.id === id)?.name ?? id;

  const playerMatches = useMemo(
    () => matches.filter(m => m.player1Id === player.id || m.player2Id === player.id)
      .sort((a, b) => (a.orderNumber ?? 0) - (b.orderNumber ?? 0)),
    [matches, player.id],
  );

  // Current rating from latest snapshot
  const currentRating = useMemo(() => {
    if (snapshots.length === 0) return DEFAULT_INITIAL_RATING;
    const latest = snapshots[snapshots.length - 1];
    return latest.ratings[player.id] ?? DEFAULT_INITIAL_RATING;
  }, [snapshots, player.id]);

  // Elo change from last match
  const lastEloChange = useMemo(() => {
    if (playerMatches.length === 0) return null;
    const last = playerMatches[playerMatches.length - 1];
    return last.player1Id === player.id
      ? last.eloAfterP1 - last.eloBeforeP1
      : last.eloAfterP2 - last.eloBeforeP2;
  }, [playerMatches, player.id]);

  // Win/loss stats
  const { games, wins, pointsWon, pointsLost } = useMemo(() => {
    let wins = 0, pointsWon = 0, pointsLost = 0;
    for (const m of playerMatches) {
      const isP1 = m.player1Id === player.id;
      const my = isP1 ? m.score1 : m.score2;
      const opp = isP1 ? m.score2 : m.score1;
      pointsWon += my;
      pointsLost += opp;
      if (my > opp) wins++;
    }
    return { games: playerMatches.length, wins, pointsWon, pointsLost };
  }, [playerMatches, player.id]);

  const winPercent = games > 0 ? (wins / games * 100).toFixed(0) : '0';
  const avgDiff = games > 0 ? ((pointsWon - pointsLost) / games) : 0;
  const avgPointsWon = games > 0 ? pointsWon / games : 0;
  const avgPointsLost = games > 0 ? pointsLost / games : 0;
  const rallyWinPct = (pointsWon + pointsLost) > 0 ? (pointsWon / (pointsWon + pointsLost) * 100).toFixed(0) : '0';

  // Пик30 — peak over last 30 player matches (consistent with sparkline)
  const { peakRating, peakDate } = useMemo(() => {
    const last30 = playerMatches.slice(-30);
    let peak = -Infinity, peakDate: string | null = null;
    for (const m of last30) {
      const r = m.player1Id === player.id ? m.eloAfterP1 : m.eloAfterP2;
      if (r > peak) { peak = r; peakDate = m.date; }
    }
    return { peakRating: peak === -Infinity ? currentRating : peak, peakDate };
  }, [playerMatches, player.id, currentRating]);

  // Form guide — last 5 results
  const formGuide = useMemo(() => {
    return [...playerMatches].slice(-5).reverse().map(m => {
      const isP1 = m.player1Id === player.id;
      const won = isP1 ? m.score1 > m.score2 : m.score2 > m.score1;
      return won ? 'W' : 'L';
    });
  }, [playerMatches, player.id]);

  // Current streak
  const streak = useMemo(() => {
    if (playerMatches.length === 0) return null;
    const sorted = [...playerMatches].reverse();
    let count = 0;
    let type: 'win' | 'loss' | null = null;
    for (const m of sorted) {
      const isP1 = m.player1Id === player.id;
      const won = isP1 ? m.score1 > m.score2 : m.score2 > m.score1;
      const cur = won ? 'win' : 'loss';
      if (type === null) { type = cur; count = 1; }
      else if (cur === type) count++;
      else break;
    }
    return type ? { type, count } : null;
  }, [playerMatches, player.id]);

  // H2H stats per opponent
  const h2hStats = useMemo(() => {
    const map = new Map<string, { wins: number; losses: number }>();
    for (const m of playerMatches) {
      const oppId = m.player1Id === player.id ? m.player2Id : m.player1Id;
      const isP1 = m.player1Id === player.id;
      const won = isP1 ? m.score1 > m.score2 : m.score2 > m.score1;
      const s = map.get(oppId) ?? { wins: 0, losses: 0 };
      if (won) s.wins++; else s.losses++;
      map.set(oppId, s);
    }
    return map;
  }, [playerMatches, player.id]);

  // Favorite opponent — highest win%, tiebreak: most total matches
  const favorite = useMemo(() => {
    let best: { id: string; wins: number; losses: number } | null = null;
    for (const [id, s] of h2hStats) {
      if (s.wins === 0) continue;
      if (!best) { best = { id, ...s }; continue; }
      const pct = s.wins / (s.wins + s.losses);
      const bestPct = best.wins / (best.wins + best.losses);
      const total = s.wins + s.losses;
      const bestTotal = best.wins + best.losses;
      if (pct > bestPct || (pct === bestPct && total > bestTotal)) best = { id, ...s };
    }
    return best;
  }, [h2hStats]);

  // Nemesis — highest loss%, tiebreak: most total matches
  const nemesis = useMemo(() => {
    let worst: { id: string; wins: number; losses: number } | null = null;
    for (const [id, s] of h2hStats) {
      if (s.losses === 0) continue;
      if (!worst) { worst = { id, ...s }; continue; }
      const pct = s.losses / (s.wins + s.losses);
      const worstPct = worst.losses / (worst.wins + worst.losses);
      const total = s.wins + s.losses;
      const worstTotal = worst.wins + worst.losses;
      if (pct > worstPct || (pct === worstPct && total > worstTotal)) worst = { id, ...s };
    }
    return worst;
  }, [h2hStats]);

  // Rating history for sparkline — last 30 of THIS player's matches,
  // using eloAfter from each match (not snapshots, which include all players)
  const ratingHistory = useMemo(() => {
    const last30 = playerMatches.slice(-30);
    if (last30.length === 0) return [];
    // Prepend the rating before the first shown match so the chart starts from context
    const first = last30[0];
    const startRating = first.player1Id === player.id ? first.eloBeforeP1 : first.eloBeforeP2;
    const afterRatings = last30.map(m =>
      m.player1Id === player.id ? m.eloAfterP1 : m.eloAfterP2,
    );
    return [startRating, ...afterRatings];
  }, [playerMatches, player.id]);

  // Last 10 matches (newest first)
  const lastMatches = useMemo(() => [...playerMatches].reverse().slice(0, 10), [playerMatches]);

  // H2H list sorted by games desc
  const h2hList = useMemo(() => {
    return Array.from(h2hStats.entries())
      .map(([id, s]) => ({ id, ...s, total: s.wins + s.losses }))
      .sort((a, b) => b.total - a.total);
  }, [h2hStats]);

  const fmtDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  const fmtElo = (n: number | null) => n === null ? '' : n >= 0 ? `+${n}` : `${n}`;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      {/* Back */}
      <button
        className="btn btn-sm"
        onClick={onBack}
        style={{ marginBottom: 16, border: '1px solid #ddd' }}
      >
        ← Назад к рейтингу
      </button>

      {/* Header */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
        {player.photoUrl
          ? <img src={player.photoUrl} alt={player.name}
              style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #e5e7eb' }} />
          : <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, flexShrink: 0 }}>
              {player.name[0].toUpperCase()}
            </div>
        }
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 24 }}>{player.name}</h2>
            <span style={{ color: '#888', fontSize: 14 }}>#{rank} в рейтинге</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#1d4ed8' }}>◆ {currentRating}</span>
            {lastEloChange !== null && (
              <span style={{ fontSize: 14, color: lastEloChange >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                {fmtElo(lastEloChange)} (посл. матч)
              </span>
            )}
          </div>
          {player.hand && (
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
              🏸 {player.hand === 'right' ? 'Правая рука' : 'Левая рука'}
            </div>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        {[
          { label: 'Матчей', value: games },
          { label: '% Побед', value: `${winPercent}%` },
          { label: 'Пик30', value: peakRating, sub: peakDate ? fmtDate(peakDate) : null },
          { label: 'Ср. ±', value: `${avgDiff >= 0 ? '+' : ''}${avgDiff.toFixed(1)}`, color: avgDiff >= 0 ? '#16a34a' : '#dc2626' },
        ].map(c => (
          <div key={c.label} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 8px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: (c as { color?: string }).color ?? '#111' }}>{c.value}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{c.label}</div>
            {(c as { sub?: string | null }).sub && <div style={{ fontSize: 10, color: '#aaa' }}>{(c as { sub?: string | null }).sub}</div>}
          </div>
        ))}
      </div>

      {/* Secondary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
        {[
          { label: 'Побед', value: wins },
          { label: 'Очки выигр.', value: pointsWon },
          { label: 'Очки проигр.', value: pointsLost },
          { label: 'Ø выигр.', value: avgPointsWon.toFixed(1) },
          { label: 'Ø проигр.', value: avgPointsLost.toFixed(1) },
          { label: '% розыгр.', value: `${rallyWinPct}%` },
        ].map(c => (
          <div key={c.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{c.value}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Form + streak */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#666', marginRight: 4 }}>Форма:</span>
          {formGuide.map((r, i) => (
            <span key={i} style={{
              width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#fff',
              background: r === 'W' ? '#22c55e' : '#ef4444',
            }}>{r}</span>
          ))}
          {formGuide.length === 0 && <span style={{ color: '#aaa', fontSize: 13 }}>нет матчей</span>}
        </div>
        {streak && (
          <div style={{ fontSize: 13, color: streak.type === 'win' ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
            {streak.type === 'win' ? '🔥' : '❄️'} {streak.count} {streak.type === 'win' ? 'побед' : 'пораж.'} подряд
          </div>
        )}
      </div>

      {/* Sparkline */}
      {ratingHistory.length >= 2 && (
        <div style={{ marginBottom: 20 }}>
          {(() => {
            const min = Math.min(...ratingHistory);
            const max = Math.max(...ratingHistory);
            return (
              <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>
                📈 Динамика рейтинга (посл. {ratingHistory.length - 1} матчей · min: {min} · max: {max})
              </div>
            );
          })()}
          <RatingSparkline ratings={ratingHistory} />
        </div>
      )}

      {/* Favorite + Nemesis */}
      {(favorite || nemesis) && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {favorite && (
            <div style={{ flex: 1, minWidth: 140, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 12, color: '#166534', marginBottom: 4 }}>👑 Любимый соперник</div>
              <div style={{ fontWeight: 700 }}>{playerName(favorite.id)}</div>
              <div style={{ fontSize: 13, color: '#555' }}>{favorite.wins}–{favorite.losses} · {Math.round(favorite.wins / (favorite.wins + favorite.losses) * 100)}%</div>
            </div>
          )}
          {nemesis && nemesis.id !== favorite?.id && (
            <div style={{ flex: 1, minWidth: 140, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 12, color: '#991b1b', marginBottom: 4 }}>💀 Немезида</div>
              <div style={{ fontWeight: 700 }}>{playerName(nemesis.id)}</div>
              <div style={{ fontSize: 13, color: '#555' }}>{nemesis.wins}–{nemesis.losses} · {Math.round(nemesis.wins / (nemesis.wins + nemesis.losses) * 100)}%</div>
            </div>
          )}
        </div>
      )}

      {/* Last 10 matches */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-title" style={{ fontSize: 15, marginBottom: 10 }}>Последние матчи</div>
        {lastMatches.length === 0
          ? <p style={{ color: '#aaa' }}>Нет матчей</p>
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Соперник</th>
                    <th>Счёт</th>
                    <th>Elo</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lastMatches.map(m => {
                    const isP1 = m.player1Id === player.id;
                    const oppId = isP1 ? m.player2Id : m.player1Id;
                    const myScore = isP1 ? m.score1 : m.score2;
                    const oppScore = isP1 ? m.score2 : m.score1;
                    const won = myScore > oppScore;
                    const eloChange = isP1 ? m.eloAfterP1 - m.eloBeforeP1 : m.eloAfterP2 - m.eloBeforeP2;
                    return (
                      <tr key={m.id}>
                        <td>{fmtDate(m.date)}</td>
                        <td>{playerName(oppId)}</td>
                        <td>{myScore}:{oppScore}</td>
                        <td style={{ color: eloChange >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                          {fmtElo(eloChange)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block', width: 20, height: 20, borderRadius: 4,
                            background: won ? '#22c55e' : '#ef4444',
                            color: '#fff', fontSize: 11, fontWeight: 700,
                            lineHeight: '20px', textAlign: 'center',
                          }}>{won ? 'W' : 'L'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </div>

      {/* H2H */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-title" style={{ fontSize: 15, marginBottom: 10 }}>{player.name} против всех</div>
        {h2hList.length === 0
          ? <p style={{ color: '#aaa' }}>Нет данных</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {h2hList.map(({ id, wins, losses, total }) => {
                const pct = total > 0 ? wins / total : 0;
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 90, fontSize: 14, fontWeight: 500, flexShrink: 0 }}>{playerName(id)}</div>
                    <div style={{ flex: 1, height: 10, background: '#e5e7eb', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${pct * 100}%`, height: '100%', background: pct >= 0.5 ? '#22c55e' : '#ef4444', borderRadius: 5, transition: 'width .3s' }} />
                    </div>
                    <div style={{ width: 70, fontSize: 13, color: '#555', textAlign: 'right', flexShrink: 0 }}>
                      {wins}–{losses} · {Math.round(pct * 100)}%
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }
      </div>
    </div>
  );
}
