import React from 'react';
import { PixelAvatar } from './PixelAvatar';
import { PixelAvatarData, PixelPack } from './pixelAvatar';
import { combinationFromSeed } from '@itsim/shared';

/**
 * Идентичность персонажа — docs/pixel-art.md, Этап 4 («экспорт и интеграция»).
 * The room already shows the look; this card makes it inspectable: which
 * component came from the genotype and which from the seed, plus the exact seed
 * that reproduces the character.
 */
export const PixelIdentity: React.FC<{ pack: PixelPack; data: PixelAvatarData; neighbours?: number }> = ({
  pack,
  data,
  neighbours = 4,
}) => {
  const file = data.file;
  const config = pack.generatorConfig;
  const labels = (combo: Record<string, string | null>) =>
    Object.entries(combo)
      .filter(([, v]) => v)
      .map(([cat, id]) => ({ cat, label: id ? file.components[id]?.label ?? id : '', id: id ?? '' }));

  const rows = labels(data.combo);
  const siblingSeeds = config
    ? Array.from({ length: neighbours }, (_, i) => `${data.seed}:next${i}`)
    : [];

  return (
    <div className="game-card">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="section-title">Пиксельная идентичность</h3>
        <span className="text-[10px] font-mono text-ink-500">32×32 · {rows.length} слоёв</span>
      </div>

      <div className="grid grid-cols-[96px_1fr] gap-3">
        <PixelAvatar data={data} scale={6} className=" border-2 border-ink-700" background="#12141a" />
        <dl className="space-y-1 text-xs">
          {rows.map(({ cat, label, id }) => (
            <div key={cat} className="flex items-center justify-between gap-2">
              <dt className="text-ink-500">{cat}</dt>
              <dd className="flex items-center gap-2">
                <span className="text-ink-200">{label}</span>
                <span
                  className={`text-[9px] px-1 ${
                    data.source[cat] === 'trait' ? 'bg-moss-500/15 text-moss-300' : 'bg-ink-700/60 text-ink-400'
                  }`}
                  title={data.source[cat] === 'trait' ? 'взято из генотипа игрока' : 'вытянуто из seed'}
                >
                  {data.source[cat] === 'trait' ? 'генотип' : 'seed'}
                </span>
                <code className="text-[9px] text-ink-600">{id}</code>
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-ink-800">
            <dt className="text-ink-500">палитра</dt>
            <dd className="text-ink-200">{data.scheme?.name ?? 'базовая'}</dd>
          </div>
        </dl>
      </div>

      {siblingSeeds.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] text-ink-500">соседи по seed:</span>
          {siblingSeeds.map((seed) => {
            const combo = combinationFromSeed(file, config!, seed);
            return (
              <span key={seed} title={`${seed} · ${combo.scheme.id}`} className="w-8">
                <PixelAvatar
                  data={{ ...data, combo: combo.combo, scheme: combo.scheme, schemeId: combo.scheme.id }}
                  scale={2}
                  className="border-2 border-ink-800"
                />
              </span>
            );
          })}
        </div>
      )}

      <p className="mt-2 text-[10px] font-mono text-ink-600 break-all" title={data.seed}>
        reproducibility: seed + checksum(components.json) + checksum(generator_config.json)
      </p>
    </div>
  );
};
