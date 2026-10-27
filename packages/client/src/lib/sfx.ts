/**
 * Звук (долг «Звуки», docs/TODO.md §5): крошечный WebAudio-синтезатор без
 * ассетов — щелчки и звоночки рождаются из осцилляторов. Преф живёт в
 * localStorage (`itsim_pref_sound`, как в SettingsView); по умолчанию выключен.
 *
 * Autoplay-политика браузеров: AudioContext стартует лениво и «просыпается»
 * на первом жесте пользователя — все вызовы идут из обработчиков кликов.
 */

import { PREF_KEYS, readPref } from './prefs';

const PREF_SOUND = PREF_KEYS.sound;

export type SfxKind = 'tap' | 'success' | 'error' | 'coin' | 'levelup' | 'event';

function soundEnabled(): boolean {
  return readPref(PREF_SOUND, false);
}

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!soundEnabled()) return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Одна нота: частота (Гц), старт (с от нуля), длительность (с), громкость. */
function tone(freq: number, start: number, dur: number, gain = 0.12, type: OscillatorType = 'triangle'): void {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const vol = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  vol.gain.setValueAtTime(0.0001, t0);
  vol.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  vol.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(vol).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const RECIPES: Record<SfxKind, () => void> = {
  // Короткий щелчок кнопки
  tap: () => tone(880, 0, 0.04, 0.07, 'square'),
  // Действие прошло
  success: () => {
    tone(660, 0, 0.07);
    tone(880, 0.07, 0.1);
  },
  // Ошибка сервера / отказ
  error: () => {
    tone(220, 0, 0.12, 0.12, 'sawtooth');
    tone(180, 0.1, 0.16, 0.1, 'sawtooth');
  },
  // Деньги
  coin: () => {
    tone(988, 0, 0.05, 0.09, 'square');
    tone(1319, 0.05, 0.12, 0.09, 'square');
  },
  // Повышение/уровень
  levelup: () => {
    tone(523, 0, 0.09);
    tone(659, 0.09, 0.09);
    tone(784, 0.18, 0.09);
    tone(1047, 0.27, 0.18);
  },
  // Карточка события
  event: () => {
    tone(740, 0, 0.08);
    tone(988, 0.08, 0.14);
  },
};

export function playSfx(kind: SfxKind): void {
  try {
    RECIPES[kind]();
  } catch {
    /* звук никогда не ломает игру */
  }
}
