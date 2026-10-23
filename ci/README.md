# CI

[`github-actions-ci.yml`](github-actions-ci.yml) — готовый workflow для GitHub Actions.

Чтобы включить его, скопируйте файл на положенное место и запушьте с правами `workflows`:

```bash
mkdir -p .github/workflows
cp ci/github-actions-ci.yml .github/workflows/ci.yml
git add .github/workflows/ci.yml && git commit -m "CI: enable GitHub Actions"
```

> Файл лежит здесь, а не в `.github/workflows/`, потому что GitHub-приложение,
> которым коммитил агент, не имеет права `workflows` и push с изменением
> workflow-файла отклоняется на стороне GitHub.
>
> Проверено 23.09.2026 на живом push: GitHub отвечает
> `refusing to allow a GitHub App to create or update workflow
'.github/workflows/ci.yml' without 'workflows' permission`, и push всей ветки
> отбивается целиком. Поэтому включение CI — единственный шаг, который нужно
> сделать **вашей** учёткой; дальше `verify` и `content-guard` поедут сами.

## Что он проверяет

Джоба `verify` (на каждый push и PR):

1. `npm run lint:types` — tsc по всем пакетам
2. `npm run lint:code` — eslint
3. `npm run format:check` — prettier (`continue-on-error`, пока база не переформатирована)
4. `npm run validate:content` — схемы контента + cross-reference
5. `npm run build -w packages/shared && npm run build -w packages/content` — **сборка
   движка и контента до тестов**. Шаг добавлен 22.10.2026: серверные тесты импортируют
   `@itsim/content`, а у него `main`/`exports` смотрят в `dist/`, и без сборки падает
   весь набор с «Failed to resolve entry for package "@itsim/content"». Раньше это
   случайно закрывал шаг 1 (`tsc -p packages/content` эмитит `dist`), то есть тесты
   зависели от побочного эффекта проверки типов. Корневой `npm test` теперь собирает
   оба пакета сам, поэтому локально и в CI порядок совпадает
6. `npm run test -w packages/shared|server|bot|client` — 424 юнит-теста
   (`shared` 221 · `server` 72 · `bot` 22 · `client` 106)
7. `npm run test -w packages/sim` — симулятор баланса: коридоры вех, комплаенс поздней
   игры и эндгейм-зонд (40 × 730 дней, срок удержания кресла CTO)
8. `npm run pixelgen:audit` — пиксельный контент
9. `npm run build` — полная сборка

> 22.10.2026, измерено: на `main` без этого CI было **32 ошибки eslint** (15 в
> `routes/game/*` от разбивки PR #9 + 17 из PR #10) и падающий `npm test` на свежем
> клоне. Ни один PR #1–#11 проверок не имел — workflow так и не включён.

Джоба `content-guard` (только на PR, который трогает `packages/content/**`):
валидация контента в `--strict` (предупреждения фатальны) + обязательный прогон симулятора.

Локально тот же набор — `npm run lint && npm test && npm run build`.
