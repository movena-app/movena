/**
 * Pure playback lifecycle state derived from native MPV observations.
 *
 * `status` intentionally describes the transport lifecycle only. MPV's pause
 * property is kept separately because there is no paused state in the public
 * lifecycle: a paused, ready session is still the current playing session.
 */

type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'buffering' | 'seeking' | 'ended' | 'error';

type PlaybackErrorCode = 'startup-timeout' | 'startup-failed' | 'playback-failed';

export interface PlaybackError {
  code: PlaybackErrorCode;
  message: string;
  at: number;
}

export interface PlaybackState {
  /** The monotonically increasing native-player session generation. */
  generation: number | null;
  status: PlaybackStatus;
  /** True when MPV has reported that its video output is configured. */
  videoReady: boolean;
  /** The authoritative MPV pause property, independent of lifecycle status. */
  paused: boolean;
  /** The authoritative MPV cache-pause property. */
  pausedForCache: boolean;
  /** The authoritative MPV seeking property. */
  seeking: boolean;
  /** True after MPV reports a valid time position for this session. */
  hasPosition: boolean;
  startedAt: number | null;
  firstPositionAt: number | null;
  error: PlaybackError | null;
}

interface PlaybackSessionStartedObservation {
  type: 'session-started';
  generation: number;
  at?: number | undefined;
}

type MpvPlaybackProperty =
  'vo-configured' | 'pause' | 'paused-for-cache' | 'seeking' | 'time-pos' | 'eof-reached';

interface MpvPropertyObservation {
  type: 'mpv-property';
  generation: number;
  name: MpvPlaybackProperty;
  value: unknown;
  at?: number | undefined;
}

interface PlaybackEndObservation {
  type: 'end-file';
  generation: number;
  /** `eof` is a normal end; other reasons are treated as playback failures. */
  reason: 'eof' | 'stop' | 'error' | 'unknown';
  message?: string | undefined;
  at?: number | undefined;
}

interface PlaybackErrorObservation {
  type: 'error';
  generation: number;
  message: string;
  /** Startup errors use a distinct code for diagnostics and retry policy. */
  phase?: 'startup' | 'playback' | undefined;
  at?: number | undefined;
}

interface StartupTimeoutObservation {
  type: 'startup-timeout';
  generation: number;
  at?: number | undefined;
  timeoutMs?: number | undefined;
}

export type PlaybackObservation =
  | PlaybackSessionStartedObservation
  | MpvPropertyObservation
  | PlaybackEndObservation
  | PlaybackErrorObservation
  | StartupTimeoutObservation;

type PlaybackTransitionRejection = 'stale-session';

export interface PlaybackTransition {
  state: PlaybackState;
  accepted: boolean;
  rejection?: PlaybackTransitionRejection | undefined;
}

const DEFAULT_STARTUP_TIMEOUT_MS = 15_000;

export function createIdlePlaybackState(): PlaybackState {
  return {
    generation: null,
    status: 'idle',
    videoReady: false,
    paused: false,
    pausedForCache: false,
    seeking: false,
    hasPosition: false,
    startedAt: null,
    firstPositionAt: null,
    error: null,
  };
}

/**
 * Returns whether an observation belongs to the currently active session.
 * Session-start observations are special: a new generation must be greater
 * than the current one. All other observations must match exactly.
 */
export function acceptsPlaybackObservation(
  state: PlaybackState,
  observation: PlaybackObservation,
): boolean {
  if (observation.type === 'session-started') {
    return state.generation === null || observation.generation > state.generation;
  }
  return state.generation !== null && observation.generation === state.generation;
}

/**
 * Classifies a startup timeout without mutating state. A timeout is actionable
 * only while loading, before video output has become ready, and once the
 * configured startup window has elapsed.
 */
export function classifyStartupTimeout(
  state: PlaybackState,
  at: number,
  timeoutMs = DEFAULT_STARTUP_TIMEOUT_MS,
): PlaybackError | null {
  if (state.status !== 'loading' || state.videoReady || state.startedAt === null) return null;
  if (!Number.isFinite(at) || !Number.isFinite(timeoutMs) || timeoutMs < 0) return null;
  if (at - state.startedAt < timeoutMs) return null;

  return {
    code: 'startup-timeout',
    message: `Playback did not become ready within ${timeoutMs}ms.`,
    at,
  };
}

function transitionForObservation(state: PlaybackState): PlaybackStatus {
  if (state.error) return 'error';
  if (state.status === 'ended') return 'ended';
  if (state.seeking) return 'seeking';
  if (state.pausedForCache) return state.videoReady ? 'buffering' : 'loading';
  if (!state.videoReady) return 'loading';
  return 'playing';
}

function withStatus(state: PlaybackState): PlaybackState {
  return { ...state, status: transitionForObservation(state) };
}

function accepted(state: PlaybackState): PlaybackTransition {
  return { state, accepted: true };
}

function rejected(state: PlaybackState): PlaybackTransition {
  return { state, accepted: false, rejection: 'stale-session' };
}

function observationAt(observation: PlaybackObservation): number {
  return observation.at ?? Date.now();
}

/**
 * Reduces one authoritative MPV/session observation into the next lifecycle
 * state. Stale events are returned unchanged and explicitly marked rejected.
 */
export function reducePlaybackState(
  state: PlaybackState,
  observation: PlaybackObservation,
): PlaybackTransition {
  if (!acceptsPlaybackObservation(state, observation)) return rejected(state);

  if (observation.type === 'session-started') {
    const at = observationAt(observation);
    return accepted({
      generation: observation.generation,
      status: 'loading',
      videoReady: false,
      paused: false,
      pausedForCache: false,
      seeking: false,
      hasPosition: false,
      startedAt: at,
      firstPositionAt: null,
      error: null,
    });
  }

  const at = observationAt(observation);

  if (observation.type === 'startup-timeout') {
    const timeout = classifyStartupTimeout(
      state,
      at,
      observation.timeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
    );
    if (!timeout) return accepted(state);
    return accepted(withStatus({ ...state, error: timeout }));
  }

  if (observation.type === 'error') {
    return accepted(
      withStatus({
        ...state,
        error: {
          code: observation.phase === 'startup' ? 'startup-failed' : 'playback-failed',
          message: observation.message,
          at,
        },
      }),
    );
  }

  if (observation.type === 'end-file') {
    if (observation.reason === 'eof') {
      return accepted({ ...state, status: 'ended', error: null });
    }
    if (observation.reason === 'stop') {
      return accepted({ ...state, status: 'idle', error: null });
    }
    return accepted(
      withStatus({
        ...state,
        error: {
          code: 'playback-failed',
          message: observation.message ?? 'MPV ended playback unexpectedly.',
          at,
        },
      }),
    );
  }

  const next = { ...state };
  switch (observation.name) {
    case 'vo-configured':
      next.videoReady = observation.value === true;
      break;
    case 'pause':
      next.paused = observation.value === true;
      break;
    case 'paused-for-cache':
      next.pausedForCache = observation.value === true;
      break;
    case 'seeking':
      next.seeking = observation.value === true;
      break;
    case 'time-pos':
      if (typeof observation.value === 'number' && Number.isFinite(observation.value)) {
        next.hasPosition = true;
        next.firstPositionAt ??= at;
      }
      break;
    case 'eof-reached':
      if (observation.value === true) {
        next.status = 'ended';
        next.error = null;
        return accepted(next);
      }
      break;
  }

  return accepted(withStatus(next));
}

/** Convenience alias for callers that prefer reducer terminology. */
