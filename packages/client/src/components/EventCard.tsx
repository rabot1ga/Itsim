import React from 'react';
import { PixelIcon } from './pixel/PixelIcon';

/** Decorative category artwork, not a promise of a particular event outcome. */
export function eventArtwork(tags: string[]): string {
  if (tags.some((tag) => ['health', 'mental'].includes(tag))) return '/events/rest.webp';
  if (tags.includes('pets')) return '/events/pet.webp';
  return '/events/night.webp';
}

/** Reference-inspired event card; art is decorative, effects remain content-driven. */

/** Pick the leading emoji of an event title («☀️ Утро…» → ☀️ + «Утро…»). */
function splitLeadEmoji(title: string): { emoji: string | null; rest: string } {
  const m = title.match(/^(\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*)\s*(.*)$/su);
  if (m && m[1] && m[2]) return { emoji: m[1], rest: m[2] };
  return { emoji: null, rest: title };
}

/** The tone (color + emblem + kicker) of an event card by its tags. */
const EVENT_TONES: Array<{
  test: (tags: string[]) => boolean;
  tone: 'tone-gold' | 'tone-sky' | 'tone-moss' | 'tone-clay' | 'tone-ochre';
  icon: string;
  label: string;
}> = [
  { test: (t) => t.includes('crisis') || t.includes('toxic'), tone: 'tone-clay', icon: 'warn', label: 'Кризис' },
  { test: (t) => t.includes('reward'), tone: 'tone-gold', icon: 'trophy', label: 'Награда' },
  {
    test: (t) =>
      ['work', 'career', 'tech', 'overtime', 'startup', 'mentoring', 'freelance', 'code'].some((x) => t.includes(x)),
    tone: 'tone-gold',
    icon: 'briefcase',
    label: 'Работа',
  },
  {
    test: (t) =>
      ['study', 'ai_ml', 'frontend', 'backend', 'mobile', 'qa', 'devops', 'gamedev', 'blockchain', 'cybersec'].some(
        (x) => t.includes(x)
      ),
    tone: 'tone-sky',
    icon: 'book',
    label: 'Учёба',
  },
  {
    test: (t) => ['money', 'crypto', 'mining', 'bar', 'sidejob'].some((x) => t.includes(x)),
    tone: 'tone-moss',
    icon: 'coin',
    label: 'Деньги',
  },
  {
    test: (t) => ['social', 'friend', 'family', 'pets'].some((x) => t.includes(x)),
    tone: 'tone-sky',
    icon: 'people',
    label: 'Люди',
  },
  { test: (t) => ['health', 'mental'].some((x) => t.includes(x)), tone: 'tone-moss', icon: 'heart', label: 'Здоровье' },
  { test: (t) => t.includes('chain'), tone: 'tone-sky', icon: 'chat', label: 'История' },
  { test: () => true, tone: 'tone-ochre', icon: 'dice', label: 'Событие' },
];

/** Resource chips for a choice: +2 ⚡, −500 ₽, ★+1… driven by effects. */
const CHIP_SPECS: Array<{ key: string; icon: string }> = [
  { key: 'money', icon: '₽' },
  { key: 'energy', icon: '⚡' },
  { key: 'motivation', icon: '🔥' },
  { key: 'health', icon: '❤️' },
  { key: 'reputation', icon: '★' },
  { key: 'karma', icon: '☯' },
];

interface EventChip {
  icon: string;
  text: string;
  good: boolean;
}

function effectChips(effects?: Record<string, any>): EventChip[] {
  if (!effects) return [];
  const chips: EventChip[] = [];
  for (const spec of CHIP_SPECS) {
    const v = effects[spec.key];
    if (typeof v !== 'number' || v === 0) continue;
    const good = v > 0;
    const sign = v > 0 ? '+' : '';
    chips.push({
      icon: spec.icon,
      text: spec.key === 'money' ? `${sign}${v.toLocaleString('ru-RU')} ₽` : `${sign}${v}`,
      good,
    });
  }
  // skill xp gains (may be several skills in one choice)
  const skill = effects['skill'];
  if (skill && typeof skill === 'object') {
    const total = Object.values(skill).reduce((s: number, v: any) => s + (typeof v === 'number' ? v : 0), 0);
    if (total !== 0) chips.push({ icon: '📚', text: `${total > 0 ? '+' : ''}${total} XP`, good: total > 0 });
  }
  // relationships to colleagues/relatives
  const relation = effects['relation'];
  if (relation && typeof relation === 'object') {
    const total = Object.values(relation).reduce((s: number, v: any) => s + (typeof v === 'number' ? v : 0), 0);
    if (total !== 0) chips.push({ icon: '👥', text: `${total > 0 ? '+' : ''}${total}`, good: total > 0 });
  }
  for (const key of ['burnoutDays', 'jobWarnings']) {
    const v = effects[key];
    if (typeof v === 'number' && v > 0) chips.push({ icon: '⚠️', text: `+${v}`, good: false });
  }
  return chips;
}

export const EventCard: React.FC<{
  title: string;
  description: string;
  tags?: string[];
  choices: Array<{ text: string; effects?: Record<string, any> }>;
  onChoose: (index: number) => void;
}> = ({ title, description, tags = [], choices, onChoose }) => {
  const tone = EVENT_TONES.find((t) => t.test(tags)) ?? EVENT_TONES[EVENT_TONES.length - 1];
  const lead = splitLeadEmoji(title);
  return (
    <section className={`ev-card ${tone.tone} animate-pop-in`} aria-label={title}>
      <div className="ev-story-label">Случайное событие · {tone.label}</div>
      <img className="ev-art" src={eventArtwork(tags)} alt="" width={280} height={160} />
      <div className="ev-head">
        <span className="ev-icon">
          {lead.emoji ? <span className="ev-emoji">{lead.emoji}</span> : <PixelIcon name={tone.icon} size={22} />}
        </span>
        <span className="min-w-0 flex-1 flex flex-col justify-center">
          <span className="ev-kicker">{tone.label}</span>
          <h2 className="ev-title">{lead.rest}</h2>
        </span>
      </div>
      <div className="ev-band" />
      <div className="ev-body">
        <p className="ev-desc">{description}</p>
      </div>
      <div className="ev-choices">
        {choices.map((choice, i) => {
          const chips = effectChips(choice.effects);
          return (
            <button key={i} onClick={() => onChoose(i)} className={`ev-choice ${i === 0 ? 'ev-choice-primary' : ''}`}>
              <span className="ev-choice-text">{choice.text}</span>
              {chips.length > 0 && (
                <span className="ev-chips">
                  {chips.map((c, ci) => (
                    <span key={ci} className={`ev-chip ${c.good ? 'good' : 'bad'}`}>
                      <span className="ev-chip-ico">{c.icon}</span>
                      <span className="num">{c.text}</span>
                    </span>
                  ))}
                </span>
              )}
              <PixelIcon name="arrow" size={10} className="ev-choice-arrow shrink-0" />
            </button>
          );
        })}
      </div>
    </section>
  );
};
