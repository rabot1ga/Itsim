# NPC portraits

Pixel-art head-and-shoulders portraits for the five recurring NPCs in
`packages/content/npcs.json`. Same art direction as `story-v1/portrait.webp`
(brown/grey palette, dark navy background, 16-bit retro pixel clusters).

Generated 2026-09-08 from text descriptions in `npcs.json`. Not crops of
any reference artwork. Review provenance before public release; AI
generation is not a legal guarantee of exclusivity.

| id            | name             | role         | file             |
| ------------- | ---------------- | ------------ | ---------------- |
| teamlead      | Алексей Петрович | teamlead     | teamlead.webp    |
| junior_colleague | Маша          | junior       | junior.webp      |
| toxic_senior  | Дмитрий Борисович| senior_toxic | toxic.webp       |
| uni_friend    | Саня             | friend       | friend.webp      |
| hr_anna       | Анна             | hr           | hr_anna.webp     |

128×128, WebP q82, ~3-4 KB each. Source `npcs.json` `avatar` field
stores the original `.png` filename; the client substitutes `.webp`.

Wired into the Friends view: `packages/client/src/screens/FriendsView.tsx`
renders each NPC's portrait with the generic icon as a fallback (and a
graceful `onError` hide if the file is missing).
