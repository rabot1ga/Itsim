import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlayerPortrait } from '../components/PlayerPortrait';

/**
 * The unified portrait is the layered SVG figure (genetics propose, the
 * wardrobe disposes) cropped at head and shoulders. These tests pin the
 * merge: genetic defaults, explicit wardrobe overrides, layer tinting and
 * the honest fallback when content or genotype is missing.
 */

const mocks = vi.hoisted(() => ({
  content: null as any,
}));

vi.mock('../lib/avatarContent', () => ({
  fetchAvatarContent: () => Promise.resolve(mocks.content),
}));

const manifest = {
  resolution: { width: 500, height: 760 },
  slots: [
    {
      id: 'body',
      zOrder: 0,
      required: true,
      tintSlot: 'skinTone',
      entries: [{ id: 'body_base', file: 'avatar/body/base.svg' }],
    },
    {
      id: 'eyes',
      zOrder: 1,
      required: true,
      entries: [
        { id: 'eye_normal', file: 'avatar/eyes/normal.svg' },
        { id: 'eye_tired', file: 'avatar/eyes/tired.svg' },
      ],
    },
    {
      id: 'beard',
      zOrder: 2,
      required: false,
      tintSlot: 'hairColor',
      entries: [
        { id: 'beard_none', file: null },
        { id: 'beard_full', file: 'avatar/beard/full.svg' },
      ],
    },
    {
      id: 'hair',
      zOrder: 3,
      required: true,
      tintSlot: 'hairColor',
      entries: [
        { id: 'hair_short', file: 'avatar/hair/short.svg' },
        { id: 'hair_manbun', file: 'avatar/hair/manbun.svg' },
      ],
    },
    {
      id: 'top',
      zOrder: 4,
      required: true,
      entries: [
        { id: 'top_hoodie_gray', file: 'avatar/top/hoodie_gray.svg' },
        { id: 'top_jacket', file: 'avatar/top/jacket.svg' },
      ],
    },
  ],
};

const geneticsConfig = {
  skinTones: [{ id: 'skin_pale', name: 'Бледный', hue: 30, sat: 1.3, light: 1.15 }],
  hairPalette: [{ id: 'hair_blond', name: 'Блонд', hue: 55, sat: 1.6, light: 1.2 }],
  wallPalette: [],
};

const genetics = {
  seed: 'portrait-test',
  skinTone: 'skin_pale',
  eyeShape: 'eye_normal',
  hairStyle: 'hair_short',
  hairColor: 'hair_blond',
  beard: 'beard_full',
  top: 'top_hoodie_gray',
  accessory: 'acc_none',
  windowShape: 'window_square',
  wallColor: 'wall_blue',
  decor: 'decor_none',
};

beforeEach(() => {
  mocks.content = { avatar: manifest, genetics: geneticsConfig };
});
afterEach(cleanup);

const saved = () => screen.getByRole('img', { name: 'Портрет твоего персонажа' });
const layerSrc = (container: HTMLElement, part: string) =>
  Array.from(container.querySelectorAll('img'))
    .map((img) => img.getAttribute('src') ?? '')
    .find((src) => src.includes(part));

describe('unified SVG portrait', () => {
  it('renders the saved layered figure at head and shoulders', async () => {
    const { container } = render(<PlayerPortrait player={{ genetics, avatar: {} }} />);
    await waitFor(() => expect(container.querySelector('[data-portrait="saved"]')).toBeTruthy());
    expect(saved()).toBeTruthy();
    expect(layerSrc(container, '/layers/avatar/body/base.svg')).toBeTruthy();
    expect(layerSrc(container, '/layers/avatar/hair/short.svg')).toBeTruthy();
    expect(layerSrc(container, '/layers/avatar/beard/full.svg')).toBeTruthy();
    expect(layerSrc(container, '/layers/avatar/top/hoodie_gray.svg')).toBeTruthy();
  });

  it('tints skin and hair layers from the genetic palettes', async () => {
    const { container } = render(<PlayerPortrait player={{ genetics, avatar: {} }} />);
    await waitFor(() => expect(container.querySelector('[data-portrait="saved"]')).toBeTruthy());
    const body = Array.from(container.querySelectorAll('img')).find((img) => img.getAttribute('src')?.includes('body'));
    expect(body?.style.filter).toContain('hue-rotate(30deg)');
    const hair = Array.from(container.querySelectorAll('img')).find((img) => img.getAttribute('src')?.includes('hair'));
    expect(hair?.style.filter).toContain('hue-rotate(55deg)');
  });

  it('lets the wardrobe override the genetic shape', async () => {
    const { container } = render(
      <PlayerPortrait player={{ genetics, avatar: { hair: 'hair_manbun', top: 'top_jacket', beard: 'beard_none' } }} />
    );
    await waitFor(() => expect(container.querySelector('[data-portrait="saved"]')).toBeTruthy());
    expect(layerSrc(container, '/layers/avatar/hair/manbun.svg')).toBeTruthy();
    expect(layerSrc(container, '/layers/avatar/top/jacket.svg')).toBeTruthy();
    expect(layerSrc(container, '/layers/avatar/beard/full.svg')).toBeFalsy();
  });

  it('recolours tinted layers from wardrobe hex picks (genetics overridden)', async () => {
    const { container } = render(<PlayerPortrait player={{ genetics, avatar: { hairColor: '#d7a94b' } }} />);
    await waitFor(() => expect(container.querySelector('[data-portrait="saved"]')).toBeTruthy());
    const hair = Array.from(container.querySelectorAll('img')).find((img) => img.getAttribute('src')?.includes('hair'));
    // #d7a94b ≈ hue 40° on the grayscale hair layer, overriding the genetic hue.
    expect(hair?.style.filter).toContain('hue-rotate(40deg)');
  });

  it('shows the honest default when there is no saved genotype', async () => {
    const { container, unmount } = render(<PlayerPortrait player={{ telegramId: 1 }} />);
    await waitFor(() => expect(container.querySelector('[data-portrait="fallback"]')).toBeTruthy());
    expect(screen.getByAltText(/Стандартный портрет/)).toBeTruthy();
    unmount();
  });

  it('shows the honest default when avatar content fails to load', async () => {
    mocks.content = { avatar: null, genetics: null };
    const { container } = render(<PlayerPortrait player={{ genetics, avatar: {} }} />);
    await waitFor(() => expect(container.querySelector('[data-portrait="fallback"]')).toBeTruthy());
    expect(screen.getByAltText(/Стандартный портрет/)).toBeTruthy();
  });

  it('swaps to the fallback when a layer image breaks', async () => {
    const { container } = render(<PlayerPortrait player={{ genetics, avatar: {} }} />);
    await waitFor(() => expect(container.querySelector('[data-portrait="saved"]')).toBeTruthy());
    fireEvent.error(Array.from(container.querySelectorAll('img'))[0]);
    await waitFor(() => expect(container.querySelector('[data-portrait="fallback"]')).toBeTruthy());
  });
});
