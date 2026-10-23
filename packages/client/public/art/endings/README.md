# Ending illustrations

Six pixel-art scenes for the endings screen (`packages/client/src/screens/EndingView.tsx`),
one per ending in `balance.endings`: `cto` / `exit` / `free_artist` / `teacher` /
`burnout` / `left_it`. Generated 2026-10-22 one art pass, in the game palette
(`#0D1117` / `#1B212C` / `#4ADE80` / `#F4D35E`), with the same protagonist as
`../story-v1/` (brown hair, square glasses, navy hoodie), so the six scenes read
as one life. 512×307, WebP q82, ~22–53 KB each.

These are NOT crops of any reference artwork. AI generation is not a legal
guarantee of exclusivity — review provenance before public release (same note
as `../npcs/README.md`).

| id          | scene                                                                  | file             |
| ----------- | ---------------------------------------------------------------------- | ---------------- |
| cto         | night corner office, city skyline, crown-shaped glow in the glass      | `cto.webp`       |
| exit        | rocket over the dawn city, small team on the roof, briefcase at feet   | `exit.webp`      |
| free_artist | sunny balcony: plants, sleeping cat, laptop, no office anywhere        | `free_artist.webp` |
| teacher     | evening meetup: mentor at a whiteboard, four juniors with laptops      | `teacher.webp`   |
| burnout     | 3 a.m. desk: red falling graphs, warning glyphs, empty cans, ember glow | `burnout.webp`  |
| left_it     | kitchen: green apron over the hoodie, laptop packed in a cardboard box | `left_it.webp`   |

## Iterations (source PNGs live outside git)

Source PNGs are kept in `artifacts/endings-src/` (gitignored, same rule as the
avatar masters — `docs/QUESTIONS-2026-09-23.md` §M). Kept iterations:

- `burnout` v1 carried baked-in monitor text ("CAUTION" plus glyph noise);
  v2 redraws the screens with abstract falling graphs and bare warning
  triangles only.
- `left_it` v1 lost the shared protagonist (a different person in the kitchen);
  v2 restored him but put a vendor logo on the laptop lid; v3 keeps the lid
  plain matte grey.

## Wiring

`packages/client/src/lib/endingArt.ts` — `endingArtwork(id)` returns
`/art/endings/<id>.webp` and aliases the saved `careerEnding === 'corporate_god'`
to the `cto` scene. `EndingView.tsx` renders the scene as a full-bleed card
banner (`.ending-art` in `index.css`) and hides the `<img>` on error, so a
missing file degrades to the text card instead of a broken image. Covered by
`packages/client/src/__tests__/endingArt.test.ts` (mapping + alias + the exact
file set on disk).
