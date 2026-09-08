import React from 'react';

/**
 * Last line of defence: a crash used to blank the whole Mini App to white,
 * which tells the player nothing and tells us even less. Catch it, show what
 * broke and offer a reload.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[itsim] render crashed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="section-title">Что-то сломалось</p>
        <p className="text-sm text-ink-400 max-w-xs">
          Экран не отрисовался. Прогресс сохранён на сервере — попробуйте перезагрузить.
        </p>
        <pre className="well text-2xs text-left text-ink-500 max-w-full overflow-auto">
          {error.message}
        </pre>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Перезагрузить
        </button>
      </div>
    );
  }
}
