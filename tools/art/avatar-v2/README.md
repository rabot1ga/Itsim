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

## Готово (в `layers/`)

body_base, eye_normal, eye_tired, hair_short, beard_goatee, top_tshirt,
bottom_jeans, acc_cap.

## Очередь генерации (осталось 30)

| Слот | id | Промпт-ядро (плюс общий boilerplate) |
|---|---|---|
| eyes | eye_closed, eye_vr, eye_red, eye_legendary | arcs-закрытые; glazed cyan VR; bloodshot; glowing amber legendary |
| hair | buzzcut, messy, long, manbun, curly, undercut, spiky, ponytail | ёжик; хаотичный bedhead; прямые до плеч; пучок с выбритыми висками; плотные кудри; гладкий верх+fade; ирокез-полоса; высокий хвост |
| beard | stubble, full, mustache | точечная щетина; густая «борода джуна» по челюсти; классические усы |
| top | hoodie_gray, hoodie_localhost, hoodie_corp, hoodie_cat, shirt, jacket | серое худи с карманом; чаркоул-худи «localhost»; янтарь-мерч с треугольным лого; тёмное худи с кошачьими ушками на капюшоне; голубая рубашка с воротником; коричневая айтишная куртка поверх футболки |
| bottom | sweatpants, chinos, shorts, suit | серо-синие джоггеры; бежевые чиносы с подворотом; светло-серые шорты; тёмные брюки костюма |
| acc | headphones, glasses, vr_headset, medal, beanie | тёмные наушники; квадратные чёрные очки; циановый VR-шлем; золотая медаль «1000»; синяя вязаная шапка-бини |

Boilerplate: «JUST a … layer for a pixel-art avatar builder, same retro
adventure game style and shading as the mannequin reference, floating piece
sized exactly for the mannequin's <часть>, NO face/body, clean hard pixel
edges, flat pure magenta background #FF00FF, centered.»

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
