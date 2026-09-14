// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
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
  useEnabledSources: vi.fn(() => ({ isAvailable: true })),
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
import { useSearchStore } from '@/modules/search/store/useSearchStore';

beforeEach(() => {
  localStorage.clear();
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
});
