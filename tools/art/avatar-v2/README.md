# Avatar layers v2 — story-v1 art style (2026-09-12)

Перегенерация слоёв аватара 500×760 в качестве story-v1 (заставка/сцены событий):
крисповые ретро-adventure пиксель-кластеры, тёплая теневая лепка, тот же язык
шейдинга, что и у `public/art/story-v1/*.webp`. Механика игры не меняется —
меняются только файлы слоёв (manfest остаётся канвасом 500×760, слоты те же,
skin/hair тинтятся CSS-фильтрами, см. `shared/lookResolve.ts`).

## Пайплайн

1. **Мастер-кукла** (`masters/mannequin-v1.png`): лысый манекен в штанах, руки
   в стороны, пустое лицо — на плоском magenta-фоне (#FF00FF). Точка отсчёта
   пропорций: голова ≈110 px после fit в канвас, line of eyes y≈101.
2. **Генерация слоёв**: каждый предмет рисуется отдельно на том же magenta-фоне,
   в промпте всегда есть манекен как референс размера/стиля («sized exactly for
   the mannequin's head/torso/…»). Лимит генератора — ~10 изображений в ход,
   поэту батчами.
3. **Сборка** (`tools/art/avatar-key.mjs`):
   - `key` — chroma-key magenta→alpha (tol 42), авто-кроп содержимого;
   - `body` — grayscale-конверсия (luminance → 0.36..0.80) и fit на канвас;
   - `layer <png> <slot> <out.webp>` — fit по якорной рамке слота (SLOTS), для
     hair/beard — grayscale (тинт hairColor). У hair есть `clear` — прямоугольник
     лица, из которого вырезается чёлка, чтобы глаза всегда были видны;
   - `demo` — собрать композит на тёмном фоне для глазного контроля.
4. Якоря слотов зафиксированы в `SLOTS` (avatar-key.mjs): head/eyes/beard/top/
   bottom/acc_* — измерены на собранном теле в /tmp/body_base.webp.

## Готово (в `layers/`) — 36/38

**body**: body_base
**eyes**: eye_normal, eye_tired, eye_vr, eye_red, eye_legendary, eye_closed
**hair**: hair_short, hair_messy, hair_manbun, hair_buzzcut, hair_curly, hair_long, hair_ponytail
**beard**: beard_goatee, beard_stubble, beard_full, beard_mustache
**top**: top_tshirt, top_hoodie_gray, top_hoodie_localhost, top_shirt, top_jacket, top_hoodie_corp, top_hoodie_cat
**bottom**: bottom_jeans, bottom_sweatpants, bottom_chinos, bottom_shorts, bottom_suit
**acc**: acc_cap, acc_headphones, acc_glasses, acc_beanie, acc_vr_headset, acc_medal

Демо-композиты лежат рядом: `demo-*.png`.

## Очередь генерации (осталось 2)

| Слот | id | примечание |
|---|---|---|
| hair | undercut, spiky | b7 «solid cap»-промпт дал заливку лица; следующий промпт: рамка вокруг лица как у hair_short (U-curve открывает лицо, волосы только вокруг и сверху) |

Boilerplate (критично! иначе генератор рисует полного манекена поверх предмета):
«Tiny isolated sprite of JUST a single <предмет> floating alone, retro adventure
game pixel art style (same style as the existing mannequin reference), warm
amber shading, clean hard pixel edges. NO face, NO head/skin, NO neck, NO
shoulders, NO body attached underneath — the object sits on an invisible body.
Flat pure magenta background #FF00FF, object centered, occupies ~15-25% of the
canvas.»

Промпты **без** `images`-reference к манекену — image-reference заставляет
модель копировать всю фигуру. Стиль задавать текстом, размер/пропорции —
через якорные рамки слотов в avatar-key.mjs.

Волосы: после сборки обязателен контроль-кадр — `clear`-зона гарантирует
только глаза, но слишком длинные боковые пряди рисует промпт (при неудаче —
перегенерация с «sides end at mid-ear»). Код цвета одежды НЕ указывать жёстко,
если не критично: дизайн доминирующего цвета собирается из арта.

## Интеграция (после добора очереди)

1. Обновить `packages/content/layers/avatar_manifest.json`: entry.file →
   новые webp (имена: `avatar-v2/<slot>/<entry>.webp`), старые SVG оставить в
   репозитории как provenance.
2. Переснять доминанты цветов TOP/BOTTOM из нового арта и обновить таблицы в
   `packages/shared/src/engine/lookResolve.ts` (изо-фигурка комнаты идёт за
   теми же hex).
3. Visual-pass: HUD-портрет (кроп 125..375×55..305), зеркало гардероба,
   комнатная изо-сцена на одном сейве; e2e пробегает без изменений, если
   имена слоёв/тинты сохранены.
4. Глаза у предмета в редакторе — eye_vr показывается под acc_vr_headset.

Мастера в `masters/` закоммичены сознательно (песочница Arena чистит /tmp);
после стабилизации очереди их можно вынести из git, как у story-v1.
