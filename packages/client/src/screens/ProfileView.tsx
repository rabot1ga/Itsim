import React from 'react';
import { useGameStore } from '../store/gameStore';
import { PlayerPortrait } from '../components/PlayerPortrait';
import { PixelIcon } from '../components/pixel/PixelIcon';
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

/** The profile block in reference 1.png, populated only from saved game state. */
export const ProfileView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const setView = useGameStore((s) => s.setView);
  if (!player) return null;
  const mainId = player.mainSkillId ?? 'javascript';
  const skill = player.skills?.[mainId] ?? { level: 0, xp: 0 };
  const skills = Object.values(player.skills ?? {}) as Array<{ level: number }>;
  const statRows = [
    ['День жизни', String(player.currentDay ?? 1)],
    ['Основной навык', `${mainId} · ур. ${skill.level}`],
    ['Опыт навыка', skill.level >= 100 ? 'Максимум' : `${skill.xp} / ${xpToNext(skill.level)} XP`],
    ['Репутация', Math.round(player.reputation ?? 0).toLocaleString('ru-RU')],
    ['Навыков изучено', String(skills.filter((s) => s.level > 0).length)],
    ['Достижения', String((player.achievements ?? []).length)],
    ['Предметы', String((player.items ?? []).length)],
    ['Прожито жизней', String(player.meta?.lives ?? 0)],
  ];
  return (
    <div className="space-y-3">
      <h2 className="reference-screen-title">
        <PixelIcon name="person" size={20} />
        Профиль
      </h2>
      <section className="profile-card" aria-label="Профиль персонажа">
        <div className="profile-identity">
          <PlayerPortrait player={player} size={80} />
          <div>
            <h3>Айтишник</h3>
            <p>{GRADES[player.grade] ?? player.grade}</p>
            <span>{player.job?.position ?? 'Карьера ещё впереди'}</span>
          </div>
        </div>
        <dl className="profile-stats">
          {statRows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className="num">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="profile-money">
          <PixelIcon name="coin" size={16} />
          {(player.money ?? 0).toLocaleString('ru-RU')} ₽
        </div>
        <button className="btn btn-secondary w-full" onClick={() => setView('room')}>
          Комната и гардероб
        </button>
      </section>
      <section className="profile-card" aria-label="Цели и развитие">
        <h3 className="flex items-center gap-2 text-sm">
          <PixelIcon name="trophy" size={16} />
          Цели и развитие
        </h3>
        <p className="text-xs text-ink-400 mt-2">
          Проверь достижения и требования к следующему грейду. Выбери следующую цель для своего персонажа.
        </p>
        <div className="profile-links">
          <button onClick={() => setView('achievements')}>
            <PixelIcon name="target" size={13} />
            Достижения и цели
            <PixelIcon name="arrow" size={10} />
          </button>
          <button onClick={() => setView('career')}>
            <PixelIcon name="briefcase" size={13} />
            Карьерный рост
            <PixelIcon name="arrow" size={10} />
          </button>
          <button onClick={() => setView('skills')}>
            <PixelIcon name="book" size={13} />
            Обучение
            <PixelIcon name="arrow" size={10} />
          </button>
        </div>
      </section>
      <p className="text-2xs text-ink-400">
        Портрет использует ту же внешность, что и комната: причёску, силуэт одежды и доступные цвета. Изменить их можно в гардеробе.
      </p>
    </div>
  );
};
