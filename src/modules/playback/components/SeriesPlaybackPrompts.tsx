import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { RiSkipForwardFill } from '@/shared/ui/icons';
import { tauriApi } from '@/platform/tauri';
import { usePlayerStore } from '../store/usePlayerStore';
import { getXtreamCredentials, useAuthStore } from '@/modules/sources/public/store/useAuthStore';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { debugLog } from '@/modules/diagnostics/public/store/useDebugStore';
import { useSeriesInfo } from '@/modules/catalog/public/data/useDetails';
import { useIntroDbSegments } from '../data/useIntroDb';
import { findNextEpisode } from '../lib/seriesNavigation';
import { resolvePlaybackPromptSegments } from '../lib/chapters';
import {
  formatEpisodePlaybackTitle,
  getSeriesBaseTitle,
  parseEpisodeTitle,
} from '@/modules/catalog/public/lib/titleParser';
import { mergeMediaTags } from '@/shared/lib/mediaTags';
import styles from './SeriesPlaybackPrompts.module.css';
import { resolveEpisodePlayback } from '../lib/playback';
import { xtreamItemId } from '@/modules/sources/public/lib/sourceIdentity';
import { useI18n } from '@/shared/i18n/i18n';

/** How long the auto-play prompt waits before it actually advances. */
const AUTO_PLAY_COUNTDOWN_SECONDS = 8;

/**
 * Everything about moving between episodes and skipping segments: the Skip
 * Intro button, the Skip Recap button, the Next Episode prompt that appears
 * once the credits roll, and the auto-play countdown once mpv reports the file
 * has actually ended. Supports both embedded chapter markers and crowdsourced
 * timestamps via IntroDB, as well as automatic skipping.
 */
