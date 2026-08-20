import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';

interface DayViewProps {
  onAdvanceDay: () => void;
}

interface SideJobInfo {
  name: string;
  icon: string;
  energy: number;
  payment: number;
  paymentPerSkill?: number;
  paymentVar?: number;
  health?: number;
  motivation?: number;
  minSkill?: number;
  minDay?: number;
}

const ACTIONS = [
  // Study actions
  { id: 'study_youtube', icon: '📺', name: 'YouTube туториалы', energy: 2, cost: 0, category: 'study' },
  { id: 'study_book', icon: '📖', name: 'Читать книгу', energy: 1, cost: 1500, category: 'study' },
  { id: 'study_stepik', icon: '🎓', name: 'Stepik курс', energy: 2, cost: 2000, category: 'study' },
  { id: 'study_course', icon: '💻', name: 'Платный курс', energy: 3, cost: 15000, category: 'study' },
  { id: 'study_english', icon: '🇬🇧', name: 'Английский (базово)', energy: 2, cost: 0, category: 'study' },
  { id: 'study_english_course', icon: '🗣️', name: 'Курс английского', energy: 3, cost: 3000, category: 'study' },

  // Work actions
  { id: 'work_task', icon: '💼', name: 'Рабочая задача', energy: 4, cost: 0, category: 'work' },
  { id: 'work_overtime', icon: '🌙', name: 'Переработка', energy: 5, cost: 0, category: 'work' },
  { id: 'pet_project', icon: '🚀', name: 'Пет-проект', energy: 3, cost: 0, category: 'work' },
  { id: 'freelance', icon: '🛠', name: 'Фриланс-заказ', energy: 4, cost: 0, category: 'work' },

  // Rest actions
  { id: 'rest_sleep', icon: '😴', name: 'Поспать', energy: 0, cost: 0, category: 'rest' },
  { id: 'rest_walk', icon: '🚶', name: 'Прогулка', energy: 1, cost: 0, category: 'rest' },
  { id: 'rest_bar', icon: '🍺', name: 'Бар с друзьями', energy: 2, cost: 2000, category: 'rest' },
  { id: 'rest_hobby', icon: '🎮', name: 'Хобби', energy: 1, cost: 0, category: 'rest' },
  { id: 'rest_gym', icon: '🏋️', name: 'Качалка', energy: 2, cost: 3000, category: 'rest' },

  // Social
  { id: 'networking', icon: '🤝', name: 'Нетворкинг', energy: 2, cost: 0, category: 'social' },
];

