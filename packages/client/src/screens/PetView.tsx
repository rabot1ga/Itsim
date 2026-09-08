import React, { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Spinner, EmptyState, ScreenTitle, SectionTitle } from '../components/ui';

/**
 * Pet — экран питомца: состояние, инвентарь, кормление.
 *
 * Делит питомцев на «настоящих» (еда, настроение) и косметические аксессуары
 * (бант/корона/очки) — те же определения, что в `DayView` и в серверной
 * валидации `feed_pet`.
 */
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

const PET_META: Record<string, { name: string; mood: string }> = {
  pet_cat: { name: 'Кот', mood: 'мурчит' },
  pet_dog: { name: 'Собака', mood: 'виляет хвостом' },
  pet_cactus: { name: 'Кактус', mood: 'невозмутим' },
  pet_robo: { name: 'Робо-питомец', mood: 'мигает диодом' },
  pet_spider: { name: 'Паук', mood: 'плетёт паутину' },
  pet_bulldog: { name: 'Бульдог', mood: 'сопит' },
  pet_parrot: { name: 'Попугай', mood: 'повторяет за тобой' },
  pet_hamster: { name: 'Хомяк', mood: 'крутит колесо' },
  pet_fish: { name: 'Рыбка', mood: 'смотрит из аквариума' },
};

const PET_EMOJI: Record<string, string> = {
  pet_cat: '🐱',
  pet_dog: '🐶',
  pet_cactus: '🌵',
  pet_robo: '🤖',
  pet_spider: '🕷',
  pet_bulldog: '🐶',
  pet_parrot: '🦜',
  pet_hamster: '🐹',
  pet_fish: '🐟',
};

const FEED_COST = 500;
const FEED_ENERGY = 1;
const FEED_MOOD = 3;

export const PetView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const performAction = useGameStore((s) => s.performAction);
  const [items, setItems] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/content/items', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data?.items)) setItems(data.items.filter((i: any) => i.type === 'pet'));
      })
      .catch(() => {
        if (!controller.signal.aborted) setItems([]);
      });
    return () => controller.abort();
  }, []);

  const owned = useMemo<string[]>(() => player?.items ?? [], [player?.items]);
  const realPetIds = useMemo(() => owned.filter((id: string) => REAL_PETS.includes(id)), [owned]);
  const accessoryIds = useMemo(
    () => owned.filter((id: string) => items?.some((i) => i.id === id) && !REAL_PETS.includes(id)),
    [owned, items]
  );
  const boughtPetIds = useMemo(
    () => (items ?? []).map((i) => i.id).filter((id: string) => !owned.includes(id) && REAL_PETS.includes(id)),
    [items, owned]
  );

  if (!player) return null;

  const fed = Boolean(player.petFedToday);
  const petId = realPetIds[0];
  const meta = petId ? (PET_META[petId] ?? null) : null;

  const feed = async () => {
    if (busy) return;
    if (fed) {
      setError('Питомец уже сыт — до завтра');
      return;
    }
    if ((player.money ?? 0) < FEED_COST) {
      setError('Не хватает денег на корм');
      return;
    }
    if ((player.energy ?? 0) < FEED_ENERGY) {
      setError('Нет энергии — поспи или погуляй');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ok = await performAction('feed_pet');
      if (!ok) setError(useGameStore.getState().error ?? 'Не удалось покормить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle
        emoji="🐾"
        meta={
          <span className={fed ? 'text-moss-300' : 'text-ochre-300'} aria-label={fed ? 'Сыт' : 'Голодный'}>
            {fed ? 'сыт' : 'голодный'}
          </span>
        }
      >
        Питомец
      </ScreenTitle>

      {/* Hero — the current pet or a CTA to buy one */}
      {meta ? (
        <article className="card text-center" aria-label="Текущий питомец">
          <p className="text-5xl leading-none mb-2" aria-hidden="true">
            {PET_EMOJI[petId] ?? '🐾'}
          </p>
          <h3 className="text-base font-semibold text-white">{meta.name}</h3>
          <p className="text-2xs text-ink-500 mt-0.5">{meta.mood}</p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="well text-center">
              <p className="text-2xs text-ink-500">🍖 Корм</p>
              <p className="num text-sm text-ink-100">{FEED_COST} ₽</p>
            </div>
            <div className="well text-center">
              <p className="text-2xs text-ink-500">⚡ Энергия</p>
              <p className="num text-sm text-ink-100">−{FEED_ENERGY}</p>
            </div>
            <div className="well text-center">
              <p className="text-2xs text-ink-500">😊 Настроение</p>
              <p className="num text-sm text-moss-300">+{FEED_MOOD}</p>
            </div>
          </div>
          <button
            onClick={feed}
            disabled={busy || fed}
            className={`btn w-full mt-3 text-sm ${fed ? 'btn-secondary' : 'btn-primary'}`}
            aria-label={fed ? 'Питомец уже накормлен' : 'Покормить питомца'}
          >
            {busy ? 'Кормим…' : fed ? 'Уже накормлен сегодня' : '🍖 Покормить'}
          </button>
          {error && (
            <p className="text-xs text-clay-300 mt-1" role="alert">
              {error}
            </p>
          )}
        </article>
      ) : (
        <div className="card">
          <EmptyState
            bare
            emoji="🐾"
            title="У тебя пока нет питомца"
            hint="Питомец даёт +3 настроения каждый день и делает комнату менее одинокой."
          />
          <button className="btn btn-primary w-full mt-3" onClick={() => useGameStore.getState().setView('shop')}>
            В магазин
          </button>
        </div>
      )}

      {/* Owned accessories (bows, crowns, glasses) */}
      {accessoryIds.length > 0 && (
        <article className="card" aria-label="Аксессуары">
          <SectionTitle className="mb-1">Аксессуары</SectionTitle>
          <p className="subtle mb-3">
            Бантики, короны и очки не едят, но и настроения не дают. Коллекционируй ради витрины.
          </p>
          <ul className="space-y-1.5">
            {accessoryIds.map((id: string) => (
              <li key={id} className="well flex items-center gap-2">
                <span aria-hidden="true">✨</span>
                <span className="text-sm text-ink-100 flex-1 truncate">
                  {id.replace('pet_', '').replace(/_/g, ' ')}
                </span>
                <span className="text-2xs text-moss-300">на питомце</span>
              </li>
            ))}
          </ul>
        </article>
      )}

      {/* Other pets you could buy — surfaces the catalogue, not a hard sell */}
      {items === null ? (
        <Spinner label="Открываем каталог…" />
      ) : (
        boughtPetIds.length > 0 && (
          <article className="card" aria-label="Другие питомцы">
            <SectionTitle className="mb-3">В каталоге</SectionTitle>
            <ul className="space-y-1.5">
              {boughtPetIds.map((id: string) => (
                <li key={id} className="well flex items-center gap-2">
                  <span className="text-base" aria-hidden="true">
                    {PET_EMOJI[id] ?? '🐾'}
                  </span>
                  <span className="text-sm text-ink-100 flex-1 truncate">
                    {PET_META[id]?.name ?? id.replace('pet_', '').replace(/_/g, ' ')}
                  </span>
                  <span className="text-2xs text-ink-500">в магазине</span>
                </li>
              ))}
            </ul>
          </article>
        )
      )}
    </div>
  );
};
