import React from 'react';
import { useGameStore } from '../store/gameStore';

const COMPANIES = [
  { id: 'search_everything', name: 'Поиск.Всё', icon: '🔍', stack: 'Python, Java, SQL', salary: '115%', bar: 1.1 },
  { id: 'corporation_of_everything', name: 'Corporation of Everything', icon: '🌐', stack: 'Python, Java, TS, Go', salary: '130%', bar: 1.3 },
  { id: 'green_bank_digital', name: 'ЗелёныйБанк Диджитал', icon: '🏦', stack: 'Java, Spring, SQL', salary: '105%', bar: 0.95 },
  { id: 'neo_bank', name: 'НеоБанк', icon: '💳', stack: 'TS, React, Node.js', salary: '110%', bar: 1.05 },
  { id: 'pixel_dot_studio', name: 'Студия «Пиксель и Точка»', icon: '🎨', stack: 'JS, React, Python', salary: '70%', bar: 0.6 },
];

const GRADES = [
  { grade: 'intern', name: 'Стажёр', skill: 18, salary: '35 000 ₽' },
  { grade: 'junior', name: 'Junior', skill: 32, salary: '90 000 ₽' },
  { grade: 'middle', name: 'Middle', skill: 55, salary: '220 000 ₽' },
  { grade: 'senior', name: 'Senior', skill: 76, salary: '400 000 ₽' },
  { grade: 'teamlead', name: 'Teamlead', skill: 80, salary: '520 000 ₽' },
  { grade: 'architect', name: 'Архитектор', skill: 90, salary: '680 000 ₽' },
];

export const CareerView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const currentView = useGameStore((s) => s.currentView);

  if (!player) return null;

  const totalSkills = Object.values(player.skills ?? {}).reduce((sum: number, s: any) => sum + (s.level ?? 0), 0);

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-lg font-bold text-white">💼 Карьера</h2>

      {/* Current job */}
      <div className="game-card border-l-4 border-emerald-500">
        {player.job ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-emerald-400">Работаешь</span>
              <span className="text-xs text-slate-500">Дней: {player.job.daysWorked ?? 0}</span>
            </div>
            <p className="text-white font-medium">{player.job.position}</p>
            <p className="text-xs text-slate-400">Зарплата: {formatMoney(player.job.salary)}/мес</p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-amber-400">Без работы</span>
              <span className="text-xs text-slate-500">День {player.currentDay ?? 1}</span>
            </div>
            <p className="text-slate-400 text-sm">Найди работу через раздел «День»</p>
          </>
        )}
      </div>

      {/* Grade progress */}
      <div className="game-card">
        <h3 className="text-sm font-medium text-slate-400 mb-2">📈 Грейды</h3>
        <div className="space-y-1.5">
          {GRADES.map((g) => {
            const isReached = player.grade === g.grade ||
              ['intern', 'junior', 'middle', 'senior', 'teamlead', 'architect'].indexOf(player.grade || '') >=
              ['intern', 'junior', 'middle', 'senior', 'teamlead', 'architect'].indexOf(g.grade);

            const showSkill = ['intern', 'junior', 'middle', 'senior'].indexOf(g.grade) >= 0;

            return (
              <div key={g.grade} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full ${isReached ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                <span className={`w-20 ${isReached ? 'text-slate-200' : 'text-slate-500'}`}>{g.name}</span>
                <span className={`flex-1 ${isReached ? 'text-slate-300' : 'text-slate-600'}`}>{g.salary}</span>
                {showSkill && (
                  <span className={`${totalSkills >= g.skill ? 'text-emerald-400' : 'text-slate-600'}`}>
                    навык {g.skill}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Companies */}
      <div className="game-card">
        <h3 className="text-sm font-medium text-slate-400 mb-2">🏢 Компании</h3>
        <div className="space-y-2">
          {COMPANIES.map((c) => (
            <div key={c.id} className="bg-slate-800/50 rounded-lg p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{c.icon}</span>
                  <div>
                    <p className="text-sm text-slate-200">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.stack}</p>
                  </div>
                </div>
                <div className="text-right text-xs">
                  <span className="text-emerald-400">{c.salary}</span>
                  <div className="text-slate-600">барьер {c.bar}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

function formatMoney(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)} млн`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)} тыс`;
  return `${amount}`;
}