import { describe, expect, it } from 'vitest';
import {
  generateM3u,
  getM3uSeriesGroups,
  parseM3u,
  parseM3uEpisodeTitle,
} from '@/modules/sources/data/m3uClient';
import { mapM3uCatalog } from '@/modules/catalog/data/useCatalog';
import { useSourceStore } from '@/modules/sources/store/useSourceStore';
import { playableFromMediaItem } from '@/modules/playback/lib/playback';

describe('M3U parsing and catalog mapping', () => {
  it('parses extended metadata, guide URLs, relative URLs, and request headers', () => {
    const playlist = parseM3u(
      `\uFEFF#EXTM3U x-tvg-url="guide.xml" playlist-name="Living Room"
#EXTINF:-1 tvg-id="news.de" tvg-name="News" tvg-logo="https://img.test/news.png" tvg-chno="7" group-title="DE | News",DE - News HD
#EXTVLCOPT:http-user-agent=Movena Test
#EXTHTTP:{"Referer":"https://portal.test/"}
streams/news.m3u8|Origin=https%3A%2F%2Fportal.test
`,
      {
        sourceId: 'm3u-source-a',
        baseUrl: 'https://provider.test/path/list.m3u',
        headers: { 'User-Agent': 'Source Default', Cookie: 'session=one' },
      },
    );

    expect(playlist.name).toBe('Living Room');
    expect(playlist.epgUrls).toEqual(['https://provider.test/path/guide.xml']);
    expect(playlist.entries).toHaveLength(1);
    expect(playlist.entries[0]).toMatchObject({
      title: 'DE - News HD',
      url: 'https://provider.test/path/streams/news.m3u8',
      type: 'live',
      tvgId: 'news.de',
      logo: 'https://img.test/news.png',
      channelNumber: '7',
      groupTitle: 'DE | News',
      headers: {
        'User-Agent': 'Movena Test',
        Referer: 'https://portal.test/',
        Origin: 'https://portal.test',
        Cookie: 'session=one',
      },
    });
  });

  it('classifies explicit VOD and episode entries while keeping ambiguous streams live', () => {
    const playlist = parseM3u(
      `#EXTM3U
#EXTINF:7200 group-title="Movies" year="2024" rating="8.2",Feature Film (2024)
https://media.test/movie.mp4
#EXTINF:-1 group-title="Series",Northern Lights S01E02 - Arrival
https://media.test/series/s01e02.mkv
#EXTINF:-1 group-title="Series",Northern Lights S01E01 - Pilot
https://media.test/series/s01e01.mkv
`,
      { sourceId: 'm3u-source-b' },
    );

    expect(playlist.entries.map((entry) => entry.type)).toEqual(['vod', 'series', 'series']);
    expect(parseM3uEpisodeTitle('Northern Lights S02E03 - Aurora')).toMatchObject({
      seriesTitle: 'Northern Lights',
      seasonNumber: 2,
      episodeNumber: 3,
      episodeTitle: 'Aurora',
    });
    expect(mapM3uCatalog(playlist, 'live')).toEqual([]);
    expect(mapM3uCatalog(playlist, 'vod')[0]).toMatchObject({
      year: '2024',
      rating: 8.2,
      streamUrl: 'https://media.test/movie.mp4',
      type: 'vod',
    });
    expect(mapM3uCatalog(playlist, 'series')).toEqual([
      expect.objectContaining({ type: 'series', title: 'Northern Lights' }),
    ]);
  });

  it('keeps ambiguous vendor paths on the live-player route', () => {
    const playlist = parseM3u(
      `#EXTM3U
#EXTINF:-1 group-title="Germany",Country Channel
https://media.test/live/user/pass/10.ts
#EXTINF:-1 group-title="German",Library Film
https://media.test/movie/user/pass/20.ts
#EXTINF:-1 group-title="German",Library Show Episode
https://media.test/series/user/pass/30.ts
`,
      { sourceId: 'm3u-source-paths' },
    );

    expect(playlist.entries.map((entry) => entry.type)).toEqual(['live', 'live', 'live']);
  });

  it('keeps simultaneously enabled playlists distinct in a merged live catalog', () => {
    const livingRoom = parseM3u(
      `#EXTM3U
#EXTINF:-1 tvg-id="shared.channel",Shared Channel
https://one.test/live.m3u8
`,
      { sourceId: 'm3u-living-room' },
    );
    const garden = parseM3u(
      `#EXTM3U
#EXTINF:-1 tvg-id="shared.channel",Shared Channel
https://two.test/live.m3u8
`,
      { sourceId: 'm3u-garden' },
    );

    const merged = [
      ...mapM3uCatalog(livingRoom, 'live', 'Living Room'),
      ...mapM3uCatalog(garden, 'live', 'Garden'),
    ];

    expect(merged).toHaveLength(2);
    expect(new Set(merged.map((item) => item.id)).size).toBe(2);
    expect(merged.map((item) => [item.sourceId, item.subtitle])).toEqual([
      ['m3u-living-room', 'Living Room'],
      ['m3u-garden', 'Garden'],
    ]);
  });

  it('restores stripped library transport from the validated source runtime', () => {
    const playlist = parseM3u(
      `#EXTM3U
#EXTINF:-1 group-title="News",Secure Channel
#EXTVLCOPT:http-user-agent=Provider App
https://media.test/live/token/10.ts
`,
      { sourceId: 'm3u-source-cache' },
    );
    useSourceStore.setState({
      runtimes: {
        'm3u-source-cache': {
          connection: null,
          playlist,
          status: 'ready',
          error: null,
          revision: 1,
        },
      },
    });
    const savedItem = {
      ...mapM3uCatalog(playlist, 'live')[0]!,
      streamUrl: undefined,
      httpHeaders: undefined,
    };

    expect(playableFromMediaItem(savedItem, null)).toMatchObject({
      streamUrl: 'https://media.test/live/token/10.ts',
      httpHeaders: { 'User-Agent': 'Provider App' },
    });
  });

  it('keeps duplicate entries addressable and reports incomplete entries', () => {
    const playlist = parseM3u(
      `#EXTM3U
#EXTINF:-1,Channel
https://media.test/live
#EXTINF:-1,Channel
https://media.test/live
#EXTINF:-1,Missing
`,
      { sourceId: 'm3u-source-c' },
    );

    expect(playlist.entries).toHaveLength(2);
    expect(playlist.entries[0]!.id).not.toBe(playlist.entries[1]!.id);
    expect(playlist.warnings).toContain('The final playlist entry has no media URL');
  });

  it('rejects HLS media manifests and empty playlists', () => {
    expect(() =>
      parseM3u('#EXTM3U\n#EXT-X-TARGETDURATION:6\nsegment.ts', { sourceId: 'm3u-hls' }),
    ).toThrow('HLS stream manifest');
    expect(() => parseM3u('#EXTM3U\n# comment', { sourceId: 'm3u-empty' })).toThrow(
      'does not contain any playable items',
    );
  });

  it('groups and orders series episodes correctly with getM3uSeriesGroups', () => {
    const playlist = parseM3u(
      `#EXTM3U
#EXTINF:-1 group-title="Series",Show S01E03 - Third
https://media.test/show/s01e03.mkv
#EXTINF:-1 group-title="Series",Show S01E01 - Pilot
https://media.test/show/s01e01.mkv
#EXTINF:-1 group-title="Series",Show S01E02 - Second
https://media.test/show/s01e02.mkv
`,
      { sourceId: 'm3u-series-test' },
    );

    const groups = getM3uSeriesGroups(playlist);
    expect(groups.size).toBe(1);
    const episodes = Array.from(groups.values())[0]!;
    expect(episodes).toHaveLength(3);
    expect(episodes.map((ep) => ep.episode?.episodeNumber)).toEqual([1, 2, 3]);
  });

  it('serializes M3U playlists with generateM3u and preserves roundtrip metadata', () => {
    const sourceContent = `#EXTM3U x-tvg-url="https://epg.test/guide.xml" playlist-name="Living Room"
#EXTINF:-1 tvg-id="cnn.us" tvg-name="CNN" tvg-logo="https://img.test/cnn.png" tvg-chno="10" group-title="News" catchup="append" catchup-days="3" radio="true",CNN HD
#EXTGRP:News
#EXTVLCOPT:http-user-agent=MovenaTest
#EXTVLCOPT:http-referrer=https://portal.test/
https://stream.test/live/cnn.m3u8
#EXTINF:5400 group-title="Cinema" year="2023" rating="7.5",Action Movie (2023)
#EXTGRP:Cinema
https://stream.test/vod/action.mp4
`;
    const parsed = parseM3u(sourceContent, { sourceId: 'test-src' });
    const generated = generateM3u({
      name: parsed.name,
      epgUrls: parsed.epgUrls,
      entries: parsed.entries,
    });

    expect(generated).toContain('#EXTM3U');
    expect(generated).toContain('x-tvg-url="https://epg.test/guide.xml"');
    expect(generated).toContain('playlist-name="Living Room"');
    expect(generated).toContain('tvg-id="cnn.us"');
    expect(generated).toContain('tvg-logo="https://img.test/cnn.png"');
    expect(generated).toContain('tvg-chno="10"');
    expect(generated).toContain('group-title="News"');
    expect(generated).toContain('#EXTGRP:News');
    expect(generated).toContain('https://stream.test/live/cnn.m3u8');
    expect(generated).toContain('https://stream.test/vod/action.mp4');

    const roundtrip = parseM3u(generated, { sourceId: 'test-src-roundtrip' });
    expect(roundtrip.name).toBe('Living Room');
    expect(roundtrip.epgUrls).toEqual(['https://epg.test/guide.xml']);
    expect(roundtrip.entries).toHaveLength(2);
    expect(roundtrip.entries[0]!.title).toBe('CNN HD');
    expect(roundtrip.entries[0]!.tvgId).toBe('cnn.us');
    expect(roundtrip.entries[0]!.radio).toBe(true);
    expect(roundtrip.entries[1]!.type).toBe('vod');
  });

  it('roundtrips editor metadata, custom headers, unknown attributes, and directives', () => {
    const parsed = parseM3u(
      `#EXTM3U provider="demo"
# provider-comment
#EXTINF:-1 group-title="News" description="Morning news" catchup-source="https://archive.test/{utc}" vendor-id="42",Morning
#VENDOROPT:keep-me
#EXTHTTP:{"Origin":"https://portal.test","Cookie":"session=redacted"}
https://stream.test/morning.m3u8
`,
      { sourceId: 'editor-roundtrip' },
    );
    parsed.entries[0]!.type = 'vod';
    const generated = generateM3u(parsed);
    const roundtrip = parseM3u(generated, { sourceId: 'editor-roundtrip-2' });

    expect(roundtrip.extraHeaderAttributes).toEqual({ provider: 'demo' });
    expect(roundtrip.extraDirectives).toContain('# provider-comment');
    expect(roundtrip.entries[0]!.description).toBe('Morning news');
    expect(roundtrip.entries[0]!.catchupSource).toBe('https://archive.test/{utc}');
    expect(roundtrip.entries[0]!.extraAttributes).toEqual({ 'vendor-id': '42' });
    expect(roundtrip.entries[0]!.extraDirectives).toContain('#VENDOROPT:keep-me');
    expect(roundtrip.entries[0]!.headers).toMatchObject({
      Origin: 'https://portal.test',
      Cookie: 'session=redacted',
    });
    expect(roundtrip.entries[0]!.type).toBe('vod');
  });

  it('removes unknown header and entry metadata when preservation is disabled', () => {
    const parsed = parseM3u(
      `#EXTM3U provider="demo"
# provider-comment
#EXTINF:-1 group-title="News" vendor-id="42",Morning
#VENDOROPT:keep-me
https://stream.test/morning.m3u8
`,
      { sourceId: 'normalized-export' },
    );

    const generated = generateM3u({ ...parsed, preserveUnknownTags: false });

    expect(generated).not.toContain('provider="demo"');
    expect(generated).not.toContain('# provider-comment');
    expect(generated).not.toContain('vendor-id="42"');
    expect(generated).not.toContain('#VENDOROPT:keep-me');
    expect(generated).toContain('group-title="News"');
    expect(generated).toContain('https://stream.test/morning.m3u8');
  });

  it('uses source request headers at runtime without exporting them into the playlist', () => {
    const parsed = parseM3u(
      `#EXTM3U
#EXTINF:-1,Protected stream
https://stream.test/live.m3u8
`,
      {
        sourceId: 'protected-source',
        headers: { Authorization: 'Bearer secret', Referer: 'https://portal.test/private' },
      },
    );

    expect(parsed.entries[0]!.headers).toMatchObject({ Authorization: 'Bearer secret' });
    const generated = generateM3u(parsed);
    expect(generated).not.toContain('Authorization');
    expect(generated).not.toContain('Bearer secret');
    expect(generated).not.toContain('portal.test/private');
  });

  it('preserves an entry header that explicitly overrides a source header', () => {
    const parsed = parseM3u(
      `#EXTM3U
#EXTINF:-1,Override
#EXTVLCOPT:http-user-agent=Entry Agent
https://stream.test/live.m3u8
`,
      { sourceId: 'override-source', headers: { 'User-Agent': 'Source Agent' } },
    );

    expect(generateM3u(parsed)).toContain('#EXTVLCOPT:http-user-agent=Entry Agent');
  });
});
