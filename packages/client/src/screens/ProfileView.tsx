import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { PlayerPortrait } from '../components/PlayerPortrait';
import { ScreenTitle, SectionTitle, StatBar } from '../components/ui';
import { fetchSkillNames } from '../lib/skillNames';
import { xpToNext } from '@itsim/shared';

const GRADES: Record<string, string> = {
  unemployed: 'В начале пути',
  intern: 'Стажёр',
  junior: 'Junior Developer',
  middle: 'Middle Developer',
  senior: 'Senior Developer',
  teamlead: 'Teamlead',
  architect: 'Архитектор',
  cto: 'CTO',
};

const LINKS: Array<{ view: string; emoji: string; label: string }> = [
  { view: 'achievements', emoji: '🎯', label: 'Цели и достижения' },
  { view: 'leaderboard', emoji: '🏆', label: 'Топ игроков' },
  { view: 'room', emoji: '🏠', label: 'Комната и гардероб' },
  { view: 'friends', emoji: '👥', label: 'Друзья и знакомые' },
  { view: 'wallet', emoji: '💼', label: 'Кошелёк и NFT' },
  { view: 'career', emoji: '💼', label: 'Карьерный рост' },
  { view: 'endings', emoji: '🏁', label: 'Финалы' },
  { view: 'settings', emoji: '⚙️', label: 'Настройки' },
];

/** The full-screen version of the reference profile card. */
export const ProfileView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const setView = useGameStore((s) => s.setView);
  const [skillNames, setSkillNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    fetchSkillNames().then((map) => {
      if (alive) setSkillNames(map);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!player) return null;

  const mainId = player.mainSkillId ?? 'javascript';
  const skill = player.skills?.[mainId] ?? { level: 0, xp: 0 };
  const skills = Object.values(player.skills ?? {}) as Array<{ level: number }>;
  const need = xpToNext(skill.level);
  const eventsSeen = Object.values(player.eventHistory ?? {}).reduce((sum: number, h: any) => sum + (h?.count ?? 0), 0);

  const facts: Array<[string, string]> = [
    ['Основной навык', `${skillNames[mainId] ?? mainId} · ур. ${skill.level}`],
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

  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle emoji="👤">Профиль</ScreenTitle>

      <section className="card profile-hero" aria-label="Профиль персонажа">
        <PlayerPortrait player={player} size={96} />
        <h3>Айтишник</h3>
        <p>{GRADES[player.grade] ?? player.grade}</p>
        <span className="subtle">{player.job?.position ?? 'Карьера ещё впереди'}</span>
        <dl className="profile-stats mt-3">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className="num">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3" style={{ maxWidth: 260, marginLeft: 'auto', marginRight: 'auto' }}>
          <StatBar resource="xp" label="Опыт навыка" value={skill.xp} max={need} />
        </div>
        <div className="profile-money num">
          <span aria-hidden="true">💰</span>
          {(player.money ?? 0).toLocaleString('ru-RU')} ₽
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

      <p className="subtle">
        Портрет использует ту же внешность, что и комната: причёску, силуэт одежды и цвета. Изменить их можно в
        гардеробе.
      </p>
    </div>
  );
};
