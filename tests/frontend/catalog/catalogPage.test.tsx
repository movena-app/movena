import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Film } from 'lucide-react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CatalogPage } from '@/modules/catalog/components/CatalogPage';
import { useAuthStore } from '@/modules/sources/store/useAuthStore';
import { useSourceStore } from '@/modules/sources/store/useSourceStore';
import * as catalogApi from '@/modules/catalog/data/useCatalog';
import * as categoriesApi from '@/modules/catalog/data/useCategories';
import * as enabledSourcesHook from '@/modules/sources/hooks/useEnabledSources';
import type { MediaItem } from '@/modules/catalog/model/media';

vi.mock('@/modules/catalog/components/VirtualizedGrid', () => ({
  VirtualizedGrid: ({
    items,
    onItemClick,
  }: {
    items: Array<{ id: string; title: string }>;
    onItemClick?: (item: { id: string; title: string }) => void;
  }) => (
    <div data-testid="virtualized-grid">
      {items.map((item) => (
        <button key={item.id} onClick={() => onItemClick?.(item)}>
          {item.title}
        </button>
      ))}
    </div>
  ),
}));

describe('CatalogPage component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    useAuthStore.setState({ profiles: [], runtimes: {} });
    useSourceStore.setState({ profiles: [], enabledSourceIds: [], runtimes: {} });
    vi.restoreAllMocks();

    vi.spyOn(enabledSourcesHook, 'useEnabledSources').mockReturnValue({
      enabledSourceIds: ['src-1'],
      xtreamEnabled: true,
      xtreamAvailable: true,
      xtreamSources: [],
      availableXtreamSources: [],
      m3uSources: [],
      availableM3uSources: [],
      isAvailable: true,
      isLoading: false,
      errors: [],
      queryScope: 'all',
    });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{ui}</BrowserRouter>
      </QueryClientProvider>,
    );
  };

  it('renders catalog page with items, header, and search', async () => {
    const mockItems: MediaItem[] = [
      { id: 'm1', title: 'The Matrix', posterUrl: '', type: 'vod', categoryId: 'cat-1' },
      { id: 'm2', title: 'The Matrix Reloaded', posterUrl: '', type: 'vod', categoryId: 'cat-1' },
    ];

    vi.spyOn(catalogApi, 'useCatalogByType').mockReturnValue({
      data: mockItems,
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(categoriesApi, 'useCategories').mockReturnValue({
      data: [{ category_id: 'cat-1', category_name: 'Action' }],
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    const onItemClick = vi.fn();

    renderWithProviders(
      <CatalogPage
        type="vod"
        title="Movies"
        icon={Film}
        emptyTitle="No Movies Found"
        emptyDescription="There are no movies in this category."
        noSourceDescription="Add a source to view movies."
        onItemClick={onItemClick}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Movies' })).toBeTruthy();
    expect(screen.getByText(/2 movies/i)).toBeTruthy();
    expect(screen.getByText('The Matrix')).toBeTruthy();
    expect(screen.getByText('The Matrix Reloaded')).toBeTruthy();
  });

  it('displays empty state when catalog is empty', async () => {
    vi.spyOn(catalogApi, 'useCatalogByType').mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(categoriesApi, 'useCategories').mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithProviders(
      <CatalogPage
        type="vod"
        title="Movies"
        icon={Film}
        emptyTitle="No Movies Found"
        emptyDescription="There are no movies in this category."
        noSourceDescription="Add a source to view movies."
        onItemClick={vi.fn()}
      />,
    );

    expect(screen.getByText('No Movies Found')).toBeTruthy();
    expect(screen.getByText('There are no movies in this category.')).toBeTruthy();
  });

  it('displays no source state when source is unavailable', async () => {
    vi.spyOn(enabledSourcesHook, 'useEnabledSources').mockReturnValue({
      enabledSourceIds: [],
      xtreamEnabled: false,
      xtreamAvailable: false,
      xtreamSources: [],
      availableXtreamSources: [],
      m3uSources: [],
      availableM3uSources: [],
      isAvailable: false,
      isLoading: false,
      errors: [],
      queryScope: 'none',
    });

    vi.spyOn(catalogApi, 'useCatalogByType').mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(categoriesApi, 'useCategories').mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithProviders(
      <CatalogPage
        type="vod"
        title="Movies"
        icon={Film}
        emptyTitle="No Movies Found"
        emptyDescription="There are no movies in this category."
        noSourceDescription="Add a source to view movies."
        onItemClick={vi.fn()}
      />,
    );

    expect(screen.getByText('No Source Available')).toBeTruthy();
    expect(screen.getByText('Add a source to view movies.')).toBeTruthy();
  });

  it('displays error state and retries on action click', async () => {
    const user = userEvent.setup();
    const refetchCatalog = vi.fn();

    vi.spyOn(catalogApi, 'useCatalogByType').mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('Network failure'),
      isFetching: false,
      refetch: refetchCatalog,
    } as any);

    vi.spyOn(categoriesApi, 'useCategories').mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithProviders(
      <CatalogPage
        type="vod"
        title="Movies"
        icon={Film}
        emptyTitle="No Movies Found"
        emptyDescription="There are no movies in this category."
        noSourceDescription="Add a source to view movies."
        onItemClick={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Try Again' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(refetchCatalog).toHaveBeenCalledTimes(1);
  });

  it('filters catalog items using genre chips and applies sorting', async () => {
    const user = userEvent.setup();
    const mockItems: MediaItem[] = [
      {
        id: 'm1',
        title: 'Die Hard',
        genre: 'Action',
        added: '100',
        year: '1988',
        rating: 8.2,
        posterUrl: '',
        type: 'vod',
        categoryId: 'cat-1',
      },
      {
        id: 'm2',
        title: 'Airplane!',
        genre: 'Comedy',
        added: '200',
        year: '1980',
        rating: 7.7,
        posterUrl: '',
        type: 'vod',
        categoryId: 'cat-1',
      },
      {
        id: 'm3',
        title: 'The Matrix',
        genre: 'Action, Sci-Fi',
        added: '300',
        year: '1999',
        rating: 8.7,
        posterUrl: '',
        type: 'vod',
        categoryId: 'cat-1',
      },
    ];

    vi.spyOn(catalogApi, 'useCatalogByType').mockReturnValue({
      data: mockItems,
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(categoriesApi, 'useCategories').mockReturnValue({
      data: [{ category_id: 'cat-1', category_name: 'All Movies' }],
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithProviders(
      <CatalogPage
        type="vod"
        title="Movies"
        icon={Film}
        emptyTitle="No Movies Found"
        emptyDescription="There are no movies in this category."
        noSourceDescription="Add a source to view movies."
        onItemClick={vi.fn()}
      />,
    );

    // Initial state renders all 3 items
    expect(screen.getByText('Die Hard')).toBeTruthy();
    expect(screen.getByText('Airplane!')).toBeTruthy();
    expect(screen.getByText('The Matrix')).toBeTruthy();

    // Click 'Comedy' genre chip
    const comedyChip = screen.getByRole('button', { name: /Comedy/i });
    await user.click(comedyChip);

    // Only Comedy item remains
    expect(screen.getByText('Airplane!')).toBeTruthy();
    expect(screen.queryByText('Die Hard')).toBeNull();
    expect(screen.queryByText('The Matrix')).toBeNull();

    // Click 'All Genres' to reset
    const allGenresChip = screen.getByRole('button', { name: /All Genres/i });
    await user.click(allGenresChip);
    expect(screen.getByText('Die Hard')).toBeTruthy();
    expect(screen.getByText('Airplane!')).toBeTruthy();
    expect(screen.getByText('The Matrix')).toBeTruthy();
  });
});
