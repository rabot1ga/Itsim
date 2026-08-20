import React from 'react';
import { useGameStore } from '../store/gameStore';

interface DayViewProps {
  onAdvanceDay: () => void;
}

const ACTIONS = [
  // Study actions
  { id: 'study_youtube', icon: '📺', name: 'YouTube туториалы', energy: 2, cost: 0, category: 'study' },
  { id: 'study_book', icon: '📖', name: 'Читать книгу', energy: 1, cost: 1500, category: 'study' },
  { id: 'study_stepik', icon: '🎓', name: 'Stepik курс', energy: 2, cost: 2000, category: 'study' },
  { id: 'study_course', icon: '💻', name: 'Платный курс', energy: 3, cost: 15000, category: 'study' },
  
  // Work actions
  { id: 'work_task', icon: '💼', name: 'Рабочая задача', energy: 4, cost: 0, category: 'work' },
  { id: 'pet_project', icon: '🚀', name: 'Пет-проект', energy: 3, cost: 0, category: 'work' },
  
  // Rest actions
  { id: 'rest_sleep', icon: '😴', name: 'Поспать', energy: 0, cost: 0, category: 'rest' },
  { id: 'rest_walk', icon: '🚶', name: 'Прогулка', energy: 1, cost: 0, category: 'rest' },
  { id: 'rest_bar', icon: '🍺', name: 'Бар с друзьями', energy: 1, cost: 2000, category: 'rest' },
  { id: 'rest_hobby', icon: '🎮', name: 'Хобби', energy: 1, cost: 0, category: 'rest' },
  
  // Social
  { id: 'networking', icon: '🤝', name: 'Нетворкинг', energy: 2, cost: 0, category: 'social' },
];

export const DayView: React.FC<DayViewProps> = ({ onAdvanceDay }) => {
  const { player, performAction } = useGameStore();

  if (!player) return null;

  const handleAction = (actionId: string) => {
    performAction(actionId, { skillId: 'javascript' });
  };

  const canAct = (energy: number) => player.energy >= energy;
  const canAfford = (cost: number) => (player.money ?? 0) >= cost;

  const categories = [
    { id: 'study', label: '📚 Учёба', actions: ACTIONS.filter(a => a.category === 'study') },
    { id: 'work', label: '💼 Работа', actions: ACTIONS.filter(a => a.category === 'work') },
    { id: 'rest', label: '😌 Отдых', actions: ACTIONS.filter(a => a.category === 'rest') },
    { id: 'social', label: '🤝 Социальное', actions: ACTIONS.filter(a => a.category === 'social') },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Event notification area */}
      {player._lastEvent && (
        <div className="game-card border-primary-500/30 bg-primary-500/5">
          <p className="text-sm text-slate-300">{player._lastEvent}</p>
        </div>
      )}

      {/* Actions by category */}
      {categories.map(cat => (
        <div key={cat.id}>
          <h3 className="text-sm font-medium text-slate-400 mb-2">{cat.label}</h3>
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

      {/* End day button */}
      <button
        onClick={onAdvanceDay}
        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors text-lg mt-4"
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