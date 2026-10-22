import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Сюжет дня (`.story-card`) перекрывает игровой экран: `GameScreen.renderView()`
 * возвращает карточку **вместо** текущей вкладки, поэтому пока выбор не сделан,
 * под ногами теста просто нет ни кнопки «Откликнуться», ни свотча цвета — и
 * падает он не «на асерте», а на 90-секундном actionability-таймауте. Ровно так
 * краснели `portrait.spec` и `projects.spec`, и ровно так `overflow.spec`
 * оставлял соседнему спекy невзятый сюжет.
 *
 * Общая реализация — не лень, а лечение расхождения: четыре копии этой функции
 * в сьютах отличались только тем, сколько они ждут карточку. Первая звала
 * `isVisible()` без ожидания и пропускала сюжет, который прилетает на сотню
 * позже клика; вторая ждала фиксированные 1.2–4 с — и под нагрузкой (полный
 * прогон 4.2 м против 2.3 м) карточка успевала приехать позже окна.
 *
 * Почему здесь нет «умного» ожидания по серверу (`GET /api/game/state` →
 * `activeEvent`): этот GET не является чистым чтением. Он поднимает due-запись
 * из `pendingEvents` в `state.activeEventId`
 * (packages/server/src/routes/game/state.ts:102-111), после чего ответ о
 * закрытии дня приходит уже с `activeEvent: null` — клиент карточку не рисует,
 * а событие есть. Проверка «должен ли быть сюжет» сама создавала тот самый
 * флап, поэтому оракул — DOM, а гонку «карточка приехала позже» закрывает `act`.
 */

/** Сколько ждать «Продолжить» после выбора в строгом режиме. */
const SETTLE = 15_000;
/** Сюжетов за один хвост бывает два: день + прилетевшее следом цепное событие. */
const MAX_PASSES = 3;

const visibleSoon = (locator: Locator, timeout: number) =>
  locator
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);

/**
 * @param strict   требует, чтобы взятый сюжет дошёл до конца: выбор нажат,
 *                 «Продолжить» закрыл чек, карточки нет. Для «подмести за
 *                 собой» (cleanup между спеками) ставят false: там отсутствие
 *                 реакции — не дефект продукта.
 */
export async function resolveStory(page: Page, opts: { strict?: boolean } = {}): Promise<void> {
  const { strict = true } = opts;
  const card = page.locator('.story-card');
  const cont = page.getByRole('button', { name: 'Продолжить' });

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    if ((await card.count()) === 0) return;

    const choice = card.locator('.story-choice:not(:disabled)').first();
    if (await visibleSoon(choice, strict ? SETTLE : 1_000)) {
      await choice.click();
    } else if (strict) {
      throw new Error('.story-card открыт, но ни один выбор недоступен — играть нечем');
    }

    // Выбор сворачивается в чек решения, который ждёт отдельного нажатия.
    if (await visibleSoon(cont, strict ? SETTLE : 1_000)) {
      await cont.click();
      if (strict) await expect(card).toHaveCount(0);
    } else if (strict) {
      throw new Error('«Продолжить» не появился после выбора');
    }

    if ((await card.count()) === 0) return;
  }
}

/**
 * Шаг, который может перехватить сюжет. Клик по своей кнопке и карточка,
 * приехавшая в том же ответе, — это два рендера, и между ними проходит от нуля
 * до нескольких сотен миллисекунд: ждать «полсекунды на всякий случай» значит
 * флапать под нагрузкой. Поэтому: пробуем шаг, а если он упал и на экране
 * выросла `.story-card` — закрываем сюжет и повторяем.
 *
 * Работает это только потому, что действия ограничены: в
 * `playwright.config.ts` стоит `use.actionTimeout = 15_000`, и без него
 * перехваченный клик висел бы до таймаута теста, никогда не доходя до повтора
 * (значение по умолчанию — 0, «ждать вечно»). Повтор безопасен для
 * идемпотентных шагов; шаг сам решает, что делать при «уже сделано» (см.
 * `winContract`, где отклик — один в день).
 */
export async function act(page: Page, step: () => Promise<void>, retries = 2): Promise<void> {
  const card = page.locator('.story-card');
  for (let i = 0; ; i++) {
    try {
      return await step();
    } catch (error) {
      if (i >= retries || (await card.count()) === 0) throw error;
      await resolveStory(page);
    }
  }
}