export const DayView: React.FC<DayViewProps> = ({ onAdvanceDay }) => {
  const player = useGameStore((s) => s.player);
  const activeEvent = useGameStore((s) => s.activeEvent);
  const error = useGameStore((s) => s.error);
  const clearError = useGameStore((s) => s.clearError);
  const performAction = useGameStore((s) => s.performAction);
  const chooseEvent = useGameStore((s) => s.chooseEvent);
  const mining = useGameStore((s) => s.mining);
  const [sideJobs, setSideJobs] = useState<Record<string, SideJobInfo>>({});

  useEffect(() => {
    fetch('/api/content/side-jobs')
      .then((r) => r.json())
      .then((data) => setSideJobs(data.sideJobs ?? {}))
      .catch(() => setSideJobs({}));
  }, []);

  if (!player) return null;

  const handleAction = (actionId: string) => {
    performAction(actionId, { skillId: player.mainSkillId || 'javascript' });
  };

  const canAct = (energy: number) => player.energy >= energy;
  const canAfford = (cost: number) => (player.money ?? 0) >= cost;

  const categories = [
    { id: 'study', label: '📚 Учёба', actions: ACTIONS.filter(a => a.category === 'study') },
    { id: 'work', label: '💼 Работа и проекты', actions: ACTIONS.filter(a => a.category === 'work') },
    { id: 'rest', label: '😌 Отдых', actions: ACTIONS.filter(a => a.category === 'rest') },
    { id: 'social', label: '🤝 Социальное', actions: ACTIONS.filter(a => a.category === 'social') },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Active event */}
      {activeEvent && (
        <div className="game-card border-amber-500/40 bg-amber-500/5 animate-pop-in">
          <p className="text-sm font-bold text-amber-300 mb-1">{activeEvent.title}</p>
          <p className="text-sm text-slate-300 mb-3">{activeEvent.description}</p>
          <div className="space-y-2">
            {activeEvent.choices.map((choice: any, i: number) => (
              <button
                key={i}
                onClick={() => chooseEvent(activeEvent.id, i)}
                className="w-full text-left px-3 py-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 hover:border-amber-500/50 rounded-lg text-sm text-slate-200 transition-colors"
              >
                {choice.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="game-card border-red-500/40 bg-red-500/10 cursor-pointer" onClick={clearError}>
          <p className="text-sm text-red-300">⚠️ {error}</p>
          <p className="text-xs text-slate-500 mt-0.5">Нажми, чтобы скрыть</p>
        </div>
      )}

      {/* Event notification area */}
      {player._lastEvent && (
        <div className="game-card border-primary-500/30 bg-primary-500/5 whitespace-pre-line">
          <p className="text-sm text-slate-300">{player._lastEvent}</p>
        </div>
      )}

      {/* Mining farm (passive income) */}
      {mining && (
        <div className="game-card border-yellow-500/30 bg-yellow-500/5 animate-pop-in">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-yellow-300">⛏ Майнинг-ферма</span>
            <span className="text-xs text-slate-400">{mining.hashrate} MH/s</span>
          </div>
          <div className="flex gap-2 text-xs text-slate-400 mt-1">
            <span className="text-emerald-400">+{formatMoney(mining.gross)}</span>
            <span>−{formatMoney(mining.electricity)} ⚡</span>
            <span className="font-mono">≈ {mining.net >= 0 ? '+' : ''}{formatMoney(mining.net)}/день</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Курс: {mining.price.toFixed(1)} ₽/MH · доход начисляется при завершении дня
          </p>
        </div>
      )}

      {/* Actions by category */}
      {categories.map(cat => (
        <div key={cat.id}>
          <h3 className="section-title mb-2">{cat.label}</h3>
          <div className="grid grid-cols-2 gap-2">
            {cat.actions.map(action => {
              const enabled = canAct(action.energy) && canAfford(action.cost);
              return (
                <button
                  key={action.id}
                  onClick={() => handleAction(action.id)}
                  disabled={!enabled}
                  className={`game-card text-left transition-all ${
                    enabled ? 'hover:border-primary-500/50 hover:bg-slate-800/80' : 'opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{action.icon}</span>
                    <span className="text-sm font-medium text-slate-200">{action.name}</span>
                  </div>
                  <div className="flex gap-2 text-xs text-slate-500">
                    <span>⚡{action.energy}</span>
                    {action.cost > 0 && <span>💰{formatMoney(action.cost)}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Side jobs (non-IT gigs) */}
      {Object.keys(sideJobs).length > 0 && (
        <div>
          <h3 className="section-title mb-2">🛵 Подработки (не IT)</h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(sideJobs).map(([jobId, job]) => {
              const enabled = canAct(job.energy) && (player.currentDay ?? 0) >= (job.minDay ?? 1);
              const minSkillMet = (player.skills?.[player.mainSkillId ?? 'javascript']?.level ?? 0) >= (job.minSkill ?? 0);
              return (
                <button
                  key={jobId}
                  onClick={() => performAction('side_job', { jobId })}
                  disabled={!enabled || !minSkillMet}
                  title={!minSkillMet ? `Нужен навык ${job.minSkill}+` : jobId}
                  className={`game-card text-left transition-all ${
                    enabled && minSkillMet ? 'hover:border-amber-500/50 hover:bg-slate-800/80' : 'opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{job.icon}</span>
                    <span className="text-sm font-medium text-slate-200">{job.name}</span>
                  </div>
                  <div className="flex gap-2 text-xs text-slate-500">
                    <span>⚡{job.energy}</span>
                    <span className="text-emerald-400">
                      +{formatMoney(job.payment + (job.paymentPerSkill ? Math.round((player.skills?.[player.mainSkillId ?? 'javascript']?.level ?? 0) * job.paymentPerSkill) : 0))}
                      {job.paymentVar ? '±' : ''}
                    </span>
                    {!minSkillMet && <span>🔒 навык {job.minSkill}+</span>}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-600 mt-1">Одна подработка в день. Здоровье и мотивация — по курсу.</p>
        </div>
      )}

      {/* Banked offline days */}
      {(player.bankedDays ?? 0) > 0 && (
        <button
          onClick={() => performAction('use_banked_day')}
          className="w-full py-2.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/60 text-slate-200 rounded-xl font-medium transition-all text-sm active:scale-[0.98]"
        >
          ⏰ Банк офлайн-дней: {player.bankedDays} — использовать (полная энергия, +10 🔥)
        </button>
      )}

      {/* End day button */}
      <button
        onClick={onAdvanceDay}
        className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-2xl font-bold transition-all text-lg mt-4 shadow-lg shadow-indigo-900/40 active:scale-[0.98]"
      >
        ➡️ Завершить день {player.currentDay ?? 1} →
      </button>
    </div>
  );
};

function formatMoney(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}м`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}к`;
  return `${amount}`;
}
