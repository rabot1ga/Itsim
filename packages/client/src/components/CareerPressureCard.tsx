import React, { useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { metaXpBonusPct } from '@itsim/shared';
import { haptic } from '../lib/telegram';

/**
 * Career pressure card (v2.1 balance layer).
 *
 * Two things the late game needs to be legible:
 *  1. «Твой день стоит …» — living costs are charged daily, so a big salary is
 *     not a big fortune; the player should see why.
 *  2. What the next promotion actually requires — content career gates check the
 *     MAIN skill depth + branch breadth + soft skills, and an invisible gate is
 *     just a bug in the player's eyes.
 *
 * It is ONE card, not two stacked panels: the receipt (cost breakdown) is a
 * quiet, collapsible line — the balance itself always stays visible — while the
 * promotion gate stays open because it shapes today's choices. Two framed
 * blocks said "two different things" about one subject; one card with a dashed
 * divider says "career, right now".
 */
const ENDING_LABELS: Record<string, string> = {
  corporate_god: 'Корпоративный бог',
  burnout: 'Выгорание',
  left_it: 'Ушёл из IT',
  free_artist: 'Свободный художник',
  teacher: 'Учитель',
  exit: 'Экзит',
};

export const CareerPressureCard: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const cost = useGameStore((s) => s.costOfDay);
  const outlook = useGameStore((s) => s.careerOutlook);
  const performAction = useGameStore((s) => s.performAction);
  const startNewLife = useGameStore((s) => s.startNewLife);
  const [costOpen, setCostOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // two-tap confirm for the destructive prestige reset: first tap arms it and
  // starts a 5s timer, second tap executes — a fat-fingered restart is a day lost
  const [confirmLife, setConfirmLife] = useState(false);
  const confirmLifeTimer = useRef<number | undefined>(undefined);

  if (!player) return null;

  const handleNewLife = async () => {
    if (!confirmLife) {
      setConfirmLife(true);
      confirmLifeTimer.current = window.setTimeout(() => setConfirmLife(false), 5000);
      return;
    }
    if (confirmLifeTimer.current) window.clearTimeout(confirmLifeTimer.current);
    haptic('medium');
    setBusy(true);
    const ok = await startNewLife();
    setBusy(false);
    setConfirmLife(false);
    if (!ok) haptic('error');
  };

  const fmt = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

  const showOutlook = Boolean(outlook && outlook.kind !== 'top');
  if (!cost && !showOutlook && !player.careerEnding) return null;

  return (
    <section className="card space-y-2.5">
      {player.careerEnding && (
        <>
          <div className="border-l-[3px] border-l-gold-300 pl-2.5">
            <div className="text-2xs font-semibold uppercase tracking-[0.09em] text-gold-300">
              Финал · {metaXpBonusPct(player.meta) > 0 ? `жизнь ${player.meta!.lives} завершена` : 'глава прожита'}
            </div>
            <div className="text-sm font-semibold text-white mt-0.5">
              {ENDING_LABELS[player.careerEnding] ?? player.careerEnding}
            </div>
            <div className="mt-1 text-xs text-ink-400 leading-relaxed">
              {player.careerEnding === 'corporate_god'
                ? 'Ты в борде. Поздравляем: теперь ты отвечаешь за чужие карьеры и за свой сон.'
                : 'Игра продолжается — это отмеченная глава, а не титр. Но назад дороги уже нет.'}
            </div>

            {/* Prestige (P1.1): what survives and what the next life gives back */}
            <div className="mt-2 space-y-1 text-xs leading-relaxed">
              {metaXpBonusPct(player.meta) > 0 && (
                <p className="flex items-center gap-1.5 text-gold-300/90">
                  <span aria-hidden="true">🔥</span>
                  Мета-бонус: навсегда <span className="num">+{metaXpBonusPct(player.meta)}% XP</span>
                </p>
              )}
              <p className="text-ink-500">Ачивки, покупки и стрик входа не сгорают. Навыки, деньги и вещи — да.</p>
            </div>

            <button
              onClick={() => void handleNewLife()}
              disabled={busy}
              className={`btn btn-secondary w-full text-sm mt-2.5 ${confirmLife ? '!text-clay-300' : ''}`}
            >
              {busy
                ? 'Начинаем…'
                : confirmLife
                  ? 'Точно? Всё начнётся с дня 1'
                  : player.meta && player.meta.lives > 0
                    ? `♻ Начать жизнь ${player.meta.lives + 1}`
                    : '♻ Начать новую жизнь'}
            </button>
            {confirmLife && (
              <p className="mt-1 text-2xs text-clay-300 leading-tight">
                Следующая жизнь даст +15% XP навсегда. Нажми ещё раз — или просто подожди.
              </p>
            )}
          </div>
          {(cost || showOutlook) && <div className="divider" />}
        </>
      )}

      {cost && (
        <div>
          <button
            onClick={() => setCostOpen((v) => !v)}
            aria-expanded={costOpen}
            className="w-full flex items-center gap-2 text-left touch-target"
          >
            <span aria-hidden="true">🪙</span>
            <span className="flex-1 text-sm font-semibold text-ink-100">Стоимость дня</span>
            <span className={`num text-sm font-semibold ${cost.balanceDaily >= 0 ? 'text-moss-300' : 'text-clay-300'}`}>
              {cost.balanceDaily >= 0 ? '+' : ''}
              {fmt(cost.balanceDaily)}/день
            </span>
            <span aria-hidden="true" className={`accordion-chevron ${costOpen ? 'is-open' : ''}`}>
              ▾
            </span>
          </button>

          <div className={`accordion-body ${costOpen ? 'open' : ''}`}>
            <div className="accordion-inner">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-400 pt-2 pl-5">
                <span>Еда, дорога, подписки</span>
                <span className="num text-right text-ink-100">−{fmt(cost.daily)}</span>
                <span>Аренда (в пересчёте на день)</span>
                <span className="num text-right text-ink-100">−{fmt(cost.rent)}</span>
                {cost.wealthTax > 0 && (
                  <>
                    <span>Налог на состояние/лайфстайл</span>
                    <span className="num text-right text-ochre-300">−{fmt(cost.wealthTax)}</span>
                  </>
                )}
                {cost.incomeDaily > 0 && (
                  <>
                    <span>Зарплата (в пересчёте на день)</span>
                    <span className="num text-right text-moss-300">+{fmt(cost.incomeDaily)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {cost.broke && (
            <div className="text-xs text-ochre-300 pl-5">
              Режим «гречка и лапша»: расходы урезаны, но настроение тает. Нужен доход.
            </div>
          )}
        </div>
      )}

      {showOutlook && (
        <>
          {(cost || player.careerEnding) && <div className="divider" />}
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-100">
                <span aria-hidden="true">🎯</span>
                {outlook!.kind === 'cto_election' ? outlook!.label : `До «${outlook!.label}»`}
              </span>
              {typeof outlook!.progress === 'number' && (
                <span className="num text-xs text-ink-400">{outlook!.progress}%</span>
              )}
            </div>

            {outlook!.kind === 'promotion' && (
              <>
                <div className="meter mt-2.5">
                  <span
                    style={{
                      width: `${Math.max(3, outlook!.progress)}%`,
                      background: outlook!.ready ? 'var(--green)' : 'var(--gold)',
                    }}
                  />
                </div>
                <div className="mt-2 space-y-1 text-xs">
                  {outlook!.ready ? (
                    <div className="text-moss-300">
                      Требования выполнены. Ждём ревью: через {outlook!.daysToReview} дн.
                      {outlook!.competition > 1 ? ` · мест на двоих: ${outlook!.competition} претендента` : ''}
                    </div>
                  ) : (
                    outlook!.missing.map((m: any) => (
                      <div key={m.key} className="flex justify-between gap-3 text-ink-300">
                        <span>{m.label}</span>
                        <span className="num text-clay-300 shrink-0">
                          {m.current} / {m.needed}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-2 text-2xs text-ink-600 leading-relaxed">
                  Грейды растут от глубины (основной навык + ветка), а не от количества курсов.
                </div>
              </>
            )}

            {outlook!.kind === 'cto_election' && (
              <>
                <div className="mt-2 text-xs text-ink-300">
                  {outlook!.ready ? (
                    <>
                      Борд готов тебя выслушать. Шанс: <b className="num text-moss-300">{outlook!.chance}%</b>. Провал —
                      минус 60 дней и 4 репутации.
                    </>
                  ) : (
                    <div className="space-y-1">
                      {outlook!.missing.map((m: any) => (
                        <div key={m.key} className="flex justify-between">
                          <span>{m.label}</span>
                          <span className="num text-clay-300 shrink-0">
                            {m.current} / {m.needed}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-primary mt-3 w-full text-sm disabled:opacity-40"
                  disabled={!outlook!.ready || busy || outlook!.cooldownDays > 0 || player.energy < 3}
                  onClick={async () => {
                    setBusy(true);
                    await performAction('cto_elect');
                    setBusy(false);
                  }}
                >
                  {outlook!.cooldownDays > 0
                    ? `Борд занят (${outlook!.cooldownDays} дн.)`
                    : 'Выдвинуться в CTO · 3 энергии'}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
};
