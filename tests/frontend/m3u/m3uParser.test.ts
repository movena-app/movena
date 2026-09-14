import { describe, expect, it } from 'vitest';
import { parseM3uAsync } from '@/modules/m3u-editor/services/m3uParser';

describe('asynchronous M3U parser boundary', () => {
  it('preserves source identity, base URL resolution, and inherited headers', async () => {
    const playlist = await parseM3uAsync(
      `#EXTM3U
#EXTINF:-1 tvg-id="news",News
live/news.ts`,
      {
        sourceId: 'source-worker',
        baseUrl: 'https://example.com/lists/main.m3u',
        headers: { 'User-Agent': 'Movena test' },
      },
    );

    expect(playlist.entries[0]).toMatchObject({
      sourceId: 'source-worker',
      url: 'https://example.com/lists/live/news.ts',
      headers: { 'User-Agent': 'Movena test' },
    });
  });

  it('propagates parser validation errors', async () => {
    await expect(parseM3uAsync('#EXTM3U\n#EXT-X-TARGETDURATION:6\nsegment.ts')).rejects.toThrow(
      'HLS stream manifest',
    );
  });
});
