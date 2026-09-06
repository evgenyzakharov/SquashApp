import { useState, useMemo, useRef, useCallback } from 'react';
import type { Player, Match, RatingSnapshot } from '../core/types';
import { calculateNewRatings } from '../core/elo';
import { DEFAULT_INITIAL_RATING } from '../core/types';
import { addMatch, addRatingSnapshot } from '../db/api';
import { addToQueue, isNetworkError } from '../core/offlineQueue';

// ─── Player avatar ───────────────────────────────────────

function PlayerAvatar({ player, size }: { player: Player; size: number }) {
  if (player.photoUrl) {
    return (
      <img src={player.photoUrl} alt={player.name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: '#dbeafe',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: Math.round(size * 0.42), flexShrink: 0, color: '#1d4ed8',
    }}>
      {player.name[0].toUpperCase()}
    </div>
  );
}

// ─── Player select with mini card ────────────────────────

interface PlayerSelectCardProps {
  label: string;
  players: Player[];
  value: string;
  exclude: string;
  currentRatings: Record<string, number>;
  onChange: (id: string) => void;
}

function PlayerSelectCard({ label, players, value, exclude, currentRatings, onChange }: PlayerSelectCardProps) {
  const selected = players.find((p) => p.id === value);
  const available = players.filter((p) => p.id !== exclude);

  return (
    <div className="form-group" style={{ minWidth: 0 }}>
      <label>{label}</label>
      <div style={{ position: 'relative' }}>
        {/* Visual card */}
        <div style={{
          border: `1.5px solid ${selected ? '#3b82f6' : '#ddd'}`,
          borderRadius: 10,
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: selected ? '#f0f6ff' : '#fff',
          minHeight: 56,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}>
          {selected ? (
            <>
              <PlayerAvatar player={selected} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {selected.name}
                </div>
                <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>
                  Elo {currentRatings[selected.id] ?? DEFAULT_INITIAL_RATING}
                </div>
              </div>
            </>
          ) : (
            <span style={{ color: '#aaa', fontSize: 13 }}>Выберите...</span>
          )}
          <span style={{ color: '#aaa', fontSize: 11, flexShrink: 0 }}>▼</span>
        </div>

        {/* Native select — transparent overlay, handles the actual tap/selection */}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            fontSize: 16, // prevents iOS zoom on focus
          }}
        >
          <option value="">Выберите...</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({currentRatings[p.id] ?? DEFAULT_INITIAL_RATING})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ─── Compact player picker (one line inside a bulk row) ──

interface RowPlayerPickerProps {
  players: Player[];
  value: string;
  exclude: string;
  currentRatings: Record<string, number>;
  onChange: (id: string) => void;
}

function RowPlayerPicker({ players, value, exclude, currentRatings, onChange }: RowPlayerPickerProps) {
  const selected = players.find((p) => p.id === value);
  const available = players.filter((p) => p.id !== exclude);

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <div style={{
        border: `1.5px solid ${selected ? '#3b82f6' : '#ddd'}`,
        borderRadius: 10,
        padding: '4px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: selected ? '#f0f6ff' : '#fff',
        minHeight: 44,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}>
        {selected ? (
          <>
            <PlayerAvatar player={selected} size={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {selected.name}
              </div>
              <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600, lineHeight: 1.2 }}>
                Elo {currentRatings[selected.id] ?? DEFAULT_INITIAL_RATING}
              </div>
            </div>
          </>
        ) : (
          <span style={{ color: '#aaa', fontSize: 13 }}>Выберите игрока...</span>
        )}
        <span style={{ color: '#aaa', fontSize: 11, flexShrink: 0 }}>▼</span>
      </div>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Игрок"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
          fontSize: 16, // prevents iOS zoom on focus
        }}
      >
        <option value="">Выберите игрока...</option>
        {available.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({currentRatings[p.id] ?? DEFAULT_INITIAL_RATING})
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Score stepper ───────────────────────────────────────

const MAX_SCORE = 99;
// Games are played to 11, so the steppers start there and get wound to the real score
const DEFAULT_SCORE = 11;

function clampScore(n: number): number {
  return Math.min(MAX_SCORE, Math.max(0, n));
}

interface ScoreStepperProps {
  value: number;
  win: boolean;
  large?: boolean;
  onSet: (v: number) => void;
  onStep: (delta: number) => void; // stepping goes through a functional update, so rapid taps never drop
}

function ScoreStepper({ value, win, large, onSet, onStep }: ScoreStepperProps) {
  const stepClass = `score-step${large ? ' score-step-lg' : ''}`;
  const valueClass = `score-value${large ? ' score-value-lg' : ''}${win ? ' win' : ''}`;

  return (
    <div className={`score-stepper${large ? ' score-stepper-lg' : ''}`}>
      <button type="button" className={stepClass} aria-label="Минус"
        onClick={() => onStep(-1)}>−</button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_SCORE}
        className={valueClass}
        aria-label="Счёт"
        value={value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onSet(isNaN(n) ? 0 : clampScore(n));
        }}
      />
      <button type="button" className={stepClass} aria-label="Плюс"
        onClick={() => onStep(1)}>+</button>
    </div>
  );
}

