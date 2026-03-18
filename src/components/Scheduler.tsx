import { useState, useMemo } from 'react';
import type { Player, RatingSnapshot, Schedule } from '../core/types';
import { DEFAULT_INITIAL_RATING } from '../core/types';
import { generateSchedule } from '../core/scheduler';

interface Props {
  players: Player[];
  snapshots: RatingSnapshot[];
}

export function Scheduler({ players, snapshots }: Props) {
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
  const [courts, setCourts] = useState('2');
  const [slotMinutes, setSlotMinutes] = useState('7');
  const [totalMinutes, setTotalMinutes] = useState('60');
  const [schedule, setSchedule] = useState<Schedule | null>(null);

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

  const playerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of players) map.set(p.id, p.name);
    return map;
  }, [players]);

  function togglePlayer(id: string) {
    setSelectedPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedPlayers(new Set(players.map((p) => p.id)));
  }

  function deselectAll() {
    setSelectedPlayers(new Set());
  }

  function generate() {
    const selected = players
      .filter((p) => selectedPlayers.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        rating: currentRatings[p.id] ?? DEFAULT_INITIAL_RATING,
      }));

    const result = generateSchedule({
      players: selected,
      courts: parseInt(courts) || 2,
      slotMinutes: parseInt(slotMinutes) || 15,
      totalMinutes: parseInt(totalMinutes) || 60,
    });

    setSchedule(result);
  }

  return (
    <div>
      <h2 className="section-title">Генератор расписания</h2>

      <div className="form-group">
        <label>Участники ({selectedPlayers.size} выбрано)</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button className="btn" onClick={selectAll}>Все</button>
          <button className="btn" onClick={deselectAll}>Никого</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {players.map((p) => (
            <label
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                border: '1px solid #ddd',
                borderRadius: 6,
                background: selectedPlayers.has(p.id) ? '#dbeafe' : 'white',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              <input
                type="checkbox"
                checked={selectedPlayers.has(p.id)}
                onChange={() => togglePlayer(p.id)}
              />
              {p.name} ({currentRatings[p.id] ?? DEFAULT_INITIAL_RATING})
            </label>
          ))}
        </div>
      </div>

      <div className="form-row" style={{ marginBottom: 16 }}>
        <div className="form-group">
          <label>Кол-во кортов</label>
          <input type="number" min="1" value={courts} onChange={(e) => setCourts(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Длительность слота (мин)</label>
          <input
            type="number"
            min="5"
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(e.target.value)}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Общее время (мин)</label>
        <input
          type="number"
          min="5"
          value={totalMinutes}
          onChange={(e) => setTotalMinutes(e.target.value)}
        />
      </div>

      <button
        className="btn btn-primary"
        onClick={generate}
        disabled={selectedPlayers.size < 2}
      >
        Сгенерировать
      </button>

      {schedule && (
        <div style={{ marginTop: 24 }}>
          <h3>
            Расписание: {schedule.totalRounds} раундов
            {schedule.isFullRoundRobin ? ' (полный round-robin)' : ' (по рейтингу)'}
          </h3>

          {schedule.rounds.map((round) => (
            <div key={round.round} className="schedule-round">
              <h3>Раунд {round.round}</h3>
              {round.matches.map((m, i) => (
                <div key={i} className="schedule-match">
                  <span className="court-badge">Корт {m.court}</span>
                  <span>
                    <strong>{playerNames.get(m.player1Id) ?? m.player1Id}</strong>
                    {' vs '}
                    <strong>{playerNames.get(m.player2Id) ?? m.player2Id}</strong>
                  </span>
                </div>
              ))}
              {round.resting.length > 0 && (
                <div className="resting">
                  Отдыхают: {round.resting.map((id) => playerNames.get(id) ?? id).join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
