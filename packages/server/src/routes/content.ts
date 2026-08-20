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
      events: ['events_common.json', 'events_work.json'],
      items: 'items.json',
      npcs: 'npcs.json',
      achievements: 'achievements.json',
      actions: 'actions.json',
      balance: 'balance.json',
    };
  });
}