export function SeriesPlaybackPrompts() {
  const { t, number } = useI18n();
  const activeStream = usePlayerStore((s) => s.activeStream);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const eofReached = usePlayerStore((s) => s.eofReached);
  const chapters = usePlayerStore((s) => s.chapters);
  const playStream = usePlayerStore((s) => s.playStream);
  const credentials = useAuthStore((s) =>
    activeStream?.sourceId
      ? (s.runtimes[activeStream.sourceId]?.credentials ?? null)
      : getXtreamCredentials(),
  );
  const autoPlayNextEpisode = useSettingsStore((s) => s.autoPlayNextEpisode);
  const skipIntroEnabled = useSettingsStore((s) => s.skipIntroEnabled);
  const skipRecapEnabled = useSettingsStore((s) => s.skipRecapEnabled);
  const autoSkipIntro = useSettingsStore((s) => s.autoSkipIntro);
  const introDbEnabled = useSettingsStore((s) => s.introDbEnabled);

  // Extract structured season and episode identifiers even if the stream title only contains them
  const parsedFromTitle = useMemo(() => {
    if (!activeStream?.title) return null;
    return parseEpisodeTitle(activeStream.title, {
      seriesTitle: activeStream.seriesTitle,
      seasonNum: activeStream.seasonNum,
      episodeNum: activeStream.episodeNum,
    });
  }, [
    activeStream?.title,
    activeStream?.seriesTitle,
    activeStream?.seasonNum,
    activeStream?.episodeNum,
  ]);

  const resolvedSeriesTitle =
    activeStream?.seriesTitle ||
    parsedFromTitle?.seriesTitle ||
    (activeStream?.title ? getSeriesBaseTitle(activeStream.title) : undefined);
  const resolvedSeasonNum = activeStream?.seasonNum ?? parsedFromTitle?.seasonNum ?? null;
  const resolvedEpisodeNum = activeStream?.episodeNum ?? parsedFromTitle?.episodeNum ?? null;

  const isSeries =
    activeStream?.type === 'series' || Boolean(resolvedSeasonNum && resolvedEpisodeNum);

  // Shared with VodControls, so this is normally already in cache by the
  // time it's needed — no extra fetch on top of what the controls do.
  const { data: seriesData } = useSeriesInfo(
    activeStream?.seriesSourceItemId || activeStream?.seriesId,
    activeStream?.sourceId,
    isSeries && Boolean(activeStream?.seriesSourceItemId || activeStream?.seriesId),
  );

  const anySkipActive = skipIntroEnabled || skipRecapEnabled || autoSkipIntro;
  const { data: introDbSegments } = useIntroDbSegments(
    resolvedSeriesTitle,
    resolvedSeasonNum,
    resolvedEpisodeNum,
    anySkipActive && introDbEnabled && Boolean(resolvedSeasonNum && resolvedEpisodeNum),
  );

  const next = useMemo(() => {
    if (!isSeries || !seriesData?.episodes || !activeStream) return null;
    return findNextEpisode(
      seriesData.episodes,
      activeStream.sourceItemId || activeStream.id,
      activeStream.seasonNum,
    );
  }, [isSeries, seriesData, activeStream]);

  const nextEpisodeDisplayTitle = useMemo(() => {
    if (!next || !activeStream) return null;
    return parseEpisodeTitle(next.episode.title, {
      seriesTitle: activeStream.seriesTitle || getSeriesBaseTitle(activeStream.title),
      seasonNum: next.seasonNum,
      episodeNum: next.episode.episode_num,
    }).cleanTitle;
  }, [next, activeStream]);

  const playNext = useCallback(() => {
    if (!next || !activeStream?.seriesId) return;
    const playback = resolveEpisodePlayback(next.episode, credentials);
    if (!playback) return;
    const baseTitle =
      getSeriesBaseTitle(
        seriesData?.info?.name || activeStream.seriesTitle || activeStream.title,
      ) || 'Series';
    const parsedEpisode = parseEpisodeTitle(next.episode.title, {
      seriesTitle: baseTitle,
      seasonNum: next.seasonNum,
      episodeNum: next.episode.episode_num,
    });
    playStream({
      id: activeStream.sourceId?.startsWith('xtream-')
        ? xtreamItemId(activeStream.sourceId, 'episode', next.episode.id)
        : next.episode.id,
      sourceItemId: next.episode.id.toString(),
      title: formatEpisodePlaybackTitle(
        baseTitle,
        next.seasonNum,
        next.episode.episode_num,
        next.episode.title,
      ),
      type: 'series',
      ...playback,
      posterUrl: next.episode.info?.movie_image || activeStream.posterUrl,
      seriesPosterUrl: activeStream.seriesPosterUrl,
      seriesId: activeStream.seriesId,
      seriesSourceItemId: activeStream.seriesSourceItemId,
      seriesTitle: baseTitle,
      seasonNum: next.seasonNum,
      episodeNum: next.episode.episode_num,
      episodeTitle: parsedEpisode.cleanTitle,
      tags: mergeMediaTags(...(activeStream.tags ?? []), ...parsedEpisode.tags),
      country: activeStream.country ?? parsedEpisode.country,
    });
  }, [next, credentials, activeStream, seriesData, playStream]);
  const playNextRef = useRef(playNext);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  // ── Prompt segments (Chapters preferred, IntroDB fallback) ──

  const segments = useMemo(
    () =>
      anySkipActive
        ? resolvePlaybackPromptSegments(chapters, introDbSegments)
        : { intro: null, recap: null, outro: null },
    [chapters, introDbSegments, anySkipActive],
  );

  useEffect(() => {
    if (!activeStream) return;
    debugLog.info('player', `Skip prompts: resolved segments for "${activeStream.title}"`, {
      chapterCount: chapters.length,
      chapterTitles: chapters.map((c) => c.title).filter(Boolean),
      introDbSegments,
      resolvedSegments: segments,
      autoSkipIntro,
      skipIntroEnabled,
      skipRecapEnabled,
    });
  }, [
    activeStream,
    chapters,
    introDbSegments,
    segments,
    autoSkipIntro,
    skipIntroEnabled,
    skipRecapEnabled,
  ]);

  // ── Automatic Intro / Recap Skipping ──────────────────────────

  const autoSkippedSegmentsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    autoSkippedSegmentsRef.current.clear();
  }, [activeStream?.id]);

  useEffect(() => {
    if (!autoSkipIntro || !activeStream) return;

    if (skipRecapEnabled && segments.recap) {
      const recapKey = `recap:${segments.recap.start}:${segments.recap.skipTo}`;
      if (!autoSkippedSegmentsRef.current.has(recapKey)) {
        if (currentTime >= segments.recap.start && currentTime < segments.recap.skipTo - 0.5) {
          autoSkippedSegmentsRef.current.add(recapKey);
          void tauriApi.mpvSeek(segments.recap.skipTo);
          return;
        }
      }
    }

    if (skipIntroEnabled && segments.intro) {
      const introKey = `intro:${segments.intro.start}:${segments.intro.skipTo}`;
      if (!autoSkippedSegmentsRef.current.has(introKey)) {
        if (currentTime >= segments.intro.start && currentTime < segments.intro.skipTo - 0.5) {
          autoSkippedSegmentsRef.current.add(introKey);
          void tauriApi.mpvSeek(segments.intro.skipTo);
          return;
        }
      }
    }
  }, [
    autoSkipIntro,
    activeStream,
    skipIntroEnabled,
    skipRecapEnabled,
    segments.intro,
    segments.recap,
    currentTime,
  ]);

  // ── Manual Skip Buttons ───────────────────────────────────────

  const showSkipIntro =
    skipIntroEnabled &&
    !autoSkipIntro &&
    !!segments.intro &&
    currentTime >= segments.intro.start &&
    currentTime < segments.intro.skipTo - 0.5;

  const showSkipRecap =
    skipRecapEnabled &&
    !autoSkipIntro &&
    !!segments.recap &&
    currentTime >= segments.recap.start &&
    currentTime < segments.recap.skipTo - 0.5;

  const shownRef = useRef({ intro: false, recap: false });
  useEffect(() => {
    if (showSkipIntro && !shownRef.current.intro) {
      shownRef.current.intro = true;
      debugLog.info(
        'player',
        `Skip prompts: showSkipIntro became true at currentTime=${currentTime}`,
        segments.intro,
      );
    }
    if (!showSkipIntro) shownRef.current.intro = false;
    if (showSkipRecap && !shownRef.current.recap) {
      shownRef.current.recap = true;
      debugLog.info(
        'player',
        `Skip prompts: showSkipRecap became true at currentTime=${currentTime}`,
        segments.recap,
      );
    }
    if (!showSkipRecap) shownRef.current.recap = false;
  }, [showSkipIntro, showSkipRecap, currentTime, segments.intro, segments.recap]);

  const skipIntro = useCallback(() => {
    if (!segments.intro) return;
    void tauriApi.mpvSeek(segments.intro.skipTo);
  }, [segments.intro]);

  const skipRecap = useCallback(() => {
    if (!segments.recap) return;
    void tauriApi.mpvSeek(segments.recap.skipTo);
  }, [segments.recap]);

  // ── Next Episode button once the credits start ─────────────────

  const showNextEpisodeButton =
    isSeries && !!next && !!segments.outro && currentTime >= segments.outro.start && !eofReached;

  // ── Auto-play countdown once mpv reports the file actually ended ──

  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimer = useRef<number | null>(null);
  const hasNextEpisode = Boolean(next);
  // Guards against re-arming for the same episode — eof-reached can flip
  // back to false and true again if someone seeks around after it fires.
  const firedForRef = useRef<string | null>(null);

  const clearCountdown = useCallback(() => {
    if (countdownTimer.current !== null) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
  }, []);

  useEffect(() => {
    firedForRef.current = null;
    setCountdown(null);
    clearCountdown();
  }, [activeStream?.id, clearCountdown]);

  useEffect(() => {
    if (!eofReached || !isSeries || !hasNextEpisode || !autoPlayNextEpisode) return;
    const streamKey = activeStream?.id?.toString() ?? '';
    if (firedForRef.current === streamKey) return;
    firedForRef.current = streamKey;

    let remaining = AUTO_PLAY_COUNTDOWN_SECONDS;
    setCountdown(remaining);
    countdownTimer.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearCountdown();
        setCountdown(null);
        playNextRef.current();
      } else {
        setCountdown(remaining);
      }
    }, 1000);

    return clearCountdown;
  }, [activeStream?.id, autoPlayNextEpisode, clearCountdown, eofReached, hasNextEpisode, isSeries]);

  const cancelCountdown = useCallback(() => {
    clearCountdown();
    setCountdown(null);
  }, [clearCountdown]);

  if (!activeStream) return null;

  return (
    <div className={styles.promptStack}>
      {showSkipRecap && (
        <button
          type="button"
          className={styles.skipRecapBtn}
          onClick={(e) => {
            e.stopPropagation();
            skipRecap();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {t('Skip Recap')}
        </button>
      )}

      {showSkipIntro && (
        <button
          type="button"
          className={styles.skipIntroBtn}
          onClick={(e) => {
            e.stopPropagation();
            skipIntro();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {t('Skip Intro')}
        </button>
      )}

      {countdown !== null ? (
        <div className={styles.nextEpisodeCard} onClick={(e) => e.stopPropagation()}>
          <span className={styles.nextEpisodeLabel}>
            {t('Next episode in {seconds}s', { seconds: number(countdown) })}
            {nextEpisodeDisplayTitle ? ` — ${nextEpisodeDisplayTitle}` : ''}
          </span>
          <div className={styles.nextEpisodeActions}>
            <button type="button" className={styles.nextEpisodePlayBtn} onClick={playNext}>
              <RiSkipForwardFill size={14} /> {t('Play Now')}
            </button>
            <button type="button" className={styles.nextEpisodeCancelBtn} onClick={cancelCountdown}>
              <X size={14} /> {t('Cancel')}
            </button>
          </div>
        </div>
      ) : (
        showNextEpisodeButton && (
          <button
            type="button"
            className={styles.nextEpisodeSimpleBtn}
            onClick={(e) => {
              e.stopPropagation();
              playNext();
            }}
          >
            <RiSkipForwardFill size={16} /> {t('Next Episode')}
          </button>
        )
      )}
    </div>
  );
}
