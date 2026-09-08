import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { PixelIcon } from './pixel/PixelIcon';

/**
 * Interview mini-game — gamified learning (quiz with explanations).
 * The player answers 3 questions for their skill branch and grade;
 * performance feeds the real offer chance.
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

type Phase = 'idle' | 'playing' | 'summary' | 'result';

const TIER_LABELS: Record<string, string> = { junior: 'Junior', middle: 'Middle', senior: 'Senior' };

export const InterviewPanel: React.FC = () => {
  const startInterview = useGameStore((s) => s.startInterview);
  const answerInterview = useGameStore((s) => s.answerInterview);
  const finishInterview = useGameStore((s) => s.finishInterview);

  const [phase, setPhase] = useState<Phase>('idle');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerResult>>({});
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [idx, setIdx] = useState(0);
  const [finish, setFinish] = useState<FinishResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    const data = await startInterview();
    setBusy(false);
    if (data?.questions?.length) {
      haptic('medium');
      setQuestions(data.questions);
      const restored: Record<string, number> = {};
      for (const a of data.answers ?? []) {
        if (a.chosen !== null && a.chosen !== undefined) restored[a.id] = a.chosen;
      }
      setChosen(restored);
      setPhase('playing');
    } else {
      haptic('error');
      setError('Не удалось начать собеседование. Проверь связь и попробуй ещё раз.');
    }
  };

  const choose = async (optionIndex: number) => {
    if (busy || chosen[questions[idx].id] !== undefined) return;
    setBusy(true);
    const data = await answerInterview(questions[idx].id, optionIndex);
    setBusy(false);
    if (data) {
      haptic(data.correct ? 'success' : 'error');
      setChosen((c) => ({ ...c, [questions[idx].id]: optionIndex }));
      setAnswers((a) => ({
        ...a,
        [questions[idx].id]: {
          correct: data.correct,
          correctIndex: data.correctIndex,
          explanation: data.explanation,
        },
      }));
    } else {
      haptic('error');
      setError('Ответ не отправился — попробуй ещё раз.');
    }
  };

  const next = () => {
    haptic('selection');
    if (idx + 1 < questions.length) {
      setIdx(idx + 1);
    } else {
      setPhase('summary');
    }
  };

  const complete = async () => {
    setBusy(true);
    const data = await finishInterview();
    setBusy(false);
    if (data) {
      haptic(data.result === 'offer' ? 'success' : 'warning');
      setFinish(data);
      setPhase('result');
    } else {
      haptic('error');
      setError('Не удалось завершить собеседование — результат не сохранён.');
    }
  };

  const correctCount = Object.values(answers).filter((a) => a.correct).length;
  const q = questions[idx];

  // Network/server failures used to be swallowed: the state existed but was
  // never rendered, so a failed request looked like a frozen button.
  const errorNote = error ? (
    <div className="mb-3 flex items-start gap-2 px-3 py-2 text-xs border-2 border-clay-700 bg-clay-900/40 text-clay-200">
      <PixelIcon name="warn" size={11} className="mt-0.5" />
      {error}
    </div>
  ) : null;

  if (phase === 'idle') {
    return (
      <div className="panel panel-note panel-note-sky animate-pop-in">
        {errorNote}
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white mb-1">
          <PixelIcon name="chat" size={12} className="text-sky-300" />
          Собеседование-квиз
        </h3>
        <p className="text-xs text-ink-400 mb-3 leading-relaxed">
          Ответь на 3 вопроса по своей специализации. Каждый ответ даёт XP —
          правильный больше, неправильный меньше (но тоже даёт: учишься на ошибках).
          Результат влияет на шанс оффера.
        </p>
        <button
          onClick={start}
          disabled={busy}
          className="btn btn-primary w-full"
        >
          {busy ? 'Готовим вопросы…' : 'Начать собеседование'}
        </button>
      </div>
    );
  }

  if (phase === 'playing' && q) {
    const picked = chosen[q.id];
    const result = answers[q.id];
    return (
      <div className="panel panel-note panel-note-sky animate-fade-in">
        {errorNote}
        <div className="flex items-center justify-between mb-2">
          <span className="num text-xs text-ink-400">
            Вопрос {idx + 1} из {questions.length}
          </span>
          <span className="chip">
            {TIER_LABELS[q.tier] ?? q.tier}
          </span>
        </div>
        <div className="meter mb-3">
          <span
            style={{ width: `${((idx + 1) / questions.length) * 100}%`, background: 'var(--sky)' }}
          />
        </div>
        <p className="text-sm text-white font-medium mb-3 leading-relaxed">{q.text}</p>
        <div className="space-y-2">
          {q.options.map((option, i) => {
            const isPicked = picked === i;
            const isCorrectOption = result !== undefined && i === result.correctIndex;
            const isWrongPick = isPicked && result !== undefined && !result.correct;

            let cls = '';
            if (result !== undefined) {
              if (isCorrectOption) cls = '!border-moss-600 !bg-moss-900/30';
              else if (isWrongPick) cls = '!border-clay-600 !bg-clay-900/30';
              else cls = 'opacity-50';
            }

            return (
              <button
                key={i}
                onClick={() => choose(i)}
                disabled={result !== undefined || busy}
                className={`tile w-full flex items-start gap-2 text-sm text-ink-100 touch-target ${cls}`}
              >
                <span className="num text-xs text-ink-500 mt-0.5">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1">{option}</span>
                {isCorrectOption && (
                  <PixelIcon name="check" size={11} className="text-moss-400 mt-0.5" />
                )}
                {isWrongPick && <PixelIcon name="warn" size={11} className="text-clay-400 mt-0.5" />}
              </button>
            );
          })}
        </div>
        {result && (
          <div className="mt-3 animate-fade-in">
            <div
              className={`px-3 py-2.5 text-xs leading-relaxed border ${
                result.correct
                  ? 'bg-moss-900/30 border-moss-700 text-moss-200'
                  : 'bg-ochre-900/30 border-ochre-700 text-ochre-200'
              }`}
            >
              <span className="font-semibold">{result.correct ? 'Верно. ' : 'Не совсем. '}</span>
              {result.explanation}
            </div>
            <button
              onClick={next}
              className="btn btn-primary w-full mt-2"
            >
              {idx + 1 < questions.length ? 'Следующий вопрос' : 'К итогам'}
              <PixelIcon name="arrow" size={11} />
            </button>
          </div>
        )}
      </div>
    );
  }

  if (phase === 'summary') {
    return (
      <div className="panel panel-note panel-note-sky animate-fade-in">
        <h3 className="eyebrow mb-2">Итоги собеседования</h3>
        <div className="text-center py-3">
          <PixelIcon
            name={correctCount === questions.length ? 'trophy' : 'target'}
            size={28}
            className={`mx-auto mb-2 ${
              correctCount === questions.length ? 'text-gold-300' : 'text-ink-500'
            }`}
          />
          <p className="num text-xl font-semibold text-white">
            {correctCount} из {questions.length}
          </p>
          <p className="text-xs text-ink-400 mt-1 leading-relaxed">
            {correctCount === questions.length
              ? 'Идеально! Интервьюер уже готовит оффер.'
              : correctCount > 0
              ? 'Неплохо! Каждый ответ — это опыт.'
              : 'Тяжеловато, но за каждый вопрос ты получил XP — знания растут.'}
          </p>
        </div>
        <button
          onClick={complete}
          disabled={busy}
          className="btn btn-primary w-full"
        >
          {busy ? 'Интервьюер совещается…' : 'Узнать решение'}
        </button>
      </div>
    );
  }

  if (phase === 'result' && finish) {
    const isOffer = finish.result === 'offer';
    return (
      <div
        className={`panel panel-note animate-pop-in ${
          isOffer ? 'panel-note-moss' : 'panel-note-clay'
        }`}
      >
        <div className="text-center py-2">
          <PixelIcon
            name={isOffer ? 'trophy' : 'warn'}
            size={26}
            className={`mx-auto mb-2 ${isOffer ? 'text-gold-300' : 'text-clay-400'}`}
          />
          <h3 className={`text-base font-semibold ${isOffer ? 'text-moss-300' : 'text-clay-300'}`}>
            {isOffer ? 'Оффер получен' : 'Отказ'}
          </h3>
          <p className="num text-xs text-ink-300 mt-1">
            Верно: {finish.correct}/{finish.total} · шанс был {finish.chance}%
          </p>
          {finish.xp?.length > 0 && (
            <p className="num text-xs text-sky-300 mt-2">Обучение: {finish.xp.join(', ')} XP</p>
          )}
          <p className="text-xs text-ink-400 mt-2 leading-relaxed">
            {isOffer
              ? 'Загляни в блок «Офферы» выше и прими его!'
              : 'Не расстраивайся — подтяни навыки и откликайся снова. Опыт остался с тобой.'}
          </p>
        </div>
      </div>
    );
  }

  return null;
};
