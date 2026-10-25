import { t, LOCALES, LOCALE_NAMES, currentLocale, type Locale, fmtNumber } from '../lib/i18n';
import React from 'react';
import { useGameStore } from '../store/gameStore';
import { haptic } from '../lib/telegram';
import { ScreenTitle, SectionTitle, StatBar } from '../components/ui';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { xpToNext } from '@itsim/shared';
import { gradeLabel, skillName } from '../lib/playerLabels';
import { profileArtwork, profileMoodOf, PROFILE_MOOD_META } from '../lib/profileArt';
/**
 * Профиль = «карточка жизни» (A2, 25.10.2026): баннер-портрет протагониста,
 * показатели, значки и язык. Финалы/цели/вехи переехали в таб «Прогресс» —
 * здесь они дублировались списками и ссылками.
 */
/** Значки Stars-покупок («кофе разработчику» и др.) — обещаны в профиле. */
const BADGE_LABEL: Record<string, string> = {
  supporter: 'Спонсор',
  fashionista: 'Модник',
  neon: 'Кибер',
  patron: 'Меценат',
  winter: 'Зимний',
  summer: 'Летний',
};
export const ProfileView: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const setView = useGameStore((s) => s.setView);
  const setLanguage = useGameStore((s) => s.setLanguage);
  if (!player) return null;
  const mood = profileMoodOf(player);
  const moodMeta = PROFILE_MOOD_META[mood];
  const mainId = player.mainSkillId ?? 'javascript';
  const skill = player.skills?.[mainId] ?? { level: 0, xp: 0 };
  const skills = Object.values(player.skills ?? {}) as Array<{
    level: number;
  }>;
  const need = xpToNext(skill.level);
  const eventsSeen = Object.values(player.eventHistory ?? {}).reduce((sum: number, h: any) => sum + (h?.count ?? 0), 0);
  const facts: Array<[string, string]> = [
    // e2e и design.md §10: профиль обязан называть основной навык — до этого
    // в карточке были уровень и XP, но не то, какой именно навык основной.
    [t('Основной навык'), skillName(mainId)],
    [t('Уровень'), String(skill.level)],
    [t('Опыт'), skill.level >= 100 ? t('Максимум') : `${skill.xp} / ${need} XP`],
    [t('Репутация'), `${fmtNumber(Math.round(player.reputation ?? 0))}`],
    [t('Достижения'), String((player.achievements ?? []).length)],
    [t('Навыков изучено'), String(skills.filter((s) => s.level > 0).length)],
    [t('Предметы'), String((player.items ?? []).length)],
  ];
  const stats: Array<[string, string]> = [
    [t('Дней в игре'), String(player.currentDay ?? 1)],
    [t('Заработано всего'), `${fmtNumber(Math.round(player.totalEarned ?? player.money ?? 0))} ₽`],
    [t('Событий пройдено'), String(eventsSeen)],
    [t('Прожито жизней'), String(player.meta?.lives ?? 0)],
  ];
  const chips: Array<[string, string]> = [
    ['bolt', `${player.energy ?? 0}/${player.maxEnergy ?? 0}`],
    ['flame', String(Math.round(player.motivation ?? 0))],
    ['trophy', String(Math.round(player.reputation ?? 0))],
    ['coin', `${fmtNumber(Math.round(player.money ?? 0))} ₽`],
  ];
  return (
    <div className="space-y-4 animate-fade-in">
      <ScreenTitle icon="person">{t('Профиль')}</ScreenTitle>

      <section className="card story-card" aria-label={t('Профиль персонажа')}>
        <p className="story-card-kicker">
          {gradeLabel(player.grade)} · {player.job?.position ?? t('карьера ещё впереди')}
        </p>
        <div className="story-card-art profile-banner">
          <img src={profileArtwork(mood)} alt={t('Настроение: {p0}', { p0: moodMeta.label })} />
        </div>
        <div className="story-card-copy">
          <h3>{moodMeta.label}</h3>
          <p>{moodMeta.line}</p>
        </div>
        <div className="profile-chips" aria-label={t('Ключевые показатели')}>
          {chips.map(([icon, value]) => (
            <span key={icon} className="res-chip num">
              <PixelIcon name={icon} size={12} /> {value}
            </span>
          ))}
        </div>
        {(player.badges ?? []).length > 0 && (
          <div className="profile-chips" aria-label={t('Значки')}>
            {(player.badges ?? []).map((b: string) => (
              <span key={b} className="res-chip">
                <PixelIcon name="star" size={12} /> {t(BADGE_LABEL[b] ?? b)}
              </span>
            ))}
          </div>
        )}
        <p className="story-footnote">
          {t('День')} {player.currentDay ?? 1}
          {t('. Настроение зависит от энергии, мотивации и выгорания.')}
        </p>
      </section>

      <section className="card">
        <dl className="profile-stats">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className="num">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3">
          <StatBar resource="xp" label={t('Опыт навыка')} value={skill.xp} max={need} />
        </div>
      </section>

      <section className="card">
        <SectionTitle>{t('Статистика')}</SectionTitle>
        <dl className="profile-stats mt-2">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className="num">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Поле языка профиля (P2.5, этап 3): выбор живёт в сейве — новый девайс
          подхватывает его, запросы по-прежнему несут X-Locale. */}
      <section className="card">
        <SectionTitle>{t('Язык')}</SectionTitle>
        <div className="settings-row">
          <PixelIcon name="globe" size={18} />
          <span className="settings-row-label">{t('Язык интерфейса')}</span>
          <div className="settings-row-value" role="group" aria-label={t('Язык интерфейса')}>
            {LOCALES.map((l: Locale) => (
              <button
                key={l}
                type="button"
                className={currentLocale() === l ? 'btn btn-primary' : 'btn btn-ghost'}
                aria-pressed={currentLocale() === l}
                onClick={() => {
                  haptic('selection');
                  void setLanguage(l);
                }}
              >
                {LOCALE_NAMES[l]}
              </button>
            ))}
          </div>
        </div>
        <p className="story-footnote">{t('Выбор сохраняется в профиле и подхватывается на других устройствах.')}</p>
      </section>

      <div className="profile-links">
        <button className="btn btn-secondary justify-start" onClick={() => setView('settings')}>
          <PixelIcon name="gear" size={16} />
          {t('Настройки')}
        </button>
      </div>
    </div>
  );
};
