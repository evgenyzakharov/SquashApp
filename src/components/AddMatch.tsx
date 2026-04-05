import { useState, useMemo, useCallback } from 'react';
import type { Player, Match, RatingSnapshot } from '../core/types';
import { calculateNewRatings } from '../core/elo';
import { DEFAULT_INITIAL_RATING } from '../core/types';
import { addMatch, addRatingSnapshot } from '../db/api';

interface ParsedMatch {
  player1Name: string;
  player2Name: string;
  player1Id: string;
  player2Id: string;
  score1: number;
  score2: number;
  error?: string;
}

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
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkResults, setBulkResults] = useState<string[]>([]);

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

  const findPlayer = useCallback((name: string): Player | undefined => {
    const lower = name.toLowerCase().trim();
    return players.find((p) => p.name.toLowerCase() === lower);
  }, [players]);

  function parseBulkText(text: string): ParsedMatch[] {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        // Formats: "Маша Вова 8:11", "Маша - Вова 8:11", "Маша-Вова 8:11"
        const scoreMatch = line.match(/(\d+)\s*[:\-]\s*(\d+)\s*$/);
        if (!scoreMatch) {
          return { player1Name: '', player2Name: '', player1Id: '', player2Id: '', score1: 0, score2: 0, error: `"${line}" — не найден счёт` };
        }

        const s1 = parseInt(scoreMatch[1]);
        const s2 = parseInt(scoreMatch[2]);
        const namePart = line.slice(0, scoreMatch.index).trim();

        // Split names: "Маша Вова", "Маша - Вова", "Маша-Вова"
        const nameSplit = namePart.split(/\s*[-–—]\s*|\s+/);
        if (nameSplit.length < 2) {
          return { player1Name: namePart, player2Name: '', player1Id: '', player2Id: '', score1: s1, score2: s2, error: `"${line}" — не удалось разделить имена` };
        }

        // Try all possible splits (in case names have spaces)
        let p1: Player | undefined;
        let p2: Player | undefined;
        let p1Name = '';
        let p2Name = '';

        for (let i = 1; i < nameSplit.length; i++) {
          const try1 = nameSplit.slice(0, i).join(' ');
          const try2 = nameSplit.slice(i).join(' ');
          const found1 = findPlayer(try1);
          const found2 = findPlayer(try2);
          if (found1 && found2) {
            p1 = found1;
            p2 = found2;
            p1Name = try1;
            p2Name = try2;
            break;
          }
        }

        if (!p1 || !p2) {
          return { player1Name: nameSplit[0], player2Name: nameSplit.slice(1).join(' '), player1Id: '', player2Id: '', score1: s1, score2: s2, error: `"${line}" — игрок не найден` };
        }

        if (p1.id === p2.id) {
          return { player1Name: p1Name, player2Name: p2Name, player1Id: p1.id, player2Id: p2.id, score1: s1, score2: s2, error: `"${line}" — один и тот же игрок` };
        }

        return { player1Name: p1Name, player2Name: p2Name, player1Id: p1.id, player2Id: p2.id, score1: s1, score2: s2 };
      });
  }

  const parsedBulk = useMemo(() => {
    if (!bulkText.trim()) return [];
    return parseBulkText(bulkText);
  }, [bulkText, players]);

  const bulkHasErrors = parsedBulk.some((m) => m.error);
  const canSubmitBulk = parsedBulk.length > 0 && !bulkHasErrors && !saving;

  async function handleBulkSubmit() {
    if (!canSubmitBulk) return;

    setSaving(true);
    setBulkResults([]);
    const results: string[] = [];
    const ratings = { ...currentRatings };
    let maxOrder = matches.reduce((max, m) => Math.max(max, m.orderNumber ?? 0), 0);
    let matchCount = matches.length;

    try {
      for (const pm of parsedBulk) {
        const rA = ratings[pm.player1Id] ?? DEFAULT_INITIAL_RATING;
        const rB = ratings[pm.player2Id] ?? DEFAULT_INITIAL_RATING;
        const elo = calculateNewRatings(rA, rB, pm.score1, pm.score2);

        maxOrder++;
        matchCount++;
        const matchId = `${date}-${String(matchCount).padStart(3, '0')}`;

        const match: Match = {
          id: matchId,
          orderNumber: maxOrder,
          date,
          player1Id: pm.player1Id,
          player2Id: pm.player2Id,
          score1: pm.score1,
          score2: pm.score2,
          eloBeforeP1: rA,
          eloBeforeP2: rB,
          eloAfterP1: elo.newRatingA,
          eloAfterP2: elo.newRatingB,
        };

        ratings[pm.player1Id] = elo.newRatingA;
        ratings[pm.player2Id] = elo.newRatingB;

        const snapshot: RatingSnapshot = {
          date,
          matchId,
          ratings: { ...ratings },
        };

        await addMatch(match);
        await addRatingSnapshot(snapshot);

        results.push(
          `${pm.player1Name} ${pm.score1}:${pm.score2} ${pm.player2Name} | ` +
          `Elo: ${rA}→${elo.newRatingA}, ${rB}→${elo.newRatingB}`,
        );
      }

      setBulkResults(results);
      setBulkText('');
      onMatchAdded();
    } catch (err) {
      setBulkResults([...results, `Ошибка: ${err instanceof Error ? err.message : 'Unknown'}`]);
    } finally {
      setSaving(false);
    }
  }

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

    const maxOrder = matches.reduce((max, m) => Math.max(max, m.orderNumber ?? 0), 0);

    const match: Match = {
      id: matchId,
      orderNumber: maxOrder + 1,
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Добавить результат</h2>
        <button
          className={`btn btn-sm ${bulkMode ? 'btn-primary' : ''}`}
          style={{ border: bulkMode ? 'none' : '1px solid #ddd' }}
          onClick={() => { setBulkMode(!bulkMode); setMessage(''); setBulkResults([]); }}
        >
          {bulkMode ? 'Одиночный' : 'Групповой'}
        </button>
      </div>

      {bulkMode ? (
        <div>
          <div className="form-group">
            <label>Дата</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Вставьте результаты (по одному на строку)</label>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"Маша Вова 8:11\nНикита Вова 12:10\nВлад - Женя 11:7"}
              rows={6}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>

          {parsedBulk.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <strong>Предпросмотр ({parsedBulk.length} матчей):</strong>
              <div style={{ marginTop: 8, fontSize: 14 }}>
                {parsedBulk.map((pm, i) => (
                  <div key={i} style={{ padding: '4px 0', color: pm.error ? '#dc2626' : '#333' }}>
                    {pm.error
                      ? pm.error
                      : `${pm.player1Name} ${pm.score1}:${pm.score2} ${pm.player2Name}`}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            className="btn btn-primary"
            disabled={!canSubmitBulk}
            onClick={handleBulkSubmit}
          >
            {saving ? 'Сохранение...' : `Сохранить ${parsedBulk.length} матчей`}
          </button>

          {bulkResults.length > 0 && (
            <div style={{ marginTop: 16, padding: 12, background: '#f0fdf4', borderRadius: 6, fontSize: 14 }}>
              {bulkResults.map((r, i) => (
                <div key={i}>{r}</div>
              ))}
            </div>
          )}
        </div>
      ) : (
      <>
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
      </>
      )}
    </div>
  );
}
