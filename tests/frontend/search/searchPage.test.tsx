// @vitest-environment happy-dom

import { render as renderUi, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/modules/catalog/data/useCatalog', () => {
  const query = {
    data: [],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  };

  return {
    useVodStreams: vi.fn(() => query),
    useSeriesList: vi.fn(() => query),
    useLiveStreams: vi.fn(() => query),
  };
});

vi.mock('@/modules/sources/hooks/useEnabledSources', () => ({
  useEnabledSources: vi.fn(() => ({
    isAvailable: true,
    queryScope: 'test-scope',
    availableM3uSources: [],
    availableXtreamSources: [],
  })),
}));

vi.mock('@/app/shell/PageTransition', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/modules/catalog/components/CatalogViewToggle', () => ({
  CatalogViewToggle: () => <div data-testid="catalog-view-toggle" />,
}));

vi.mock('@/modules/catalog/components/VirtualizedGrid', () => ({
  VirtualizedGrid: ({
    items,
    onItemClick,
  }: {
    items: Array<{ id: string; title: string }>;
    onItemClick?: (item: { id: string; title: string }) => void;
  }) => (
    <div data-testid="search-results">
      {items.map((item) => (
        <button key={item.id} onClick={() => onItemClick?.(item)}>
          {item.title}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/modules/catalog/details/MovieDetailsDialog', () => ({
  MovieDetailsDialog: ({ movieTitle }: { movieTitle: string }) => (
    <div role="dialog" aria-label={`Movie details for ${movieTitle}`} />
  ),
}));

import { SearchPage } from '@/modules/search/pages/SearchPage';
import { useVodStreams } from '@/modules/catalog/data/useCatalog';
import { useEnabledSources } from '@/modules/sources/hooks/useEnabledSources';
import { useSearchStore } from '@/modules/search/store/useSearchStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { queryKeys } from '@/modules/sources/model/queryKeys';

let queryClient: QueryClient;

function render(ui: ReactElement) {
  return renderUi(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

function vodQuery(data: unknown[]) {
  return {
    data,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useVodStreams>;
}

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useSearchStore.setState({ recentSearches: ['Dune'] });
  vi.mocked(useVodStreams).mockReturnValue({
    data: [],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useVodStreams>);
});

describe('search page controls', () => {
  it('keeps the catalogue view toggle out of the idle state and reveals it for an active query', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/search']}>
        <SearchPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Recent searches')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Search Movena' })).toBeTruthy();
    expect(screen.queryByTestId('catalog-view-toggle')).toBeNull();

    await user.type(
      screen.getByRole('textbox', { name: 'Search movies, series, or live channels' }),
      'Dune',
    );

    expect(screen.getByTestId('catalog-view-toggle')).toBeTruthy();
  });

  it('restores the result type from the URL and keeps it there when changed', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/search?q=Dune&type=series']}>
        <SearchPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('radio', { name: 'Series' }).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('radio', { name: 'Movies' }));
    expect(screen.getByRole('radio', { name: 'Movies' }).getAttribute('aria-checked')).toBe('true');
  });

  it('opens movie details instead of unexpectedly starting search-result playback', async () => {
    const user = userEvent.setup();
    vi.mocked(useVodStreams).mockReturnValue({
      data: [
        {
          id: 'movie-1',
          title: 'Dune',
          posterUrl: '',
          type: 'vod',
          sourceId: 'source-1',
          sourceItemId: '1',
        },
      ],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useVodStreams>);

    render(
      <MemoryRouter initialEntries={['/search?q=Dune&type=movies']}>
        <SearchPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Dune' }));
    expect(await screen.findByRole('dialog', { name: 'Movie details for Dune' })).toBeTruthy();
  });

  it('leaves items from hidden categories out of the results', async () => {
    vi.mocked(useVodStreams).mockReturnValue(
      vodQuery([
        { id: 'shown', title: 'Dune', posterUrl: '', type: 'vod', categoryId: 'cat-shown' },
        { id: 'hidden', title: 'Dune Uncut', posterUrl: '', type: 'vod', categoryId: 'cat-hidden' },
        { id: 'loose', title: 'Dune Part Two', posterUrl: '', type: 'vod' },
      ]),
    );
    useSettingsStore.getState().toggleCategoryPref('hidden', 'vod', 'cat-hidden');

    render(
      <MemoryRouter initialEntries={['/search?q=Dune&type=movies']}>
        <SearchPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Dune' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dune Part Two' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Dune Uncut' })).toBeNull();
  });

  it('leaves items from hidden countries out of the results', async () => {
    queryClient.setQueryData(queryKeys.categories('vod', 'test-scope'), [
      { category_id: 'cat-de', category_name: 'DE | Movies', parent_id: 0 },
      { category_id: 'cat-fr', category_name: 'FR | Movies', parent_id: 0 },
    ]);
    vi.mocked(useVodStreams).mockReturnValue(
      vodQuery([
        { id: 'de', title: 'Dune Deutsch', posterUrl: '', type: 'vod', categoryId: 'cat-de' },
        { id: 'fr', title: 'Dune Francais', posterUrl: '', type: 'vod', categoryId: 'cat-fr' },
      ]),
    );
    useSettingsStore.getState().toggleCategoryPref('hiddenCountries', 'vod', 'DE');

    render(
      <MemoryRouter initialEntries={['/search?q=Dune&type=movies']}>
        <SearchPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Dune Francais' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Dune Deutsch' })).toBeNull();
  });

  it('shows nothing from a hidden country until the category list has arrived', async () => {
    // A hidden country only maps to category ids once the category list is
    // there. Rendering the catalogue unfiltered until then is how hidden
    // channels used to reach search.
    vi.mocked(useEnabledSources).mockReturnValue({
      isAvailable: true,
      queryScope: 'pending-scope',
      availableXtreamSources: [],
      availableM3uSources: [
        {
          id: 'source-1',
          profile: { name: 'Playlist' },
          runtime: {
            playlist: {
              entries: [
                {
                  id: 'de-1',
                  type: 'vod',
                  categoryId: 'cat-de',
                  groupTitle: 'DE | Kino',
                  title: 'Dune Deutsch',
                  url: 'http://example.test/1',
                },
                {
                  id: 'fr-1',
                  type: 'vod',
                  categoryId: 'cat-fr',
                  groupTitle: 'FR | Cinema',
                  title: 'Dune Francais',
                  url: 'http://example.test/2',
                },
              ],
            },
          },
        },
      ],
    } as unknown as ReturnType<typeof useEnabledSources>);
    vi.mocked(useVodStreams).mockReturnValue(
      vodQuery([
        { id: 'de-1', title: 'Dune Deutsch', posterUrl: '', type: 'vod', categoryId: 'cat-de' },
        { id: 'fr-1', title: 'Dune Francais', posterUrl: '', type: 'vod', categoryId: 'cat-fr' },
      ]),
    );
    useSettingsStore.getState().toggleCategoryPref('hiddenCountries', 'vod', 'DE');

    render(
      <MemoryRouter initialEntries={['/search?q=Dune&type=movies']}>
        <SearchPage />
      </MemoryRouter>,
    );

    // First paint, before the category query can have resolved.
    expect(screen.queryByRole('button', { name: 'Dune Deutsch' })).toBeNull();

    // And once it has, the visible country is there and the hidden one is not.
    expect(await screen.findByRole('button', { name: 'Dune Francais' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Dune Deutsch' })).toBeNull();
  });
});
