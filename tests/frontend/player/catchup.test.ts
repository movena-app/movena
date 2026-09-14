import { describe, expect, it } from 'vitest';
import {
  buildXtreamCatchupUrl,
  evaluateCatchupWindow,
  getM3uCatchupMode,
  isM3uCatchupPlaybackSupported,
  isXtreamCatchupProgrammeEligible,
  isXtreamCatchupSupported,
  isWithinCatchupWindow,
  parseCatchupTimestamp,
  resolveM3uCatchupUrl,
  resolveXtreamCatchupUrl,
} from '@/modules/playback/lib/catchup';

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0);
const programme = {
  start: '20260812100000 +0000',
  end: '20260812103000 +0000',
};

describe('catch-up helpers', () => {
  it('parses Unix seconds, milliseconds, ISO, and XMLTV timestamps', () => {
    expect(parseCatchupTimestamp(Number.NaN)).toBeNull();
    expect(parseCatchupTimestamp('1786532400')).toBe(1_786_532_400_000);
    expect(parseCatchupTimestamp(1_786_532_400_000)).toBe(1_786_532_400_000);
    expect(parseCatchupTimestamp('2026-08-12T10:00:00Z')).toBe(Date.UTC(2026, 7, 12, 10));
    expect(parseCatchupTimestamp('20260812100000 +0200')).toBe(Date.UTC(2026, 7, 12, 8));
    expect(parseCatchupTimestamp('not-a-time')).toBeNull();
    expect(parseCatchupTimestamp('20260230100000 +0000')).toBeNull();
  });

  it('gates programmes by archive age and future time', () => {
    expect(isWithinCatchupWindow(programme.start, 1, NOW)).toBe(true);
    expect(isWithinCatchupWindow('20260810000000 +0000', 1, NOW)).toBe(false);
    expect(isWithinCatchupWindow('20260812130000 +0000', 7, NOW)).toBe(false);
    expect(evaluateCatchupWindow(programme, 1, { now: NOW, requireEnded: true })).toMatchObject({
      eligible: true,
      reason: 'eligible',
    });
    expect(
      evaluateCatchupWindow({ start: '20260812113000 +0000', end: '20260812123000 +0000' }, 1, {
        now: NOW,
        requireEnded: true,
      }).reason,
    ).toBe('not-ended');
    expect(evaluateCatchupWindow(programme, 'bad', { now: NOW }).reason).toBe(
      'invalid-archive-days',
    );
  });

  it('recognises Xtream archive eligibility and builds a safe timeshift URL', () => {
    const stream = { stream_id: 42, tv_archive: 1, tv_archive_duration: 7 } as const;
    const credentials = {
      url: 'https://provider.test:443/base',
      username: 'user name',
      password: 'secret',
    };
    expect(isXtreamCatchupSupported(stream)).toBe(true);
    expect(isXtreamCatchupProgrammeEligible(stream, programme, { now: NOW })).toBe(true);
    expect(
      resolveXtreamCatchupUrl(stream, credentials, programme, { now: NOW, extension: 'm3u8' }),
    ).toBe('https://provider.test/base/timeshift/user%20name/secret/30/2026-08-12:10-00/42.m3u8');
    expect(
      buildXtreamCatchupUrl({ ...credentials, url: 'javascript:alert(1)' }, 42, programme, {
        now: NOW,
      }),
    ).toBeNull();
    expect(
      isXtreamCatchupProgrammeEligible({ ...stream, tv_archive: 0 }, programme, { now: NOW }),
    ).toBe(false);
  });

  it('supports M3U shift, default templates, append, and Flussonic date tokens', () => {
    const base = { url: 'https://provider.test/live/channel.m3u8', catchupDays: 7 } as const;
    expect(getM3uCatchupMode({ ...base, catchup: 'shift' })).toBe('shift');
    expect(isM3uCatchupPlaybackSupported({ ...base, catchup: 'shift' })).toBe(true);
    expect(resolveM3uCatchupUrl({ ...base, catchup: 'shift' }, programme, NOW)).toBe(
      'https://provider.test/live/channel.m3u8?utc=1786528800&lutc=1786536000',
    );

    expect(
      resolveM3uCatchupUrl(
        {
          ...base,
          catchup: 'default',
          catchupSource:
            'https://archive.test/video-${start}-${duration}.m3u8?from={utc}&to={utcend}',
        },
        programme,
        NOW,
      ),
    ).toBe('https://archive.test/video-1786528800-1800.m3u8?from=1786528800&to=1786530600');
    expect(
      resolveM3uCatchupUrl(
        {
          ...base,
          catchup: 'append',
          catchupSource: 'https://archive.test/channel?token=keep',
        },
        programme,
        NOW,
      ),
    ).toContain('token=keep');
    expect(
      resolveM3uCatchupUrl(
        {
          ...base,
          catchup: 'append',
          catchupSource: '?start=${start}&duration=${duration}',
        },
        programme,
        NOW,
      ),
    ).toBe('https://provider.test/live/channel.m3u8?start=1786528800&duration=1800');
    expect(
      resolveM3uCatchupUrl(
        {
          ...base,
          catchup: 'flussonic',
          catchupSource: 'https://archive.test/{Y}-{m}-{d}:{H}-{M}/channel.m3u8',
        },
        programme,
        NOW,
      ),
    ).toBe('https://archive.test/2026-08-12:10-00/channel.m3u8');
  });

  it('rejects malformed, unsupported, and unsafe M3U input', () => {
    const programmeEntry = {
      url: 'https://provider.test/live.m3u8',
      catchup: 'default',
      catchupDays: 7,
    } as const;
    expect(getM3uCatchupMode({ ...programmeEntry, catchupSource: 'javascript:alert(1)' })).toBe(
      'none',
    );
    expect(
      resolveM3uCatchupUrl(
        { ...programmeEntry, catchupSource: 'https://archive.test/\nX-Injected: true' },
        programme,
        NOW,
      ),
    ).toBeNull();
    expect(
      resolveM3uCatchupUrl(
        { ...programmeEntry, catchupSource: 'https://archive.test/{unknown}' },
        programme,
        NOW,
      ),
    ).toBe('https://archive.test/%7Bunknown%7D');
    expect(
      resolveM3uCatchupUrl({ ...programmeEntry, catchupSource: '' }, { start: 'bad' }, NOW),
    ).toBeNull();
    expect(
      isM3uCatchupPlaybackSupported({ url: 'file:///channel', catchup: 'shift', catchupDays: 7 }),
    ).toBe(false);
  });
});
