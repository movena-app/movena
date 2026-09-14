// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const xc = vi.hoisted(() => ({ getSeriesInfo: vi.fn(), getVodInfo: vi.fn() }));
vi.mock('@/modules/sources/data/xtreamClient', () => xc);

import { useSeriesInfo, useVodInfo } from '@/modules/catalog/data/useDetails';
import { useAuthStore } from '@/modules/sources/store/useAuthStore';

const sourceId = 'xtream-details';
const credentials = {
  sourceId,
  url: 'https://provider.test',
  username: 'alice',
  password: 'secret',
};

function wrapperFactory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    profiles: [
      {
        id: sourceId,
        kind: 'xtream',
        name: 'Details',
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

describe('detail query mapping', () => {
  it('passes source credentials and stamps VOD data with its source identity', async () => {
    xc.getVodInfo.mockResolvedValue({
      info: { name: 'Movie' },
      movie_data: { stream_id: 7, name: 'Movie', container_extension: 'mp4' },
    });
    const { wrapper } = wrapperFactory();
    const { result } = renderHook(() => useVodInfo('7', sourceId), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(xc.getVodInfo).toHaveBeenCalledWith(credentials, '7', expect.any(AbortSignal));
    expect(result.current.data?.movie_data.source_id).toBe(sourceId);
  });

  it('stamps every series episode and does not fetch when the source is unavailable', async () => {
    xc.getSeriesInfo.mockResolvedValue({
      info: { name: 'Show' },
      seasons: [],
      episodes: {
        '1': [
          { id: 11, episode_num: 1 },
          { id: 12, episode_num: 2 },
        ],
      },
    });
    const { wrapper } = wrapperFactory();
    const { result } = renderHook(() => useSeriesInfo(99, sourceId), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.episodes['1']!.map((episode) => episode.source_id)).toEqual([
      sourceId,
      sourceId,
    ]);

    const unavailable = renderHook(() => useVodInfo(undefined, sourceId), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unavailable.result.current.fetchStatus).toBe('idle');
    expect(xc.getVodInfo).not.toHaveBeenCalled();
  });
});
