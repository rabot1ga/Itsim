import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { InterviewPanel } from '../components/InterviewPanel';
import { Spinner, SpriteBadge } from '../components/ui';
import { PixelIcon } from '../components/pixel/PixelIcon';

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

  const application = player.currentApplication;
  const offers = player.pendingOffers ?? [];

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="flex items-center gap-2 text-base font-semibold text-white">
        <SpriteBadge sprite="whiteboard" size={32} />
        Карьера
      </h2>

      {/* Current job */}
      <div className={`panel panel-note ${player.job ? 'panel-note-moss' : 'panel-note-ochre'}`}>
        {player.job ? (
          <>
            <div className="flex items-center justify-between mb-1.5">
              <span className="eyebrow !text-moss-300">Работаешь</span>
              <span className="num text-xs text-ink-500 shrink-0">
                {player.job.daysWorked ?? 0} дн.
              </span>
            </div>
            <p className="text-white font-medium">{player.job.position}</p>
            <p className="num text-xs text-ink-400 mt-0.5">
              {formatMoney(player.job.salary)} ₽/мес
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1.5">
              <span className="eyebrow !text-ochre-300">Без работы</span>
              <span className="num text-xs text-ink-500 shrink-0">день {player.currentDay ?? 1}</span>
            </div>
            <p className="text-ink-400 text-sm leading-relaxed">
              Откликайся на вакансии ниже — но сначала прокачай навыки (от 18 суммарно) и коммуникацию
            </p>
          </>
        )}
      </div>

      {/* Office entry */}
      {player.job && (
        <button
          onClick={() => setView('office')}
          className="tile w-full flex items-center gap-3"
        >
          <PixelIcon name="briefcase" size={16} className="text-ink-300" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-ink-100">Мой офис</span>
            <span className="block text-xs text-ink-500 truncate">
              {player.job.position} · команда, задачи и настроение дня
            </span>
          </span>
          <PixelIcon name="arrow" size={11} className="text-ink-500 shrink-0" />
        </button>
      )}

      {/* Job offers */}
      {offers.length === 0 && !player.job && !application && (
        <div className="panel flex items-center gap-3">
          <PixelIcon name="box" size={18} className="text-ink-600" />
          <p className="text-xs text-ink-400 leading-relaxed">
            Офферов пока нет — откликнись на вакансии ниже. HR любят настойчивых
            (и прокачанные навыки).
          </p>
        </div>
      )}
      {offers.length > 0 && (
        <div className="panel panel-note panel-note-moss animate-pop-in">
          <h3 className="section-title mb-2">Офферы</h3>
          <div className="space-y-2">
            {offers.map((o: any) => (
              <div key={o.companyId} className="well p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-ink-100">{o.position}</p>
                    <p className="num text-xs text-moss-300">{formatMoney(o.salary)} ₽/мес</p>
                    <p className="num text-2xs text-ink-500">сгорит через {o.expiresInDays} дн.</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => acceptOffer(o.companyId)}
                      className="btn btn-primary !min-h-[38px] !px-3 text-xs"
                    >
                      Принять
                    </button>
                    <button
                      onClick={() => declineOffer(o.companyId)}
                      className="btn btn-ghost !min-h-[38px] !px-3 text-xs"
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
        <div className="panel panel-note panel-note-sky">
          <h3 className="eyebrow mb-2">Твой отклик</h3>
          {application.status === 'interview_scheduled' && (
            <p className="text-sm text-ink-300 leading-relaxed">
              {application.position} — собеседование на {application.interviewDay} день. Готовься, скрести пальцы.
            </p>
          )}
          {application.status === 'rejected' && (
            <p className="text-sm text-ink-300 leading-relaxed">
              {application.position} — отказ. «Мы вернёмся к вам, если что». Можешь откликнуться снова.
            </p>
          )}
          {application.status === 'accepted' && (
            <p className="text-sm text-ink-300 leading-relaxed">
              Оффер получен — прими его в блоке «Офферы» выше.
            </p>
          )}
        </div>
      )}

      {/* Grade progress — real content gates, not a hardcoded copy */}
      <div className="game-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="section-title">Грейды</h3>
          <span className="text-2xs text-ink-600">глубина + ветка + мягкие навыки</span>
        </div>
        <div className="space-y-1.5">
          {(gates.length ? gates : []).map((g) => {
            const order = gates.map(x => x.grade);
            const isReached = order.indexOf(player.grade || '') >= order.indexOf(g.grade);
            const isNext = outlook?.grade === g.grade || outlook?.label === g.label;
            const mainSkill = Math.max(...Object.values(player.skills ?? {}).map((x: any) => x.level ?? 0), 0);

            return (
              <div
                key={g.grade}
                className={` px-2 py-1.5 border ${
                  isNext ? 'border-gold-700 bg-gold-900/15' : 'border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-1.5 h-1.5 ${
                      isReached ? 'bg-moss-400' : g.special ? 'bg-gold-500' : 'bg-ink-600'
                    }`}
                  />
                  <span className={`w-24 ${isReached ? 'text-ink-100' : 'text-ink-500'}`}>
                    {g.label ?? g.grade}
                  </span>
                  <span className={`num flex-1 ${isReached ? 'text-ink-300' : 'text-ink-600'}`}>
                    {SALARY_LABELS[g.grade] ?? ''}
                  </span>
                  <span
                    className={`num ${mainSkill >= g.skill ? 'text-moss-300' : 'text-ink-500'}`}
                  >
                    навык {g.skill}
                  </span>
                </div>
                {(isNext || isReached) && (
                  <div className="mt-1.5 flex flex-wrap gap-1 pl-3.5">
                    {g.total ? <span className="chip">всего {g.total}</span> : null}
                    {g.branchTotal ? <span className="chip">ветка {g.branchTotal}</span> : null}
                    <span className="chip">comm {g.comm}</span>
                    {g.english ? <span className="chip">eng {g.english}</span> : null}
                    {g.leadership ? <span className="chip">lead {g.leadership}</span> : null}
                    <span className="chip">rep {g.rep}</span>
                    {g.special ? (
                      <span className="chip !text-gold-300 !border-gold-700">выборы борда</span>
                    ) : null}
                    {!g.special && g.minDaysInGrade ? <span className="chip">ревью раз в {g.minDaysInGrade} дн.</span> : null}
                  </div>
                )}
              </div>
            );
          })}
          {!gates.length && <Spinner label="Грейды загружаются…" />}
        </div>
      </div>

      {/* Companies */}
      <div className="game-card">
        <h3 className="section-title mb-2">Компании</h3>
        {companies.length === 0 && <Spinner label="Загрузка компаний…" />}
        <div className="space-y-2">
          {companies.map((c) => {
            const canApply = !player.job && (!application || ['rejected', 'accepted'].includes(application.status));
            return (
              <div key={c.id} className="well p-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm text-ink-100 truncate">{c.name}</p>
                      <p className="text-xs text-ink-500">
                        {SIZE_LABELS[c.size] ?? c.size} · {c.stack.slice(0, 3).map(s => STACK_ICONS[s] ?? s).join(' ')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs shrink-0 ml-2">
                    <span className="num text-moss-300">{Math.round(c.salaryMult * 100)}%</span>
                    <div className="num text-ink-600">барьер {c.interviewBar}</div>
                  </div>
                </div>
                <p className="text-xs text-ink-500 mt-1.5 leading-relaxed line-clamp-2">{c.flavor}</p>
                {canApply && (
                  <button
                    onClick={() => applyToCompany(c.id)}
                    className="btn btn-secondary w-full mt-2 !min-h-[38px] text-sm"
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
