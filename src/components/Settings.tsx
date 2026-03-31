import { useState } from 'react';
import type { Player } from '../core/types';
import { addPlayer, hidePlayer, unhidePlayer } from '../db/api';

interface Props {
  allPlayers: Player[];
  onChanged: () => void;
  onClose: () => void;
}

export function Settings({ allPlayers, onChanged, onClose }: Props) {
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;

    const id = name.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '_');
    const exists = allPlayers.some((p) => p.id === id);
    if (exists) {
      alert('Игрок с таким ID уже существует');
      return;
    }

    setSaving(true);
    try {
      await addPlayer({ id, name });
      setNewName('');
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (player: Player) => {
    setSaving(true);
    try {
      if (player.hidden) {
        await unhidePlayer(player.id);
      } else {
        await hidePlayer(player.id);
      }
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h3>Настройки</h3>
        <button className="btn btn-sm" onClick={onClose}>✕</button>
      </div>

      <div className="settings-section">
        <h4>Добавить игрока</h4>
        <div className="settings-add-row">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Имя игрока"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            disabled={saving}
          />
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving || !newName.trim()}>
            Добавить
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h4>Игроки</h4>
        <div className="settings-player-list">
          {allPlayers.map((p) => (
            <div key={p.id} className={`settings-player ${p.hidden ? 'hidden-player' : ''}`}>
              <span className="settings-player-name">{p.name}</span>
              <button
                className={`btn btn-sm ${p.hidden ? 'btn-primary' : 'btn-danger'}`}
                onClick={() => handleToggle(p)}
                disabled={saving}
              >
                {p.hidden ? 'Показать' : 'Скрыть'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
