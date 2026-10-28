import { t } from '../lib/i18n';
import React from 'react';
import { useGameStore } from '../store/gameStore';
import { PixelIcon } from './pixel/PixelIcon';

/**
 * Единый тост ошибок (UX-пакет G, 28.10.2026).
 *
 * Ошибка действия живёт в сторе, а не в конкретном экране: раньше карточка
 * ошибки рисовалась только на «Сегодня»/«Работе» — отказ на другом экране
 * можно было и не заметить. Тост показывает её везде, тап — скрыть.
 * Внутри `EventCard` (полноэкранное событие) свой инлайн-ошибку — там тост
 * скрывается, чтобы не дублировать.
 */
export const ErrorToast: React.FC = () => {
  const error = useGameStore((s) => s.error);
  const clearError = useGameStore((s) => s.clearError);
  if (!error) return null;
  return (
    <button
      onClick={clearError}
      className="error-toast"
      role="alert"
      aria-label={t('Ошибка: {p0}. Нажми, чтобы скрыть', { p0: error })}
    >
      <PixelIcon name="warn" size={14} />
      <span className="min-w-0 flex-1">{error}</span>
      <span className="error-toast-x" aria-hidden="true">
        ✕
      </span>
    </button>
  );
};
