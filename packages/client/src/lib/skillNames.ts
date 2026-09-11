/**
 * Human skill names from `/api/content/skills`, fetched once per session.
 *
 * Content owns the names; the client kept re-having to guess them (raw ids
 * leaked into the UI after the design-system rebuild). A module-level cache
 * is enough — skills never change during a session.
 */

let cache: Record<string, string> | null = null;
let inflight: Promise<Record<string, string>> | null = null;

export async function fetchSkillNames(): Promise<Record<string, string>> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch('/api/content/skills')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('skills'))))
      .then((data) => {
        const map: Record<string, string> = {};
        for (const skill of Array.isArray(data?.skills) ? data.skills : []) {
          if (skill?.id && skill?.name) map[skill.id] = skill.name;
        }
        cache = map;
        return map;
      })
      .catch(() => ({}));
  }
  return inflight;
}

/** Synchronous read after fetchSkillNames() has warmed the cache; falls back to the id. */
export function skillName(id: string): string {
  return cache?.[id] ?? id;
}
