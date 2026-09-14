// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SeriesDetailsDialog } from '@/modules/catalog/details/SeriesDetailsDialog';
import * as useDetailsModule from '@/modules/catalog/data/useDetails';
import { useLibraryStore } from '@/modules/library/store/useLibraryStore';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { useSourceStore } from '@/modules/sources/store/useSourceStore';
import { parseM3u } from '@/modules/sources/data/m3uClient';
import { mapM3uCatalog } from '@/modules/catalog/data/useCatalog';
import { useAuthStore } from '@/modules/sources/store/useAuthStore';

vi.mock('@/modules/catalog/data/useDetails', () => ({
  useSeriesInfo: vi.fn(),
}));
const tmdb = vi.hoisted(() => ({ searchTmdb: vi.fn(), getTmdbTv: vi.fn() }));
vi.mock('@/modules/metadata/data/tmdbClient', () => tmdb);
const upcoming = vi.hoisted(() => ({ useUpcomingReleases: vi.fn() }));
vi.mock('@/modules/guide/data/useUpcomingReleases', () => upcoming);

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const mockSeriesData = {
  info: {
    name: 'DE - Breaking Bad',
    cover: 'https://example.com/cover.jpg',
    backdrop_path: ['https://example.com/backdrop.jpg'],
    plot: 'A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine.',
    cast: 'Bryan Cranston, Aaron Paul, Anna Gunn, Dean Norris',
    director: 'Vince Gilligan',
    genre: 'Drama, Crime, Thriller',
    rating: '9.5',
    releaseDate: '2008-01-20',
  },
  episodes: {
    '1': [
      {
        id: 'ep-101',
        episode_num: 1,
        title: 'Pilot 4K HDR',
        stream_url: 'https://example.com/stream/1.mp4',
        container_extension: 'mp4',
        info: {
          movie_image: 'https://example.com/ep1.jpg',
          plot: 'Walter White learns he has cancer.',
          duration: '00:58:00',
          duration_secs: 3480,
        },
      },
      {
        id: 'ep-102',
        episode_num: 2,
        title: "Cat's in the Bag...",
        stream_url: 'https://example.com/stream/2.mp4',
        container_extension: 'mp4',
        info: {
          movie_image: 'https://example.com/ep2.jpg',
          plot: 'Walt and Jesse attempt to dispose of two bodies.',
          duration: '00:48:00',
          duration_secs: 2880,
        },
      },
    ],
    '2': [
      {
        id: 'ep-201',
        episode_num: 1,
        title: 'Seven Thirty-Seven',
        stream_url: 'https://example.com/stream/201.mp4',
        container_extension: 'mp4',
        info: {
          movie_image: 'https://example.com/ep201.jpg',
          plot: 'Walt and Jesse realize how dire their situation is.',
          duration: '00:47:00',
          duration_secs: 2820,
        },
      },
    ],
  },
};

