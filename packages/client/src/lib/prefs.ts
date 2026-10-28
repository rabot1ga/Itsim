/**
 * Настройки устройства (долги «Звуки» и «режим высокого контраста»): одна
 * точка правды для ключей и применения. Всё живёт в localStorage — сервер
 * владеет сейвом, префы — личное дело каждого устройства.
 */

export const PREF_KEYS = {
  notifications: 'itsim_pref_notifications',
  sound: 'itsim_pref_sound',
  haptics: 'itsim_pref_haptics',
  contrast: 'itsim_pref_contrast',
} as const;

export function readPref(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* preferences are optional */
  }
}

export function contrastEnabled(): boolean {
  return readPref(PREF_KEYS.contrast, false);
}

export function setContrast(enabled: boolean): void {
  writePref(PREF_KEYS.contrast, enabled);
  applyContrast();
}

/** Вешает data-contrast="high" на <html>; вызывается и при старте приложения. */
export function applyContrast(): void {
  const root = document.documentElement;
  if (contrastEnabled()) root.dataset.contrast = 'high';
  else delete root.dataset.contrast;
}
