# Room scenes

Four pixel-art scenes for the «Дом» screen and the room card on «Главная»
(`packages/client/src/screens/RoomView.tsx`, `components/HomeRoomCard.tsx`),
one per progress tier: `start` / `cozy` / `work` / `dream`. Generated
2026-10-22 as one art pass in the game palette (`#0D1117` / `#1B212C` /
`#4ADE80` / `#F4D35E`), 512×384 (4:3, no crop in `.story-card-art`), WebP q82,
~23–56 KB each.

The room is a series: same bones in every tier (bed left, desk centre, window
with the city right), same protagonist as `../story-v1/` and `../endings/`
(brown hair, square glasses, navy hoodie), comfort grows tier by tier, the
ginger cat moves in from `cozy`. Tier switches by grade: intern/junior →
start, middle → cozy, senior → work, teamlead+ → dream (`lib/roomArt.ts`).
The neon signs in the `dream` window carry baked-in lettering on purpose,
same convention as `../story-v1/` city scenes.

These are NOT crops of any reference artwork. AI generation is not a legal
guarantee of exclusivity — review provenance before public release (same note
as `../npcs/README.md`).

| tier  | scene                                                              | file        |
| ----- | ------------------------------------------------------------------ | ----------- |
| start | sparse rented room: boxes, bare bed, old CRT, cold light           | `start.webp` |
| cozy  | lived-in: plants, string lights, rug, cat on the bed, warm lamp    | `cozy.webp`  |
| work  | home office: dual monitors, mic arm, whiteboard, cat on the shelf  | `work.webp`  |
| dream | top-floor studio: panoramic sunset window, guitar, plants everywhere | `dream.webp` |

Source PNGs live outside git in `artifacts/room-concepts/` (gitignored, same
rule as the avatar masters and ending sources), together with the two
direction concepts (`concept-a.png` first-person, `concept-b.png` with the
protagonist — the chosen one).

## Wiring

`packages/client/src/lib/roomArt.ts` — `roomTierOf(grade)`, `roomArtwork(tier)`,
`ROOM_TIER_META` (titles/taglines/descriptions). `RoomView` renders the scene
as the banner of an event-style card (`.story-card` + `.story-card-art`) with
zone rows reusing the event-choice chrome; `HomeRoomCard` shows a small
`.room-thumb` of the current tier on «Главная». Both hide the `<img>` on
error, so a missing file degrades to the text card. Covered by
`packages/client/src/__tests__/roomArt.test.ts` (tier mapping, paths, file set,
meta completeness).
