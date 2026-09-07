import React from 'react';
import { LayerManifest } from '@itsim/shared';
import { Composition, buildLayerStack } from './layers';
import { PixelAvatar } from './PixelAvatar';
import { PixelAvatarData } from './pixelAvatar';

/**
 * Office renderer (docs/design.md §11) — the same layer engine as the room
 * (manifest + z-order + composition), fed by employment data instead of housing.
 */

export type OfficeMood = 'normal' | 'deadline' | 'friday' | 'night' | 'retro';

export const OFFICE_MOOD_META: Record<OfficeMood, { label: string; entry: string }> = {
  normal: { label: 'Обычный день', entry: 'omood_none' },
  deadline: { label: 'Дедлайн', entry: 'omood_deadline' },
  friday: { label: 'Пятница', entry: 'omood_friday' },
  night: { label: 'Ночной деплой', entry: 'omood_night' },
  retro: { label: 'Ретро', entry: 'omood_retro' },
};

export interface OfficeCompositionInput {
  grade: string;
  companySize: string;
  currentDay: number;
  energy: number;
  maxEnergy: number;
  motivation: number;
  achievements: string[];
  relationships: Record<string, number>;
}

const GRADE_ORDER = ['unemployed', 'intern', 'junior', 'middle', 'senior', 'teamlead', 'architect', 'cto'];

export function officeMoodOf(input: Pick<OfficeCompositionInput, 'currentDay' | 'energy' | 'maxEnergy' | 'motivation'>): OfficeMood {
  const { currentDay, energy, maxEnergy, motivation } = input;
  if (energy <= Math.max(2, Math.round((maxEnergy || 16) * 0.15))) return 'night';
  if (motivation < 30) return 'deadline';
  if (currentDay % 7 === 0) return 'friday';
  if (currentDay % 7 === 3) return 'retro';
  return 'normal';
}

export function buildOfficeComposition(input: OfficeCompositionInput): Composition {
  const gi = Math.max(0, GRADE_ORDER.indexOf(input.grade));
  const seniorAt = GRADE_ORDER.indexOf('senior');

  const kind =
    ({ startup: 'garage', product: 'product', enterprise: 'corp', outsource: 'cowork' } as Record<string, string>)[
      input.companySize
    ] ?? 'cowork';
  const lvl = gi >= seniorAt ? 1 : 0;

  const deskIdx = gi <= 1 ? 0 : gi === 2 ? 1 : gi === 3 ? 2 : gi === 4 ? 3 : 4;
  const city = gi <= 2 ? 'ocity_spalnik' : gi === 3 ? 'ocity_center' : gi === 4 ? 'ocity_city' : 'ocity_neon';

  const boards = ['oboard_kanban', 'oboard_sprint', 'oboard_arch', 'oboard_motivate'];
  const board = boards[Math.floor(input.currentDay / 7) % boards.length];

  const team =
    input.companySize === 'enterprise'
      ? 'oteam_cubes'
      : input.companySize === 'outsource'
        ? 'oteam_row'
        : 'oteam_island';

  let micro = gi <= 1 ? 'omicro_mug' : gi === 2 ? 'omicro_cactus' : gi === 3 ? 'omicro_photo' : gi === 4 ? 'omicro_figure' : 'omicro_award';
  if ((input.achievements ?? []).includes('fullstack_samurai')) micro = 'omicro_duck'; // the debug duck 🦆

  const mood = officeMoodOf(input);

  // Dmitry softens up once you befriend him.
  const toxicRelation = input.relationships?.['toxic_senior'] ?? 0;

  return {
    obg: `obg_${kind}_${lvl}`,
    ocity: city,
    oboard: board,
    oteam: team,
    odesk: `odesk_${deskIdx}`,
    odesk_micro: micro,
    colleague1: 'lead',
    colleague2: 'junior',
    colleague3: toxicRelation >= 30 ? 'mentor' : 'toxic',
    ocoffee: mood === 'friday' ? 'ocoffee_juice' : gi >= 3 ? 'ocoffee_machine' : 'ocoffee_cooler',
    omood: OFFICE_MOOD_META[mood].entry,
  };
}

/**
 * Colleague figures share one centered drawing per archetype; the slots are
 * spread horizontally until the artist draws positioned variants.
 */
const COLLEAGUE_OFFSET: Record<string, string> = {
  colleague1: 'translateX(-32%)',
  colleague2: 'none',
  colleague3: 'translateX(32%)',
};

export const OfficeRenderer: React.FC<{
  officeManifest: LayerManifest;
  composition: Composition;
  mood: OfficeMood;
  pixelAvatar?: PixelAvatarData | null;
}> = ({ officeManifest, composition, mood, pixelAvatar }) => {
  const layers = buildLayerStack(officeManifest, composition, null, null);

  return (
    <div className="relative w-full aspect-square overflow-hidden rounded-2xl border border-ink-700 bg-ink-800">
      {layers.map((layer) => (
        <img
          key={layer.slotId}
          src={layer.file}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full select-none"
          style={{
            filter: layer.filter ?? 'none',
            transform: COLLEAGUE_OFFSET[layer.slotId] ?? 'none',
          }}
        />
      ))}

      {/* The player sits at the hero desk */}
      {pixelAvatar && (
        <div className="absolute left-[40%] bottom-[7%] w-[30%]">
          <PixelAvatar data={pixelAvatar} scale={8} className="rounded-lg" background="transparent" />
        </div>
      )}

      {/* Mood badge */}
      <div className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-black/50 text-[10px] text-ink-200 font-medium">
        {OFFICE_MOOD_META[mood].label}
      </div>
    </div>
  );
};
