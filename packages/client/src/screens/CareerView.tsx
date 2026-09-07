import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { InterviewPanel } from '../components/InterviewPanel';

interface GateInfo {
  grade: string;
  label?: string;
  skill: number;
  total?: number;
  branchTotal?: number;
  comm: number;
  rep: number;
  english?: number;
  leadership?: number;
  minDaysInGrade?: number;
  competition?: number;
  special?: boolean;
}

const SALARY_LABELS: Record<string, string> = {
  intern: '35 000 ₽', junior: '90 000 ₽', middle: '220 000 ₽', senior: '400 000 ₽',
  teamlead: '520 000 ₽', architect: '680 000 ₽', cto: '1 000 000 ₽',
};

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
  const setView = useGameStore((s) => s.setView);
  const applyToCompany = useGameStore((s) => s.applyToCompany);
  const acceptOffer = useGameStore((s) => s.acceptOffer);
  const declineOffer = useGameStore((s) => s.declineOffer);
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [gates, setGates] = useState<GateInfo[]>([]);
  const outlook = useGameStore((s) => s.careerOutlook);

  useEffect(() => {
    fetch('/api/content/companies')
      .then((r) => r.json())
      .then((data) => setCompanies(data.companies ?? []))
      .catch(() => setCompanies([]));
    fetch('/api/content/career-gates')
      .then((r) => r.json())
      .then((data) => setGates(data.gates ?? []))
      .catch(() => setGates([]));
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

      {/* Office entry */}
      {player.job && (
        <button
          onClick={() => setView('office')}
          className="game-card w-full flex items-center gap-3 text-left border-sky-500/30 hover:border-sky-500/50 active:scale-[0.98] transition-all"
        >
          <span className="text-2xl">🏢</span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-slate-100">Мой офис</span>
            <span className="block text-[11px] text-slate-500 truncate">
              {player.job.position} · команда, задачи и настроение дня
            </span>
          </span>
          <span className="text-primary-400 shrink-0">→</span>
        </button>
      )}

      {/* Job offers */}
      {offers.length > 0 && (
        <div className="game-card border-l-4 border-emerald-500 animate-pop-in">
          <h3 className="section-title mb-2">📩 Офферы</h3>
          <div className="space-y-2">
            {offers.map((o: any) => (
              <div key={o.companyId} className="bg-slate-800/50 rounded-lg p-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-200">{o.position}</p>
                    <p className="text-xs text-emerald-400">{formatMoney(o.salary)}/мес</p>
                    <p className="text-xs text-slate-500">Сгорит через {o.expiresInDays} дн.</p>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-2">
                    <button
                      onClick={() => acceptOffer(o.companyId)}
                      className="text-xs px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl touch-target font-medium transition-all"
                    >
                      Принять
                    </button>
                    <button
                      onClick={() => declineOffer(o.companyId)}
                      className="text-xs px-4 py-2.5 bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-300 rounded-xl touch-target transition-all"
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

      {/* Interview quiz */}
      {application?.status === 'interview_scheduled' && <InterviewPanel />}

      {/* Application status */}
      {application && (
        <div className="game-card border-l-4 border-sky-500">
          <h3 className="section-title mb-2">📄 Твой отклик</h3>
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

      {/* Grade progress — real content gates, not a hardcoded copy */}
      <div className="game-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="section-title">📈 Грейды</h3>
          <span className="text-[10px] text-slate-500">глубина + ветка + мягкие навыки</span>
        </div>
        <div className="space-y-1.5">
          {(gates.length ? gates : []).map((g) => {
            const order = gates.map(x => x.grade);
            const isReached = order.indexOf(player.grade || '') >= order.indexOf(g.grade);
            const isNext = outlook?.grade === g.grade || outlook?.label === g.label;
            const mainSkill = Math.max(...Object.values(player.skills ?? {}).map((x: any) => x.level ?? 0), 0);

            return (
              <div key={g.grade} className={`rounded-lg px-2 py-1.5 ${isNext ? 'bg-primary-500/10 border border-primary-500/30' : ''}`}>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full ${isReached ? 'bg-emerald-500' : g.special ? 'bg-amber-400/70' : 'bg-slate-600'}`} />
                  <span className={`w-24 ${isReached ? 'text-slate-200' : 'text-slate-500'}`}>{g.label ?? g.grade}</span>
                  <span className={`flex-1 ${isReached ? 'text-slate-300' : 'text-slate-600'}`}>{SALARY_LABELS[g.grade] ?? ''}</span>
                  <span className={`font-mono ${mainSkill >= g.skill ? 'text-emerald-400' : 'text-slate-500'}`}>
                    навык {g.skill}
                  </span>
                </div>
                {(isNext || isReached) && (
                  <div className="mt-1 flex flex-wrap gap-1 pl-4 text-[10px] text-slate-500">
                    {g.total ? <span className="chip">всего {g.total}</span> : null}
                    {g.branchTotal ? <span className="chip">ветка {g.branchTotal}</span> : null}
                    <span className="chip">comm {g.comm}</span>
                    {g.english ? <span className="chip">eng {g.english}</span> : null}
                    {g.leadership ? <span className="chip">lead {g.leadership}</span> : null}
                    <span className="chip">rep {g.rep}</span>
                    {g.special ? <span className="chip text-amber-300">выборы борда</span> : null}
                    {!g.special && g.minDaysInGrade ? <span className="chip">ревью раз в {g.minDaysInGrade} дн.</span> : null}
                  </div>
                )}
              </div>
            );
          })}
          {!gates.length && (
            <p className="text-xs text-slate-500">Грейды ещё не загружены.</p>
          )}
        </div>
      </div>

      {/* Companies */}
      <div className="game-card">
        <h3 className="section-title mb-2">🏢 Компании</h3>
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
                    className="mt-2 w-full text-sm px-3 py-2.5 bg-primary-600 hover:bg-primary-700 active:scale-[0.98] text-white rounded-xl transition-all touch-target font-medium"
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
