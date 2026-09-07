import React from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * Career pressure panel (v2.1 balance layer).
 *
 * Two things the late game needs to be legible:
 *  1. «Твой день стоит …» — living costs are charged daily, so a big salary is
 *     not a big fortune; the player should see why.
 *  2. What the next promotion actually requires — content career gates check the
 *     MAIN skill depth + branch breadth + soft skills, and an invisible gate is
 *     just a bug in the player's eyes.
 */
export const CareerPressureCard: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const cost = useGameStore((s) => s.costOfDay);
  const outlook = useGameStore((s) => s.careerOutlook);
  const performAction = useGameStore((s) => s.performAction);
  const [busy, setBusy] = React.useState(false);

  if (!player) return null;

  const fmt = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {cost && (
        <div className="game-card p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-slate-200">💸 Стоимость дня</span>
            <span className={`text-sm font-mono ${cost.balanceDaily >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {cost.balanceDaily >= 0 ? '+' : ''}
              {fmt(cost.balanceDaily)}/день
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400">
            <span>Еда, дорога, подписки</span>
            <span className="text-right font-mono text-slate-200">−{fmt(cost.daily)}</span>
            <span>Аренда (в пересчёте на день)</span>
            <span className="text-right font-mono text-slate-200">−{fmt(cost.rent)}</span>
            {cost.wealthTax > 0 && (
              <>
                <span>Налог на состояние/лайфстайл</span>
                <span className="text-right font-mono text-amber-300">−{fmt(cost.wealthTax)}</span>
              </>
            )}
            {cost.incomeDaily > 0 && (
              <>
                <span>Зарплата (в пересчёте на день)</span>
                <span className="text-right font-mono text-emerald-300">+{fmt(cost.incomeDaily)}</span>
              </>
            )}
          </div>
          {cost.broke && (
            <div className="mt-2 text-xs text-amber-300">
              Режим «гречка и лапша»: расходы урезаны, но мотивация тает. Нужен доход.
            </div>
          )}
        </div>
      )}

      {outlook && outlook.kind !== 'top' && (
        <div className="game-card p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-slate-200">
              🎯 {outlook.kind === 'cto_election' ? outlook.label : `До «${outlook.label}»`}
            </span>
            {typeof outlook.progress === 'number' && (
              <span className="text-xs font-mono text-slate-400">{outlook.progress}%</span>
            )}
          </div>

          {outlook.kind === 'promotion' && (
            <>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-700/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary-500 to-emerald-400 transition-all"
                  style={{ width: `${Math.max(3, outlook.progress)}%` }}
                />
              </div>
              <div className="mt-2 space-y-1 text-xs">
                {outlook.ready ? (
                  <div className="text-emerald-300">
                    Требования выполнены. Ждём ревью: через {outlook.daysToReview} дн.
                    {outlook.competition > 1 ? ` · мест на двоих: ${outlook.competition} претендента` : ''}
                  </div>
                ) : (
                  outlook.missing.map((m: any) => (
                    <div key={m.key} className="flex justify-between text-slate-300">
                      <span>{m.label}</span>
                      <span className="font-mono text-rose-300">
                        {m.current} / {m.needed}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Грейды растут от глубины (основной навык + ветка), а не от количества курсов.
              </div>
            </>
          )}

          {outlook.kind === 'cto_election' && (
            <>
              <div className="mt-2 text-xs text-slate-300">
                {outlook.ready ? (
                  <>Борд готов тебя выслушать. Шанс: <b className="text-emerald-300">{outlook.chance}%</b>. Провал = −60 дней и −4 ⭐</>
                ) : (
                  <div className="space-y-1">
                    {outlook.missing.map((m: any) => (
                      <div key={m.key} className="flex justify-between">
                        <span>{m.label}</span>
                        <span className="font-mono text-rose-300">
                          {m.current} / {m.needed}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="btn btn-primary mt-3 w-full text-sm disabled:opacity-40"
                disabled={!outlook.ready || busy || outlook.cooldownDays > 0 || player.energy < 3}
                onClick={async () => {
                  setBusy(true);
                  await performAction('cto_elect');
                  setBusy(false);
                }}
              >
                {outlook.cooldownDays > 0
                  ? `Борд занят (${outlook.cooldownDays} дн.)`
                  : '🗳 Выдвинуться в CTO (3⚡)'}
              </button>
            </>
          )}
        </div>
      )}

      {player.careerEnding && (
        <div className="game-card p-3 sm:col-span-2 border border-primary-500/30 bg-primary-500/5">
          <div className="text-sm font-semibold text-slate-100">
            {player.careerEnding === 'corporate_god' && '🏢 Финал: Корпоративный бог'}
            {player.careerEnding === 'burnout' && '🔥 Финал: Выгорание'}
            {player.careerEnding === 'left_it' && '💀 Финал: Ушёл из IT'}
            {player.careerEnding === 'free_artist' && '💻 Финал: Свободный художник'}
            {player.careerEnding === 'teacher' && '🎓 Финал: Учитель'}
            {player.careerEnding === 'exit' && '🚀 Финал: Экзит'}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {player.careerEnding === 'corporate_god'
              ? 'Ты в борде. Поздравляем: теперь ты отвечаешь за чужие карьеры и за свой сон.'
              : 'Игра продолжается — это отмеченная глава, а не титр. Но назад дороги уже нет.'}
          </div>
        </div>
      )}
    </div>
  );
};
