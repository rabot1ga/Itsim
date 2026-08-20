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
      events: ['events_common.json', 'events_work.json', 'events_chains.json'],
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
}
