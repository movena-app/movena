import { useCallback, useEffect, useRef, useState } from 'react';
import { desktopApi, type ResolverStatusEventData } from '@/platform/desktop';
import { tauriApi, type MpvPropertyUpdate } from '@/platform/tauri';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { debugLog, type LogLevel } from '@/modules/diagnostics/public/store/useDebugStore';
import { notify } from '@/shared/notifications/useNotificationStore';
import { applyAspectRatio } from './aspect';
import { applyImageAdjustments } from './imageSettings';
import { setPlayerFullscreen } from './fullscreen';
import { clearPlaybackRecovery, writePlaybackRecovery } from '../lib/playbackRecovery';
import { getErrorMessage } from '@/shared/lib/error';

interface EndFileData {
  reason?: 'eof' | 'stop' | 'quit' | 'error' | 'redirect' | 'unknown' | undefined;
  errorCode?: number | undefined;
  errorMessage?: string | null | undefined;
}

interface MpvLogData {
  prefix: string;
  level: string;
  text: string;
}

function formatMpvEndFileError(endFile: EndFileData): string {
  if (endFile.errorMessage?.trim()) {
    return endFile.errorCode === undefined
      ? endFile.errorMessage
      : `mpv error ${endFile.errorCode}: ${endFile.errorMessage}`;
  }
  return endFile.errorCode === undefined
    ? 'mpv ended the stream with an unknown playback error.'
    : `mpv ended the stream with error code ${endFile.errorCode}.`;
}

function formatResolverPlaybackError(log: MpvLogData): string | null {
  if (log.prefix !== 'ytdl_hook' || (log.level !== 'error' && log.level !== 'fatal')) return null;
  const message = log.text.trim();
  if (
    !message ||
    message === '[media location omitted]' ||
    /^youtube-dl failed: unexpected error occurred\.?$/i.test(message)
  )
    return null;
  if (/the channel is not currently live/i.test(message)) {
    return 'This channel is not currently live.';
  }
  return message.replace(/^ERROR:\s*/i, '');
}

function parseResolverStatus(data: unknown): ResolverStatusEventData | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  if (
    value.provider !== 'twitch' ||
    !['starting', 'ready', 'ad-break', 'failed'].includes(String(value.phase))
  )
    return null;
  const expectedDurationSeconds =
    typeof value.expectedDurationSeconds === 'number' &&
    Number.isFinite(value.expectedDurationSeconds)
      ? Math.max(1, Math.min(180, Math.round(value.expectedDurationSeconds)))
      : undefined;
  return {
    provider: 'twitch',
    phase: value.phase as ResolverStatusEventData['phase'],
    ...(expectedDurationSeconds === undefined ? {} : { expectedDurationSeconds }),
    ...(typeof value.code === 'string' ? { code: value.code } : {}),
  };
}

function formatTwitchResolverError(code: string | undefined): string {
  switch (code) {
    case 'resolver-unavailable':
      return 'The bundled Twitch resolver is unavailable.';
    case 'resolver-startup-timeout':
      return 'The Twitch resolver did not become ready in time.';
    case 'channel-offline':
      return 'This Twitch channel is not currently live.';
    case 'no-streams':
      return 'Twitch did not provide a playable live stream.';
    case 'client-integrity-unavailable':
      return 'Twitch requires a browser integrity check, but no compatible Chromium browser was available.';
    case 'malformed-loopback-response':
      return 'The Twitch resolver returned an invalid local playback address.';
    default:
      return 'The Twitch stream resolver stopped unexpectedly.';
  }
}

interface MpvSessionState {
  errorMessage: string | null;
  retryPlayback: () => void;
  isRetrying: boolean;
}

/**
 * How long `isBuffering` may stay true before it's treated as stuck rather
 * than a normal cache refill.
 *
 * Some IPTV origins/CDNs go quiet mid-stream without ever closing the
 * connection or erroring it out — no bytes arrive, but nothing tells mpv the
 * transfer is dead either, so `--network-timeout` never fires and mpv's own
 * cache sits in `paused-for-cache` forever. That is a silent stall, not a
 * playback error: no `end-file` event follows, so nothing else in this file
 * would ever recover from it on its own.
 */
const STALL_TIMEOUT_MS = 20_000;

/** Caps automatic stall recoveries per stream so a source that is genuinely
 * dead falls through to the manual "Reconnect" screen instead of retrying
 * forever in silence. */
