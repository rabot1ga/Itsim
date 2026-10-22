import React from 'react';
import { useGameStore } from '../store/gameStore';
import { ScreenTitle, SectionTitle, StatBar } from '../components/ui';
import { xpToNext } from '@itsim/shared';
import { gradeLabel, skillName } from '../lib/playerLabels';
import { profileArtwork, profileMoodOf, PROFILE_MOOD_META } from '../lib/profileArt';

const LINKS: Array<{ view: string; emoji: string; label: string }> = [
  { view: 'achievements', emoji: '🎯', label: 'Цели и достижения' },
  { view: 'leaderboard', emoji: '🏆', label: 'Топ игроков' },
  { view: 'room', emoji: '🏠', label: 'Комната' },
  { view: 'friends', emoji: '👥', label: 'Друзья и знакомые' },
  { view: 'career', emoji: '💼', label: 'Карьерный рост' },
  { view: 'endings', emoji: '🏁', label: 'Финалы' },
  { view: 'settings', emoji: '⚙️', label: 'Настройки' },
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
  const skills = Object.values(player.skills ?? {}) as Array<{ level: number }>;
  const need = xpToNext(skill.level);
  const eventsSeen = Object.values(player.eventHistory ?? {}).reduce((sum: number, h: any) => sum + (h?.count ?? 0), 0);

  const facts: Array<[string, string]> = [
    // e2e и design.md §10: профиль обязан называть основной навык — до этого
    // в карточке были уровень и XP, но не то, какой именно навык основной.
    ['Основной навык', skillName(mainId)],
    ['Уровень', String(skill.level)],
    ['Опыт', skill.level >= 100 ? 'Максимум' : `${skill.xp} / ${need} XP`],
    ['Репутация', `${Math.round(player.reputation ?? 0).toLocaleString('ru-RU')} ⭐`],
    ['Достижения', String((player.achievements ?? []).length)],
    ['Навыков изучено', String(skills.filter((s) => s.level > 0).length)],
    ['Предметы', String((player.items ?? []).length)],
  ];

  const stats: Array<[string, string]> = [
    ['Дней в игре', String(player.currentDay ?? 1)],
    ['Заработано всего', `${Math.round(player.totalEarned ?? player.money ?? 0).toLocaleString('ru-RU')} ₽`],
    ['Событий пройдено', String(eventsSeen)],
    ['Прожито жизней', String(player.meta?.lives ?? 0)],
  ];

  const chips: Array<[string, string]> = [
    ['⚡', `${player.energy ?? 0}/${player.maxEnergy ?? 0}`],
    ['🔥', String(Math.round(player.motivation ?? 0))],
    ['⭐', String(Math.round(player.reputation ?? 0))],
    ['💰', `${Math.round(player.money ?? 0).toLocaleString('ru-RU')} ₽`],
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle emoji="👤">Профиль</ScreenTitle>

      <section className="card story-card" aria-label="Профиль персонажа">
        <p className="story-card-kicker">
          {gradeLabel(player.grade)} · {player.job?.position ?? 'карьера ещё впереди'}
        </p>
        <div className="story-card-art profile-banner">
          <img src={profileArtwork(mood)} alt={`Настроение: ${moodMeta.label}`} />
        </div>
        <div className="story-card-copy">
          <h3>{moodMeta.label}</h3>
          <p>{moodMeta.line}</p>
        </div>
        <div className="profile-chips" aria-label="Ключевые показатели">
          {chips.map(([emoji, value]) => (
            <span key={emoji} className="res-chip num">
              <span aria-hidden="true">{emoji}</span> {value}
            </span>
          ))}
        </div>
        <p className="story-footnote">День {player.currentDay ?? 1}. Настроение зависит от энергии, мотивации и выгорания.</p>
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
          <StatBar resource="xp" label="Опыт навыка" value={skill.xp} max={need} />
        </div>
      </section>

      <section className="card">
        <SectionTitle>Статистика</SectionTitle>
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
