// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const xc = vi.hoisted(() => ({ getChannelEPG: vi.fn() }));
vi.mock('@/modules/sources/data/xtreamClient', () => xc);

import { decodeEpgText, useChannelEpg } from '@/modules/guide/data/useEpg';
import { useAuthStore } from '@/modules/sources/store/useAuthStore';

describe('provider EPG query mapping', () => {
  it('decodes base64 text but keeps ordinary text intact', () => {
    expect(decodeEpgText('TmV3cw==')).toBe('News');
    expect(decodeEpgText('Plain description')).toBe('Plain description');
    expect(decodeEpgText(undefined)).toBe('');
  });

  it('maps, sorts, and rejects malformed provider timestamps', async () => {
    const sourceId = 'xtream-epg';
    useAuthStore.setState({
      profiles: [
        {
          id: sourceId,
          kind: 'xtream',
          name: 'EPG',
          locationLabel: 'epg.test',
          username: 'a',
          userInfo: { auth: 1 },
          serverInfo: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      runtimes: {
        [sourceId]: {
          credentials: { sourceId, url: 'https://epg.test', username: 'a', password: 'secret' },
          status: 'ready',
          error: null,
          revision: 1,
        },
      },
    } as never);
    xc.getChannelEPG.mockResolvedValue([
      {
        id: 'later',
        title: 'TGF0ZXI=',
        description: 'Later description',
        start_timestamp: '2000',
        stop_timestamp: '2600',
      },
      {
        id: 'bad',
        title: 'Bad',
        description: '',
        start_timestamp: '2000oops',
        stop_timestamp: '2600',
      },
      { id: '', title: '', description: '', start_timestamp: 2600, stop_timestamp: 2000 },
      {
        id: 'earlier',
        title: 'Earlier',
        description: '',
        start_timestamp: 1000,
        stop_timestamp: 1500,
      },
    ]);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useChannelEpg('42', true, sourceId), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      { id: 'earlier', title: 'Earlier', description: '', start: 1_000_000, end: 1_500_000 },
      {
        id: 'later',
        title: 'Later',
        description: 'Later description',
        start: 2_000_000,
        end: 2_600_000,
      },
    ]);
    expect(xc.getChannelEPG).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId }),
      '42',
      expect.any(AbortSignal),
    );
    client.clear();
  });
});
