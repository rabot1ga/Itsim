import { FastifyInstance } from 'fastify';
import { getContent } from '../services/contentService.js';

export async function contentRoutes(app: FastifyInstance) {
  /**
   * GET /api/content/manifest
   * Content manifest for client caching
   */
  app.get('/manifest', async () => {
    return {
      version: '2.0.0',
      skills: 'skills.json',
      perks: 'perks.json',
      companies: 'companies.json',
      events: ['events_common.json', 'events_work.json', 'events_chains.json', 'events_mining.json', 'events_life.json', 'events_skills.json', 'events_action.json', 'events_daily.json', 'events_daily2.json', 'events_npcs.json', 'events_more_action.json'],
      items: 'items.json',
      npcs: 'npcs.json',
      achievements: 'achievements.json',
      actions: 'actions.json',
      balance: 'balance.json',
    };
  });

  /**
   * GET /api/content/companies — company list for the career screen
   */
  app.get('/companies', async () => {
    const { companies } = getContent();
    return {
      companies: companies.map((c: any) => ({
        id: c.id,
        name: c.name,
        archetype: c.archetype,
        size: c.size,
        stack: c.stack,
        salaryMult: c.salaryMult,
        interviewBar: c.interviewBar,
        toxicity: c.toxicity,
        growthPotential: c.growthPotential,
        perks: c.perks,
        flavor: c.flavor,
        requiresEnglish: c.requiresEnglish,
      })),
    };
  });

  /**
   * GET /api/content/items — shop items (excludes housing/courses)
   */
  app.get('/items', async () => {
    const { items } = getContent();
    return {
      items: items.filter((i: any) => !['housing', 'course'].includes(i.type)),
    };
  });

  /**
   * GET /api/content/genetics — trait options + palettes (DESIGN.md 3.1)
   */
  app.get('/genetics', async () => {
    return { genetics: getContent().genetics };
  });

  /**
   * GET /api/content/layers — avatar/room layer manifests (DESIGN.md 2)
   */
  app.get('/layers', async () => {
    const { avatarLayers, roomLayers } = getContent();
    return { avatar: avatarLayers, room: roomLayers };
  });

  /**
   * GET /api/content/cross-collections — third-party NFT synergies (DESIGN.md 3.3)
   */
  app.get('/cross-collections', async () => {
    return { crossCollections: getContent().crossCollections };
  });

  /**
   * GET /api/content/skills — the full talent tree (branches, parents, unlocks)
   */
  app.get('/skills', async () => {
    return { skills: getContent().skills };
  });

  /**
   * GET /api/content/side-jobs — non-IT gigs (courier, barista, etc.)
   */
  app.get('/side-jobs', async () => {
    return { sideJobs: getContent().balance.sideJobs ?? {} };
  });

  /**
   * GET /api/content/perks — perk definitions with requirements
   */
  app.get('/perks', async () => {
    return { perks: getContent().perks };
  });

  /**
   * GET /api/content/achievements — achievement definitions
   */
  app.get('/achievements', async () => {
    return { achievements: getContent().achievements };
  });
}
