// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/catalog/data/useCatalog', async () => {
  const actual = await vi.importActual<typeof import('@/modules/catalog/data/useCatalog')>(
    '@/modules/catalog/data/useCatalog',
  );
  return { ...actual, useLiveStreams: vi.fn() };
});

vi.mock('@/modules/catalog/data/useCategories', async () => {
  const actual = await vi.importActual<typeof import('@/modules/catalog/data/useCategories')>(
    '@/modules/catalog/data/useCategories',
  );
  return { ...actual, useCategories: vi.fn(), useHiddenCategoryIds: vi.fn() };
});

import { ChannelsDrawer } from '@/modules/playback/components/ChannelsDrawer';
import { useLiveStreams } from '@/modules/catalog/data/useCatalog';
import { useCategories, useHiddenCategoryIds } from '@/modules/catalog/data/useCategories';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';

const categories = [
  { category_id: 'uk', category_name: 'UK | General', parent_id: 0 },
  { category_id: 'news', category_name: 'News', parent_id: 0 },
];

const channels = [
  {
    id: 'ch-1',
    title: 'BBC One',
    posterUrl: '',
    type: 'live' as const,
    categoryId: 'uk',
    channelNum: 1,
    streamUrl: 'http://x/1',
  },
  {
    id: 'ch-2',
    title: 'CNN International',
    posterUrl: '',
    type: 'live' as const,
    categoryId: 'news',
    channelNum: 2,
    streamUrl: 'http://x/2',
  },
  {
    id: 'ch-3',
    title: 'Hidden Channel',
    posterUrl: '',
    type: 'live' as const,
    categoryId: 'hidden',
    channelNum: 3,
    streamUrl: 'http://x/3',
  },
  {
    id: 'ch-4',
    title: 'ITV',
    posterUrl: '',
    type: 'live' as const,
    categoryId: 'uk',
    channelNum: 4,
    streamUrl: 'http://x/4',
  },
];

function renderDrawer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ChannelsDrawer />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // @tanstack/react-virtual measures the scroll container via
  // offsetWidth/offsetHeight; happy-dom never lays anything out, so every
  // element reports zero size and the virtualizer renders no rows. Fake a
  // real viewport so the rows under test are considered visible.
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 380 });

  vi.mocked(useLiveStreams).mockReturnValue({ data: channels } as ReturnType<
    typeof useLiveStreams
  >);
  vi.mocked(useCategories).mockReturnValue({ data: categories } as ReturnType<
    typeof useCategories
  >);
  vi.mocked(useHiddenCategoryIds).mockReturnValue(new Set(['hidden']));
  usePlayerStore.setState({
    activeStream: {
      id: 'ch-1',
      sourceItemId: 'ch-1',
      title: 'BBC One',
      type: 'live',
      streamUrl: 'http://x/1',
    },
    showChannelsDrawer: true,
  });
});

describe('ChannelsDrawer', () => {
  it('renders nothing when closed or not on a live stream', () => {
    usePlayerStore.setState({ showChannelsDrawer: false });
    const { container } = renderDrawer();
    expect(container.innerHTML).toBe('');
  });

  it('scopes the list to the category the current channel came from, and names it in the header', async () => {
    usePlayerStore.setState({
      activeStream: {
        id: 'ch-1',
        sourceItemId: 'ch-1',
        title: 'BBC One',
        type: 'live',
        streamUrl: 'http://x/1',
        categoryId: 'uk',
      },
    });
    renderDrawer();

    expect(screen.getByText('General')).toBeTruthy(); // "UK | General" parsed down to its label
    expect(screen.getByText('BBC One')).toBeTruthy();
    expect(screen.getByText('ITV')).toBeTruthy();
    expect(screen.queryByText('CNN International')).toBeNull();
    expect(screen.queryByText('Hidden Channel')).toBeNull();
  });

  it('falls back to the full (non-hidden) list when the stream carries no category', async () => {
    const user = userEvent.setup();
    renderDrawer();

    expect(screen.getByText('BBC One')).toBeTruthy();
    expect(screen.getByText('CNN International')).toBeTruthy();
    expect(screen.queryByText('Hidden Channel')).toBeNull();

    await user.type(screen.getByPlaceholderText('Search channels...'), 'cnn');
    expect(screen.queryByText('BBC One')).toBeNull();
    expect(screen.getByText('CNN International')).toBeTruthy();
  });

  it('switches channels without closing the drawer', async () => {
    const user = userEvent.setup();
    renderDrawer();

    const channelButton = screen.getByRole('button', { name: /CNN International/ });
    await user.click(channelButton);
    expect(usePlayerStore.getState().activeStream?.id).toBe('ch-2');
    expect(usePlayerStore.getState().showChannelsDrawer).toBe(true);
  });

  it('closes on the close button', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Close Channels' }));
    expect(usePlayerStore.getState().showChannelsDrawer).toBe(false);
  });
});
