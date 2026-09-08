# Story art v1 — 2026-09-08

12 newly AI-generated assets: ten event scenes, a front-facing room and a default
portrait. User references 1.png / 2.png guided palette, composition and subject;
these files are NOT crops of those references. No game UI or rewards are baked in.

The scenes share a brown-haired, square-glasses, navy-hoodie developer. Categories:
night / pet / bicycle / offer / social / shop / server / parcel / rest / bug.
Room and portrait remain **static default illustrations**, not a dynamic render
of player furniture or genetics. The existing live room editor is retained.

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
