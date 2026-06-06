import { useState, useRef } from 'react';
import type { Player } from '../core/types';
import { addPlayer, hidePlayer, unhidePlayer, updatePlayer, uploadPlayerPhoto } from '../db/api';

interface Props {
  allPlayers: Player[];
  onChanged: () => void;
  onClose: () => void;
  onRecalculate: () => Promise<void>;
}

export function Settings({ allPlayers, onChanged, onClose, onRecalculate }: Props) {
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingPhotoPlayer, setPendingPhotoPlayer] = useState<string | null>(null);

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

  const handleRecalculate = async () => {
    if (!confirm('Пересчитать все рейтинги с нуля?\n\nЭто исправит Elo для всех матчей в правильном порядке. Операция может занять несколько секунд.')) return;
    setRecalculating(true);
    try {
      await onRecalculate();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка пересчёта');
    } finally {
      setRecalculating(false);
    }
  };

  const handlePhotoClick = (playerId: string) => {
    setPendingPhotoPlayer(playerId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingPhotoPlayer) return;
    e.target.value = '';
    setUploadingId(pendingPhotoPlayer);
    try {
      const url = await uploadPlayerPhoto(pendingPhotoPlayer, file);
      await updatePlayer(pendingPhotoPlayer, { photoUrl: url });
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка загрузки фото');
    } finally {
      setUploadingId(null);
      setPendingPhotoPlayer(null);
    }
  };

  const handleSetHand = async (player: Player, hand: 'right' | 'left') => {
    setSaving(true);
    try {
      await updatePlayer(player.id, { hand: player.hand === hand ? null : hand });
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
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
        <h4>Данные</h4>
        <button
          className="btn btn-danger btn-sm"
          onClick={handleRecalculate}
          disabled={recalculating || saving}
          style={{ width: '100%' }}
        >
          {recalculating ? 'Пересчёт...' : '🔄 Пересчитать все рейтинги'}
        </button>
        <p style={{ fontSize: 12, color: '#888', marginTop: 6, marginBottom: 0 }}>
          Пересчитывает Elo всех матчей с начала. Используй если рейтинги сбились.
        </p>
      </div>

      <div className="settings-section">
        <h4>Игроки</h4>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <div className="settings-player-list">
          {allPlayers.map((p) => (
            <div key={p.id} className={`settings-player ${p.hidden ? 'hidden-player' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Фото */}
                <button
                  onClick={() => handlePhotoClick(p.id)}
                  disabled={uploadingId === p.id}
                  title="Загрузить фото"
                  style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
                >
                  {p.photoUrl
                    ? <img src={p.photoUrl} alt={p.name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
                    : <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📷</div>
                  }
                </button>
                <span className="settings-player-name" style={{ flex: 1 }}>
                  {p.name}
                  {uploadingId === p.id && <span style={{ fontSize: 11, color: '#888', marginLeft: 6 }}>загрузка...</span>}
                </span>
                <button
                  className={`btn btn-sm ${p.hidden ? 'btn-primary' : 'btn-danger'}`}
                  onClick={() => handleToggle(p)}
                  disabled={saving}
                >
                  {p.hidden ? 'Показать' : 'Скрыть'}
                </button>
              </div>
              {/* Рука */}
              <div style={{ display: 'flex', gap: 6, paddingLeft: 44 }}>
                <span style={{ fontSize: 12, color: '#666', alignSelf: 'center' }}>Рука:</span>
                {(['right', 'left'] as const).map((h) => (
                  <button
                    key={h}
                    className={`btn btn-sm ${p.hand === h ? 'btn-primary' : ''}`}
                    style={{ fontSize: 12, padding: '2px 10px', border: p.hand === h ? 'none' : '1px solid #ddd' }}
                    onClick={() => handleSetHand(p, h)}
                    disabled={saving}
                  >
                    {h === 'right' ? 'Правая' : 'Левая'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
