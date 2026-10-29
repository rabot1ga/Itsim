import { t } from '../lib/i18n';
import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { playSfx } from '../lib/sfx';
import { DeckCard } from './DeckCard';
import { PixelIcon } from './pixel/PixelIcon';

/**
 * Собеседование как карточки стека (DESIGN-DECK §7.2): тот же квиз
 * (3 вопроса → результат), но подача — карточки дня, а не панель в «Работе».
 * Варианты ответа — тапом (их 2–4), свайп остаётся за «Дальше»/«Позже».
 */
interface Question {
  id: string;
  skillId: string;
  tier: string;
  text: string;
  options: string[];
}
interface AnswerResult {
  correct: boolean;
  correctIndex: number;
  explanation: string;
}
interface FinishResult {
  result: 'offer' | 'rejected';
  correct: number;
  total: number;
  chance: number;
  xp: string[];
}

export const DeckInterview: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const startInterview = useGameStore((s) => s.startInterview);
  const answerInterview = useGameStore((s) => s.answerInterview);
  const finishInterview = useGameStore((s) => s.finishInterview);
  const [phase, setPhase] = useState<'intro' | 'playing' | 'result'>('intro');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerResult>>({});
  const [idx, setIdx] = useState(0);
  const [finish, setFinish] = useState<FinishResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    const data = await startInterview();
    setBusy(false);
    if (data?.questions?.length) {
      haptic('medium');
      setQuestions(data.questions);
      setIdx(0);
      setPhase('playing');
    } else {
      haptic('error');
      setError(t('Не удалось начать собеседование. Проверь связь и попробуй ещё раз.'));
    }
  };

  const choose = async (optionIndex: number) => {
    const q = questions[idx];
    if (!q || busy || answers[q.id]) return;
    setBusy(true);
    const data = await answerInterview(q.id, optionIndex);
    setBusy(false);
    if (data) {
      haptic(data.correct ? 'success' : 'error');
      playSfx(data.correct ? 'success' : 'error');
      setAnswers((a) => ({
        ...a,
        [q.id]: { correct: data.correct, correctIndex: data.correctIndex, explanation: data.explanation },
      }));
    } else {
      haptic('error');
      setError(t('Ответ не отправился — попробуй ещё раз.'));
    }
  };

  const advance = async () => {
    if (idx + 1 < questions.length) {
      setIdx(idx + 1);
      return;
    }
    setBusy(true);
    const data = await finishInterview();
    setBusy(false);
    if (data) {
      haptic(data.result === 'offer' ? 'success' : 'warning');
      playSfx(data.result === 'offer' ? 'success' : 'error');
      setFinish(data);
      setPhase('result');
    } else {
      haptic('error');
      setError(t('Не удалось завершить собеседование — результат не сохранён.'));
    }
  };

  if (phase === 'intro') {
    return (
      <DeckCard
        id="interview-intro"
        icon="chat"
        tone="hook"
        title={t('Собеседование сегодня')}
        flavor={t('3 вопроса по специализации: правильные ответы повышают шанс оффера. Каждый ответ даёт XP')}
        busy={busy}
        left={{ label: t('Позже'), run: onDone, tone: 'ghost' }}
        right={{ label: t('Начать'), run: start }}
      >
        {error && (
          <p className="text-xs text-clay-200 flex items-center gap-1.5" role="alert">
            <PixelIcon name="warn" size={14} />
            {error}
          </p>
        )}
      </DeckCard>
    );
  }

  if (phase === 'playing') {
    const q = questions[idx];
    const result = q ? answers[q.id] : undefined;
    return (
      <DeckCard
        id={`interview-q${idx + 1}`}
        icon="chat"
        title={t('Вопрос {p0} из {p1}', { p0: idx + 1, p1: questions.length })}
        busy={busy}
        right={result ? { label: t('Дальше'), run: advance } : undefined}
      >
        {error && (
          <p className="text-xs text-clay-200 mb-2" role="alert">
            {error}
          </p>
        )}
        {q && (
          <>
            <p className="text-sm text-ink-100 leading-relaxed mb-2">{q.text}</p>
            <div className="deck-options">
              {q.options.map((opt, i) => {
                const picked = result && result.correctIndex === i;
                const wrongPick = result && !result.correct && i !== result.correctIndex;
                return (
                  <button
                    key={i}
                    className="deck-option"
                    data-state={result ? (picked ? 'correct' : wrongPick ? 'dim' : 'revealed') : 'idle'}
                    disabled={Boolean(result) || busy}
                    onClick={() => void choose(i)}
                  >
                    {opt}
                    {picked && <PixelIcon name="check" size={13} />}
                  </button>
                );
              })}
            </div>
            {result && (
              <p className={`text-xs mt-2 ${result.correct ? 'text-moss-300' : 'text-clay-200'}`}>
                {result.correct ? t('Верно! Интервьюер кивает.') : t('Мимо. Зато теперь точно запомнишь.')}{' '}
                {result.explanation}
              </p>
            )}
          </>
        )}
      </DeckCard>
    );
  }

  const offered = finish?.result === 'offer';
  return (
    <DeckCard
      id="interview-result"
      icon={offered ? 'trophy' : 'warn'}
      tone={offered ? 'hook' : 'action'}
      title={offered ? t('Оффер получен!') : t('В этот раз не вышло')}
      meta={
        finish ? (
          <span className="deck-cost num">
            {t('Верных ответов: {p0}/{p1}', { p0: finish.correct, p1: finish.total })} ·{' '}
            {t('шанс был {p0}%', { p0: finish.chance })}
          </span>
        ) : undefined
      }
      flavor={
        offered
          ? t('Прими оффер в «Карьере» — он сгорит через 5 дней')
          : t('Подтяни навыки: серия отказов повышает шанс следующего собеседования')
      }
      right={{ label: t('Готово'), run: onDone }}
    />
  );
};
