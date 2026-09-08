export interface EventEffects {
  money?: number;
  energy?: number;
  motivation?: number;
  health?: number;
  reputation?: number;
  karma?: number;
  burnoutDays?: number;
  jobWarnings?: number;
  skill?: Record<string, number>;
  relation?: Record<string, number>;
}
export interface EventRequirements {
  energy?: number;
  money?: number;
  skill?: Record<string, number>;
  minRelation?: Record<string, number>;
  npcPresent?: string;
}
export interface EventPlayer {
  energy: number;
  money: number;
  skills?: Record<string, { level: number }>;
  relationships?: Record<string, number>;
}
export interface EffectRow {
  key: string;
  label: string;
  text: string;
  /** pixel icon name (legacy surfaces) */
  icon: string;
  /** chrome emoji — the design system's resource token */
  emoji: string;
  good: boolean;
}

const SKILLS: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  sql: 'SQL',
  react: 'React',
  nodejs: 'Node.js',
  go: 'Go',
  java: 'Java',
  git: 'Git',
  docker: 'Docker',
  english: 'Английский',
  communication: 'Коммуникация',
};
const PEOPLE: Record<string, string> = {
  teamlead: 'Алексей Петрович',
  junior_colleague: 'Маша',
  toxic_senior: 'Дмитрий Борисович',
  uni_friend: 'Саня',
  hr_anna: 'Анна из HR',
};
const RESOURCES: Array<[keyof EventEffects, string, string, string, string, boolean]> = [
  ['money', 'Деньги', 'coin', '💰', ' ₽', false],
  ['energy', 'Энергия', 'bolt', '⚡', '', false],
  ['motivation', 'Настроение', 'flame', '😊', '', false],
  ['health', 'Здоровье', 'heart', '❤️', '', false],
  ['reputation', 'Репутация', 'star', '⭐', '', false],
  ['karma', 'Карма', 'dice', '🍀', '', false],
  ['burnoutDays', 'Дни выгорания', 'warn', '🔥', ' дн.', true],
  ['jobWarnings', 'Замечания на работе', 'warn', '⚠️', '', true],
];

/** No totals: +XP for one skill must not cancel −XP for another. */
export function effectRows(effects: EventEffects = {}): EffectRow[] {
  const rows: EffectRow[] = [];
  const add = (
    key: string,
    label: string,
    icon: string,
    emoji: string,
    value: unknown,
    suffix = '',
    inverse = false
  ) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return;
    rows.push({
      key,
      label,
      icon,
      emoji,
      text: `${value > 0 ? '+' : ''}${value.toLocaleString('ru-RU')}${suffix}`,
      good: inverse ? value < 0 : value > 0,
    });
  };
  for (const [key, label, icon, emoji, suffix, inverse] of RESOURCES)
    add(key, label, icon, emoji, effects[key], suffix, inverse);
  for (const [id, xp] of Object.entries(effects.skill ?? {}))
    add(`skill:${id}`, `Опыт · ${SKILLS[id] ?? id}`, 'book', '✨', xp, ' XP');
  for (const [id, value] of Object.entries(effects.relation ?? {}))
    add(`relation:${id}`, `Отношения · ${PEOPLE[id] ?? id}`, 'people', '👥', value);
  return rows;
}

export function choiceTone(rows: EffectRow[]): 'green' | 'amber' | 'red' | 'purple' {
  const good = rows.some((row) => row.good),
    bad = rows.some((row) => !row.good);
  return good && bad ? 'amber' : bad ? 'red' : good ? 'green' : 'purple';
}

export function unmetRequirements(req: EventRequirements | undefined, player?: EventPlayer): string[] {
  if (!req || !player) return [];
  const missing: string[] = [];
  if (req.energy !== undefined && player.energy < req.energy) missing.push(`Нужно энергии: ${req.energy}`);
  if (req.money !== undefined && player.money < req.money)
    missing.push(`Нужно денег: ${req.money.toLocaleString('ru-RU')} ₽`);
  for (const [id, level] of Object.entries(req.skill ?? {}))
    if ((player.skills?.[id]?.level ?? 0) < level) missing.push(`${SKILLS[id] ?? id}: уровень ${level}`);
  for (const [id, value] of Object.entries(req.minRelation ?? {}))
    if ((player.relationships?.[id] ?? 0) < value) missing.push(`Отношения с ${PEOPLE[id] ?? id}: ${value}`);
  // npcPresent has no supplied presence context. Do not invent a client-side lock.
  return missing;
}

/** Specific story IDs first, then explicit title topics, then broad tags. */
export function eventArtwork(tags: string[], title = '', eventId = ''): string {
  const exact: Record<string, string> = {
    tutorial_cat: 'pet',
    stray_cat_found: 'pet',
    cat_arrives: 'pet',
    fam_care_package: 'parcel',
    courier_rain: 'bicycle',
    random_bug: 'bug',
    prod_bug_escape: 'bug',
    server_hacked: 'server',
    tech_api_deprecated: 'server',
    guard_reading: 'server',
  };
  let scene: string | undefined = exact[eventId];
  if (!scene) {
    const topic = title.toLocaleLowerCase();
    const rules: Array<[RegExp, string]> = [
      [
        /(?:^|[^\p{L}])(?:кот|кота|коту|котом|коты|котик|котёнок|котенок|кошк\p{L}*|питом\p{L}*|cat)(?=$|[^\p{L}])/u,
        'pet',
      ],
      [/велосип|велик|такси|курьер|bike/, 'bicycle'],
      [/посыл|подарок|parcel/, 'parcel'],
      [/сервер|продакш|взлом|server/, 'server'],
      [/\bbug\b|баг|ошибка в код/, 'bug'],
      [/ваканс|оффер|предложение.*работ/, 'offer'],
      [/контракт|подписал|подряд/, 'contract'],
      [/фриланс|заказчик|биржа заказ|клиент/, 'freelance'],
      [/похвал|соцсет|лайк|пост.*вирус/, 'social'],
      [/скидка на тех|магазин|ноутбук|новый пк/, 'shop'],
      [/дожд|болез|простуд|выходно|отпуск|выгор/, 'rest'],
    ];
    scene = rules.find(([pattern]) => pattern.test(topic))?.[1];
  }
  if (!scene) {
    if (tags.includes('pets')) scene = 'pet';
    else if (tags.includes('freelance')) scene = 'freelance';
    else if (tags.some((tag) => ['health', 'mental', 'rest', 'weather'].includes(tag))) scene = 'rest';
    else if (tags.some((tag) => ['social', 'friend', 'family'].includes(tag))) scene = 'social';
    else if (tags.some((tag) => ['career', 'interview'].includes(tag))) scene = 'offer';
    else if (tags.some((tag) => ['code', 'qa'].includes(tag))) scene = 'bug';
    else if (tags.some((tag) => ['tech', 'cybersec', 'devops', 'mining'].includes(tag))) scene = 'server';
    else if (tags.some((tag) => ['shop', 'equipment'].includes(tag))) scene = 'shop';
    else scene = 'night';
  }
  return `/art/story-v1/${scene}.webp`;
}

/** Content emoji are decorative; pixel icons provide consistent resource symbols. */
export function storyLabel(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]/gu, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}
