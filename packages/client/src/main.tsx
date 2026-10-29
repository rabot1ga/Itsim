import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initTelegramApp } from './lib/telegram';
import { applyContrast, applyTheme } from './lib/prefs';
import { ErrorBoundary } from './components/ErrorBoundary';

// Telegram chrome: fullscreen, stable viewport height, dark header, haptics-ready.
// Safe no-op in a plain browser.
initTelegramApp();
// High-contrast preference (device-local) — before first paint.
applyContrast();
applyTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
