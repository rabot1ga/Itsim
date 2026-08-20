import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';

const GRADES = [
  { grade: 'intern', name: 'Стажёр', skill: 18, salary: '35 000 ₽' },
  { grade: 'junior', name: 'Junior', skill: 32, salary: '90 000 ₽' },
  { grade: 'middle', name: 'Middle', skill: 55, salary: '220 000 ₽' },
  { grade: 'senior', name: 'Senior', skill: 76, salary: '400 000 ₽' },
  { grade: 'teamlead', name: 'Teamlead', skill: 80, salary: '520 000 ₽' },
  { grade: 'architect', name: 'Архитектор', skill: 90, salary: '680 000 ₽' },
];

const SIZE_LABELS: Record<string, string> = {
  enterprise: 'Корпорация',
  startup: 'Стартап',
  product: 'Продукт',
  outsource: 'Аутсорс',
};

interface CompanyInfo {
  id: string;
  name: string;
  archetype: string;
  size: string;
  stack: string[];
  salaryMult: number;
  interviewBar: number;
  toxicity: number;
  growthPotential: number;
  perks: string[];
  flavor: string;
  requiresEnglish: number;
}

const STACK_ICONS: Record<string, string> = {
  javascript: '🟨', react: '⚛️', typescript: '🔷', python: '🐍', java: '☕',
  spring: '🌱', sql: '🗃️', kotlin: '🟣', go: '🐹', nodejs: '🟢', swift: '🐦',
};

export const CareerView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const applyToCompany = useGameStore((s) => s.applyToCompany);
  const acceptOffer = useGameStore((s) => s.acceptOffer);
  const declineOffer = useGameStore((s) => s.declineOffer);
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);

  useEffect(() => {
    fetch('/api/content/companies')
      .then((r) => r.json())
      .then((data) => setCompanies(data.companies ?? []))
      .catch(() => setCompanies([]));
  }, []);

  if (!player) return null;

  const totalSkills = Object.values(player.skills ?? {}).reduce((sum: number, s: any) => sum + (s.level ?? 0), 0);
  const application = player.currentApplication;
  const offers = player.pendingOffers ?? [];

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
            <p className="text-slate-400 text-sm">
              Откликайся на вакансии ниже — но сначала прокачай навыки (от 18 суммарно) и коммуникацию
            </p>
          </>
        )}
      </div>

      {/* Job offers */}
      {offers.length > 0 && (
        <div className="game-card border-l-4 border-emerald-500">
          <h3 className="text-sm font-medium text-slate-400 mb-2">📩 Офферы</h3>
          <div className="space-y-2">
            {offers.map((o: any) => (
              <div key={o.companyId} className="bg-slate-800/50 rounded-lg p-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-200">{o.position}</p>
                    <p className="text-xs text-emerald-400">{formatMoney(o.salary)}/мес</p>
                    <p className="text-xs text-slate-500">Сгорит через {o.expiresInDays} дн.</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => acceptOffer(o.companyId)}
                      className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                    >
                      Принять
                    </button>
                    <button
                      onClick={() => declineOffer(o.companyId)}
                      className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg"
                    >
                      Отклонить
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Application status */}
      {application && (
        <div className="game-card border-l-4 border-sky-500">
          <h3 className="text-sm font-medium text-slate-400 mb-2">📄 Твой отклик</h3>
          {application.status === 'interview_scheduled' && (
            <p className="text-sm text-slate-300">
              {application.position} — собеседование на {application.interviewDay} день. Готовься, скрести пальцы.
            </p>
          )}
          {application.status === 'rejected' && (
            <p className="text-sm text-slate-300">
              {application.position} — отказ. «Мы вернёмся к вам, если что». Можешь откликнуться снова.
            </p>
          )}
          {application.status === 'accepted' && (
            <p className="text-sm text-slate-300">
              Оффер получен — прими его в блоке «Офферы» выше.
            </p>
          )}
        </div>
      )}

      {/* Grade progress */}
      <div className="game-card">
        <h3 className="text-sm font-medium text-slate-400 mb-2">📈 Грейды</h3>
        <div className="space-y-1.5">
          {GRADES.map((g) => {
            const order = GRADES.map(x => x.grade);
            const isReached = player.grade === g.grade || order.indexOf(player.grade || '') >= order.indexOf(g.grade);

            return (
              <div key={g.grade} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full ${isReached ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                <span className={`w-20 ${isReached ? 'text-slate-200' : 'text-slate-500'}`}>{g.name}</span>
                <span className={`flex-1 ${isReached ? 'text-slate-300' : 'text-slate-600'}`}>{g.salary}</span>
                <span className={`${totalSkills >= g.skill ? 'text-emerald-400' : 'text-slate-600'}`}>
                  навык {g.skill}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Companies */}
      <div className="game-card">
        <h3 className="text-sm font-medium text-slate-400 mb-2">🏢 Компании</h3>
        {companies.length === 0 && (
          <p className="text-xs text-slate-500">Загрузка компаний...</p>
        )}
        <div className="space-y-2">
          {companies.map((c) => {
            const canApply = !player.job && (!application || ['rejected', 'accepted'].includes(application.status));
            return (
              <div key={c.id} className="bg-slate-800/50 rounded-lg p-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 truncate">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        {SIZE_LABELS[c.size] ?? c.size} · {c.stack.slice(0, 3).map(s => STACK_ICONS[s] ?? s).join(' ')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs shrink-0 ml-2">
                    <span className="text-emerald-400">{Math.round(c.salaryMult * 100)}%</span>
                    <div className="text-slate-600">барьер {c.interviewBar}</div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{c.flavor}</p>
                {canApply && (
                  <button
                    onClick={() => applyToCompany(c.id)}
                    className="mt-2 w-full text-xs px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                  >
                    Откликнуться
                  </button>
                )}
              </div>
            );
          })}
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
