import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findIntroChapter, findOutroChapter } from '@/modules/playback/lib/chapters';
import { findNextEpisode } from '@/modules/playback/lib/seriesNavigation';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';

describe('playback domain logic', () => {
  beforeEach(() => usePlayerStore.getState().closePlayer());
  afterEach(() => vi.restoreAllMocks());

  it('advances across season boundaries', () => {
    const result = findNextEpisode(
      {
        '1': [{ id: 10, episode_num: 1 }],
        '2': [{ id: 20, episode_num: 1 }],
      },
      10,
      1,
    );

    expect(result).toEqual({ episode: { id: 20, episode_num: 1 }, seasonNum: '2' });
  });

  it('uses real chapter boundaries for intro and credits actions', () => {
    const chapters = [
      { title: 'Intro', time: 5 },
      { title: 'Episode', time: 91 },
      { title: 'End Credits', time: 2400 },
    ];

    expect(findIntroChapter(chapters)).toEqual({ start: 5, skipTo: 91 });
    expect(findOutroChapter(chapters)).toEqual({ start: 2400 });
  });

  it('treats mpv property changes as authoritative state', () => {
    const store = usePlayerStore.getState();
    store.playStream({
      id: 'stream-1',
      title: 'Example',
      type: 'vod',
      streamUrl: 'https://example.test/video',
    });
    store.updateFromMpvEvent('time-pos', 12.5);
    store.updateFromMpvEvent('pause', true);
    store.updateFromMpvEvent('volume', 0);
    store.updateFromMpvEvent('vo-configured', true);
    store.updateFromMpvEvent('paused-for-cache', true);
    store.updateFromMpvEvent('sub-visibility', true);

    const state = usePlayerStore.getState();
    expect(state.currentTime).toBe(12.5);
    expect(state.isBuffering).toBe(true);
    expect(state.isPlaying).toBe(false);
    expect(state.isMuted).toBe(true);
    expect(state.isVideoReady).toBe(true);
    expect(state.subtitlesVisible).toBe(true);
  });

  it('clears authoritative buffering when mpv resumes from cache pause', () => {
    const store = usePlayerStore.getState();
    store.updateFromMpvEvent('paused-for-cache', true);
    expect(usePlayerStore.getState().isBuffering).toBe(true);

    store.updateFromMpvEvent('paused-for-cache', false);
    expect(usePlayerStore.getState().isBuffering).toBe(false);
  });

  it('rejects malformed track entries from native events', () => {
    usePlayerStore
      .getState()
      .setTrackList([
        null,
        { id: 'wrong', type: 'audio' },
        { id: 2, type: 'audio', selected: true },
        { id: 3, type: 'sub', selected: true },
      ]);

    const state = usePlayerStore.getState();
    expect(state.audioTracks.map((track) => track.id)).toEqual([2]);
    expect(state.subtitleTracks.map((track) => track.id)).toEqual([3]);
    expect(state.currentAudioTrack).toBe(2);
    expect(state.currentSubTrack).toBe(3);
  });

  it('normalizes video and codec metadata from native track nodes', () => {
    usePlayerStore.getState().setTrackList([
      {
        id: 1,
        type: 'video',
        selected: true,
        codec: 'h264',
        'codec-desc': 'H.264',
        'codec-profile': 'High',
      },
      { id: 2, type: 'audio', codec: 'aac', 'decoder-desc': 'AAC decoder' },
    ]);

    expect(usePlayerStore.getState().videoTracks).toEqual([
      expect.objectContaining({
        id: 1,
        codec: 'h264',
        codecDescription: 'H.264',
        codecProfile: 'High',
      }),
    ]);
    expect(usePlayerStore.getState().audioTracks[0]).toEqual(
      expect.objectContaining({ codec: 'aac', decoderDescription: 'AAC decoder' }),
    );
  });

  it('tracks startup, seek, and post-start rebuffer timings from authoritative events', () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const store = usePlayerStore.getState();
    store.playStream({
      id: 'timed',
      title: 'Timed',
      type: 'vod',
      streamUrl: 'https://example.test',
    });

    now = 1_120;
    store.markMpvStartCompleted();
    store.updateFromMpvEvent('paused-for-cache', true);
    expect(usePlayerStore.getState().diagnostics.rebufferCount).toBe(0);

    now = 1_400;
    store.updateFromMpvEvent('vo-configured', true);
    now = 1_600;
    store.updateFromMpvEvent('time-pos', 0.1);
    now = 2_000;
    store.updateFromMpvEvent('seeking', true);
    now = 2_250;
    store.updateFromMpvEvent('seeking', false);
    now = 3_000;
    store.updateFromMpvEvent('paused-for-cache', true);
    now = 3_450;
    store.updateFromMpvEvent('paused-for-cache', false);

    expect(usePlayerStore.getState().diagnostics).toMatchObject({
      mpvStartMs: 120,
      videoReadyMs: 400,
      firstPositionMs: 600,
      lastSeekMs: 250,
      rebufferCount: 1,
      totalRebufferMs: 450,
      rebufferStartedAt: null,
    });
  });

  it('sanitizes and caps one-second native diagnostic samples', () => {
    const store = usePlayerStore.getState();
    for (let index = 0; index < 65; index += 1) {
      store.updateFromMpvEvent('diagnostic-sample', {
        'hwdec-current': 'd3d11va',
        'video-params': { w: 1920, h: 1080, pixelformat: 'nv12', primaries: 'bt.709' },
        'audio-params': { format: 'float', samplerate: 48000, channels: 'stereo' },
        'demuxer-cache-duration': index,
        'cache-speed': 1_000_000,
        'frame-drop-count': 2,
        path: 'must-not-be-stored',
      });
    }

    const diagnostics = usePlayerStore.getState().diagnostics;
    expect(diagnostics.samples).toHaveLength(60);
    expect(diagnostics.samples[0]!.cacheDurationSeconds).toBe(5);
    expect(diagnostics.hardwareDecoder).toBe('d3d11va');
    expect(diagnostics.videoParams).toMatchObject({
      width: 1920,
      height: 1080,
      pixelFormat: 'nv12',
    });
    expect(diagnostics.audioParams).toMatchObject({ sampleRate: 48000, channels: 'stereo' });
    expect(JSON.stringify(diagnostics)).not.toContain('must-not-be-stored');
  });

  it('tracks subtitle visibility independently from the selected decoded track', () => {
    const store = usePlayerStore.getState();
    store.setTrackList([{ id: 3, type: 'sub', selected: true }]);
    store.updateFromMpvEvent('sub-visibility', false);

    const state = usePlayerStore.getState();
    expect(state.currentSubTrack).toBe(3);
    expect(state.subtitlesVisible).toBe(false);
  });

  it('resets session-derived state when replacing a stream', () => {
    const store = usePlayerStore.getState();
    store.updateFromMpvEvent('duration', 300);
    store.updateFromMpvEvent('speed', 1.5);
    store.updateFromMpvEvent('eof-reached', true);
    store.playStream({
      id: 'new',
      title: 'New',
      type: 'live',
      streamUrl: 'https://example.test/live',
    });

    expect(usePlayerStore.getState()).toMatchObject({
      duration: 0,
      playbackSpeed: 1,
      eofReached: false,
      isBuffering: true,
      isVideoReady: false,
    });
  });

  it('ignores native observations from the replaced session', () => {
    const store = usePlayerStore.getState();
    store.playStream({
      id: 'old',
      title: 'Old',
      type: 'vod',
      streamUrl: 'https://example.test/old',
    });
    const oldSession = usePlayerStore.getState().sessionId!;
    store.playStream({
      id: 'new',
      title: 'New',
      type: 'vod',
      streamUrl: 'https://example.test/new',
    });
    const currentSession = usePlayerStore.getState().sessionId!;

    store.updateFromMpvEvent('time-pos', 99, oldSession);
    expect(usePlayerStore.getState().currentTime).toBe(0);
    store.updateFromMpvEvent('time-pos', 12, currentSession);
    expect(usePlayerStore.getState().currentTime).toBe(12);
  });

  it('sanitizes chapter lists and reacts to end-of-file only when confirmed', () => {
    const store = usePlayerStore.getState();
    store.updateFromMpvEvent('chapter-list', [
      { title: 'Intro', time: 5 },
      { title: 42, time: 10 },
      { title: 'Bad', time: '20' },
      null,
    ]);
    store.updateFromMpvEvent('eof-reached', false);

    expect(usePlayerStore.getState().chapters).toEqual([
      { title: 'Intro', time: 5 },
      { title: undefined, time: 10 },
    ]);
    expect(usePlayerStore.getState().eofReached).toBe(false);

    store.updateFromMpvEvent('eof-reached', true);
    expect(usePlayerStore.getState()).toMatchObject({ eofReached: true, isPlaying: false });
  });
});
