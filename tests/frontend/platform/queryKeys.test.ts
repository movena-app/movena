import { describe, expect, it } from 'vitest';
import {
  getAuthQueryScope,
  getCombinedSourceQueryScope,
  getM3uQueryScope,
  getUrlQueryScope,
  getXtreamQueryScope,
  queryKeys,
} from '@/modules/sources/model/queryKeys';

describe('provider-scoped query keys', () => {
  const credentials = {
    url: 'HTTPS://PRIMARY.TEST/',
    alternativeUrls: ['https://backup.test/', 'https://primary.test'],
    username: 'Alice',
    password: 'secret',
  };

  it('creates a stable opaque scope independent of server ordering', () => {
    const scope = getAuthQueryScope(credentials);
    const reordered = getAuthQueryScope({
      ...credentials,
      url: 'https://backup.test',
      alternativeUrls: ['https://primary.test'],
      username: 'alice',
    });

    expect(scope).toBe(reordered);
    expect(scope).toMatch(/^account-[a-z0-9]+$/);
    expect(scope).not.toContain('alice');
    expect(scope).not.toContain('primary');
    expect(scope).not.toContain('secret');
  });

  it('keeps provider accounts in different cache namespaces', () => {
    expect(getAuthQueryScope(credentials)).not.toBe(
      getAuthQueryScope({ ...credentials, username: 'bob' }),
    );
  });

  it('isolates two source records even when they use identical credentials', () => {
    const first = getXtreamQueryScope('xtream-one', credentials);
    const second = getXtreamQueryScope('xtream-two', credentials);
    expect(first).not.toBe(second);
    expect(first).not.toContain('xtream-one');
  });

  it('scopes playlist caches by opaque source identity and revision', () => {
    const first = getM3uQueryScope('m3u-sensitive-source-label', 2);
    expect(first).toMatch(/^playlist-[a-z0-9]+-2$/);
    expect(first).not.toContain('sensitive');
    expect(first).not.toBe(getM3uQueryScope('m3u-another-source', 2));
    expect(first).not.toBe(getM3uQueryScope('m3u-sensitive-source-label', 3));
  });

  it('keeps guide URLs and their credentials out of query diagnostics', () => {
    const scope = getUrlQueryScope('https://guide.test/epg.xml?token=secret');
    expect(scope).toMatch(/^url-[a-z0-9]+$/);
    expect(scope).not.toContain('guide.test');
    expect(scope).not.toContain('secret');
    expect(scope).not.toBe(getUrlQueryScope('https://guide.test/other.xml'));
  });

  it('combines enabled source scopes without depending on selection order', () => {
    const combined = getCombinedSourceQueryScope(['playlist-one-2', 'account-two']);
    expect(combined).toMatch(/^sources-[a-z0-9]+$/);
    expect(combined).toBe(getCombinedSourceQueryScope(['account-two', 'playlist-one-2']));
    expect(combined).not.toBe(getCombinedSourceQueryScope(['account-two']));
  });

  it('builds deterministic resource keys', () => {
    expect(queryKeys.vodInfo(42, 'account-abc')).toEqual(['vod_info', 'account-abc', '42']);
    expect(queryKeys.catalog('live', 'account-abc')).toEqual(['catalog', 'live', 'account-abc']);
    expect(
      queryKeys.tmdbUpcoming('favorites', 'en-US', false, 'w500', true, 14, '2026-08-23'),
    ).not.toEqual(
      queryKeys.tmdbUpcoming('favorites', 'en-US', false, 'w500', false, 14, '2026-08-23'),
    );
    expect(queryKeys.tvmazeEpisodes(42)).toEqual(['tvmaze_episodes_v3', 42]);
    expect(queryKeys.tmdbExternalIds(1399)).toEqual(['tmdb_external_ids', 1399]);
    expect(queryKeys.introDbSegments('tt0944947', 1, 1)).toEqual([
      'introdb_segments',
      'tt0944947',
      1,
      1,
    ]);
  });
});
