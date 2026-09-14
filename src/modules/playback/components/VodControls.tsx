import React, { useState, useCallback, useEffect } from 'react';
import { Check, Download } from 'lucide-react';
import {
  RiPauseFill,
  RiPlayFill,
  RiPlayList2Fill,
  RiPlayList2Line,
  RiSkipForwardFill,
  RiSpeedUpFill,
  RiSpeedUpLine,
} from '@/shared/ui/icons';
import { tauriApi } from '@/platform/tauri';
import { formatTime } from '@/shared/lib/time';

import { applySbsTo2d } from './aspect';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { useDownloadStore } from '@/modules/downloads/public/store/useDownloadStore';
import { StateIcon } from '@/shared/ui/StateIcon';
import { getXtreamCredentials, useAuthStore } from '@/modules/sources/public/store/useAuthStore';
import type { XtreamEpisode } from '@/modules/sources/public/data/xtreamClient';
import { useSeriesInfo } from '@/modules/catalog/public/data/useDetails';
import { findNextEpisode } from '../lib/seriesNavigation';
import { notify } from '@/shared/notifications/useNotificationStore';
import { getErrorMessage, getUserFacingErrorMessage } from '@/shared/lib/error';
import {
  formatEpisodePlaybackTitle,
  getSeriesBaseTitle,
  parseEpisodeTitle,
} from '@/modules/catalog/public/lib/titleParser';
import { mergeMediaTags } from '@/shared/lib/mediaTags';
import {
  VolumeControl,
  AudioPopover,
  SubtitlePopover,
  AspectRatioControl,
  FullscreenButton,
} from './SharedControls';
import { ImageControls } from './ImageControls';
import styles from './PlayerControls.module.css';
import { resolveEpisodePlayback } from '../lib/playback';
import { xtreamItemId } from '@/modules/sources/public/lib/sourceIdentity';
import { sanitizeDownloadFileName } from '@/modules/downloads/public/lib/downloads';
import { startMediaDownload } from '@/modules/downloads/public/services/mediaDownload';
import { useI18n } from '@/shared/i18n/i18n';

/* Native `title` tooltips are avoided in the player overlay. macOS keeps one on
   screen until the next mouse event over the element, so when the controls fade
   or the window enters fullscreen the tooltip stays behind and trails the
   pointer across the picture. `aria-label` keeps the buttons described for
   assistive technology without drawing anything. */

// ── Custom skip icons ─────────────────────────────────────────

function RotateCcw({
  size = 20,
  seconds = 10,
}: {
  size?: number | undefined;
  seconds?: number | undefined;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <text
        x="12"
        y="13.2"
        fontSize="7.5"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
        fill="currentColor"
        stroke="none"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {seconds}
      </text>
    </svg>
  );
}

function RotateCw({
  size = 20,
  seconds = 10,
}: {
  size?: number | undefined;
  seconds?: number | undefined;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <text
        x="12"
        y="13.2"
        fontSize="7.5"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
        fill="currentColor"
        stroke="none"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {seconds}
      </text>
    </svg>
  );
}

