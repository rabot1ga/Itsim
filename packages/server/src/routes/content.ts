import { FastifyInstance } from 'fastify';
import { getContent } from '../services/contentService.js';

export async function contentRoutes(app: FastifyInstance) {
  /**
   * GET /api/content/balance — runtime tuning (XP curves, costs, endings, …)
   *
   * Public read; the client uses it to show live ending thresholds in the
   * «Финалы» screen so the player sees what is still required.
   */
  app.get('/balance', async () => {
    return { balance: getContent().balance };
  });

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
      events: [
        'events_common.json',
        'events_work.json',
        'events_chains.json',
        'events_mining.json',
        'events_life.json',
        'events_skills.json',
        'events_action.json',
        'events_daily.json',
        'events_daily2.json',
        'events_npcs.json',
        'events_more_action.json',
        'events_tech.json',
        'events_money2.json',
        'events_family2.json',
        'events_social2.json',
        'events_health2.json',
        'events_work2.json',
        'events_study2.json',
        'events_sidejob2.json',
      ],
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
   * GET /api/content/layers — avatar/room/office layer manifests (DESIGN.md 2)
   */
  app.get('/layers', async () => {
    const { avatarLayers, roomLayers, officeLayers } = getContent();
    return { avatar: avatarLayers, room: roomLayers, office: officeLayers };
  });

  /**
   * GET /api/content/npcs — colleagues for the office screen (docs/design.md §11)
   * Returns the avatar filename too so the client can render individual portraits
   * instead of a shared generic icon.
   */
  app.get('/npcs', async () => {
    const { npcs } = getContent();
    return {
      npcs: npcs.map((n: any) => ({
        id: n.id,
        name: n.name,
        role: n.role,
        description: n.description,
        avatar: typeof n.avatar === 'string' ? n.avatar : null,
        initialRelation: typeof n.initialRelation === 'number' ? n.initialRelation : 0,
      })),
    };
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
   * GET /api/content/career-gates — the promotion ladder as data (v2.1).
   * The client must show the *real* gates, not a hardcoded copy of them.
   */
  app.get('/career-gates', async () => {
    const balance = getContent().balance as any;
    return {
      gates: balance.careerGates ?? [],
      livingCosts: balance.livingCosts ?? null,
      endings: balance.endings ?? null,
    };
  });

  /**
   * GET /api/content/pixel — pixel-art avatar pack (docs/pixel-art.md).
   * The client renders from this payload with the shared engine; there are no
   * pre-rendered sprites at runtime, so PNGs stay a build/QA artifact.
   */
  app.get('/pixel', async () => {
    const { pixelArt, pixelGeneratorConfig } = getContent();
    if (!pixelArt) return { available: false, canvas: null, components: {}, palettes: {}, generatorConfig: null };
    return {
      available: true,
      canvas: pixelArt.canvas,
      layout: pixelArt.layout,
      layerOrder: pixelArt.layer_order,
      palettes: pixelArt.palettes,
      components: pixelArt.components,
      generatorConfig: pixelGeneratorConfig,
    };
  });

  /**
   * GET /api/content/projects — freelance contracts with deadlines. Whether a
   * project is available depends on player state, so that stays server-side in
   * /api/game/action; this is only the catalogue.
   */
  app.get('/projects', async () => {
    return { projects: getContent().projects?.projects ?? [] };
  });

  /**
   * GET /api/content/side-jobs — non-IT gigs (courier, barista, etc.)
   */
  app.get('/side-jobs', async () => {
    return { sideJobs: getContent().balance.sideJobs ?? {} };
  });

  /**
   * GET /api/content/archetypes — curated skill routes (P1.3). Progress is not
   * stored anywhere: the client derives it from the player's skill levels.
   */
  app.get('/archetypes', async () => {
    return { archetypes: getContent().archetypes?.archetypes ?? [] };
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
