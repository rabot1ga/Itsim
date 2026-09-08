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

## Что он проверяет

Джоба `verify` (на каждый push и PR):

1. `npm run lint:types` — tsc по всем пакетам
2. `npm run lint:code` — eslint
3. `npm run format:check` — prettier (`continue-on-error`, пока база не переформатирована)
4. `npm run validate:content` — схемы контента + cross-reference
5. `npm run test -w packages/shared|server|bot` — 201 юнит-тест
6. `npm run test -w packages/sim` — симулятор баланса (коридоры вех + комплаенс)
7. `npm run pixelgen:audit` — пиксельный контент
8. `npm run build` — полная сборка

Джоба `content-guard` (только на PR, который трогает `packages/content/**`):
валидация контента в `--strict` (предупреждения фатальны) + обязательный прогон симулятора.

Локально тот же набор — `npm run lint && npm test && npm run build`.
