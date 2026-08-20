import { readFileSync } from 'fs';
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
  const fs = require('fs');
  const files = fs.readdirSync(eventsDir).filter((f: string) => f.endsWith('.json'));
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
  const companyIds = new Set(bundle.companies.map((c: any) => c.id));
  const npcIds = new Set(bundle.npcs.map((n: any) => n.id));

  // Validate skill references in events
  for (const event of bundle.events) {
    for (const choice of event.choices) {
      if (choice.effects?.skill) {
        for (const skillId of Object.keys(choice.effects.skill)) {
          if (!skillIds.has(skillId)) {
            console.warn(`⚠ Event ${event.id}: unknown skill "${skillId}"`);
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

  console.log('✓ Cross-reference validation complete');
}

export function getContent(): ContentBundle {
  if (!content) {
    throw new Error('Content not loaded — call loadContent() first');
  }
  return content;
}