import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  EventSchema, EventsFileSchema,
  SkillSchema, SkillsFileSchema,
  PerkSchema, PerksFileSchema,
  CompanySchema, CompaniesFileSchema,
  NPCSchema, NPCsFileSchema,
  ItemSchema, ItemsFileSchema,
  AchievementSchema, AchievementsFileSchema,
  BalanceSchema,
  GeneticsConfigSchema,
  LayerManifestSchema,
  CrossCollectionsSchema,
  DailyChallengesFileSchema,
  InterviewQuestionsFileSchema,
} from '@itsim/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, '..', '..', '..', 'content');

// Content cache
let content: ContentBundle | null = null;

export interface ContentBundle {
  events: any[];
  skills: any[];
  perks: any[];
  companies: any[];
  npcs: any[];
  items: any[];
  achievements: any[];
  balance: any;
  genetics: any;
  avatarLayers: any;
  roomLayers: any;
  crossCollections: any;
  challenges: any[];
  interviewQuestions: any[];
}

/**
 * Load and validate all content files at server startup
 */
export function loadContent(): ContentBundle {
  const bundle: ContentBundle = {
    events: loadAndValidate('events', EventsFileSchema, loadEventFiles()),
    skills: loadAndValidate('skills.json', SkillsFileSchema),
    perks: loadAndValidate('perks.json', PerksFileSchema),
    companies: loadAndValidate('companies.json', CompaniesFileSchema),
    npcs: loadAndValidate('npcs.json', NPCsFileSchema),
    items: loadAndValidate('items.json', ItemsFileSchema),
    achievements: loadAndValidate('achievements.json', AchievementsFileSchema),
    balance: loadAndValidate('balance.json', BalanceSchema),
    genetics: loadAndValidate('genetics.json', GeneticsConfigSchema),
    avatarLayers: loadAndValidate('layers/avatar_manifest.json', LayerManifestSchema),
    roomLayers: loadAndValidate('layers/room_manifest.json', LayerManifestSchema),
    crossCollections: loadAndValidate('cross_collections.json', CrossCollectionsSchema),
    challenges: loadAndValidate('challenges.json', DailyChallengesFileSchema),
    interviewQuestions: loadAndValidate('interview_questions.json', InterviewQuestionsFileSchema),
  };

  // Run cross-file validation
  validateCrossReferences(bundle);

  content = bundle;
  return bundle;
}

function loadAndValidate(filename: string, schema: any, data?: any): any {
  const raw = data ?? JSON.parse(readFileSync(join(CONTENT_DIR, filename), 'utf-8'));
  const result = schema.safeParse(raw);
  if (!result.success) {
    console.error(`✗ Validation failed for ${filename}:`);
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    throw new Error(`Content validation failed: ${filename}`);
  }
  console.log(`✓ ${filename} validated`);
  return result.data;
}

function loadEventFiles(): any[] {
  const eventsDir = join(CONTENT_DIR, 'events');
  const files = readdirSync(eventsDir).filter((f: string) => f.endsWith('.json'));
  const allEvents: any[] = [];
  for (const file of files) {
    const data = JSON.parse(readFileSync(join(eventsDir, file), 'utf-8'));
    if (Array.isArray(data)) {
      allEvents.push(...data);
    }
  }
  return allEvents;
}

function validateCrossReferences(bundle: ContentBundle) {
  const skillIds = new Set(bundle.skills.map((s: any) => s.id));
  const eventIds = new Set(bundle.events.map((e: any) => e.id));
  const npcIds = new Set(bundle.npcs.map((n: any) => n.id));

  // Soft skills live in PlayerState.softSkills and are valid event targets
  const softSkillIds = new Set([
    'communication',
    'english',
    'time_management',
    'leadership',
    'stress_resistance',
    'public_speaking',
  ]);

  // Layer ids across both manifests
  const layerIds = new Set<string>();
  for (const manifest of [bundle.avatarLayers, bundle.roomLayers]) {
    for (const slot of manifest.slots) {
      for (const entry of slot.entries) {
        layerIds.add(entry.id);
      }
    }
  }

  // Validate skill references in events
  for (const event of bundle.events) {
    for (const choice of event.choices) {
      if (choice.effects?.skill) {
        for (const skillId of Object.keys(choice.effects.skill)) {
          if (!skillIds.has(skillId) && !softSkillIds.has(skillId)) {
            console.warn(`⚠ Event ${event.id}: unknown skill "${skillId}"`);
          }
        }
      }
      if (choice.effects?.relation) {
        for (const npcId of Object.keys(choice.effects.relation)) {
          if (!npcIds.has(npcId)) {
            console.warn(`⚠ Event ${event.id}: unknown npc "${npcId}"`);
          }
        }
      }
      if (choice.chain) {
        if (!eventIds.has(choice.chain.eventId)) {
          console.warn(`⚠ Event ${event.id}: chain references unknown event "${choice.chain.eventId}"`);
        }
      }
    }
  }

  // Validate item layer references (DESIGN.md 3.2)
  for (const item of bundle.items) {
    if (item.layerId && !layerIds.has(item.layerId)) {
      console.warn(`⚠ Item ${item.id}: layerId "${item.layerId}" not found in layer manifests`);
    }
  }

  // Validate cross-collection layer references (DESIGN.md 3.3)
  for (const col of bundle.crossCollections.collections) {
    if (!layerIds.has(col.layerId)) {
      console.warn(`⚠ Cross-collection ${col.collectionId}: layerId "${col.layerId}" not found in layer manifests`);
    }
  }

  // Validate interview question skill references
  const questionSkillIds = new Set(bundle.interviewQuestions.map((q: any) => q.skillId));
  for (const skillId of questionSkillIds) {
    if (skillId !== 'general' && !skillIds.has(skillId)) {
      console.warn(`⚠ Interview question references unknown skill "${skillId}"`);
    }
  }

  // Validate genetics option ids against the layer manifests (DESIGN.md 1)
  const avatarEntryIds = new Set<string>();
  for (const slot of bundle.avatarLayers.slots) {
    for (const entry of slot.entries) avatarEntryIds.add(entry.id);
  }
  const roomEntryIds = new Set<string>();
  for (const slot of bundle.roomLayers.slots) {
    for (const entry of slot.entries) roomEntryIds.add(entry.id);
  }
  const geneticsCheck: Array<[string, any[], Set<string>]> = [
    ['eyes', bundle.genetics.eyes, avatarEntryIds],
    ['hairstyles', bundle.genetics.hairstyles, avatarEntryIds],
    ['beards', bundle.genetics.beards, avatarEntryIds],
    ['tops', bundle.genetics.tops, avatarEntryIds],
    ['accessories', bundle.genetics.accessories, avatarEntryIds],
    ['windows', bundle.genetics.windows, roomEntryIds],
    ['decorOptions', bundle.genetics.decorOptions, roomEntryIds],
  ];
  for (const [group, options, ids] of geneticsCheck) {
    for (const opt of options) {
      if (!ids.has(opt.id)) {
        console.warn(`⚠ Genetics.${group}: option "${opt.id}" not found in layer manifests`);
      }
    }
  }

  console.log('✓ Cross-reference validation complete');
}

export function getContent(): ContentBundle {
  if (!content) {
    throw new Error('Content not loaded — call loadContent() first');
  }
  return content;
}