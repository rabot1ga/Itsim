import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initTelegramApp } from './lib/telegram';
import { ErrorBoundary } from './components/ErrorBoundary';

// Telegram chrome: fullscreen, stable viewport height, dark header, haptics-ready.
// Safe no-op in a plain browser.
initTelegramApp();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
