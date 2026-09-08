/**
 * Telegram Mini App helpers — one place for all WebApp API access.
 *
 * - initTelegramApp(): ready/expand, stable viewport height, header colors,
 *   disable pull-down-to-close conflicts (vertical swipes)
 * - haptic(): impact / notification / selection feedback (no-op outside Telegram)
 * - MainButton / BackButton wrappers with safe fallbacks for browser dev
 */

interface TelegramMainButton {
  show: () => void;
  hide: () => void;
  setText: (text: string) => void;
  setParams: (params: Record<string, string | boolean>) => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
  showProgress: (leaveActive?: boolean) => void;
  hideProgress: () => void;
  readonly isVisible: boolean;
}

interface TelegramBackButton {
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
  readonly isVisible: boolean;
}

interface TelegramHaptics {
  impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
  notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
  selectionChanged: () => void;
}

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  /** Raw init data for server-side validation (empty in plain browsers). */
  initData?: string;
  viewportHeight?: number;
  viewportStableHeight?: number;
  onEvent: (event: string, cb: () => void) => void;
  offEvent: (event: string, cb: () => void) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  openInvoice?: (url: string, callback?: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void) => void;
  openTelegramLink?: (url: string) => void;
  MainButton?: TelegramMainButton;
  BackButton?: TelegramBackButton;
  HapticFeedback?: TelegramHaptics;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegram(): TelegramWebApp | undefined {
  return window.Telegram?.WebApp;
}

export function isTelegram(): boolean {
  return !!window.Telegram?.WebApp;
}

let initialized = false;

/** Call once at startup (main.tsx). Safe to call in a plain browser. */
/** The app background (--bg in index.css) — Telegram's chrome is painted to match. */
export const APP_INK = '#11151c';

/** Re-apply header/background colours (safe to call again after a theme change). */
export function applyTelegramChrome(): void {
  const tg = getTelegram();
  if (!tg) return;
  try {
    tg.setHeaderColor?.(APP_INK);
    tg.setBackgroundColor?.(APP_INK);
  } catch {
    /* noop */
  }
}

export function initTelegramApp(): void {
  const tg = getTelegram();
  if (!tg || initialized) return;
  initialized = true;

  try {
    tg.ready();
  } catch {
    /* noop */
  }
  try {
    tg.expand();
  } catch {
    /* noop */
  }

  // Keep the app at full height and sync the CSS var Telegram gives us.
  const syncViewport = () => {
    const h = tg.viewportStableHeight || tg.viewportHeight;
    if (h && h > 0) {
      document.documentElement.style.setProperty('--tg-viewport-stable-height', `${h}px`);
    }
  };
  syncViewport();
  try {
    tg.onEvent('viewportChanged', syncViewport);
  } catch {
    /* older clients */
  }

  // Blend the native chrome into our dark theme.
  try {
    tg.setHeaderColor?.(APP_INK);
    tg.setBackgroundColor?.(APP_INK);
  } catch {
    /* noop */
  }

  // Prevent the "swipe down closes the app" gesture from fighting our scroll.
  try {
    tg.disableVerticalSwipes?.();
  } catch {
    /* Bot API < 7.7 */
  }
}

// ---------------------------------------------------------------------------
// Haptics
// ---------------------------------------------------------------------------

export type HapticKind =
  | 'tap' // light impact — default button press
  | 'medium'
  | 'heavy'
  | 'selection' // tab switches, toggles
  | 'success' // offer, achievement, level-up
  | 'error' // failed action
  | 'warning';

/** No-op outside Telegram or on clients without HapticFeedback. */
export function haptic(kind: HapticKind = 'tap'): void {
  const hf = getTelegram()?.HapticFeedback;
  if (!hf) return;
  try {
    switch (kind) {
      case 'selection':
        hf.selectionChanged();
        return;
      case 'success':
      case 'error':
      case 'warning':
        hf.notificationOccurred(kind);
        return;
      case 'medium':
        hf.impactOccurred('medium');
        return;
      case 'heavy':
        hf.impactOccurred('heavy');
        return;
      case 'tap':
      default:
        hf.impactOccurred('light');
    }
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// MainButton (native bottom CTA)
// ---------------------------------------------------------------------------

export function isMainButtonSupported(): boolean {
  return !!getTelegram()?.MainButton;
}

export function showMainButton(text: string, onClick: () => void): void {
  const btn = getTelegram()?.MainButton;
  if (!btn) return;
  try {
    btn.setParams({ text, color: '#0284c7', text_color: '#ffffff' });
    btn.onClick(onClick);
    btn.show();
  } catch {
    /* noop */
  }
}

export function hideMainButton(onClick?: () => void): void {
  const btn = getTelegram()?.MainButton;
  if (!btn) return;
  try {
    if (onClick) btn.offClick(onClick);
    if (btn.isVisible) btn.hide();
  } catch {
    /* noop */
  }
}

export function setMainButtonProgress(busy: boolean): void {
  const btn = getTelegram()?.MainButton;
  if (!btn) return;
  try {
    if (busy) btn.showProgress(false);
    else btn.hideProgress();
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// BackButton (native top-left back)
// ---------------------------------------------------------------------------

export function showBackButton(onClick: () => void): void {
  const btn = getTelegram()?.BackButton;
  if (!btn) return;
  try {
    btn.onClick(onClick);
    btn.show();
  } catch {
    /* noop */
  }
}

export function hideBackButton(onClick?: () => void): void {
  const btn = getTelegram()?.BackButton;
  if (!btn) return;
  try {
    if (onClick) btn.offClick(onClick);
    if (btn.isVisible) btn.hide();
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// Payments (Telegram Stars)
// ---------------------------------------------------------------------------

export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending';

/**
 * Open a Stars invoice. Inside Telegram this is the native payment sheet;
 * in a plain browser (local dev) we fall back to a new tab so the flow is at
 * least inspectable.
 */
export function openInvoice(url: string, callback?: (status: InvoiceStatus) => void): void {
  const tg = getTelegram();
  if (tg?.openInvoice) {
    try {
      tg.openInvoice(url, (status) => callback?.(status));
      return;
    } catch {
      /* fall through */
    }
  }
  window.open(url, '_blank');
  callback?.('pending');
}
