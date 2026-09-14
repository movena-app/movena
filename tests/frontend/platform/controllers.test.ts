import { describe, expect, it } from 'vitest';
import {
  formatBitrate,
  formatByteRate,
  formatDebugTime,
  formatMilliseconds,
  formatSignedMilliseconds,
  playerPhase,
  searchableDetails,
} from '@/modules/diagnostics/components/debugOverlayModel';
import {
  emptyPlaylist,
  emptyRawEditorViewState,
  legacyDraftKey,
  playlistSnapshot,
} from '@/modules/m3u-editor/components/m3uEditorController';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';

const number = (value: number, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat('en', options).format(value);

describe('debug overlay model', () => {
  it('formats time and transfer measurements at their boundaries', () => {
    expect(formatDebugTime(Number.NaN)).toBe('—');
    expect(formatDebugTime(65.9)).toBe('1:05');
    expect(formatDebugTime(3661)).toBe('1:01:01');
    expect(formatMilliseconds(undefined, number)).toBe('—');
    expect(formatMilliseconds(250, number)).toBe('250 ms');
    expect(formatMilliseconds(1500, number)).toBe('1.50 s');
    expect(formatBitrate(undefined, number)).toBe('—');
    expect(formatBitrate(900_000, number)).toBe('900 kbps');
    expect(formatBitrate(2_000_000, number)).toBe('2.00 Mbps');
    expect(formatByteRate(900_000, number)).toBe('900 kB/s');
    expect(formatByteRate(2_000_000, number)).toBe('2.00 MB/s');
    expect(formatSignedMilliseconds(0.125, number)).toBe('+125.0 ms');
  });

  it('classifies player phases and searchable log details', () => {
    const state = usePlayerStore.getState();
    expect(playerPhase({ ...state, activeStream: null })).toBe('Idle');
    const activeStream = {
      id: 'stream',
      title: 'Stream',
      streamUrl: 'https://media.test/live',
      type: 'live' as const,
    };
    expect(playerPhase({ ...state, activeStream, eofReached: true })).toBe('Ended');
    expect(playerPhase({ ...state, activeStream, eofReached: false, isVideoReady: false })).toBe(
      'Starting',
    );
    expect(
      playerPhase({
        ...state,
        activeStream,
        eofReached: false,
        isVideoReady: true,
        isBuffering: true,
      }),
    ).toBe('Buffering');
    expect(
      playerPhase({
        ...state,
        activeStream,
        eofReached: false,
        isVideoReady: true,
        isBuffering: false,
        isPlaying: true,
      }),
    ).toBe('Playing');
    expect(
      searchableDetails({
        id: '1',
        timestamp: 0,
        level: 'info',
        category: 'system',
        message: 'ok',
      }),
    ).toBe('');
    expect(
      searchableDetails({
        id: '2',
        timestamp: 0,
        level: 'info',
        category: 'system',
        message: 'ok',
        details: { safe: true },
      }),
    ).toBe('{"safe":true}');
  });
});

describe('M3U editor controller', () => {
  it('creates isolated empty state and stable draft keys', () => {
    expect(emptyPlaylist()).toEqual({ entries: [], epgUrls: [], warnings: [] });
    expect(emptyRawEditorViewState()).toEqual({
      selectionStart: 0,
      selectionEnd: 0,
      scrollTop: 0,
      scrollLeft: 0,
    });
    expect(legacyDraftKey('source-1')).toBe('movena-m3u-editor-draft-v1:source-1');
  });

  it('snapshots playlist collections without materializing absent metadata', () => {
    const minimal = playlistSnapshot({ entries: [], epgUrls: [], warnings: [] });
    expect(minimal).toEqual({ entries: [], epgUrls: [], warnings: [] });
    const complete = playlistSnapshot({
      name: 'Living Room',
      entries: [],
      epgUrls: ['https://guide.test/xmltv'],
      warnings: ['warning'],
      extraHeaderAttributes: { owner: 'movena' },
      extraDirectives: ['#PLAYLIST:Living Room'],
    });
    expect(complete.name).toBe('Living Room');
    expect(complete.extraDirectives).toEqual(['#PLAYLIST:Living Room']);
  });
});
