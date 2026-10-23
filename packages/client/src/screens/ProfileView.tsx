import { t } from '../lib/i18n';
import React from 'react';
import { useGameStore } from '../store/gameStore';
import { ScreenTitle, SectionTitle, StatBar } from '../components/ui';
import { xpToNext } from '@itsim/shared';
import { gradeLabel, skillName } from '../lib/playerLabels';
import { profileArtwork, profileMoodOf, PROFILE_MOOD_META } from '../lib/profileArt';
const LINKS: Array<{
  view: string;
  emoji: string;
  label: string;
}> = [
  { view: 'achievements', emoji: '🎯', label: t('Цели и достижения') },
  { view: 'leaderboard', emoji: '🏆', label: t('Топ игроков') },
  { view: 'room', emoji: '🏠', label: t('Комната') },
  { view: 'friends', emoji: '👥', label: t('Друзья и знакомые') },
  { view: 'career', emoji: '💼', label: t('Карьерный рост') },
  { view: 'endings', emoji: '🏁', label: t('Финалы') },
  { view: 'settings', emoji: '⚙️', label: t('Настройки') },
];
/**
 * Профиль = «карточка жизни» (решение 22.10.2026, вариант A): баннер-портрет
 * протагониста с настроением по состоянию + чипы ключевых ресурсов. Слоистой
 * фигуры и гардероба больше нет — внешность не кастомизируется.
 */
export const ProfileView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const setView = useGameStore((s) => s.setView);
  if (!player) return null;
  const mood = profileMoodOf(player);
  const moodMeta = PROFILE_MOOD_META[mood];
  const mainId = player.mainSkillId ?? 'javascript';
  const skill = player.skills?.[mainId] ?? { level: 0, xp: 0 };
  const skills = Object.values(player.skills ?? {}) as Array<{
    level: number;
  }>;
  const need = xpToNext(skill.level);
  const eventsSeen = Object.values(player.eventHistory ?? {}).reduce((sum: number, h: any) => sum + (h?.count ?? 0), 0);
  const facts: Array<[string, string]> = [
    // e2e и design.md §10: профиль обязан называть основной навык — до этого
    // в карточке были уровень и XP, но не то, какой именно навык основной.
    [t('Основной навык'), skillName(mainId)],
    [t('Уровень'), String(skill.level)],
    [t('Опыт'), skill.level >= 100 ? t('Максимум') : `${skill.xp} / ${need} XP`],
    [t('Репутация'), `${Math.round(player.reputation ?? 0).toLocaleString('ru-RU')} ⭐`],
    [t('Достижения'), String((player.achievements ?? []).length)],
    [t('Навыков изучено'), String(skills.filter((s) => s.level > 0).length)],
    [t('Предметы'), String((player.items ?? []).length)],
  ];
  const stats: Array<[string, string]> = [
    [t('Дней в игре'), String(player.currentDay ?? 1)],
    [t('Заработано всего'), `${Math.round(player.totalEarned ?? player.money ?? 0).toLocaleString('ru-RU')} ₽`],
    [t('Событий пройдено'), String(eventsSeen)],
    [t('Прожито жизней'), String(player.meta?.lives ?? 0)],
  ];
  const chips: Array<[string, string]> = [
    ['⚡', `${player.energy ?? 0}/${player.maxEnergy ?? 0}`],
    ['🔥', String(Math.round(player.motivation ?? 0))],
    ['⭐', String(Math.round(player.reputation ?? 0))],
    ['💰', `${Math.round(player.money ?? 0).toLocaleString('ru-RU')} ₽`],
  ];
  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle emoji="👤">{t('Профиль')}</ScreenTitle>

      <section className="card story-card" aria-label={t('Профиль персонажа')}>
        <p className="story-card-kicker">
          {gradeLabel(player.grade)} · {player.job?.position ?? t('карьера ещё впереди')}
        </p>
        <div className="story-card-art profile-banner">
          <img src={profileArtwork(mood)} alt={t('Настроение: {p0}', { p0: moodMeta.label })} />
        </div>
        <div className="story-card-copy">
          <h3>{moodMeta.label}</h3>
          <p>{moodMeta.line}</p>
        </div>
        <div className="profile-chips" aria-label={t('Ключевые показатели')}>
          {chips.map(([emoji, value]) => (
            <span key={emoji} className="res-chip num">
              <span aria-hidden="true">{emoji}</span> {value}
            </span>
          ))}
        </div>
        <p className="story-footnote">
          {t('День')} {player.currentDay ?? 1}
          {t('. Настроение зависит от энергии, мотивации и выгорания.')}
        </p>
      </section>

      <section className="card">
        <dl className="profile-stats">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className="num">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3">
          <StatBar resource="xp" label={t('Опыт навыка')} value={skill.xp} max={need} />
        </div>
      </section>

      <section className="card">
        <SectionTitle>{t('Статистика')}</SectionTitle>
        <dl className="profile-stats mt-2">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className="num">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="profile-links">
        {LINKS.map((link) => (
          <button key={link.view} className="btn btn-secondary justify-start" onClick={() => setView(link.view)}>
            <span aria-hidden="true">{link.emoji}</span>
            {link.label}
          </button>
        ))}
      </div>
    </div>
  );
};
