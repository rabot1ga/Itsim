import React from 'react';
import { useGameStore } from '../store/gameStore';
import { PlayerPortrait } from '../components/PlayerPortrait';
import { ProceduralAvatar } from '../components/room/ProceduralAvatar';
import { useLayerContent } from '../components/room/useLayerContent';
import { avatarComposition } from '../components/room/layers';
import { ScreenTitle, SectionTitle, StatBar } from '../components/ui';
import { xpToNext } from '@itsim/shared';
import { gradeLabel, skillName } from '../lib/playerLabels';

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
  const { avatarManifest, geneticsConfig } = useLayerContent();
  if (!player) return null;
  const avatarOverrides = avatarComposition(player.avatar, player.genetics);

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

  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle emoji="👤">Профиль</ScreenTitle>

      <section className="card profile-hero" aria-label="Профиль персонажа">
        {/* Полнофигурный слоистый персонаж — он же «лицо» закупленной одежды.
            iso-бюст остаётся фолбэком: пока манифест не доехал (или контент
            недоступен), показываем привычный портрет, а не пустой кадр. */}
        {avatarManifest && geneticsConfig && player.genetics ? (
          <ProceduralAvatar
            manifest={avatarManifest}
            traits={player.genetics}
            geneticsConfig={geneticsConfig}
            compositionOverrides={avatarOverrides}
            avatarCustom={player.avatar ?? null}
            className="w-[96px]"
          />
        ) : (
          <PlayerPortrait player={player} size={96} />
        )}
        <h3>Айтишник</h3>
        <p>{gradeLabel(player.grade)}</p>
        <span className="subtle">{player.job?.position ?? 'Карьера ещё впереди'}</span>
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
