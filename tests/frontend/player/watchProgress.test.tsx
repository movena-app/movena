// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/sources/data/xtreamClient', () => ({
  getSeriesInfo: vi.fn(),
  getVodInfo: vi.fn(),
}));

import { detailQueryKeys } from '@/modules/catalog/data/useDetails';
import { getXtreamQueryScope } from '@/modules/sources/model/queryKeys';
import { useWatchProgress } from '@/modules/playback/components/useWatchProgress';
import { useAuthStore } from '@/modules/sources/store/useAuthStore';
import { useLibraryStore } from '@/modules/library/store/useLibraryStore';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';

const sourceId = 'xtream-progress';
const credentials = {
  sourceId,
  url: 'https://provider.test',
  username: 'alice',
  password: 'secret',
};

beforeEach(() => {
  vi.clearAllMocks();
  useLibraryStore.setState({ favorites: [], collections: [], history: [], watched: [] });
  usePlayerStore.getState().closePlayer();
  useAuthStore.setState({
    profiles: [
      {
        id: sourceId,
        kind: 'xtream',
        name: 'Progress',
        locationLabel: 'provider.test',
        username: 'alice',
        userInfo: { auth: 1 },
        serverInfo: {},
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    runtimes: { [sourceId]: { credentials, status: 'ready', error: null, revision: 1 } },
  } as never);
});

describe('watch progress integration', () => {
  it('saves clean series metadata and discovers the next episode from the cached detail query', () => {
    const client = new QueryClient();
    const scope = getXtreamQueryScope(sourceId, credentials);
    client.setQueryData(detailQueryKeys.series('series-raw', scope), {
      episodes: {
        '1': [
          { id: 'episode-1', episode_num: 1, title: 'Show S01E01 - Pilot' },
          { id: 'episode-2', episode_num: 2, title: 'Show S01E02 - Next' },
        ],
      },
    });
    act(() =>
      usePlayerStore.getState().playStream({
        id: 'episode-1',
        sourceItemId: 'episode-1',
        title: 'Show S01E01 - Pilot',
        type: 'series',
        streamUrl: 'https://provider.test/episode-1.mp4',
        sourceId,
        seriesId: 'series-1',
        seriesSourceItemId: 'series-raw',
        seriesTitle: 'Show',
        seasonNum: '1',
        episodeNum: 1,
        posterUrl: 'episode-still',
        seriesPosterUrl: 'series-cover',
      }),
    );
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useWatchProgress(), { wrapper });
    act(() => {
      usePlayerStore.getState().updateFromMpvEvent('duration', 1000);
      usePlayerStore.getState().updateFromMpvEvent('time-pos', 200);
    });
    act(() => result.current());

    expect(useLibraryStore.getState().history[0]).toMatchObject({
      id: 'series-1',
      title: 'Show',
      posterUrl: 'series-cover',
      sourceId,
      sourceItemId: 'series-raw',
      episodeId: 'episode-1',
      episodeTitle: 'Pilot',
      currentTime: 200,
      duration: 1000,
    });
  });

  it('does not write live playback or sessions without a usable duration', () => {
    const client = new QueryClient();
    act(() =>
      usePlayerStore.getState().playStream({
        id: 'live-1',
        title: 'Live',
        type: 'live',
        streamUrl: 'https://provider.test/live.m3u8',
        sourceId,
      }),
    );
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useWatchProgress(), { wrapper });
    act(() => result.current());
    expect(useLibraryStore.getState().history).toEqual([]);
  });
});
