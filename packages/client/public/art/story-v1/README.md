# Story art v1 — 2026-09-08

12 newly AI-generated assets: ten event scenes, a front-facing room and a default
portrait. User references 1.png / 2.png guided palette, composition and subject;
these files are NOT crops of those references. No game UI or rewards are baked in.

The scenes share a brown-haired, square-glasses, navy-hoodie developer. Categories:
night / pet / bicycle / offer / social / shop / server / parcel / rest / bug.
Room and portrait remain **static default illustrations**, not a dynamic render
of player furniture or genetics. The existing live room editor is retained.

## Iteration 2 (later the same day)

All ten event scenes were aligned to the explicit subjects on the user's
`1.png` TODO board. The original batch was on-style but several scenes were
too generic and didn't match the board. Affected ids and the new subject
each one carries:

| id       | Subject on 1.png                                              |
| -------- | ------------------------------------------------------------- |
| offer    | Chat bubble: "Вакансия в другой компании. Зарплата: $3000+"   |
| social   | Social post: "@dev_guru — Отличная статья! 👍 128 ⚡ 32"     |
| shop     | New laptop with a red "SALE 30%" price tag                    |
| server   | Red monitor: "SERVER ERROR 500" + shocked developer           |
| bug      | Monitor: "Ошибка в коде" + sad-face emoji + cockroach         |
| parcel   | Glowing green mystery box with "?" + "ANONYMOUS" tag          |

The previous batch is kept in `_old/` for provenance. The remaining four
(night / pet / bicycle / rest) already matched the TODO board and were
left untouched.

Generated masters are outside Git at `/home/user/art-work` for this session.
The atlas included white gutters despite the no-gutter prompt; every scene was
reviewed and cropped inside its border. `manifest.json` records output dimensions,
byte sizes, SHA-256 and source/crop metadata. To rebuild the optimized files from
these exact masters: `node tools/art/build-story-assets.mjs /path/to/masters`.
AI generation itself is not deterministic. Source master hashes identify this batch.

Art brief: crisp retro adventure-game pixel clusters, ink/navy night backgrounds,
warm amber interior lamps, muted moss accents. Scene specifications are recorded
in docs/ART-BRIEF-2026-09-08.md. Review images/provenance before public release;
AI generation is not a legal guarantee of exclusivity.

## Iteration 3 — 2026-09-09: биржа заказов

Two new scenes were generated for the freelance-bid loop, in the same style and
with the same developer (brown messy hair, square glasses, navy hoodie):

| id          | Subject                                                                              | Used by                                             |
| ----------- | ------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `freelance` | Ночной стол, отклик уходит к заказчику зелёным конвертом, песочные часы ожидания       | карточка «Отклик отправлен», события с тегом `freelance` |
| `contract`  | Подписанный контракт с зелёной печатью, календарь с отмеченным дедлайном, тихий триумф | карточка активного проекта, события про контракт     |

384×230 WebP, quality 88, cropped `fit: cover` from 1376×768 masters (masters are
not committed — see `tools/art/add-story-scene.mjs`). No text, letters or digits
are baked into either image. Manifest total: 14 files, 249 778 bytes.

Also corrected in this pass: `parcel.webp` ships at 345×230, while the manifest
claimed 384×230 — `validate-story-assets.mjs` failed on it. The manifest now
records the real width; the image itself is untouched.
