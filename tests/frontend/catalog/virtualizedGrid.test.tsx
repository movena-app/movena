// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const virtualState = vi.hoisted(() => ({ rowKey: 'live:4:120:16:0' }));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getTotalSize: () => 120,
    getVirtualItems: () => [{ index: 0, key: virtualState.rowKey, start: 0 }],
  }),
}));

import { VirtualizedGrid } from '@/modules/catalog/components/VirtualizedGrid';
import type { MediaItem } from '@/modules/catalog/model/media';

beforeAll(() => {
  class TestResizeObserver {
    observe() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: TestResizeObserver,
    configurable: true,
  });
});

describe('virtualized grid resizing', () => {
  it('preserves mounted card artwork when the virtualizer invalidates row geometry', () => {
    const items: MediaItem[] = [
      {
        id: 'youtube-live',
        title: 'YouTube Live',
        posterUrl: '',
        type: 'live',
        streamUrl: 'https://www.youtube.com/@channel/live',
      },
    ];
    const view = render(
      <MemoryRouter>
        <VirtualizedGrid items={items} isLiveTv gap={16} />
      </MemoryRouter>,
    );
    const originalLogo = screen.getByRole('img', { name: 'YouTube' });

    virtualState.rowKey = 'live:4:121:16:0';
    view.rerender(
      <MemoryRouter>
        <VirtualizedGrid items={items} isLiveTv gap={17} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: 'YouTube' })).toBe(originalLogo);
  });
});