function VodTimeline() {
  const { t } = useI18n();
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [hoverData, setHoverData] = useState<{ time: number; percent: number } | null>(null);

  const displayTime = scrubTime !== null ? scrubTime : currentTime;
  const progressPercent =
    duration > 0 ? Math.max(0, Math.min(100, (displayTime / duration) * 100)) : 0;

  const performSeek = useCallback((targetTime: number) => {
    setScrubTime(null);
    usePlayerStore.setState({ currentTime: targetTime, isBuffering: true });
    void tauriApi.mpvSeek(targetTime).catch((error: unknown) => {
      notify.error(
        'Seek Failed',
        getUserFacingErrorMessage(error, 'Could not seek to that position.'),
      );
    });
  }, []);

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    performSeek(time);
  };

  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    const time = Number((e.target as HTMLInputElement).value);
    setScrubTime(time);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLInputElement>) => {
    if (!duration || duration <= 0) {
      setHoverData(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const thumbWidth = 16;
    const thumbRadius = thumbWidth / 2;
    const effectiveWidth = Math.max(1, rect.width - thumbWidth);
    const offsetX = Math.max(0, Math.min(effectiveWidth, e.clientX - rect.left - thumbRadius));
    const ratio = offsetX / effectiveWidth;
    const time = ratio * duration;
    const thumbCenterPx = thumbRadius + ratio * effectiveWidth;
    const percent = (thumbCenterPx / rect.width) * 100;
    setHoverData({ time, percent });
  };

  const handlePointerLeave = () => {
    setHoverData(null);
  };

  return (
    <div className={styles.timelineContainer}>
      <span className={styles.timeText}>{formatTime(displayTime)}</span>
      <div className={styles.seekbarWrapper}>
        {hoverData !== null && (
          <div
            className={styles.timelineTooltip}
            style={{
              left: `clamp(24px, ${hoverData.percent}%, calc(100% - 24px))`,
            }}
            data-testid="timeline-tooltip"
          >
            {formatTime(hoverData.time)}
          </div>
        )}
        <input
          type="range"
          className={styles.seekbar}
          min={0}
          max={duration || 100}
          value={displayTime}
          onInput={handleInput}
          onChange={handleSeekChange}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          aria-label={t('Playback position')}
          style={{ '--progress': `${progressPercent}%` } as React.CSSProperties}
        />
      </div>
      <span className={styles.timeText}>{formatTime(duration)}</span>
    </div>
  );
}

// ── VodControls Component ─────────────────────────────────────

export function VodControls() {
  const { t, number } = useI18n();
  const activeStream = usePlayerStore((s) => s.activeStream);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playbackSpeed = usePlayerStore((s) => s.playbackSpeed);
  const playStream = usePlayerStore((s) => s.playStream);
  const activePopover = usePlayerStore((s) => s.activePopover);
  const setActivePopover = usePlayerStore((s) => s.setActivePopover);
  const showEpisodesDrawer = usePlayerStore((s) => s.showEpisodesDrawer);
  const setShowEpisodesDrawer = usePlayerStore((s) => s.setShowEpisodesDrawer);
  const [isDownloading, setIsDownloading] = useState(false);
  // Playing straight from a completed download already — its `streamUrl` is
  // the local file path, not a fetchable source, so offering to download it
  // again would just fail. See playableFromDownloadedItem in utils/playback.
  const isPlayingDownload = useDownloadStore((s) =>
    activeStream ? Boolean(s.downloadedByLibraryId[String(activeStream.id)]) : false,
  );

  const seekJumpSecs = useSettingsStore((s) => s.seekJumpSecs);

  const credentials = useAuthStore((s) =>
    activeStream?.sourceId
      ? (s.runtimes[activeStream.sourceId]?.credentials ?? null)
      : getXtreamCredentials(),
  );
  const [is3dMode, setIs3dMode] = useState(false);

  const reportControlError = useCallback((error: unknown, fallback: string) => {
    notify.error('Playback Control Failed', getUserFacingErrorMessage(error, fallback));
  }, []);

  // Each stream gets a fresh mpv instance, so the override does not carry over
  // — but the button used to stay lit, showing a setting that was no longer in
  // effect.
  useEffect(() => {
    setIs3dMode(false);
  }, [activeStream?.id]);

  /**
   * Make side-by-side 3D watchable without glasses.
   *
   * SBS packs the left and right eye into one frame, each squeezed to half
   * width. Keep the left half and declare the result 16:9, and it plays as an
   * ordinary picture. Verified against mpv: the crop takes 1920x1080 down to
   * 960x1080, and clearing it restores the full frame.
   *
   * This replaces an aspect-only override that stretched the frame to 32:9. It
   * un-squeezed the two halves but still showed both of them, so it only ever
   * helped on a 3D display — not for watching normally.
   */
  const setSbsTo2d = useCallback(async (enabled: boolean) => {
    setIs3dMode(enabled);

    try {
      await applySbsTo2d(enabled, enabled ? '16:9' : useSettingsStore.getState().aspectRatio);
    } catch (error) {
      notify.error(
        '3D Mode Failed',
        getErrorMessage(error, 'mpv video filter update failed without an error message.'),
        undefined,
        undefined,
        'playback',
      );
    }
  }, []);

  const isSeries = activeStream?.type === 'series';

  // ── Fetch series data (only for series type) ────────────────

  const { data: seriesData } = useSeriesInfo(
    activeStream?.seriesSourceItemId || activeStream?.seriesId,
    activeStream?.sourceId,
    isSeries,
  );

  // ── Play episode helper ──────────────────────────────────────

  const playEpisode = useCallback(
    (episode: XtreamEpisode, seasonNum: string) => {
      if (!activeStream?.seriesId) return;
      const playback = resolveEpisodePlayback(episode, credentials);
      if (!playback) return;
      const seriesTitle =
        getSeriesBaseTitle(
          seriesData?.info?.name || activeStream.seriesTitle || activeStream.title,
        ) || 'Series';
      const parsedEpisode = parseEpisodeTitle(episode.title, {
        seriesTitle,
        seasonNum,
        episodeNum: episode.episode_num,
      });

      playStream({
        id: activeStream.sourceId?.startsWith('xtream-')
          ? xtreamItemId(activeStream.sourceId, 'episode', episode.id)
          : episode.id,
        sourceItemId: episode.id.toString(),
        title: formatEpisodePlaybackTitle(
          seriesTitle,
          seasonNum,
          episode.episode_num,
          episode.title,
        ),
        type: 'series',
        ...playback,
        posterUrl: episode.info?.movie_image || activeStream.posterUrl,
        seriesPosterUrl: activeStream.seriesPosterUrl,
        seriesId: activeStream.seriesId,
        seriesSourceItemId: activeStream.seriesSourceItemId,
        seriesTitle,
        seasonNum: seasonNum,
        episodeNum: episode.episode_num,
        episodeTitle: parsedEpisode.cleanTitle,
        tags: mergeMediaTags(...(activeStream.tags ?? []), ...parsedEpisode.tags),
        country: activeStream.country ?? parsedEpisode.country,
      });
    },
    [credentials, activeStream, seriesData, playStream],
  );

  // ── Play next episode ───────────────────────────────────────

  const playNextEpisode = useCallback(() => {
    if (!seriesData?.episodes || !activeStream) return;
    const next = findNextEpisode(
      seriesData.episodes,
      activeStream.sourceItemId || activeStream.id,
      activeStream.seasonNum,
    );
    if (next) playEpisode(next.episode, next.seasonNum);
  }, [seriesData, activeStream, playEpisode]);

  const seekRelative = useCallback(
    (seconds: number) => {
      const cur = usePlayerStore.getState().currentTime;
      const dur = usePlayerStore.getState().duration;
      const target = Math.max(0, dur > 0 ? Math.min(dur, cur + seconds) : cur + seconds);
      usePlayerStore.setState({ currentTime: target, isBuffering: true });
      void tauriApi.mpvSeekRelative(seconds).catch((error: unknown) => {
        reportControlError(
          error,
          seconds < 0 ? 'Could not seek backward.' : 'Could not seek forward.',
        );
      });
    },
    [reportControlError],
  );

  const setSpeed = (speed: number) => {
    void tauriApi.mpvSetSpeed(speed).catch((error: unknown) => {
      notify.error(
        'Speed Change Failed',
        getUserFacingErrorMessage(error, 'Could not change playback speed.'),
      );
    });
    setActivePopover(null);
  };

  const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  const downloadCurrent = useCallback(() => {
    if (!activeStream?.streamUrl) {
      notify.warning('Download Unavailable', 'This media does not have a downloadable source URL.');
      return;
    }
    const fileName = sanitizeDownloadFileName(`${activeStream.title}.mp4`);
    setIsDownloading(true);
    void startMediaDownload({
      url: activeStream.streamUrl,
      fileName,
      headers: activeStream.httpHeaders,
    }).finally(() => setIsDownloading(false));
  }, [activeStream]);

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className={styles.bottomBarWrapper}>
      {/* Seekbar / Timeline */}
      <VodTimeline />

      {/* Control bar */}
      <div className={styles.bottomBar}>
        {/* Left side: Playback controls & Volume */}
        <div className={styles.leftControls}>
          {/* Play / Pause */}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() =>
              void tauriApi.mpvPlayPause().catch((error: unknown) => {
                reportControlError(error, 'Could not change playback state.');
              })
            }
            aria-label={t(isPlaying ? 'Pause (Space)' : 'Play (Space)')}
          >
            {isPlaying ? <RiPauseFill size={24} /> : <RiPlayFill size={24} />}
          </button>

          {/* Skip back 10s */}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => seekRelative(-seekJumpSecs)}
            aria-label={t('Rewind {seconds} seconds', { seconds: seekJumpSecs })}
          >
            <RotateCcw seconds={seekJumpSecs} />
          </button>

          {/* Skip forward 10s */}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => seekRelative(seekJumpSecs)}
            aria-label={t('Forward {seconds} seconds', { seconds: seekJumpSecs })}
          >
            <RotateCw seconds={seekJumpSecs} />
          </button>

          {/* Next episode (series only) */}
          {isSeries && seriesData?.episodes && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={playNextEpisode}
              aria-label={t('Next Episode')}
            >
              <RiSkipForwardFill size={20} />
            </button>
          )}

          {/* Volume control slider */}
          <VolumeControl />
        </div>

        {/* Right side: Options, Popovers & Fullscreen */}
        <div className={styles.rightControls}>
          {/* Audio & Subtitles track selector */}
          <AudioPopover />
          <SubtitlePopover />

          {/* Speed selector popover */}
          <div className={styles.popoverContainer} data-popover>
            <button
              type="button"
              className={`${styles.iconBtn} ${playbackSpeed !== 1 ? styles.activeIcon : ''}`}
              onClick={() => setActivePopover(activePopover === 'speed' ? null : 'speed')}
              aria-label={t('Playback Speed')}
            >
              <StateIcon
                icons={{ line: RiSpeedUpLine, fill: RiSpeedUpFill }}
                active={playbackSpeed !== 1}
                size={20}
              />
            </button>

            {activePopover === 'speed' && (
              <div
                className={`${styles.popoverMenu} subtle-scrollbar`}
                style={{ minWidth: '140px' }}
              >
                <div className={styles.popoverTitle}>{t('Speed')}</div>
                {speeds.map((s) => (
                  <button
                    type="button"
                    key={s}
                    className={`${styles.popoverItem} ${playbackSpeed === s ? styles.popoverItemActive : ''}`}
                    onClick={() => setSpeed(s)}
                  >
                    <span>{number(s, { maximumFractionDigits: 2 })}×</span>
                    {playbackSpeed === s && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Episodes drawer toggle (series only) */}
          {isSeries && activeStream.seriesId && (
            <button
              type="button"
              className={`${styles.iconBtn} ${showEpisodesDrawer ? styles.activeIcon : ''}`}
              onClick={() => {
                setShowEpisodesDrawer(!showEpisodesDrawer);
                setActivePopover(null);
              }}
              aria-label={t('Episodes List')}
            >
              <StateIcon
                icons={{ line: RiPlayList2Line, fill: RiPlayList2Fill }}
                active={showEpisodesDrawer}
                size={20}
              />
            </button>
          )}

          {!isPlayingDownload && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={downloadCurrent}
              disabled={isDownloading}
              aria-label={t(isDownloading ? 'Downloading current media' : 'Download current media')}
            >
              <Download size={19} />
            </button>
          )}

          {/* Side-by-side 3D → flat 2D */}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setSbsTo2d(!is3dMode)}
            aria-label={
              is3dMode
                ? t('Show the full side-by-side picture again')
                : t('Side-by-side 3D: show just one eye, full width')
            }
            style={{
              color: is3dMode ? 'var(--accent-color)' : 'white',
              fontWeight: 'bold',
              fontSize: '12px',
            }}
          >
            3D
          </button>

          {/* Image adjustments (sharpness, brightness, contrast, ...) */}
          <ImageControls />

          {/* Aspect ratio */}
          <AspectRatioControl />

          {/* Fullscreen toggle */}
          <FullscreenButton />
        </div>
      </div>
    </div>
  );
}
