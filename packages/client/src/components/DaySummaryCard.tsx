import { t } from '../lib/i18n';
import React from 'react';
import type { DaySummary } from '../store/gameStore';
import { PixelIcon } from './pixel/PixelIcon';
import { formatMoney } from '../screens/actionCatalogue';

/**
 * Итоги завершённого дня (UX-пакет D, 28.10.2026).
 *
 * Раньше ход растворялся: «Завершить день» → всплывающие «+N ₽» → и всё.
 * Сводка показывает, чем день закончился: сообщения сервера (зарплата,
 * выгорание, достижения) и дельты ресурсов. Заменяет строку «Вчера».
 */
export const DaySummaryCard: React.FC<{
  summary: DaySummary;
  onDismiss: () => void;
}> = ({ summary, onDismiss }) => {
  const { deltas } = summary;
  const rows: Array<{ key: string; icon: string; label: string; text: string; good: boolean }> = [];
  if (deltas.money)
    rows.push({
      key: 'money',
      icon: 'coin',
      label: t('Деньги'),
      text: `${deltas.money > 0 ? '+' : '−'}${formatMoney(Math.abs(deltas.money))} ₽`,
      good: deltas.money > 0,
    });
  if (deltas.energy > 0)
    rows.push({
      key: 'energy',
      icon: 'bolt',
      label: t('Энергия'),
      text: `+${deltas.energy}`,
      good: true,
    });
  if (deltas.motivation)
    rows.push({
      key: 'motivation',
      icon: 'flame',
      label: t('Мотивация'),
      text: `${deltas.motivation > 0 ? '+' : '−'}${Math.abs(deltas.motivation)}`,
      good: deltas.motivation > 0,
    });
  if (deltas.health)
    rows.push({
      key: 'health',
      icon: 'heart',
      label: t('Здоровье'),
      text: `${deltas.health > 0 ? '+' : '−'}${Math.abs(deltas.health)}`,
      good: deltas.health > 0,
    });
  if (deltas.levelsUp > 0)
    rows.push({
      key: 'levels',
      icon: 'book',
      label: t('Уровни навыков'),
      text: `+${deltas.levelsUp}`,
      good: true,
    });
  return (
    <section className="story-card day-summary-card animate-pop-in" aria-label={t('Итоги дня')}>
      <div className="story-card-kicker">
        <PixelIcon name="moon" size={12} />
        {t('День завершён')}
      </div>
      <div className="story-card-copy">
        <h2>{t('День {p0} завершён', { p0: summary.day })}</h2>
        {summary.messages.length === 0 ? (
          <p>{t('День прошёл спокойно — и это тоже результат.')}</p>
        ) : (
          <ul className="day-summary-log">
            {summary.messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </div>
      {rows.length > 0 && (
        <div className="story-outcome">
          <h3>{t('Итоги')}</h3>
          <dl className="story-effects">
            {rows.map((row) => (
              <div key={row.key} className={row.good ? 'is-positive' : 'is-negative'}>
                <dt>
                  <PixelIcon name={row.icon} size={12} />
                  <span>{row.label}</span>
                </dt>
                <dd className="num">{row.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <div className="story-choices">
        <button className="btn btn-primary w-full" onClick={onDismiss}>
          {summary.hasEvent ? t('Далее') : t('Готово')}
        </button>
      </div>
    </section>
  );
};
