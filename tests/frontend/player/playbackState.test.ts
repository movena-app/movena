import { describe, expect, it } from 'vitest';
import {
  acceptsPlaybackObservation,
  classifyStartupTimeout,
  createIdlePlaybackState,
  reducePlaybackState,
} from '@/modules/playback/lib/playbackState';

const started = (generation = 1, at = 1_000) =>
  reducePlaybackState(createIdlePlaybackState(), { type: 'session-started', generation, at }).state;

const property = (
  state: ReturnType<typeof started>,
  name: 'vo-configured' | 'pause' | 'paused-for-cache' | 'seeking' | 'time-pos' | 'eof-reached',
  value: unknown,
  at = 1_100,
) =>
  reducePlaybackState(state, {
    type: 'mpv-property',
    generation: state.generation!,
    name,
    value,
    at,
  }).state;

describe('playback state machine', () => {
  it('starts in idle and enters loading for a new session', () => {
    const initial = createIdlePlaybackState();
    expect(initial.status).toBe('idle');

    const transition = reducePlaybackState(initial, {
      type: 'session-started',
      generation: 3,
      at: 500,
    });

    expect(transition).toEqual({
      accepted: true,
      state: expect.objectContaining({
        generation: 3,
        status: 'loading',
        startedAt: 500,
        videoReady: false,
      }),
    });
  });

  it('becomes playing only after authoritative video readiness', () => {
    let state = started();
    state = property(state, 'vo-configured', true);

    expect(state.status).toBe('playing');
    expect(state.videoReady).toBe(true);
  });

  it('keeps pause authoritative without inventing a paused lifecycle state', () => {
    let state = property(started(), 'vo-configured', true);
    state = property(state, 'pause', true);

    expect(state).toMatchObject({ status: 'playing', paused: true });
  });

  it('moves between buffering and playing from cache-pause observations', () => {
    let state = property(started(), 'vo-configured', true);
    state = property(state, 'paused-for-cache', true);
    expect(state.status).toBe('buffering');

    state = property(state, 'paused-for-cache', false);
    expect(state.status).toBe('playing');
  });

  it('models seek start and completion as authoritative seeking transitions', () => {
    let state = property(started(), 'vo-configured', true);
    state = property(state, 'seeking', true);
    expect(state.status).toBe('seeking');

    state = property(state, 'seeking', false);
    expect(state.status).toBe('playing');
  });

  it('records the first valid position but ignores malformed positions', () => {
    let state = started();
    state = property(state, 'time-pos', Number.NaN, 1_200);
    expect(state.hasPosition).toBe(false);

    state = property(state, 'time-pos', 0, 1_300);
    expect(state).toMatchObject({ hasPosition: true, firstPositionAt: 1_300 });
  });

  it('transitions to ended only on an authoritative EOF observation', () => {
    let state = property(started(), 'vo-configured', true);
    state = property(state, 'eof-reached', false);
    expect(state.status).toBe('playing');

    state = property(state, 'eof-reached', true);
    expect(state.status).toBe('ended');
  });

  it('classifies a startup timeout and does not timeout a ready session', () => {
    const loading = started(4, 10_000);
    expect(classifyStartupTimeout(loading, 14_999, 5_000)).toBeNull();

    const timeout = classifyStartupTimeout(loading, 15_000, 5_000);
    expect(timeout).toEqual({
      code: 'startup-timeout',
      message: 'Playback did not become ready within 5000ms.',
      at: 15_000,
    });

    const ready = property(loading, 'vo-configured', true, 10_100);
    expect(classifyStartupTimeout(ready, 30_000, 5_000)).toBeNull();
  });

  it('turns an accepted startup timeout into an error state', () => {
    const transition = reducePlaybackState(started(5, 1_000), {
      type: 'startup-timeout',
      generation: 5,
      at: 6_000,
      timeoutMs: 5_000,
    });

    expect(transition).toMatchObject({
      accepted: true,
      state: {
        status: 'error',
        error: { code: 'startup-timeout', at: 6_000 },
      },
    });
  });

  it('classifies startup and post-start native failures separately', () => {
    const startup = reducePlaybackState(started(), {
      type: 'error',
      generation: 1,
      phase: 'startup',
      message: 'decoder unavailable',
      at: 1_500,
    }).state;
    expect(startup.error?.code).toBe('startup-failed');

    const playback = reducePlaybackState(property(started(), 'vo-configured', true), {
      type: 'error',
      generation: 1,
      phase: 'playback',
      message: 'connection lost',
      at: 2_000,
    }).state;
    expect(playback.error?.code).toBe('playback-failed');
  });

  it('rejects stale observations without mutating the current session', () => {
    const current = property(started(8), 'vo-configured', true);
    const stale = reducePlaybackState(current, {
      type: 'mpv-property',
      generation: 7,
      name: 'paused-for-cache',
      value: true,
      at: 2_000,
    });

    expect(
      acceptsPlaybackObservation(current, {
        type: 'mpv-property',
        generation: 7,
        name: 'time-pos',
        value: 20,
      }),
    ).toBe(false);
    expect(stale).toEqual({
      accepted: false,
      rejection: 'stale-session',
      state: current,
    });
  });

  it('accepts a newer session and rejects a repeated or older session start', () => {
    const current = started(10);
    expect(
      reducePlaybackState(current, {
        type: 'session-started',
        generation: 9,
        at: 2_000,
      }).accepted,
    ).toBe(false);
    expect(
      reducePlaybackState(current, {
        type: 'session-started',
        generation: 10,
        at: 2_000,
      }).accepted,
    ).toBe(false);

    const next = reducePlaybackState(current, {
      type: 'session-started',
      generation: 11,
      at: 2_000,
    });
    expect(next).toMatchObject({ accepted: true, state: { generation: 11, status: 'loading' } });
  });
});
