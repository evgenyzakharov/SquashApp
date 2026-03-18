import { useState, useMemo } from 'react';
import type { Player, Match, RatingSnapshot } from '../core/types';
import { calculateNewRatings } from '../core/elo';
import { DEFAULT_INITIAL_RATING } from '../core/types';
import { addMatch, addRatingSnapshot } from '../db/api';

interface Props {
  players: Player[];
  matches: Match[];
  snapshots: RatingSnapshot[];
  onMatchAdded: () => void;
}

export function AddMatch({ players, matches, snapshots, onMatchAdded }: Props) {
  const [player1, setPlayer1] = useState('');
  const [player2, setPlayer2] = useState('');
  const [score1, setScore1] = useState('');
  const [score2, setScore2] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const currentRatings = useMemo(() => {
    const ratings: Record<string, number> = {};
    for (const p of players) {
      ratings[p.id] = DEFAULT_INITIAL_RATING;
    }
    if (snapshots.length > 0) {
      const latest = snapshots[snapshots.length - 1];
      for (const [id, rating] of Object.entries(latest.ratings)) {
        ratings[id] = rating;
      }
    }
    return ratings;
  }, [players, snapshots]);

  const canSubmit =
    player1 && player2 && player1 !== player2 && score1 && score2 && !saving;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) {
      setMessage('Некорректный счёт');
      return;
    }

    const rA = currentRatings[player1] ?? DEFAULT_INITIAL_RATING;
    const rB = currentRatings[player2] ?? DEFAULT_INITIAL_RATING;
    const elo = calculateNewRatings(rA, rB, s1, s2);

    const matchId = `${date}-${String(matches.length + 1).padStart(3, '0')}`;

    const match: Match = {
      id: matchId,
      date,
      player1Id: player1,
      player2Id: player2,
      score1: s1,
      score2: s2,
      eloBeforeP1: rA,
      eloBeforeP2: rB,
      eloAfterP1: elo.newRatingA,
      eloAfterP2: elo.newRatingB,
    };

    const newRatings = { ...currentRatings };
    newRatings[player1] = elo.newRatingA;
    newRatings[player2] = elo.newRatingB;

    const snapshot: RatingSnapshot = {
      date,
      matchId,
      ratings: newRatings,
    };

    try {
      setSaving(true);
      setMessage('');
      await addMatch(match);
      await addRatingSnapshot(snapshot);
      setMessage(
        `Матч сохранён! ${playerName(player1)} ${s1}:${s2} ${playerName(player2)} | ` +
        `Elo: ${rA}→${elo.newRatingA}, ${rB}→${elo.newRatingB}`,
      );
      setScore1('');
      setScore2('');
      onMatchAdded();
    } catch (err) {
      setMessage(`Ошибка: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  function playerName(id: string): string {
    return players.find((p) => p.id === id)?.name ?? id;
  }

  return (
    <div>
      <h2 className="section-title">Добавить результат</h2>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Дата</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Игрок 1 (Elo: {currentRatings[player1] ?? '—'})</label>
            <select value={player1} onChange={(e) => setPlayer1(e.target.value)}>
              <option value="">Выберите...</option>
              {players
                .filter((p) => p.id !== player2)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({currentRatings[p.id] ?? DEFAULT_INITIAL_RATING})
                  </option>
                ))}
            </select>
          </div>
          <div className="form-group">
            <label>Игрок 2 (Elo: {currentRatings[player2] ?? '—'})</label>
            <select value={player2} onChange={(e) => setPlayer2(e.target.value)}>
              <option value="">Выберите...</option>
              {players
                .filter((p) => p.id !== player1)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({currentRatings[p.id] ?? DEFAULT_INITIAL_RATING})
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Счёт игрока 1</label>
            <input
              type="number"
              min="0"
              value={score1}
              onChange={(e) => setScore1(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="form-group">
            <label>Счёт игрока 2</label>
            <input
              type="number"
              min="0"
              value={score2}
              onChange={(e) => setScore2(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        {player1 && player2 && score1 && score2 && (
          <div style={{ padding: '12px', background: '#f0f9ff', borderRadius: 6, marginBottom: 16, fontSize: 14 }}>
            {(() => {
              const s1 = parseInt(score1);
              const s2 = parseInt(score2);
              if (isNaN(s1) || isNaN(s2)) return null;
              const rA = currentRatings[player1] ?? DEFAULT_INITIAL_RATING;
              const rB = currentRatings[player2] ?? DEFAULT_INITIAL_RATING;
              const elo = calculateNewRatings(rA, rB, s1, s2);
              return (
                <>
                  <strong>Предпросмотр:</strong>{' '}
                  {playerName(player1)} {rA} → {elo.newRatingA} ({elo.newRatingA - rA >= 0 ? '+' : ''}{elo.newRatingA - rA}),{' '}
                  {playerName(player2)} {rB} → {elo.newRatingB} ({elo.newRatingB - rB >= 0 ? '+' : ''}{elo.newRatingB - rB})
                </>
              );
            })()}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          {saving ? 'Сохранение...' : 'Сохранить матч'}
        </button>
      </form>

      {message && (
        <p style={{ marginTop: 16, padding: 12, background: '#f0fdf4', borderRadius: 6 }}>
          {message}
        </p>
      )}
    </div>
  );
}
