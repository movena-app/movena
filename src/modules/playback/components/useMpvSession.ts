import { useCallback, useEffect, useRef, useState } from 'react';
import { desktopApi } from '@/platform/desktop';
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

/** A live channel has no end. When mpv reports one anyway, the provider has
 * usually stopped serving the playlist mpv keeps reloading: many IPTV
 * providers redirect to a URL with a short-lived token, and once it expires
 * the reload fails (HTTP 410) and mpv freezes on the last frame. Reopening
 * the original URL gets a fresh token. The budget refills once playback has
 * run for a while, so a provider that expires tokens every few minutes keeps
 * playing, while one that fails right away falls through to the error. */
const MAX_LIVE_RECONNECTS = 3;
const LIVE_RECONNECT_BUDGET_RESET_MS = 60_000;

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
  const liveReconnectCountRef = useRef(0);
  const lastLiveReconnectAtRef = useRef(0);
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
          const readyAfterStart =
            usePlayerStore.getState().isVideoReady || Boolean(activeStream.radio);
          if (!readyAfterStart) {
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
    liveReconnectCountRef.current = 0;
    lastLiveReconnectAtRef.current = 0;
    fallbackAttemptsRef.current = 0;
    playbackErrorsRef.current = [];
  }, [activeStream?.id]);

  // Live reconnect: reopen a live channel whose stream mpv considers ended
  // (see MAX_LIVE_RECONNECTS above).
  useEffect(() => {
    if (!hasActiveStream) return;
    const reconnect = (endedSessionId: string | null) => {
      if (usePlayerStore.getState().sessionId !== endedSessionId) return;
      const now = Date.now();
      if (now - lastLiveReconnectAtRef.current > LIVE_RECONNECT_BUDGET_RESET_MS) {
        liveReconnectCountRef.current = 0;
      }
      if (liveReconnectCountRef.current >= MAX_LIVE_RECONNECTS) {
        const message = `The live stream ended and did not resume after ${MAX_LIVE_RECONNECTS} reconnect attempts.`;
        setIsRetrying(false);
        setErrorMessage(recordPlaybackError(message));
        debugLog.warn('player', 'Live reconnect budget spent; leaving it to manual retry');
        return;
      }
      liveReconnectCountRef.current += 1;
      lastLiveReconnectAtRef.current = now;
      debugLog.warn('player', 'Live stream ended; reconnecting', {
        attempt: liveReconnectCountRef.current,
      });
      usePlayerStore.getState().startPlaybackSession();
      setIsRetrying(true);
      setRestartNonce((value) => value + 1);
    };
    return usePlayerStore.subscribe((state, previousState) => {
      if (!state.eofReached || previousState.eofReached) return;
      if (state.activeStream?.type !== 'live') return;
      // The store applies an mpv event in more than one update; restarting
      // from inside the first one would be overwritten by the next.
      const endedSessionId = state.sessionId;
      queueMicrotask(() => reconnect(endedSessionId));
    });
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
      if (state.isBuffering === previousState.isBuffering) return;

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