// ─── Bulk rows ───────────────────────────────────────────

interface BulkRow {
  key: number;
  player1Id: string;
  player2Id: string;
  score1: number;
  score2: number;
}

function emptyRow(key: number): BulkRow {
  return { key, player1Id: '', player2Id: '', score1: DEFAULT_SCORE, score2: DEFAULT_SCORE };
}

function isUntouched(r: BulkRow): boolean {
  return !r.player1Id && !r.player2Id && r.score1 === DEFAULT_SCORE && r.score2 === DEFAULT_SCORE;
}

function rowError(r: BulkRow): string | null {
  if (!r.player1Id || !r.player2Id) return 'Выберите обоих игроков';
  if (r.player1Id === r.player2Id) return 'Игроки совпадают';
  if (r.score1 === r.score2) return 'Счёт не может быть равным';
  return null;
}

// ─── Text fallback (paste results as lines) ──────────────

interface ParsedMatch {
  player1Name: string;
  player2Name: string;
  player1Id: string;
  player2Id: string;
  score1: number;
  score2: number;
  error?: string;
}

function matchesWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'матч';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'матча';
  return 'матчей';
}

interface Props {
  players: Player[];
  matches: Match[];
  snapshots: RatingSnapshot[];
  onMatchAdded: () => void;
  onOfflineChange?: () => void;
  onAddMatches?: (rawMatches: { date: string; player1Id: string; player2Id: string; score1: number; score2: number }[]) => Promise<string[]>;
}

