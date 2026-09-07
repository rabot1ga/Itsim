import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';

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
    <div className="mb-3 px-3 py-2 rounded-xl text-xs bg-red-900/30 border border-red-600/40 text-red-200">
      ⚠️ {error}
    </div>
  ) : null;

  if (phase === 'idle') {
    return (
      <div className="game-card border-sky-500/40 bg-sky-500/5 animate-pop-in">
        {errorNote}
        <h3 className="text-sm font-bold text-sky-300 mb-1">🎤 Собеседование-квиз</h3>
        <p className="text-xs text-slate-300 mb-3">
          Ответь на 3 вопроса по своей специализации. Каждый ответ даёт XP —
          правильный больше, неправильный меньше (но тоже даёт: учишься на ошибках).
          Результат влияет на шанс оффера.
        </p>
        <button
          onClick={start}
          disabled={busy}
          className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all active:scale-[0.98] touch-target"
        >
          {busy ? 'Готовим вопросы...' : 'Начать собеседование'}
        </button>
      </div>
    );
  }

  if (phase === 'playing' && q) {
    const picked = chosen[q.id];
    const result = answers[q.id];
    return (
      <div className="game-card border-sky-500/40 bg-sky-500/5 animate-fade-in">
        {errorNote}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400">
            Вопрос {idx + 1} из {questions.length}
          </span>
          <span className="chip bg-slate-800 text-sky-300 border border-slate-700">
            {TIER_LABELS[q.tier] ?? q.tier}
          </span>
        </div>
        <div className="h-1 bg-slate-700 rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-sky-500 rounded-full transition-all"
            style={{ width: `${((idx + 1) / questions.length) * 100}%` }}
          />
        </div>
        <p className="text-sm text-slate-100 font-medium mb-3">{q.text}</p>
        <div className="space-y-2">
          {q.options.map((option, i) => {
            const isPicked = picked === i;
            const isCorrectOption = result !== undefined && i === result.correctIndex;
            const isWrongPick = isPicked && result !== undefined && !result.correct;

            let cls = 'border-slate-700 bg-slate-800/60 hover:border-sky-500/50';
            if (result !== undefined) {
              if (isCorrectOption) cls = 'border-emerald-500 bg-emerald-900/30';
              else if (isWrongPick) cls = 'border-red-500 bg-red-900/30';
              else cls = 'border-slate-700 bg-slate-800/40 opacity-60';
            }

            return (
              <button
                key={i}
                onClick={() => choose(i)}
                disabled={result !== undefined || busy}
                className={`w-full text-left px-3 py-3 rounded-xl border text-sm text-slate-200 transition-all touch-target active:scale-[0.98] ${cls}`}
              >
                <span className="font-mono text-xs text-slate-500 mr-2">{String.fromCharCode(65 + i)}.</span>
                {option}
                {isCorrectOption && <span className="ml-2">✅</span>}
                {isWrongPick && <span className="ml-2">❌</span>}
              </button>
            );
          })}
        </div>
        {result && (
          <div className="mt-3 animate-fade-in">
            <div
              className={`px-3 py-2.5 rounded-xl text-xs border ${
                result.correct
                  ? 'bg-emerald-900/30 border-emerald-600/40 text-emerald-200'
                  : 'bg-amber-900/30 border-amber-600/40 text-amber-200'
              }`}
            >
              <span className="font-bold">{result.correct ? '✅ Верно! ' : '❌ Не совсем. '}</span>
              {result.explanation}
            </div>
            <button
              onClick={next}
              className="w-full mt-2 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold transition-all active:scale-[0.98] touch-target"
            >
              {idx + 1 < questions.length ? 'Следующий вопрос →' : 'К итогам 📊'}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (phase === 'summary') {
    return (
      <div className="game-card border-sky-500/40 bg-sky-500/5 animate-fade-in">
        <h3 className="text-sm font-bold text-sky-300 mb-2">📊 Итоги собеседования</h3>
        <div className="text-center py-4">
          <div className="text-4xl mb-2">{correctCount === questions.length ? '🏆' : correctCount > 0 ? '👍' : '💪'}</div>
          <p className="text-xl font-bold text-white">
            {correctCount} из {questions.length}
          </p>
          <p className="text-xs text-slate-400 mt-1">
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
          className="w-full py-3 bg-gradient-to-r from-sky-600 to-violet-600 hover:from-sky-500 hover:to-violet-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all active:scale-[0.98] touch-target"
        >
          {busy ? 'Интервьюер совещается...' : 'Узнать решение 🎯'}
        </button>
      </div>
    );
  }

  if (phase === 'result' && finish) {
    const isOffer = finish.result === 'offer';
    return (
      <div className={`game-card animate-pop-in ${isOffer ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5'}`}>
        <div className="text-center py-2">
          <div className="text-4xl mb-2">{isOffer ? '🎉' : '😔'}</div>
          <h3 className={`text-base font-bold ${isOffer ? 'text-emerald-300' : 'text-red-300'}`}>
            {isOffer ? 'Оффер получен!' : 'Отказ'}
          </h3>
          <p className="text-xs text-slate-300 mt-1">
            Верно: {finish.correct}/{finish.total} · Шанс был: {finish.chance}%
          </p>
          {finish.xp?.length > 0 && (
            <p className="text-[11px] text-primary-300 mt-2">
              🎓 Обучение: {finish.xp.join(', ')} XP
            </p>
          )}
          <p className="text-xs text-slate-400 mt-2 leading-snug">
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
