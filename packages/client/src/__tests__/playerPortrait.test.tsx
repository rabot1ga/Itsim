import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlayerPortrait } from '../components/PlayerPortrait';

const mocks = vi.hoisted(() => ({ manifest: null as any, recolour: vi.fn() }));
vi.mock('../components/iso/IsoRoom', () => ({ useIsoManifest: () => mocks.manifest }));
vi.mock('../components/iso/recolor', async (original) => ({
  ...await original<typeof import('../components/iso/recolor')>(),
  recolourSprite: mocks.recolour,
}));
const player = { genetics: { seed: 'portrait-test', hairStyle: 'hair_short', top: 'top_hoodie_gray' }, avatar: {} };
const saved = () => screen.getByRole('img', { name: 'Портрет твоего персонажа' });
afterEach(cleanup);
beforeEach(() => {
  mocks.manifest = { sprites: { char_a00: { file: '/iso/char_a00.png', w: 50, h: 92, roles: { hair: ['#000000'] } } } };
  mocks.recolour.mockReset().mockResolvedValue('data:image/png;base64,portrait');
});

describe('saved player portrait', () => {
  it('frames the same room sprite at head and shoulders', async () => {
    render(<PlayerPortrait player={player} />);
    await waitFor(() => expect(saved()).toBeTruthy());
    expect(saved().getAttribute('viewBox')).toBe('0 0 50 50');
    expect(saved().querySelector('image')?.getAttribute('height')).toBe('92');
    expect(mocks.recolour.mock.calls[0][0]).toBe('/iso/char_a00.png');
  });

  it('passes saved wardrobe colours to the shared recolour engine', async () => {
    const { rerender } = render(<PlayerPortrait player={player} />);
    await waitFor(() => expect(saved()).toBeTruthy());
    rerender(<PlayerPortrait player={{ ...player, avatar: { hairColor: '#d7a94b' } }} />);
    await waitFor(() => expect(mocks.recolour).toHaveBeenCalledTimes(2));
    expect(mocks.recolour.mock.calls[1][2].hair).toBe('#d7a94b');
  });

  it('shows the honest default when there is no saved genotype or manifest', () => {
    const { rerender } = render(<PlayerPortrait player={{ telegramId: 1 }} />);
    expect(screen.getByAltText(/Стандартный портрет/)).toBeTruthy();
    expect(mocks.recolour).not.toHaveBeenCalled();
    mocks.manifest = null;
    rerender(<PlayerPortrait player={player} />);
    expect(screen.getByAltText(/Стандартный портрет/)).toBeTruthy();
  });

  it('falls back on a rejected render or broken image', async () => {
    mocks.recolour.mockRejectedValueOnce(new Error('offline'));
    const first = render(<PlayerPortrait player={player} />);
    await act(async () => {});
    expect(screen.getByAltText(/Стандартный портрет/)).toBeTruthy();
    first.unmount();
    const second = render(<PlayerPortrait player={player} />);
    await waitFor(() => expect(saved()).toBeTruthy());
    fireEvent.error(second.container.querySelector('image')!);
    expect(screen.getByAltText(/Стандартный портрет/)).toBeTruthy();
  });

  it('never applies a late render of the previous outfit', async () => {
    let old!: (url: string) => void;
    mocks.recolour.mockImplementationOnce(() => new Promise<string>((resolve) => { old = resolve; }));
    const { rerender } = render(<PlayerPortrait player={player} />);
    rerender(<PlayerPortrait player={{ ...player, genetics: { ...player.genetics, seed: 'new-person' } }} />);
    await waitFor(() => expect(saved()).toBeTruthy());
    await act(async () => old('old-outfit.png'));
    expect(saved().querySelector('image')?.getAttribute('href')).toBe('data:image/png;base64,portrait');
  });
});
