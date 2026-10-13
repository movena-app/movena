// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MovieDetailsDialog } from '@/modules/catalog/details/MovieDetailsDialog';
import * as useDetailsModule from '@/modules/catalog/data/useDetails';
import { useLibraryStore } from '@/modules/library/store/useLibraryStore';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { useAuthStore } from '@/modules/sources/store/useAuthStore';

vi.mock('@/modules/catalog/data/useDetails', () => ({
  useVodInfo: vi.fn(),
}));
const tmdb = vi.hoisted(() => ({ searchTmdbTitles: vi.fn(), getTmdbMovie: vi.fn() }));
vi.mock('@/modules/metadata/data/tmdbClient', () => tmdb);

function renderWithRouter(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockLoadedVodInfo(
  info: Partial<typeof mockMovieData.info> & Record<string, unknown> = {},
) {
  vi.spyOn(useDetailsModule, 'useVodInfo').mockReturnValue({
    data: { ...mockMovieData, info: { ...mockMovieData.info, ...info } } as any,
    isLoading: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  } as any);
}

/** The one TMDB search result for the provider's title. */
function tmdbFinds(voteAverage: number, voteCount: number) {
  tmdb.searchTmdbTitles.mockResolvedValue({
    results: [
      {
        id: 42,
        mediaType: 'movie',
        title: 'The Dink',
        originalTitle: 'The Dink',
        releaseYear: 2026,
        voteAverage,
        voteCount,
        genreIds: [35],
      },
    ],
  });
  tmdb.getTmdbMovie.mockResolvedValue({
    id: 42,
    mediaType: 'movie',
    title: 'The Dink',
    originalTitle: 'The Dink',
    releaseYear: 2026,
    voteAverage,
    voteCount,
    genres: [{ name: 'Drama' }],
    credits: {
      cast: [{ name: 'TMDB Actor' }],
      crew: [{ name: 'TMDB Director', job: 'Director', jobs: [] }],
    },
  });
}

const mockMovieData = {
  info: {
    name: 'DE - The Dink',
    movie_image: 'https://example.com/poster.jpg',
    backdrop_path: ['https://example.com/backdrop.jpg'],
    description: 'Dusty "The Hammer" Boyd attempts to save his country club by playing pickleball.',
    cast: 'Jake Johnson, Mary Steenburgen, Ben Stiller',
    director: 'Josh Greenbaum',
    genre: 'Comedy',
    rating: '6.4',
    releaseDate: '2026-07-24',
    duration: '1h 42m',
  },
  movie_data: {
    stream_id: '1234',
    container_extension: 'mp4',
    direct_stream_url: 'https://example.com/movie.mp4',
  },
};

const defaultProps = {
  movieId: 'movie-123',
  movieTitle: 'The Dink',
  moviePoster: 'https://example.com/poster.jpg',
  onClose: vi.fn(),
};

describe('<MovieDetailsDialog />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLibraryStore.setState({ favorites: [], history: [] });
    usePlayerStore.setState({ playStream: vi.fn(), activeStream: null });
    useSettingsStore.getState().resetSettings();
    useAuthStore.setState({ profiles: [], runtimes: {} });
  });

  it('renders loading skeleton state', () => {
    vi.spyOn(useDetailsModule, 'useVodInfo').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithRouter(<MovieDetailsDialog {...defaultProps} />);

    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('renders title, metadata, inline action buttons, and cast tags when data is loaded', () => {
    vi.spyOn(useDetailsModule, 'useVodInfo').mockReturnValue({
      data: mockMovieData as any,
      isLoading: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithRouter(<MovieDetailsDialog {...defaultProps} />);

    expect(screen.getByRole('heading', { level: 1, name: 'The Dink' })).toBeTruthy();
    expect(screen.getByText('2026')).toBeTruthy();
    expect(screen.getByText('6.4')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play Movie' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add to favorites/i })).toBeTruthy();
    expect(screen.getByText('Jake Johnson')).toBeTruthy();
    expect(screen.getByText('Josh Greenbaum')).toBeTruthy();
  });

  it('prefers TMDB rating and credits while preserving provider fields as fallbacks', async () => {
    useSettingsStore.setState({ tmdbApiKey: 'test-key', tmdbEnabled: true });
    tmdbFinds(8.416, 1_234);
    mockLoadedVodInfo();

    renderWithRouter(<MovieDetailsDialog {...defaultProps} />);

    await waitFor(() => expect(screen.getByText('8.4')).toBeTruthy());
    expect(screen.getByText('TMDB')).toBeTruthy();
    expect(screen.getByTitle('TMDB rating 8.4 out of 10 from 1,234 votes')).toBeTruthy();
    expect(screen.queryByText('6.4')).toBeNull();
    expect(screen.getByText('TMDB Director')).toBeTruthy();
    expect(screen.getByText('TMDB Actor')).toBeTruthy();
    // TMDB is asked about the cleaned title and the provider's year, not "DE - The Dink".
    expect(tmdb.searchTmdbTitles).toHaveBeenCalledWith(
      'test-key',
      'movie',
      'The Dink',
      2026,
      undefined,
      expect.objectContaining({ language: 'en-US' }),
    );
  });

  it("uses the provider's TMDB id after checking it against the title", async () => {
    useSettingsStore.setState({ tmdbApiKey: 'test-key', tmdbEnabled: true });
    tmdbFinds(7.1, 640);
    mockLoadedVodInfo({ tmdb_id: '42' });

    renderWithRouter(<MovieDetailsDialog {...defaultProps} />);

    await waitFor(() => expect(screen.getByText('7.1')).toBeTruthy());
    expect(tmdb.getTmdbMovie).toHaveBeenCalledWith('test-key', 42, undefined, expect.any(Object));
    expect(tmdb.searchTmdbTitles).not.toHaveBeenCalled();
  });

  it('shows no rating when TMDB knows the title but too few people have voted', async () => {
    useSettingsStore.setState({ tmdbApiKey: 'test-key', tmdbEnabled: true });
    tmdbFinds(10, 1);
    mockLoadedVodInfo();

    renderWithRouter(<MovieDetailsDialog {...defaultProps} />);

    await waitFor(() => expect(screen.getByText('TMDB Director')).toBeTruthy());
    expect(screen.queryByText('10.0')).toBeNull();
    // The provider number is an old copy of the same thin data and does not stand in.
    expect(screen.queryByText('6.4')).toBeNull();
  });

  it('falls back to the labelled provider rating when TMDB has no such title', async () => {
    useSettingsStore.setState({ tmdbApiKey: 'test-key', tmdbEnabled: true });
    tmdb.searchTmdbTitles.mockResolvedValue({
      results: [
        {
          id: 9,
          mediaType: 'movie',
          title: 'Something Else',
          originalTitle: null,
          releaseYear: 2026,
          voteAverage: 10,
          voteCount: 2,
          genreIds: [],
        },
      ],
    });
    mockLoadedVodInfo();

    renderWithRouter(<MovieDetailsDialog {...defaultProps} />);

    await waitFor(() => expect(screen.getByText('6.4')).toBeTruthy());
    expect(screen.getByText('Provider')).toBeTruthy();
    expect(
      screen.getByTitle('Provider rating 6.4 out of 10, not checked against TMDB'),
    ).toBeTruthy();
    expect(tmdb.getTmdbMovie).not.toHaveBeenCalled();
  });

  it('never shows a placeholder 10 from the provider', () => {
    mockLoadedVodInfo({ rating: '10', rating_5based: 5 });

    renderWithRouter(<MovieDetailsDialog {...defaultProps} />);

    expect(screen.getByRole('heading', { level: 1, name: 'The Dink' })).toBeTruthy();
    expect(screen.queryByText('10')).toBeNull();
    expect(screen.queryByText('10.0')).toBeNull();
    expect(screen.queryByText('Provider')).toBeNull();
  });

  it('plays the movie over the dialog and shows the dialog again when the player closes', async () => {
    const user = userEvent.setup();
    const playStreamSpy = vi.fn((stream) => usePlayerStore.setState({ activeStream: stream }));
    usePlayerStore.setState({ playStream: playStreamSpy });

    vi.spyOn(useDetailsModule, 'useVodInfo').mockReturnValue({
      data: mockMovieData as any,
      isLoading: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithRouter(<MovieDetailsDialog {...defaultProps} />);

    const playBtn = screen.getByRole('button', { name: 'Play Movie' });
    await user.click(playBtn);

    expect(playStreamSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'movie-123',
        title: 'The Dink',
        type: 'vod',
        streamUrl: 'https://example.com/movie.mp4',
      }),
    );
    // Playback runs over the dialog instead of closing it.
    expect(defaultProps.onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => usePlayerStore.setState({ activeStream: null }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'The Dink' })).toBeTruthy();
  });

  it('toggles favorite state when Add to Favorites button is clicked', async () => {
    const user = userEvent.setup();

    vi.spyOn(useDetailsModule, 'useVodInfo').mockReturnValue({
      data: mockMovieData as any,
      isLoading: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithRouter(<MovieDetailsDialog {...defaultProps} />);

    const favBtn = screen.getByRole('button', { name: /Add to favorites/i });
    await user.click(favBtn);

    expect(useLibraryStore.getState().favorites).toHaveLength(1);
    expect(useLibraryStore.getState().favorites[0]!.id).toBe('movie-123');
  });

  it('renders error state and retries fetch on Try Again click', async () => {
    const user = userEvent.setup();
    const refetchSpy = vi.fn().mockResolvedValue({});

    vi.spyOn(useDetailsModule, 'useVodInfo').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
      isFetching: false,
      refetch: refetchSpy,
    } as any);

    renderWithRouter(<MovieDetailsDialog {...defaultProps} />);

    expect(screen.getByText(/Can’t reach movie details/i)).toBeTruthy();
    const retryBtn = screen.getByRole('button', { name: 'Try Again' });
    await user.click(retryBtn);

    expect(refetchSpy).toHaveBeenCalled();
  });

  it('explains when details cannot run because source credentials are missing', () => {
    vi.spyOn(useDetailsModule, 'useVodInfo').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithRouter(<MovieDetailsDialog {...defaultProps} sourceId="xtream-missing" />);

    expect(
      screen.getByText('No credentials are loaded for Xtream source "xtream-missing".'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Settings' })).toBeTruthy();
  });
});