describe('SeriesDetailsDialog Component', () => {
  const defaultProps = {
    seriesId: 'series-123',
    seriesTitle: 'DE - Breaking Bad',
    seriesPoster: 'https://example.com/poster.jpg',
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useLibraryStore.setState({
      favorites: [],
      history: [],
      watched: [],
    });
    usePlayerStore.setState({
      activeStream: null,
    });
    useSourceStore.setState({ runtimes: {} });
    useSettingsStore.getState().resetSettings();
    useAuthStore.setState({ profiles: [], runtimes: {} });
    upcoming.useUpcomingReleases.mockReturnValue({
      data: [],
      isEnabled: false,
      isLoading: false,
      isError: false,
    });
  });

  it('renders skeleton loading state when details are loading', () => {
    vi.spyOn(useDetailsModule, 'useSeriesInfo').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithRouter(<SeriesDetailsDialog {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('renders series title, metadata, and episodes list when loaded', () => {
    vi.spyOn(useDetailsModule, 'useSeriesInfo').mockReturnValue({
      data: mockSeriesData as any,
      isLoading: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithRouter(<SeriesDetailsDialog {...defaultProps} />);

    // Title clean parsing
    expect(screen.getByRole('heading', { level: 1, name: 'Breaking Bad' })).toBeTruthy();

    expect(screen.getByText('2008')).toBeTruthy();
    expect(screen.getByText('9.5')).toBeTruthy();

    // Director and Cast in sidebar
    expect(screen.getByText('Vince Gilligan')).toBeTruthy();
    expect(screen.getByText('Bryan Cranston')).toBeTruthy();

    // Default season 1 episodes (clean title matches "Pilot")
    expect(screen.getByText(/Pilot/i)).toBeTruthy();
    expect(screen.getByText("Cat's in the Bag...")).toBeTruthy();
  });

  it('enriches a series with localized TMDB artwork and synopsis when enabled', async () => {
    useSettingsStore.getState().updateSetting('tmdbApiKey', 'test-key');
    tmdb.searchTmdb.mockResolvedValue({ results: [{ mediaType: 'tv', id: 99 }] });
    tmdb.getTmdbTv.mockResolvedValue({
      overview: 'A localized TMDB synopsis.',
      posterUrl: 'https://image.test/tv-poster.jpg',
      backdropUrl: 'https://image.test/tv-backdrop.jpg',
      voteAverage: 9.1,
      runtimeMinutes: 47,
      numberOfSeasons: 5,
      numberOfEpisodes: 62,
      genres: [{ name: 'Crime' }],
      credits: {
        cast: [{ name: 'TMDB Cast' }],
        crew: [{ name: 'TMDB Director', job: 'Director', jobs: [] }],
      },
    });
    vi.spyOn(useDetailsModule, 'useSeriesInfo').mockReturnValue({
      data: mockSeriesData as any,
      isLoading: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    useSettingsStore.setState({ tmdbEnabled: true });
    renderWithRouter(<SeriesDetailsDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('A localized TMDB synopsis.')).toBeTruthy();
    });
    expect(screen.getByAltText('Breaking Bad')).toHaveProperty(
      'src',
      'https://image.test/tv-poster.jpg',
    );
    expect(screen.getByText('9.1')).toBeTruthy();
    expect(screen.getByText('TMDB Director')).toBeTruthy();
    expect(screen.getByText('TMDB Cast')).toBeTruthy();
    expect(screen.getByText('47m')).toBeTruthy();
    expect(screen.getByText('5 seasons')).toBeTruthy();
    expect(screen.getByText('62 episodes')).toBeTruthy();
  });

  it('allows switching seasons through the shared dropdown', async () => {
    const user = userEvent.setup();
    vi.spyOn(useDetailsModule, 'useSeriesInfo').mockReturnValue({
      data: mockSeriesData as any,
      isLoading: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithRouter(<SeriesDetailsDialog {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'Season 1' }));
    await user.click(screen.getByRole('option', { name: 'Season 2' }));

    expect(screen.getByText('Seven Thirty-Seven')).toBeTruthy();
    expect(screen.queryByText("Cat's in the Bag...")).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('opens the requested season and identifies the requested episode', () => {
    vi.spyOn(useDetailsModule, 'useSeriesInfo').mockReturnValue({
      data: mockSeriesData as any,
      isLoading: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithRouter(
      <SeriesDetailsDialog {...defaultProps} initialSeasonNumber={2} initialEpisodeNumber={1} />,
    );

    expect(screen.getByRole('button', { name: 'Season 2' })).toBeTruthy();
    expect(screen.getByRole('button', { current: true }).getAttribute('aria-label')).toMatch(
      /Season 2, episode 1/,
    );
    expect(screen.getByText('Seven Thirty-Seven')).toBeTruthy();
    expect(screen.queryByText("Cat's in the Bag...")).toBeNull();
  });

  it('groups M3U episodes by season and opens the requested one', () => {
    const playlist = parseM3u(
      `#EXTM3U
#EXTINF:-1 group-title="Series",Northern Lights S01E01 - Pilot
https://media.test/northern/s01e01.mkv
#EXTINF:-1 group-title="Series",Northern Lights S02E01 - Return
https://media.test/northern/s02e01.mkv
`,
      { sourceId: 'm3u-series-source' },
    );
    const series = mapM3uCatalog(playlist, 'series')[0]!;
    useSourceStore.setState({
      runtimes: {
        'm3u-series-source': {
          connection: null,
          playlist,
          status: 'ready',
          error: null,
          revision: 1,
        },
      },
    });

    renderWithRouter(
      <SeriesDetailsDialog
        seriesId={series.id}
        seriesTitle={series.title}
        seriesPoster=""
        sourceId="m3u-series-source"
        sourceItemId={series.sourceItemId}
        initialSeasonNumber={2}
        initialEpisodeNumber={1}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Season 2' })).toBeTruthy();
    expect(screen.getByRole('button', { current: true }).getAttribute('aria-label')).toBe(
      'Play season 2, episode 1',
    );
    expect(screen.getByRole('button', { name: 'Start Watching' })).toBeTruthy();
    expect(screen.getByText('Return')).toBeTruthy();
    expect(screen.queryByText('Pilot')).toBeNull();
  });

  it('resumes the saved M3U episode from its saved position', async () => {
    const user = userEvent.setup();
    const playlist = parseM3u(
      `#EXTM3U
#EXTINF:-1 group-title="Series",Northern Lights S01E01 - Pilot
https://media.test/northern/s01e01.mkv
#EXTINF:-1 group-title="Series",Northern Lights S02E01 - Return
https://media.test/northern/s02e01.mkv
`,
      { sourceId: 'm3u-resume-source' },
    );
    const series = mapM3uCatalog(playlist, 'series')[0]!;
    const savedEpisode = playlist.entries[1]!;
    const playStream = vi.fn();
    useSourceStore.setState({
      runtimes: {
        'm3u-resume-source': {
          connection: null,
          playlist,
          status: 'ready',
          error: null,
          revision: 1,
        },
      },
    });
    useLibraryStore.setState({
      history: [
        {
          id: series.id,
          title: series.title,
          posterUrl: '',
          type: 'series',
          progressPercentage: 25,
          lastWatchedAt: Date.now(),
          currentTime: 300,
          duration: 1200,
          episodeId: savedEpisode.id,
          seasonNum: 2,
          episodeNum: 1,
        },
      ],
    });
    usePlayerStore.setState({ playStream });

    renderWithRouter(
      <SeriesDetailsDialog
        seriesId={series.id}
        seriesTitle={series.title}
        seriesPoster=""
        sourceId="m3u-resume-source"
        sourceItemId={series.sourceItemId}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Season 2' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Resume S2:E1' }));
    expect(playStream).toHaveBeenCalledWith(
      expect.objectContaining({
        id: savedEpisode.id,
        seasonNum: '2',
        episodeNum: 1,
        startPosition: 300,
        knownDuration: 1200,
      }),
    );
  });

  it('keeps long seasons focused on navigation and the ordered episode list', () => {
    vi.spyOn(useDetailsModule, 'useSeriesInfo').mockReturnValue({
      data: {
        ...mockSeriesData,
        episodes: {
          '1': Array.from({ length: 8 }, (_, i) => ({
            id: `ep-10${i + 1}`,
            episode_num: i + 1,
            title: i === 0 ? 'Pilot' : i === 1 ? "Cat's in the Bag..." : `Episode ${i + 1}`,
            stream_url: `https://example.com/stream/${i + 1}.mp4`,
            container_extension: 'mp4',
            info: { movie_image: '', plot: `Plot ${i + 1}` },
          })),
        },
      } as any,
      isLoading: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithRouter(<SeriesDetailsDialog {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Season 1' })).toBeTruthy();
    expect(screen.getByText(/Pilot/i)).toBeTruthy();
    expect(screen.getByText("Cat's in the Bag...")).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search episodes...')).toBeNull();
  });

  it('appends announced episodes that are not playable from the provider yet', async () => {
    const user = userEvent.setup();
    const favorite = {
      id: 'series-123',
      title: 'Breaking Bad',
      posterUrl: 'poster.jpg',
      type: 'series' as const,
    };
    useLibraryStore.setState({ favorites: [favorite] });
    useSettingsStore.setState({ upcomingEnabled: true, upcomingCountdownEnabled: false });
    upcoming.useUpcomingReleases.mockReturnValue({
      data: [
        {
          favorite,
          tmdbId: 99,
          airDate: '2030-01-02',
          kind: 'episode',
          title: 'Already Playable',
          seasonNumber: 1,
          episodeNumber: 2,
          artworkUrl: null,
          exactAirTime: null,
          timeSource: 'tmdb',
        },
        {
          favorite,
          tmdbId: 99,
          airDate: '2030-01-09',
          kind: 'episode',
          title: 'The Next Chapter',
          seasonNumber: 1,
          episodeNumber: 3,
          artworkUrl: null,
          exactAirTime: null,
          timeSource: 'tmdb',
        },
      ],
      isEnabled: true,
      isLoading: false,
      isError: false,
    });
    vi.spyOn(useDetailsModule, 'useSeriesInfo').mockReturnValue({
      data: mockSeriesData as any,
      isLoading: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithRouter(<SeriesDetailsDialog {...defaultProps} />);

    expect(screen.getByRole('heading', { name: 'Next announced' })).toBeTruthy();
    expect(screen.getByText('The Next Chapter')).toBeTruthy();
    expect(screen.getByText('S1 E3')).toBeTruthy();
    expect(screen.getByText('Not available yet')).toBeTruthy();
    expect(screen.queryByText('Already Playable')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'View schedule' }));
    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(upcoming.useUpcomingReleases).toHaveBeenCalledWith({ favoriteIds: ['series-123'] });
  });

  it('marks an aired but missing episode as waiting for the provider', () => {
    const favorite = {
      id: 'series-123',
      title: 'Breaking Bad',
      posterUrl: 'poster.jpg',
      type: 'series' as const,
    };
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const airDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    useLibraryStore.setState({ favorites: [favorite] });
    useSettingsStore.setState({ upcomingEnabled: true, upcomingCountdownEnabled: false });
    upcoming.useUpcomingReleases.mockReturnValue({
      data: [
        {
          favorite,
          tmdbId: 99,
          airDate,
          kind: 'episode',
          title: 'Late Arrival',
          seasonNumber: 1,
          episodeNumber: 3,
          artworkUrl: null,
          exactAirTime: null,
          timeSource: 'tmdb',
        },
      ],
      isEnabled: true,
      isLoading: false,
      isError: false,
    });
    vi.spyOn(useDetailsModule, 'useSeriesInfo').mockReturnValue({
      data: mockSeriesData as any,
      isLoading: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithRouter(<SeriesDetailsDialog {...defaultProps} />);

    expect(screen.getByText('Late Arrival')).toBeTruthy();
    expect(screen.getByText('Aired yesterday')).toBeTruthy();
    expect(screen.getByText('Waiting for provider')).toBeTruthy();
  });

  it('toggles favorite status when favorite button is clicked', async () => {
    const user = userEvent.setup();
    vi.spyOn(useDetailsModule, 'useSeriesInfo').mockReturnValue({
      data: mockSeriesData as any,
      isLoading: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithRouter(<SeriesDetailsDialog {...defaultProps} />);

    const favButton = screen.getByRole('button', { name: /Add to favorites/i });
    await user.click(favButton);

    expect(useLibraryStore.getState().favorites.some((f) => f.id === 'series-123')).toBe(true);

    await user.click(favButton);
    expect(useLibraryStore.getState().favorites.some((f) => f.id === 'series-123')).toBe(false);
  });

  it('starts episode playback and closes modal on episode click', async () => {
    const user = userEvent.setup();
    const playStreamSpy = vi.fn();
    usePlayerStore.setState({ playStream: playStreamSpy });

    vi.spyOn(useDetailsModule, 'useSeriesInfo').mockReturnValue({
      data: mockSeriesData as any,
      isLoading: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithRouter(<SeriesDetailsDialog {...defaultProps} />);

    const startWatchingBtn = screen.getByRole('button', { name: /Start Watching/i });
    await user.click(startWatchingBtn);

    expect(playStreamSpy).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('renders error state and retries fetch when retry button is clicked', async () => {
    const user = userEvent.setup();
    const refetchSpy = vi.fn().mockResolvedValue({});
    vi.spyOn(useDetailsModule, 'useSeriesInfo').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
      isFetching: false,
      refetch: refetchSpy,
    } as any);

    renderWithRouter(<SeriesDetailsDialog {...defaultProps} />);

    expect(screen.getByText(/Can’t reach series details/i)).toBeTruthy();
    const retryBtn = screen.getByRole('button', { name: 'Try Again' });
    await user.click(retryBtn);

    expect(refetchSpy).toHaveBeenCalled();
  });

  it('explains when details cannot run because source credentials are missing', () => {
    vi.spyOn(useDetailsModule, 'useSeriesInfo').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithRouter(<SeriesDetailsDialog {...defaultProps} sourceId="xtream-missing" />);

    expect(
      screen.getByText('No credentials are loaded for Xtream source "xtream-missing".'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Settings' })).toBeTruthy();
  });

  it('keeps the shared season dropdown for series with many seasons', () => {
    const seasons28Data = {
      info: mockSeriesData.info,
      episodes: Object.fromEntries(
        Array.from({ length: 28 }, (_, i) => [
          String(i + 1),
          [
            {
              id: `ep-${i + 1}01`,
              episode_num: 1,
              title: `S${i + 1} Episode 1`,
              stream_url: 'https://example.com/stream.mp4',
              container_extension: 'mp4',
              info: { movie_image: '', plot: '' },
            },
          ],
        ]),
      ),
    };

    vi.spyOn(useDetailsModule, 'useSeriesInfo').mockReturnValue({
      data: seasons28Data as any,
      isLoading: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    renderWithRouter(<SeriesDetailsDialog {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Season 1' })).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
  });
});