export function AddMatch({ players, matches, snapshots, onMatchAdded, onOfflineChange, onAddMatches }: Props) {
  const [player1, setPlayer1] = useState('');
  const [player2, setPlayer2] = useState('');
  const [score1, setScore1] = useState(DEFAULT_SCORE);
  const [score2, setScore2] = useState(DEFAULT_SCORE);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkInput, setBulkInput] = useState<'rows' | 'text'>('rows');
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyRow(1)]);
  const [bulkText, setBulkText] = useState('');
  const [bulkResults, setBulkResults] = useState<string[]>([]);
  const nextRowKey = useRef(2);

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

  function updateRow(key: number, patch: Partial<BulkRow>) {
    setBulkRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const findPlayer = useCallback((name: string): Player | undefined => {
    const lower = name.toLowerCase().trim();
    return players.find((p) => p.name.toLowerCase() === lower);
  }, [players]);

  const parseBulkText = useCallback((text: string): ParsedMatch[] => {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        // Formats: "Маша Вова 8:11", "Маша - Вова 8:11", "Маша-Вова 8:11"
        const scoreMatch = line.match(/(\d+)\s*[:-]\s*(\d+)\s*$/);
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
  }, [findPlayer]);

  const parsedBulk = useMemo(() => {
    if (!bulkText.trim()) return [];
    return parseBulkText(bulkText);
  }, [bulkText, parseBulkText]);

  function stepScore(key: number, field: 'score1' | 'score2', delta: number) {
    setBulkRows((rows) => rows.map((r) => (
      r.key === key ? { ...r, [field]: clampScore(r[field] + delta) } : r
    )));
  }

  function addRow() {
    setBulkRows((rows) => [...rows, emptyRow(nextRowKey.current++)]);
  }

  function removeRow(key: number) {
    setBulkRows((rows) => {
      const left = rows.filter((r) => r.key !== key);
      return left.length > 0 ? left : [emptyRow(nextRowKey.current++)];
    });
  }

  // Rows the user actually started filling in — untouched ones are ignored
  const filledRows = useMemo(() => bulkRows.filter((r) => !isUntouched(r)), [bulkRows]);
  const bulkHasErrors = bulkInput === 'text'
    ? parsedBulk.some((m) => m.error)
    : filledRows.some((r) => rowError(r) !== null);
  const bulkCount = bulkInput === 'text' ? parsedBulk.length : filledRows.length;
  const canSubmitBulk = bulkCount > 0 && !bulkHasErrors && !saving;

  function playerName(id: string): string {
    return players.find((p) => p.id === id)?.name ?? id;
  }

  function resetBulkInput() {
    setBulkRows([emptyRow(nextRowKey.current++)]);
    setBulkText('');
  }

  async function handleBulkSubmit() {
    if (!canSubmitBulk) return;

    setSaving(true);
    setBulkResults([]);

    const source = bulkInput === 'text' ? parsedBulk : filledRows;
    const rawMatches = source.map((r) => ({
      date,
      player1Id: r.player1Id,
      player2Id: r.player2Id,
      score1: r.score1,
      score2: r.score2,
    }));

    try {
      if (onAddMatches) {
        const results = await onAddMatches(rawMatches);
        setBulkResults(results);
      } else {
        // Fallback: direct sequential insert
        const results: string[] = [];
        const ratings = { ...currentRatings };
        let maxOrder = matches.reduce((max, m) => Math.max(max, m.orderNumber ?? 0), 0);
        let matchCount = matches.length;
        for (const rm of rawMatches) {
          const rA = ratings[rm.player1Id] ?? DEFAULT_INITIAL_RATING;
          const rB = ratings[rm.player2Id] ?? DEFAULT_INITIAL_RATING;
          const elo = calculateNewRatings(rA, rB, rm.score1, rm.score2);
          maxOrder++; matchCount++;
          const matchId = `${date}-${String(matchCount).padStart(3, '0')}`;
          await addMatch({ id: matchId, orderNumber: maxOrder, date, player1Id: rm.player1Id, player2Id: rm.player2Id, score1: rm.score1, score2: rm.score2, eloBeforeP1: rA, eloBeforeP2: rB, eloAfterP1: elo.newRatingA, eloAfterP2: elo.newRatingB });
          ratings[rm.player1Id] = elo.newRatingA; ratings[rm.player2Id] = elo.newRatingB;
          await addRatingSnapshot({ date, matchId, ratings: { ...ratings } });
          results.push(`${playerName(rm.player1Id)} ${rm.score1}:${rm.score2} ${playerName(rm.player2Id)} | Elo: ${rA}→${elo.newRatingA}, ${rB}→${elo.newRatingB}`);
        }
        setBulkResults(results);
        onMatchAdded();
      }
      resetBulkInput();
    } catch (err) {
      if (isNetworkError(err)) {
        for (const rm of rawMatches) {
          addToQueue(rm);
        }
        setBulkResults([`${rawMatches.length} ${matchesWord(rawMatches.length)} сохранено офлайн (будет синхронизировано)`]);
        resetBulkInput();
        onOfflineChange?.();
      } else {
        const msg = err instanceof Error
          ? err.message
          : (err as { message?: string })?.message
            ?? JSON.stringify(err);
        setBulkResults([`Ошибка: ${msg}`]);
      }
    } finally {
      setSaving(false);
    }
  }

  const canSubmit =
    player1 && player2 && player1 !== player2 && score1 !== score2 && !saving;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const s1 = score1;
    const s2 = score2;

    try {
      setSaving(true);
      setMessage('');

      if (onAddMatches) {
        const results = await onAddMatches([{ date, player1Id: player1, player2Id: player2, score1: s1, score2: s2 }]);
        setMessage(`Матч сохранён! ${results[0] ?? ''}`);
      } else {
        // Fallback: direct insert (no date-aware positioning)
        const rA = currentRatings[player1] ?? DEFAULT_INITIAL_RATING;
        const rB = currentRatings[player2] ?? DEFAULT_INITIAL_RATING;
        const elo = calculateNewRatings(rA, rB, s1, s2);
        const maxOrder = matches.reduce((max, m) => Math.max(max, m.orderNumber ?? 0), 0);
        const matchId = `${date}-${String(matches.length + 1).padStart(3, '0')}`;
        await addMatch({
          id: matchId, orderNumber: maxOrder + 1, date,
          player1Id: player1, player2Id: player2, score1: s1, score2: s2,
          eloBeforeP1: rA, eloBeforeP2: rB, eloAfterP1: elo.newRatingA, eloAfterP2: elo.newRatingB,
        });
        await addRatingSnapshot({ date, matchId, ratings: { ...currentRatings, [player1]: elo.newRatingA, [player2]: elo.newRatingB } });
        setMessage(`Матч сохранён! Elo: ${rA}→${elo.newRatingA}, ${rB}→${elo.newRatingB}`);
        onMatchAdded();
      }
      setScore1(DEFAULT_SCORE);
      setScore2(DEFAULT_SCORE);
    } catch (err) {
      if (isNetworkError(err)) {
        addToQueue({ date, player1Id: player1, player2Id: player2, score1: s1, score2: s2 });
        setMessage('Сохранено офлайн (будет синхронизировано при подключении)');
        setScore1(DEFAULT_SCORE);
        setScore2(DEFAULT_SCORE);
        onOfflineChange?.();
      } else {
        const msg = err instanceof Error
          ? err.message
          : (err as { message?: string })?.message
            ?? JSON.stringify(err);
        setMessage(`Ошибка: ${msg}`);
      }
    } finally {
      setSaving(false);
    }
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

          <div className="input-mode-switch">
            <button
              type="button"
              className={`btn btn-sm${bulkInput === 'rows' ? ' btn-primary' : ''}`}
              onClick={() => { setBulkInput('rows'); setBulkResults([]); }}
            >
              Списком
            </button>
            <button
              type="button"
              className={`btn btn-sm${bulkInput === 'text' ? ' btn-primary' : ''}`}
              onClick={() => { setBulkInput('text'); setBulkResults([]); }}
            >
              Текстом
            </button>
          </div>

          {bulkInput === 'text' ? (
            <>
              <div className="form-group">
                <label>Вставьте результаты (по одному на строку)</label>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={"Маша Вова 8:11\nНикита Вова 12:10\nВлад - Женя 11:7"}
                  rows={6}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 16, fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>

              {parsedBulk.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <strong>Предпросмотр ({parsedBulk.length} {matchesWord(parsedBulk.length)}):</strong>
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
            </>
          ) : (
          <>
          {bulkRows.map((row, i) => {
            const err = isUntouched(row) ? null : rowError(row);
            return (
              <div key={row.key} className="bulk-row">
                <div className="bulk-row-head">
                  <span>Матч {i + 1}</span>
                  <button
                    type="button"
                    className="btn-delete-match"
                    aria-label="Удалить матч"
                    onClick={() => removeRow(row.key)}
                  >
                    ✕
                  </button>
                </div>

                <div className="bulk-side">
                  <RowPlayerPicker
                    players={players}
                    value={row.player1Id}
                    exclude={row.player2Id}
                    currentRatings={currentRatings}
                    onChange={(id) => updateRow(row.key, { player1Id: id })}
                  />
                  <ScoreStepper
                    value={row.score1}
                    win={row.score1 > row.score2}
                    onSet={(v) => updateRow(row.key, { score1: v })}
                    onStep={(d) => stepScore(row.key, 'score1', d)}
                  />
                </div>

                <div className="bulk-side">
                  <RowPlayerPicker
                    players={players}
                    value={row.player2Id}
                    exclude={row.player1Id}
                    currentRatings={currentRatings}
                    onChange={(id) => updateRow(row.key, { player2Id: id })}
                  />
                  <ScoreStepper
                    value={row.score2}
                    win={row.score2 > row.score1}
                    onSet={(v) => updateRow(row.key, { score2: v })}
                    onStep={(d) => stepScore(row.key, 'score2', d)}
                  />
                </div>

                {err && <div className="bulk-row-error">{err}</div>}
              </div>
            );
          })}

          <button
            type="button"
            className="btn btn-sm btn-add-row"
            onClick={addRow}
          >
            + Ещё матч
          </button>
          </>
          )}

          <div>
            <button
              className="btn btn-primary"
              disabled={!canSubmitBulk}
              onClick={handleBulkSubmit}
            >
              {saving
                ? 'Сохранение...'
                : `Сохранить ${bulkCount} ${matchesWord(bulkCount)}`}
            </button>
          </div>

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
          <PlayerSelectCard
            label="Игрок 1"
            players={players}
            value={player1}
            exclude={player2}
            currentRatings={currentRatings}
            onChange={setPlayer1}
          />
          <PlayerSelectCard
            label="Игрок 2"
            players={players}
            value={player2}
            exclude={player1}
            currentRatings={currentRatings}
            onChange={setPlayer2}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Счёт игрока 1</label>
            <ScoreStepper
              value={score1}
              win={score1 > score2}
              large
              onSet={setScore1}
              onStep={(d) => setScore1((s) => clampScore(s + d))}
            />
          </div>
          <div className="form-group">
            <label>Счёт игрока 2</label>
            <ScoreStepper
              value={score2}
              win={score2 > score1}
              large
              onSet={setScore2}
              onStep={(d) => setScore2((s) => clampScore(s + d))}
            />
          </div>
        </div>

        {player1 && player2 && score1 !== score2 && (
          <div style={{ padding: '12px', background: '#f0f9ff', borderRadius: 6, marginBottom: 16, fontSize: 14 }}>
            {(() => {
              const s1 = score1;
              const s2 = score2;
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