const MAX_AUTO_STALL_RECOVERIES = 3;
const MAX_TWITCH_AD_BREAK_MS = 210_000;
const TWITCH_AD_BREAK_GRACE_MS = 30_000;
const MAX_TWITCH_AD_BREAK_RECOVERIES = 1;

/** Owns exactly one native mpv session while a stream is active. Stream
 * changes are serialized by `mpv_start`; only session exit calls `mpv_stop`. */
export function useMpvSession(): MpvSessionState {
  const activeStream = usePlayerStore((state) => state.activeStream);
  const isVideoReady = usePlayerStore((state) => state.isVideoReady);
  const streamFailoverEnabled = useSettingsStore((s) => s.streamFailoverEnabled);
  const maxStreamFailovers = useSettingsStore((s) => s.maxStreamFailovers);
  const audioDelayMs = useSettingsStore((s) => s.audioDelayMs);
  const subtitleFontSize = useSettingsStore((s) => s.subtitleFontSize);
  const subtitleFontFamily = useSettingsStore((s) => s.subtitleFontFamily);
  const subtitleOpacity = useSettingsStore((s) => s.subtitleOpacity);
  const subtitleBorderSize = useSettingsStore((s) => s.subtitleBorderSize);
  const subtitleShadowOffset = useSettingsStore((s) => s.subtitleShadowOffset);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [restartNonce, setRestartNonce] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const listenerReadyRef = useRef<Promise<() => void> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackRef = useRef<() => boolean>(() => false);
  const autoRecoveryCountRef = useRef(0);
  const fallbackAttemptsRef = useRef(0);
  const playbackErrorsRef = useRef<string[]>([]);
  const resolverErrorRef = useRef<string | null>(null);
  const twitchBreakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const twitchBreakRecoveryCountRef = useRef(0);
  const twitchBreakStartPositionRef = useRef(0);
  const twitchBreakSawBufferingRef = useRef(false);
  const hasActiveStream = Boolean(activeStream);

  const recordPlaybackError = useCallback((message: string) => {
    if (!playbackErrorsRef.current.includes(message)) playbackErrorsRef.current.push(message);
    return playbackErrorsRef.current.join('\n');
  }, []);

  const tryFallback = useCallback(() => {
    const state = usePlayerStore.getState();
    const current = state.activeStream;
    if (
      !current ||
      !streamFailoverEnabled ||
      !current.fallbacks?.length ||
      fallbackAttemptsRef.current >= maxStreamFailovers
    )
      return false;
    const [fallback, ...remaining] = current.fallbacks;
    if (!fallback) return false;
    fallbackAttemptsRef.current += 1;
    debugLog.warn('player', 'Trying stream fallback', { remaining: remaining.length });
    state.playStream({
      ...current,
      streamUrl: fallback.streamUrl,
      httpHeaders: fallback.httpHeaders,
      fallbacks: remaining,
      startPosition: current.type === 'live' ? 0 : state.currentTime,
    });
    notify.warning(
      'Trying Alternate Source',
      'The primary stream is unavailable. Trying another source.',
      undefined,
      undefined,
      'playback',
    );
    return true;
  }, [maxStreamFailovers, streamFailoverEnabled]);
  fallbackRef.current = tryFallback;

  useEffect(() => {
    if (!desktopApi.isDesktop()) return;
    const listener = desktopApi.onMpvEvent((payload) => {
      const currentSessionId = usePlayerStore.getState().sessionId;
      if (payload.sessionId && payload.sessionId !== currentSessionId) return;
      if (payload.type === 'property-change' && payload.name) {
        if (
          payload.name === 'vo-configured' &&
          payload.data === true &&
          startupTimerRef.current !== null
        ) {
          clearTimeout(startupTimerRef.current);
          startupTimerRef.current = null;
        }
        const playerState = usePlayerStore.getState();
        if (
          payload.name === 'paused-for-cache' &&
          payload.data === true &&
          playerState.resolverStatus?.phase === 'ad-break'
        ) {
          twitchBreakSawBufferingRef.current = true;
        }
        if (
          payload.name === 'time-pos' &&
          typeof payload.data === 'number' &&
          playerState.resolverStatus?.phase === 'ad-break' &&
          twitchBreakSawBufferingRef.current &&
          payload.data > twitchBreakStartPositionRef.current
        ) {
          playerState.setResolverStatus(null, payload.sessionId);
          twitchBreakSawBufferingRef.current = false;
        } else if (payload.name === 'time-pos' && playerState.resolverStatus?.phase === 'ready') {
          playerState.setResolverStatus(null, payload.sessionId);
        }
        if (payload.name === 'track-list' && Array.isArray(payload.data)) {
          usePlayerStore.getState().setTrackList(payload.data, payload.sessionId);
        } else {
          usePlayerStore
            .getState()
            .updateFromMpvEvent(payload.name, payload.data, payload.sessionId);
        }
        const settingsStore = useSettingsStore.getState();
        if (payload.name === 'volume' && typeof payload.data === 'number') {
          settingsStore.rememberPlayerVolume(payload.data);
        } else if (payload.name === 'speed' && typeof payload.data === 'number') {
          settingsStore.updateSetting('rememberedPlaybackSpeed', payload.data);
        } else if (payload.name === 'sub-visibility' && typeof payload.data === 'boolean') {
          settingsStore.updateSetting('subtitlesEnabled', payload.data);
        }
      } else if (payload.type === 'resolver-status') {
        const resolverStatus = parseResolverStatus(payload.data);
        if (!resolverStatus) return;
        if (resolverStatus.phase === 'ad-break') {
          if (startupTimerRef.current !== null) {
            clearTimeout(startupTimerRef.current);
            startupTimerRef.current = null;
          }
          if (stallTimerRef.current !== null) {
            clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
          }
          const playerState = usePlayerStore.getState();
          twitchBreakStartPositionRef.current = playerState.currentTime;
          twitchBreakSawBufferingRef.current = playerState.isBuffering;
          resolverErrorRef.current = null;
        } else if (resolverStatus.phase === 'failed') {
          resolverErrorRef.current = formatTwitchResolverError(resolverStatus.code);
        }
        usePlayerStore.getState().setResolverStatus(resolverStatus, payload.sessionId);
      } else if (payload.type === 'end-file') {
        const endFile =
          payload.data && typeof payload.data === 'object' ? (payload.data as EndFileData) : null;
        debugLog.info('player', 'MPV end-file event received', endFile);
        if (endFile?.reason === 'error') {
          const mpvError = resolverErrorRef.current ?? formatMpvEndFileError(endFile);
          const completeError = recordPlaybackError(mpvError);
          if (fallbackRef.current()) return;
          setIsRetrying(false);
          setErrorMessage(completeError);
          debugLog.warn('player', 'Playback stream failed', {
            errorCode: endFile.errorCode,
            errorMessage: endFile.errorMessage,
          });
        }
      } else if (payload.type === 'log-message') {
        const logData = payload.data as MpvLogData | null;
        if (logData) {
          const resolverError = formatResolverPlaybackError(logData);
          if (resolverError) resolverErrorRef.current = resolverError;
          const level: LogLevel =
            logData.level === 'error' || logData.level === 'fatal'
              ? 'error'
              : logData.level === 'warn'
                ? 'warn'
                : logData.level === 'info'
                  ? 'info'
                  : 'debug';
          // The backend reports a few things of its own through this channel so
          // they reach an exported diagnostic report; those are not mpv output
          // and must not be labelled as such.
          const origin = logData.prefix.startsWith('movena/') ? '' : '[mpv] ';
          debugLog[level]('player', `${origin}${logData.prefix}: ${logData.text}`);
        }
      }
    });
    listenerReadyRef.current = listener;

    return () => {
      if (startupTimerRef.current !== null) {
        clearTimeout(startupTimerRef.current);
        startupTimerRef.current = null;
      }
      if (twitchBreakTimerRef.current !== null) {
        clearTimeout(twitchBreakTimerRef.current);
        twitchBreakTimerRef.current = null;
      }
      listenerReadyRef.current = null;
      void listener.then((stopListening) => stopListening());
    };
  }, [recordPlaybackError]);

  useEffect(() => {
    if (!hasActiveStream) return;
    const stream = activeStream;
    if (!stream) return;
    document.body.classList.add('is-playing');
    document.documentElement.classList.add('is-playing');
    writePlaybackRecovery({
      streamId: String(stream.id),
      title: stream.title,
      type: stream.type,
      sourceId: stream.sourceId,
      sourceItemId: stream.sourceItemId?.toString(),
      currentTime: stream.startPosition ?? 0,
      duration: stream.knownDuration ?? 0,
      savedAt: Date.now(),
    });

    return () => {
      // This cleanup fires for two very different reasons that share the
      // same dependency: the player closing (nothing replaces this stream)
      // and switching to a new one (episode/channel change, still playing).
      // By the time this runs, the store's `activeStream` already reflects
      // whatever comes next — if that's a genuinely different stream, this
      // was a switch, and the "stop everything" side effects below (most
      // importantly, exiting fullscreen) don't belong here. They were firing
      // on every episode change, dropping fullscreen along with it.
      const nextStream = usePlayerStore.getState().activeStream;
      if (nextStream && nextStream.id !== stream.id) return;
      document.body.classList.remove('is-playing');
      document.documentElement.classList.remove('is-playing');
      document.body.classList.remove('is-video-ready');
      document.documentElement.classList.remove('is-video-ready');
      clearPlaybackRecovery();
      // Sequenced, not fired together: mpv tearing down its embedded window
      // and our own native code repositioning that same window for a
      // fullscreen exit at the same time is exactly the kind of race that
      // was corrupting the window on an episode switch. Letting mpv's
      // teardown finish first avoids it here too.
      void (async () => {
        try {
          await tauriApi.mpvStop();
        } catch (error) {
          console.error(error);
        }
        await setPlayerFullscreen(false);
      })();
    };
  }, [activeStream, hasActiveStream]);

  useEffect(() => {
    document.body.classList.toggle('is-video-ready', hasActiveStream && isVideoReady);
    document.documentElement.classList.toggle('is-video-ready', hasActiveStream && isVideoReady);
  }, [hasActiveStream, isVideoReady]);

  useEffect(() => {
    if (!activeStream) return;
    const updates: MpvPropertyUpdate[] = [
      { property: 'audio-delay', value: audioDelayMs / 1000 },
      { property: 'sub-font-size', value: subtitleFontSize },
      { property: 'sub-font', value: subtitleFontFamily },
      {
        property: 'sub-color',
        value: `#FFFFFF${Math.round(subtitleOpacity * 2.55)
          .toString(16)
          .padStart(2, '0')}`,
      },
      { property: 'sub-border-size', value: subtitleBorderSize },
      { property: 'sub-shadow-offset', value: subtitleShadowOffset },
    ];
    for (const update of updates) {
      void tauriApi.mpvSetProperty(update).catch(() => undefined);
    }
  }, [
    activeStream,
    audioDelayMs,
    subtitleBorderSize,
    subtitleFontFamily,
    subtitleFontSize,
    subtitleOpacity,
    subtitleShadowOffset,
  ]);

  useEffect(() => {
    if (!activeStream) return;
    setErrorMessage(null);
    setIsRetrying(restartNonce > 0);
    let cancelled = false;
    debugLog.info('player', `Starting MPV playback: ${activeStream.title}`, {
      type: activeStream.type,
      streamId: activeStream.id,
    });

    const start = async () => {
      resolverErrorRef.current = null;
      try {
        // Never start mpv until its event listener is active. In particular,
        // missing the first `vo-configured=true` would leave the guarded
        // webview opaque even though video output is ready.
        await listenerReadyRef.current;
        // On a fresh start this is the resume point saved to watch history.
        // On a retry (manual click or the stall watchdog below) the stream
        // itself hasn't changed, so the last position mpv actually reported
        // is still sitting in the player store — pick that up instead, or a
        // stall recovery would silently rewind the episode to wherever it
        // was originally resumed from. Live channels have no such position;
        // they always rejoin at the live edge.
        const resumePosition =
          restartNonce > 0 && activeStream.type !== 'live'
            ? usePlayerStore.getState().currentTime || activeStream.startPosition || 0
            : activeStream.startPosition || 0;
        const playbackSessionId = usePlayerStore.getState().sessionId;
        const startSettings = useSettingsStore.getState();
        await tauriApi.mpvStart({
          sessionId: playbackSessionId ?? undefined,
          url: activeStream.streamUrl,
          hwdec: startSettings.hardwareAcceleration ? startSettings.hwdecMode : 'no',
          hdr: startSettings.hdrMode === 'auto',
          debugLogLevel: startSettings.debugLogLevel,
          toneMapping: startSettings.toneMappingMode,
          cacheSecs: startSettings.cacheSecs,
          demuxerMaxBytes: startSettings.demuxerMaxBytes,
          initialVolume: startSettings.rememberedVolume,
          initialSpeed: startSettings.rememberedPlaybackSpeed,
          subtitlesVisible: startSettings.subtitlesEnabled,
          initialAudioDelayMs: startSettings.audioDelayMs,
          subtitleFontSize: startSettings.subtitleFontSize,
          subtitleFontFamily: startSettings.subtitleFontFamily,
          subtitleOpacity: startSettings.subtitleOpacity,
          subtitleBorderSize: startSettings.subtitleBorderSize,
          subtitleShadowOffset: startSettings.subtitleShadowOffset,
          startPosition: resumePosition,
          httpHeaders: activeStream.httpHeaders,
        });
        if (!cancelled) {
          usePlayerStore.getState().markMpvStartCompleted();
          if (startupTimerRef.current !== null) clearTimeout(startupTimerRef.current);
          const playerState = usePlayerStore.getState();
          const readyAfterStart = playerState.isVideoReady || Boolean(activeStream.radio);
          const waitingForTwitchAd = playerState.resolverStatus?.phase === 'ad-break';
          if (!readyAfterStart && !waitingForTwitchAd) {
            startupTimerRef.current = setTimeout(() => {
              const state = usePlayerStore.getState();
              if (
                state.sessionId !== playbackSessionId ||
                state.isVideoReady ||
                activeStream.radio ||
                cancelled
              )
                return;
              const timeoutError = `mpv startup timed out after ${startSettings.startupTimeoutMs} ms.`;
              const completeError = recordPlaybackError(timeoutError);
              setIsRetrying(false);
              if (!fallbackRef.current()) setErrorMessage(completeError);
              debugLog.warn('player', 'Playback startup timed out', {
                timeoutMs: startSettings.startupTimeoutMs,
              });
            }, startSettings.startupTimeoutMs);
          } else {
            startupTimerRef.current = null;
          }
          await applyAspectRatio(startSettings.aspectRatio, true).catch((error: unknown) => {
            notify.error(
              'Aspect Ratio Failed',
              getErrorMessage(error, 'Could not apply the saved aspect ratio.'),
              undefined,
              undefined,
              'playback',
            );
          });
          await applyImageAdjustments(
            {
              imageSharpness: startSettings.imageSharpness,
              imageBrightness: startSettings.imageBrightness,
              imageContrast: startSettings.imageContrast,
              imageSaturation: startSettings.imageSaturation,
              imageHue: startSettings.imageHue,
              imageGamma: startSettings.imageGamma,
            },
            true,
          ).catch((error: unknown) => {
            notify.error(
              'Image Adjustment Failed',
              getErrorMessage(error, 'Could not apply the saved image adjustments.'),
              undefined,
              undefined,
              'playback',
            );
          });
          setIsRetrying(false);
          debugLog.info('player', 'MPV started successfully');
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error, 'mpv_start failed without an error message.');
        console.error('MPV start failed:', message);
        if (!cancelled) {
          setIsRetrying(false);
          const completeError = recordPlaybackError(message);
          if (!fallbackRef.current()) {
            setErrorMessage(completeError);
          }
          debugLog.warn('player', 'MPV start failed', message);
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
      if (startupTimerRef.current !== null) {
        clearTimeout(startupTimerRef.current);
        startupTimerRef.current = null;
      }
    };
  }, [activeStream, recordPlaybackError, restartNonce]);

  const retryPlayback = useCallback(() => {
    playbackErrorsRef.current = [];
    twitchBreakRecoveryCountRef.current = 0;
    twitchBreakSawBufferingRef.current = false;
    setErrorMessage(null);
    setIsRetrying(true);
    if (!tryFallback()) {
      usePlayerStore.getState().startPlaybackSession();
      setRestartNonce((value) => value + 1);
    }
  }, [tryFallback]);

  // A new stream gets a fresh budget of automatic stall recoveries.
  useEffect(() => {
    autoRecoveryCountRef.current = 0;
    twitchBreakRecoveryCountRef.current = 0;
    twitchBreakSawBufferingRef.current = false;
    fallbackAttemptsRef.current = 0;
    playbackErrorsRef.current = [];
  }, [activeStream?.id]);

  // Twitch's ad media is intentionally removed by the native resolver, so
  // the local HTTP response pauses until Twitch publishes the next real
  // segment. Give that bounded gap its own recovery budget instead of letting
  // the generic 20-second cache watchdog repeatedly restart it.
  useEffect(() => {
    const clearTwitchBreakTimer = () => {
      if (twitchBreakTimerRef.current !== null) {
        clearTimeout(twitchBreakTimerRef.current);
        twitchBreakTimerRef.current = null;
      }
    };
    if (!hasActiveStream) {
      clearTwitchBreakTimer();
      return;
    }

    const armForStatus = (status: ReturnType<typeof usePlayerStore.getState>['resolverStatus']) => {
      clearTwitchBreakTimer();
      if (status?.phase !== 'ad-break') return;
      const timeoutMs =
        status.expectedDurationSeconds === undefined
          ? MAX_TWITCH_AD_BREAK_MS
          : Math.min(
              status.expectedDurationSeconds * 1000 + TWITCH_AD_BREAK_GRACE_MS,
              MAX_TWITCH_AD_BREAK_MS,
            );
      twitchBreakTimerRef.current = setTimeout(() => {
        twitchBreakTimerRef.current = null;
        if (usePlayerStore.getState().resolverStatus?.phase !== 'ad-break') return;
        if (twitchBreakRecoveryCountRef.current >= MAX_TWITCH_AD_BREAK_RECOVERIES) {
          const message =
            'Twitch did not resume the live stream after the filtered commercial break.';
          resolverErrorRef.current = message;
          setIsRetrying(false);
          setErrorMessage(recordPlaybackError(message));
          debugLog.warn('player', 'Twitch ad-break recovery budget spent');
          return;
        }
        twitchBreakRecoveryCountRef.current += 1;
        debugLog.warn('player', 'Twitch did not resume after a filtered ad break; restarting once');
        usePlayerStore.getState().startPlaybackSession();
        setIsRetrying(true);
        setRestartNonce((value) => value + 1);
      }, timeoutMs);
    };

    armForStatus(usePlayerStore.getState().resolverStatus);
    const unsubscribe = usePlayerStore.subscribe((state, previousState) => {
      if (state.resolverStatus === previousState.resolverStatus) return;
      armForStatus(state.resolverStatus);
    });
    return () => {
      clearTwitchBreakTimer();
      unsubscribe();
    };
  }, [hasActiveStream, recordPlaybackError]);

  // Stall watchdog: recover on its own from a `paused-for-cache` that never
  // clears, since nothing else here would (see STALL_TIMEOUT_MS above).
  useEffect(() => {
    const clearStallTimer = () => {
      if (stallTimerRef.current !== null) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
    };

    if (!hasActiveStream) {
      clearStallTimer();
      return;
    }

    const unsubscribe = usePlayerStore.subscribe((state, previousState) => {
      if (
        state.isBuffering === previousState.isBuffering &&
        state.resolverStatus === previousState.resolverStatus
      )
        return;

      if (state.resolverStatus?.phase === 'ad-break') {
        clearStallTimer();
        return;
      }

      if (!state.isBuffering) {
        clearStallTimer();
        return;
      }

      clearStallTimer();
      stallTimerRef.current = setTimeout(() => {
        stallTimerRef.current = null;
        // Re-check rather than trust the closure — playback may have
        // recovered on its own in the meantime.
        if (!usePlayerStore.getState().isBuffering) return;
        if (autoRecoveryCountRef.current >= MAX_AUTO_STALL_RECOVERIES) {
          const stallError = `Playback stalled for ${STALL_TIMEOUT_MS} ms after ${MAX_AUTO_STALL_RECOVERIES} automatic reconnect attempts.`;
          setIsRetrying(false);
          setErrorMessage(recordPlaybackError(stallError));
          debugLog.warn('player', 'Stall recovery budget spent; leaving it to manual retry');
          return;
        }
        autoRecoveryCountRef.current += 1;
        debugLog.warn(
          'player',
          `Playback stalled for ${STALL_TIMEOUT_MS}ms with no recovery; restarting automatically`,
          { attempt: autoRecoveryCountRef.current },
        );
        notify.warning(
          'Playback Stalled',
          'The stream stopped responding. Reconnecting…',
          undefined,
          undefined,
          'playback',
        );
        retryPlayback();
      }, STALL_TIMEOUT_MS);
    });

    return () => {
      clearStallTimer();
      unsubscribe();
    };
  }, [hasActiveStream, recordPlaybackError, retryPlayback]);

  return { errorMessage, retryPlayback, isRetrying };
}
