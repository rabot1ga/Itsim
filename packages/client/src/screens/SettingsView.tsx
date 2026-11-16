import { t, LOCALES, LOCALE_NAMES, currentLocale, type Locale } from '../lib/i18n';
import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ScreenTitle, SectionTitle, Toggle } from '../components/ui';
import { haptic } from '../lib/telegram';
import {
  PREF_KEYS,
  readPref,
  writePref,
  setContrast,
  contrastEnabled,
  readTheme,
  setTheme,
  type ThemeName,
} from '../lib/prefs';
import { playSfx } from '../lib/sfx';
import { PixelIcon } from '../components/pixel/PixelIcon';
/**
 * Settings — local, honest and small.
 *
 * Everything here is a device preference stored in localStorage: the server
 * owns the save, so the only destructive action we offer is «Новая жизнь»
 * (a real prestige reset through the API) and clearing the local preferences.
 */

export const SettingsView: React.FC = () => {
  const startNewLife = useGameStore((s) => s.startNewLife);
  const setLanguage = useGameStore((s) => s.setLanguage);
  const [notifications, setNotifications] = useState(() => readPref(PREF_KEYS.notifications, true));
  const [sound, setSound] = useState(() => readPref(PREF_KEYS.sound, false));
  const [haptics, setHaptics] = useState(() => readPref(PREF_KEYS.haptics, true));
  const [contrast, setContrastState] = useState(contrastEnabled);
  const [theme, setThemeState] = useState<ThemeName>(readTheme);
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
      <button onClick={() => useGameStore.getState().setView('profile')} className="link-back">
        {t('← Профиль')}
      </button>
      <ScreenTitle icon="gear">{t('Настройки')}</ScreenTitle>

      <section className="card">
        <div className="settings-list">
          <div className="settings-row">
            <span className="emoji" aria-hidden="true"></span>
            <span className="settings-row-label">{t('Уведомления')}</span>
            <Toggle
              checked={notifications}
              label={t('Уведомления')}
              onChange={(v) => {
                setNotifications(v);
                void useGameStore.getState().setNotifications(v); // D: серверная правда для бота
              }}
            />
          </div>
          <p className="text-2xs text-ink-600 px-1 -mt-1">
            {t('Бот пришлёт сообщение, когда банк офлайн-дней заполнен. Выключено — напоминаний не будет')}
          </p>
          <div className="settings-row">
            <span className="emoji" aria-hidden="true"></span>
            <span className="settings-row-label">{t('Звук')}</span>
            <Toggle
              checked={sound}
              label={t('Звук')}
              onChange={(v) => {
                flip(PREF_KEYS.sound, v, setSound);
                if (v) playSfx('success'); // превью уровня громкости
              }}
            />
          </div>
          <div className="settings-row">
            <span className="emoji" aria-hidden="true"></span>
            <span className="settings-row-label">{t('Вибрация')}</span>
            <Toggle checked={haptics} label={t('Вибрация')} onChange={(v) => flip(PREF_KEYS.haptics, v, setHaptics)} />
          </div>
          <div className="settings-row">
            <span className="emoji" aria-hidden="true"></span>
            <span className="settings-row-label">{t('Высокий контраст')}</span>
            <Toggle
              checked={contrast}
              label={t('Высокий контраст')}
              onChange={(v) => {
                setContrastState(v);
                setContrast(v); // вешает/снимает data-contrast="high" на <html>
                haptic('selection');
              }}
            />
          </div>
        </div>
      </section>

      <section className="card">
        <SectionTitle>{t('Тема оформления')}</SectionTitle>
        <div className="settings-row">
          <PixelIcon name="star" size={14} />
          <span className="settings-row-label">{t('Тема')}</span>
          <div className="settings-row-value" role="group" aria-label={t('Тема оформления')}>
            {(['ink', 'light'] as ThemeName[]).map((name) => (
              <button
                key={name}
                type="button"
                className={theme === name ? 'btn btn-primary' : 'btn btn-ghost'}
                aria-pressed={theme === name}
                onClick={() => {
                  setThemeState(name);
                  setTheme(name); // вешает/снимает data-theme="light" на <html>
                  haptic('selection');
                }}
              >
                {name === 'ink' ? t('Чернильная') : t('Светлая')}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <SectionTitle>{t('Язык')}</SectionTitle>
        <div className="settings-row">
          <PixelIcon name="globe" size={14} />
          <span className="settings-row-label">{t('Язык интерфейса')}</span>
          <div className="settings-row-value" role="group" aria-label={t('Язык интерфейса')}>
            {LOCALES.map((l: Locale) => (
              <button
                key={l}
                type="button"
                className={currentLocale() === l ? 'btn btn-primary' : 'btn btn-ghost'}
                aria-pressed={currentLocale() === l}
                onClick={() => {
                  haptic('selection');
                  void setLanguage(l); // выбор живёт в профиле (P2.5)
                }}
              >
                {LOCALE_NAMES[l]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <SectionTitle>{t('Опасная зона')}</SectionTitle>
        <p className="subtle mt-2">
          {t('«Новая жизнь» обнуляет карьеру, деньги и предметы. Достижения и мета-прогресс остаются с тобой.')}
        </p>
        {confirming ? (
          <div className="grid gap-2 mt-3 grid-cols-[minmax(0,1fr)]">
            <button className="btn btn-danger w-full" disabled={busy} onClick={reset}>
              {busy ? t('Начинаем заново…') : t('Да, начать новую жизнь')}
            </button>
            <button className="btn btn-ghost w-full" onClick={() => setConfirming(false)}>
              {t('Отмена')}
            </button>
          </div>
        ) : (
          <button className="btn btn-ghost w-full mt-3" onClick={() => setConfirming(true)}>
            {t('Сбросить прогресс')}
          </button>
        )}
      </section>

      <p className="subtle text-center">v2.1 · IT Life Simulator</p>
    </div>
  );
};
