# avatar-v2 — слоистый аватар из мастеров

Пайплайн, который вырезает из PSD/PNG-мастеров webp-слои аватара (канвас
500×760) для `packages/content/layers/avatar_manifest.json` и
`packages/client/public/layers/avatar-v2/`. Клиент ничего не подгоняет:
`buildLayerStack()` (`packages/client/src/components/room/layers.ts`) просто
складывает `/layers/<file>` по `zOrder`, поэтому посадка решается здесь, на
этапе сборки.

## Файлы

|                                  |                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `../avatar-key.mjs`              | движок: хромакей + режимы посадки (`pupil`, `anchor`, `top`, `bottom`, `item`, `itemColor`, `skinHair`) и таблица `OVERRIDES` |
| `build.config.json`              | список «мастер → слой» (38 записей). Единственное место, где надо править состав сборки                                       |
| `build.mjs`                      | прогон списка, `--only=<подстрока>`, `--publish`, `--config=`                                                                 |
| `check-placement.mjs`            | QA-страж: измеряет собранные слои и сверяет с лендмарками                                                                     |
| `preview.mjs`, `preview-all.mjs` | QA-рендеры в `artifacts/` (глазами)                                                                                           |
| `masters/`                       | PNG-исходники. **В git не попадают** (42 МБ на набор)                                                                         |
| `layers/`                        | выход сборки. **Тоже не в git** — в репозиторий едет только копия в `public/`                                                 |

## Команды

```bash
npm run avatar:build -w tools/art              # собрать всё в layers/
npm run avatar:build -w tools/art -- --only=hair
npm run avatar:check -w tools/art              # измерить посадку (0 = годно)
npm run avatar:preview -w tools/art            # artifacts/preview.png, preview-all.png
npm run avatar:publish -w tools/art            # + скопировать в public/layers/avatar-v2
```

Пули можно переопределить без правки конфигов: `AVATAR_MASTERS_DIR`,
`AVATAR_LAYERS_DIR`.

## Порядок работы над слоем

1. Мастер кладётся в `masters/<batch>/<file>.png`, в `build.config.json`
   добавляется запись `{ "out": "<slot_id>.webp", "master": "<batch>/<file>.png", "kind": "layer", "slot": "<slot>" }`.
2. `npm run avatar:build -w tools/art -- --only=<file>`.
3. `npm run avatar:check -w tools/art` — цифры, а не ощущения.
4. `npm run avatar:preview -w tools/art` — проверить глазами поверх тела.
5. Только когда check зелёный — `--publish` и переключение/правку манифеста.

## Состояние (23.09.2026): арты НЕ готовы к слиянию

Пайплайн перенесён из PR #10 без изменения алгоритма, но набор слоёв оттуда не
проходит `avatar:check`. Причина — мастера нарисованы на разных фигурах и в
разных зумах, а ручная подгонка в `OVERRIDES` до конца не сведена:

- топ 245×245 при разлёте рук тела 350 px → руки и плечи торчат из рукавов;
- `eye_normal` 102 px при лице ~90 px → глаза и очки вылезают за контур головы;
- `hair_short` 77×70 → хохолок вместо причёски (то же у `hair_buzzcut`,
  `hair_undercut`, `hair_manbun`);
- `beard_full` занимает y 136–230 при подбородке 168 → борода на воротнике;
- в `public/` и `tools/` лежали побайтово идентичные копии одних и тех же 38
  webp — теперь в git едет только копия в `public/`.

Годными по форме вышли топы и низы (12 слоёв), всё «головное» — переделывать.
Детали и план: `docs/ANALYSIS-2026-09-23.md` §2.2 и §6.

## Что надо решить до перекалибровки

**Тинтинг.** В main у слотов `body`/`hair`/`beard` стоит `tintSlot`, и
`layers.ts` красит грейскейл CSS-фильтром из генетики игрока. Webp-слой
предокрашен, поэтому PR #10 убрал `tintSlot` у волос и бороды — вместе с ним
перестаёт работать выбранный цвет волос/бороды, хотя настройка в UI остаётся.
Либо возвращаем маску/duotone в движке, либо вычищаем trait'ы цвета из
генетики и интерфейса. Третьего нет.
