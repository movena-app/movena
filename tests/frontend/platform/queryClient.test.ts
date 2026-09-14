import { beforeEach, describe, expect, it } from 'vitest';
import { invalidateSourceQueries, queryClient } from '@/shared/query/queryClient';

beforeEach(() => queryClient.clear());

describe('source query invalidation', () => {
  it('invalidates every source-backed family without touching unrelated UI data', async () => {
    const sourceKeys = [
      ['catalog', 'live', 'sources-a'],
      ['categories', 'live', 'sources-a'],
      ['vod_info', 'account-a', '42'],
      ['series_info', 'account-a', '7'],
      ['epg_channel', 'account-a', '12'],
      ['epg_short', 'account-a', '12'],
      ['xmltv_guides', 'sources-a', 'guide-a'],
    ] as const;
    for (const key of sourceKeys) queryClient.setQueryData(key, []);
    queryClient.setQueryData(['settings_preview'], { theme: 'dark' });

    await invalidateSourceQueries();

    for (const key of sourceKeys) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    }
    expect(queryClient.getQueryState(['settings_preview'])?.isInvalidated).toBe(false);
  });
});
