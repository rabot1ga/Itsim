import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ScreenTitle, SectionTitle, Toggle } from '../components/ui';
import { haptic } from '../lib/telegram';

/**
 * Settings — local, honest and small.
 *
 * Everything here is a device preference stored in localStorage: the server
 * owns the save, so the only destructive action we offer is «Новая жизнь»
 * (a real prestige reset through the API) and clearing the local preferences.
 */

const KEYS = {
  notifications: 'itsim_pref_notifications',
  sound: 'itsim_pref_sound',
  haptics: 'itsim_pref_haptics',
};

function readPref(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* preferences are optional */
  }
}

export const SettingsView: React.FC = () => {
  const startNewLife = useGameStore((s) => s.startNewLife);
  const [notifications, setNotifications] = useState(() => readPref(KEYS.notifications, true));
  const [sound, setSound] = useState(() => readPref(KEYS.sound, false));
  const [haptics, setHaptics] = useState(() => readPref(KEYS.haptics, true));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const flip = (key: string, value: boolean, set: (next: boolean) => void) => {
    set(value);
    writePref(key, value);
    haptic('selection');
  };

  const reset = async () => {
    setBusy(true);
    try {
      await startNewLife();
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle emoji="⚙️">Настройки</ScreenTitle>

      <section className="card">
        <div className="settings-list">
          <div className="settings-row">
            <span className="emoji" aria-hidden="true">
              🔔
            </span>
            <span className="settings-row-label">Уведомления</span>
            <Toggle
              checked={notifications}
              label="Уведомления"
              onChange={(v) => flip(KEYS.notifications, v, setNotifications)}
            />
          </div>
          <div className="settings-row">
            <span className="emoji" aria-hidden="true">
              🎵
            </span>
            <span className="settings-row-label">Звук</span>
            <Toggle checked={sound} label="Звук" onChange={(v) => flip(KEYS.sound, v, setSound)} />
          </div>
          <div className="settings-row">
            <span className="emoji" aria-hidden="true">
              📳
            </span>
            <span className="settings-row-label">Вибрация</span>
            <Toggle checked={haptics} label="Вибрация" onChange={(v) => flip(KEYS.haptics, v, setHaptics)} />
          </div>
          <div className="settings-row">
            <span className="emoji" aria-hidden="true">
              🌗
            </span>
            <span className="settings-row-label">Тема</span>
            <span className="settings-row-value">Тёмная</span>
          </div>
        </div>
      </section>

      <section className="card">
        <SectionTitle>Опасная зона</SectionTitle>
        <p className="subtle mt-2">
          «Новая жизнь» обнуляет карьеру, деньги и предметы. Достижения и мета-прогресс остаются с тобой.
        </p>
        {confirming ? (
          <div className="grid gap-2 mt-3">
            <button className="btn btn-danger w-full" disabled={busy} onClick={reset}>
              {busy ? 'Начинаем заново…' : 'Да, начать новую жизнь'}
            </button>
            <button className="btn btn-ghost w-full" onClick={() => setConfirming(false)}>
              Отмена
            </button>
          </div>
        ) : (
          <button className="btn btn-ghost w-full mt-3" onClick={() => setConfirming(true)}>
            Сбросить прогресс
          </button>
        )}
      </section>

      <p className="subtle text-center">v2.1 · IT Life Simulator</p>
    </div>
  );
};
