# Office scenes

Four pixel-art scenes for the «Мой офис» screen
(`packages/client/src/screens/OfficeView.tsx`), one per progress tier:
`openspace` / `cabinet` / `floor` / `tower`. Generated 2026-10-22 as one art
pass in the game palette (`#0D1117` / `#1B212C` / `#4ADE80` / `#F4D35E`),
512×384 (4:3, no crop in `.story-card-art`), WebP q82, ~22–30 KB each.

Same series as `../room/`: same bones in every tier (protagonist's desk
centre-right, city window right), same protagonist as `../story-v1/` and
`../endings/` (brown hair, square glasses, navy hoodie), status grows tier by
tier: crowded open-space → glass team corner → own floor with a meeting room →
executive top floor. Tier switches by the **same grade ladder as the room**
(`lib/officeArt.ts` maps `roomTierOf`): intern/junior → openspace, middle →
cabinet, senior → floor, teamlead+ → tower.

These are NOT crops of any reference artwork. AI generation is not a legal
guarantee of exclusivity — review provenance before public release (same note
as `../npcs/README.md`).

| tier      | scene                                                              | file             |
| --------- | ------------------------------------------------------------------ | ---------------- |
| openspace | crowded open-space: rows of desks, fluorescent strips, dividers    | `openspace.webp` |
| cabinet   | glass team corner: three desks, plants, whiteboard, warm lamp      | `cabinet.webp`   |
| floor     | own floor: lead desk with three monitors, glass meeting room       | `floor.webp`     |
| tower     | executive top floor: corner desk, trophy shelf, panoramic glass   | `tower.webp`     |

Source PNGs live outside git in `artifacts/office-concepts/` (gitignored, same
rule as `artifacts/room-concepts/` and the avatar masters).
