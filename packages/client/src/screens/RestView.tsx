import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { ActionGrid, toTile } from '../components/ActionGrid';
import { ScreenTitle, SectionTitle, StatBar } from '../components/ui';
import { actionsOf } from './actionCatalogue';
import { inviteLink, openTelegramLink, haptic } from '../lib/telegram';

/**
 * Отдых — recovery and people on one screen.
 *
 * Rest and «social» were two three-button grids on the home screen, both about
 * the same thing: getting mood and health back. Merged, they finally read as a
 * choice — sleep is free and slow, the bar costs money and friends, the gym
 * trades money for health.
 */

const BOT_NAME = 'itlife_simulator_bot';

/** Feedable pets — cosmetic accessories (pet_bow/...) are not dinner guests. */
const REAL_PETS = [
  'pet_cat',
  'pet_dog',
  'pet_cactus',
  'pet_robo',
  'pet_spider',
  'pet_bulldog',
  'pet_parrot',
  'pet_hamster',
  'pet_fish',
];

export const RestView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const setView = useGameStore((s) => s.setView);
  const performAction = useGameStore((s) => s.performAction);
  const error = useGameStore((s) => s.error);
  const clearError = useGameStore((s) => s.clearError);
  const [busy, setBusy] = useState(false);

  if (!player) return null;

  const run = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await performAction(id, { skillId: player.mainSkillId || 'javascript' });
    } finally {
      setBusy(false);
    }
  };

  const invite = () => {
    haptic('medium');
    openTelegramLink(inviteLink(BOT_NAME, player.telegramId ?? 'player'));
  };

  const hasPet = (player.items ?? []).some((id: string) => REAL_PETS.includes(id));
  const money = player.money ?? 0;

  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle emoji="🌿" meta={`${Math.round(player.energy ?? 0)} / ${player.maxEnergy ?? 10} ⚡`}>
        Отдых
      </ScreenTitle>

      {error && (
        <button onClick={clearError} className="card panel-note panel-note-clay w-full text-left animate-pop-in">
          <p className="flex items-start gap-2 text-sm text-clay-300">
            <span aria-hidden="true">⚠️</span>
            <span>{error}</span>
          </p>
          <p className="text-2xs text-ink-500 mt-1 pl-5">Нажми, чтобы скрыть</p>
        </button>
      )}

      {/* What resting is actually for */}
      <section className="card">
        <div className="grid gap-2">
          <StatBar resource="energy" value={player.energy} max={player.maxEnergy || 10} />
          <StatBar resource="mood" value={player.motivation} max={100} />
          <StatBar resource="health" value={player.health} max={100} />
        </div>
        {(player.energy ?? 0) <= 2 && (
          <p className="flex items-center gap-2 text-xs text-ochre-300 leading-tight mt-3">
            <span className="shrink-0" aria-hidden="true">
              ⚡
            </span>
            Энергия на исходе. «Поспать» восстановит её — сон доступен даже при нуле.
          </p>
        )}
      </section>

      <section>
        <SectionTitle className="mb-2">Восстановление</SectionTitle>
        <ActionGrid
          label="Отдых"
          actions={actionsOf('rest').map((a) => toTile(a, Boolean(player.job)))}
          energy={player.energy ?? 0}
          money={money}
          busy={busy}
          onRun={run}
        />
      </section>

      <section>
        <SectionTitle className="mb-2">Люди</SectionTitle>
        <ActionGrid
          label="Социальные действия"
          actions={actionsOf('social').map((a) => toTile(a, Boolean(player.job)))}
          energy={player.energy ?? 0}
          money={money}
          busy={busy}
          onRun={run}
        />
        <p className="text-2xs text-ink-600 mt-1.5">
          Нетворкинг растит репутацию и связи — именно они приносят офферы и события.
        </p>
      </section>

      {hasPet && (
        <button
          onClick={() => void run('feed_pet')}
          disabled={busy || Boolean(player.petFedToday)}
          className="btn btn-secondary w-full text-sm"
        >
          <span aria-hidden="true">🐾</span>
          {player.petFedToday ? 'Питомец сыт до завтра' : 'Покормить питомца · 500 ₽'}
        </button>
      )}

      {/* Friends: the roster lives on its own screen, the invite lives here */}
      <section className="card">
        <SectionTitle>Друзья</SectionTitle>
        <p className="subtle mt-1">
          Знакомые дают события, помощь и репутацию. Приглашённый друг — бонус обоим при первом входе.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button className="btn btn-primary flex-1" onClick={invite}>
            <span aria-hidden="true">🎁</span>
            Пригласить друга
          </button>
          <button className="btn btn-secondary flex-1" onClick={() => setView('friends')}>
            Все знакомые →
          </button>
        </div>
      </section>
    </div>
  );
};
