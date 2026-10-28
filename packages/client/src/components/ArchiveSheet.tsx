import { t } from '../lib/i18n';
import React from 'react';
import { useGameStore } from '../store/gameStore';
import { PixelIcon } from './pixel/PixelIcon';

/**
 * «Архив» (DESIGN-DECK §2): таббар заменён двумя контролами — «Сегодня»
 * (стек) и «Архив». Все экраны-панели живут здесь: открываются поверх стека,
 * «← Назад» возвращает к текущей карточке.
 */
export const ARCHIVE_ENTRIES: Array<{ view: string; icon: string; label: string; hint: string }> = [
  { view: 'career', icon: 'briefcase', label: t('Работа'), hint: t('задачи, биржа, вакансии') },
  { view: 'skills', icon: 'book', label: t('Развитие'), hint: t('навыки, пути, перки') },
  { view: 'progress', icon: 'chart', label: t('Прогресс'), hint: t('лента, цели, рейтинг') },
  { view: 'overview', icon: 'calendar', label: t('Обзор дня'), hint: t('все детали: быт, майнинг, банк дней') },
  { view: 'rest', icon: 'walk', label: t('Отдых'), hint: t('сон, спорт, люди') },
  { view: 'room', icon: 'house', label: t('Дом'), hint: t('комната, декор, гардероб') },
  { view: 'pet', icon: 'bone', label: t('Питомец'), hint: t('уход, игра, комнаты') },
  { view: 'office', icon: 'laptop', label: t('Офис'), hint: t('коллеги, созвоны, легаси') },
  { view: 'mining', icon: 'chip', label: t('Майнинг-ферма'), hint: t('доход, курс, свет') },
  { view: 'shop', icon: 'bag', label: t('Магазин'), hint: t('техника, еда, апгрейды') },
  { view: 'friends', icon: 'people', label: t('Друзья'), hint: t('отношения и связи') },
  { view: 'leaderboard', icon: 'trophy', label: t('Рейтинг'), hint: t('таблица игроков') },
  { view: 'profile', icon: 'person', label: t('Профиль'), hint: t('жизни, финалы, настройки') },
  { view: 'settings', icon: 'gear', label: t('Настройки'), hint: t('язык, звук, уведомления') },
];

export const ArchiveSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const setView = useGameStore((s) => s.setView);
  if (!open) return null;
  return (
    <div className="archive-backdrop" onClick={onClose}>
      <nav className="archive-sheet animate-pop-in" aria-label={t('Архив')} onClick={(e) => e.stopPropagation()}>
        <h2 className="archive-title">{t('Архив жизни')}</h2>
        <div className="archive-grid">
          {ARCHIVE_ENTRIES.map((e) => (
            <button
              key={e.view}
              className="tile archive-item"
              aria-label={e.label}
              onClick={() => {
                setView(e.view);
                onClose();
              }}
            >
              <PixelIcon name={e.icon} size={16} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink-100 leading-tight">{e.label}</span>
                <span className="block text-2xs text-ink-500 leading-tight mt-0.5">{e.hint}</span>
              </span>
            </button>
          ))}
        </div>
        <button className="btn btn-ghost w-full mt-2" onClick={onClose}>
          {t('Закрыть')}
        </button>
      </nav>
    </div>
  );
};
