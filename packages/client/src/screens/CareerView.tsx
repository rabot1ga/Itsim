import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { InterviewPanel } from '../components/InterviewPanel';
import { Spinner, ScreenTitle, SectionTitle, ResChip } from '../components/ui';
import { ProjectBoard } from '../components/ProjectBoard';
import { CareerPressureCard } from '../components/CareerPressureCard';
import { ActionGrid, toTile } from '../components/ActionGrid';
import { NavLinks } from '../components/NavLinks';
import { SIDE_JOB_EMOJI, WORK_ACTIONS, formatMoney as formatCash, type SideJobInfo } from './actionCatalogue';

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
  intern: '35 000 ₽',
  junior: '90 000 ₽',
  middle: '220 000 ₽',
  senior: '400 000 ₽',
  teamlead: '520 000 ₽',
  architect: '680 000 ₽',
  cto: '1 000 000 ₽',
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

export const CareerView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const performAction = useGameStore((s) => s.performAction);
  const applyToCompany = useGameStore((s) => s.applyToCompany);
  const acceptOffer = useGameStore((s) => s.acceptOffer);
  const declineOffer = useGameStore((s) => s.declineOffer);
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [sideJobs, setSideJobs] = useState<Record<string, SideJobInfo>>({});
  const [gates, setGates] = useState<GateInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const error = useGameStore((s) => s.error);
  const act = async (action: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const outlook = useGameStore((s) => s.careerOutlook);

  useEffect(() => {
    fetch('/api/content/side-jobs')
      .then((r) => r.json())
      .then((data) => setSideJobs(data.sideJobs ?? {}))
      .catch(() => setSideJobs({}));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false);
    setLoadError(false);
    const load = async (path: string) => {
      const response = await fetch(path, { signal: controller.signal });
      if (!response.ok) throw new Error('content');
      return response.json();
    };
    Promise.all([load('/api/content/companies'), load('/api/content/career-gates')])
      .then(([companyData, gateData]) => {
        if (!Array.isArray(companyData.companies) || !Array.isArray(gateData.gates)) throw new Error('content');
        setCompanies(companyData.companies);
        setGates(gateData.gates);
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadError(true);
          setLoaded(true);
        }
      });
    return () => controller.abort();
  }, [attempt]);

  if (!player) return null;

  const application = player.currentApplication;
  const offers = player.pendingOffers ?? [];

  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle emoji="💼">Работа</ScreenTitle>

      {error && (
        <p role="alert" className="card card-sm text-sm text-clay-300">
          {error}
        </p>
      )}

      {/* Current job */}
      <div className={`card panel-note ${player.job ? 'panel-note-moss' : 'panel-note-ochre'}`}>
        {player.job ? (
          <>
            <div className="flex items-center justify-between mb-1.5">
              <span className="eyebrow !text-moss-300">Работаешь</span>
              <span className="num text-xs text-ink-500 shrink-0">{player.job.daysWorked ?? 0} дн.</span>
            </div>
            <p className="text-white font-medium">{player.job.position}</p>
            <p className="num text-xs text-ink-400 mt-0.5">{formatMoney(player.job.salary)} ₽/мес</p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1.5">
              <span className="eyebrow !text-ochre-300">Без работы</span>
              <span className="num text-xs text-ink-500 shrink-0">день {player.currentDay ?? 1}</span>
            </div>
            <p className="text-ink-400 text-sm leading-relaxed">
              Выбери компанию ниже. Навыки и коммуникация помогут пройти собеседование; требования к росту — в
              справочнике грейдов.
            </p>
          </>
        )}
      </div>

      <ProjectBoard />

      <section aria-label="Рабочие действия">
        <SectionTitle className="mb-2">Действия</SectionTitle>
        <ActionGrid
          label="Рабочие действия"
          actions={WORK_ACTIONS.map((a) => toTile(a, Boolean(player.job)))}
          energy={player.energy ?? 0}
          money={player.money ?? 0}
          busy={busy}
          onRun={(id) => act(() => performAction(id, { skillId: player.mainSkillId || 'javascript' }))}
        />
      </section>

      {/* Non-IT gigs: money now, at the price of health and mood */}
      {Object.keys(sideJobs).length > 0 && (
        <section aria-label="Подработки не в IT">
          <SectionTitle className="mb-2">Подработки не в IT</SectionTitle>
          <ActionGrid
            label="Подработки"
            energy={player.energy ?? 0}
            money={player.money ?? 0}
            busy={busy}
            onRun={(jobId) => act(() => performAction('side_job', { jobId }))}
            actions={Object.entries(sideJobs).map(([jobId, job]) => {
              const skillLevel = player.skills?.[player.mainSkillId ?? 'javascript']?.level ?? 0;
              const tooEarly = (player.currentDay ?? 0) < (job.minDay ?? 1);
              const minSkillMet = skillLevel >= (job.minSkill ?? 0);
              const payout = job.payment + (job.paymentPerSkill ? Math.round(skillLevel * job.paymentPerSkill) : 0);
              return {
                id: jobId,
                emoji: SIDE_JOB_EMOJI[jobId] ?? '📦',
                name: job.name,
                energy: job.energy,
                locked: !minSkillMet || tooEarly,
                lockLabel: !minSkillMet ? `навык ${job.minSkill}+` : `с ${job.minDay} дня`,
                gain: (
                  <ResChip tone="positive">
                    +{formatCash(payout)}
                    {job.paymentVar ? '±' : ''} ₽
                  </ResChip>
                ),
              };
            })}
          />
          <p className="text-2xs text-ink-600 mt-1.5">Одна подработка в день. Здоровье и настроение — по курсу.</p>
        </section>
      )}

      {/* The rest of the career lives one tap away, not in the «⋮» menu */}
      <NavLinks
        title="Карьера дальше"
        links={[
          ...(player.job
            ? [
                {
                  view: 'office',
                  emoji: '🖥',
                  label: 'Мой офис',
                  hint: `${player.job.position} · команда, задачи и настроение дня`,
                },
              ]
            : []),
          { view: 'endings', emoji: '🏁', label: 'Финалы', hint: 'шесть способов завершить карьеру' },
          { view: 'leaderboard', emoji: '🏆', label: 'Топ игроков', hint: 'кто и как быстро растёт' },
        ]}
      />

      {/* Promotion pressure: cost of the day + what the next grade really needs */}
      <CareerPressureCard />

      {/* Job offers */}
      {offers.length > 0 && (
        <div className="card panel-note panel-note-moss animate-pop-in">
          <SectionTitle className="mb-2">Офферы</SectionTitle>
          <div className="space-y-2">
            {offers.map((o: any) => (
              <div key={o.companyId} className="well p-2.5">
                <div className="career-offer-row">
                  <div className="min-w-0">
                    <p className="text-sm text-ink-100">{o.position}</p>
                    <p className="num text-xs text-moss-300">{formatMoney(o.salary)} ₽/мес</p>
                    <p className="num text-2xs text-ink-500">сгорит через {o.expiresInDays} дн.</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      disabled={busy}
                      onClick={() => act(() => acceptOffer(o.companyId))}
                      className="btn btn-sm btn-primary"
                    >
                      Принять
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => act(() => declineOffer(o.companyId))}
                      className="btn btn-sm btn-ghost"
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
        <div className="card panel-note panel-note-sky">
          <SectionTitle className="mb-2">Твой отклик</SectionTitle>
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
            <p className="text-sm text-ink-300 leading-relaxed">Оффер получен — прими его в блоке «Офферы» выше.</p>
          )}
        </div>
      )}

      {/* Companies */}
      <div className="card">
        <SectionTitle className="mb-3">Доступные компании</SectionTitle>
        {!loaded && <Spinner label="Загрузка компаний…" />}
        {loadError && (
          <div role="alert" className="text-sm text-clay-300">
            Не удалось загрузить вакансии.
            <button className="btn btn-secondary mt-2" onClick={() => setAttempt((n) => n + 1)}>
              Повторить загрузку
            </button>
          </div>
        )}
        {loaded && !loadError && companies.length === 0 && (
          <p className="text-sm text-ink-400">Открытых вакансий пока нет.</p>
        )}
        <div className="space-y-2">
          {(loaded && !loadError ? companies : []).map((c) => {
            const canApply = !player.job && (!application || ['rejected', 'accepted'].includes(application.status));
            return (
              <article key={c.id} className="well career-company" aria-label={c.name}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm text-ink-100 break-words">{c.name}</p>
                      <p className="text-xs text-ink-500">
                        {SIZE_LABELS[c.size] ?? c.size} · {c.stack.slice(0, 3).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs shrink-0 ml-2">
                    <span className="num text-moss-300" title="От базовой зарплаты грейда">
                      {Math.round(c.salaryMult * 100)}% к базе
                    </span>
                    <div className="num text-ink-600">барьер {c.interviewBar}</div>
                  </div>
                </div>
                <p className="text-xs text-ink-500 mt-1.5 leading-relaxed line-clamp-2">{c.flavor}</p>
                {canApply && (
                  <button
                    disabled={busy}
                    onClick={() => act(() => applyToCompany(c.id))}
                    className="btn btn-sm btn-primary mt-3 ml-auto flex"
                  >
                    Откликнуться
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </div>
      {/* Grade progress — real content gates, not a hardcoded copy */}
      <details className="card career-grades">
        <summary className="flex items-center justify-between mb-2">
          <span className="section-title">Повышение грейда · требования</span>
        </summary>
        <div className="space-y-1.5">
          {(gates.length ? gates : []).map((g) => {
            const order = gates.map((x) => x.grade);
            const isReached = order.indexOf(player.grade || '') >= order.indexOf(g.grade);
            const isNext = outlook?.grade === g.grade || outlook?.label === g.label;
            const mainSkill = Math.max(...Object.values(player.skills ?? {}).map((x: any) => x.level ?? 0), 0);

            return (
              <div
                key={g.grade}
                className={`px-2 py-1.5 rounded-xl border ${
                  isNext ? 'border-gold-500 bg-gold-900/20' : 'border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isReached ? 'bg-moss-300' : g.special ? 'bg-gold-300' : 'bg-ink-600'
                    }`}
                  />
                  <span className={`w-24 ${isReached ? 'text-ink-100' : 'text-ink-500'}`}>{g.label ?? g.grade}</span>
                  <span className={`num flex-1 ${isReached ? 'text-ink-300' : 'text-ink-600'}`}>
                    {SALARY_LABELS[g.grade] ?? ''}
                  </span>
                  <span className={`num ${mainSkill >= g.skill ? 'text-moss-300' : 'text-ink-500'}`}>
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
                    {g.special ? <span className="chip !text-gold-300 !border-gold-700">выборы борда</span> : null}
                    {!g.special && g.minDaysInGrade ? (
                      <span className="chip">ревью раз в {g.minDaysInGrade} дн.</span>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
          {loaded && !loadError && !gates.length && (
            <p className="text-xs text-ink-400">Грейды пока не опубликованы.</p>
          )}
        </div>
      </details>
    </div>
  );
};

function formatMoney(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)} млн`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)} тыс`;
  return `${amount}`;
}
