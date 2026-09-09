import { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { MOTION_DURATION } from '@/shared/design/motion';
import { usePlayerContextMenus } from '../hooks/usePlayerContextMenus';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import {
  formatVerifiedResolution,
  useStreamVerificationStore,
} from '@/modules/sources/public/store/useStreamVerificationStore';
import {
  formatEpisodePlaybackTitle,
  getSeriesBaseTitle,
  parseLiveChannelTitle,
  parseMediaTitle,
} from '@/modules/catalog/public/lib/titleParser';
import {
  filterMediaTagsByVisibility,
  getPrimaryMediaTags,
  getTagColorType,
  mergeMediaTags,
  withVerifiedResolution,
} from '@/shared/lib/mediaTags';
import { isMacOS } from '@/platform/runtime';
import { ChannelsDrawer } from './ChannelsDrawer';
import { EpisodesDrawer } from './EpisodesDrawer';
import { FeedbackHud } from './FeedbackHud';
import { LiveControls } from './LiveControls';
import { SeriesPlaybackPrompts } from './SeriesPlaybackPrompts';
import { useMpvSession } from './useMpvSession';
import { usePlayerActions } from './usePlayerActions';
import { usePlayerChrome } from './usePlayerChrome';
import { useWatchProgress } from './useWatchProgress';
import { VodControls } from './VodControls';
import styles from './PlayerShell.module.css';
import controlStyles from './PlayerControls.module.css';
import { ErrorState } from '@/shared/ui/ErrorState';
import { useI18n } from '@/shared/i18n/i18n';

// Computed once — the platform doesn't change under the app.
const IS_MACOS = isMacOS();

export function PlayerShell() {
  const { t } = useI18n();
  const { handlePlayerContextMenu } = usePlayerContextMenus();
  const activeStream = usePlayerStore((state) => state.activeStream);
  const showControls = usePlayerStore((state) => state.showControls);
  const isBuffering = usePlayerStore((state) => state.isBuffering);
  const isVideoReady = usePlayerStore((state) => state.isVideoReady);
  const resolverStatus = usePlayerStore((state) => state.resolverStatus);
  const isFullscreen = usePlayerStore((state) => state.isFullscreen);
  const containerRef = useRef<HTMLDivElement>(null);
  // Fullscreen fills the actual screen edges — square, nothing to round off.
  // The top corners are handled natively (see macos_embed.rs's video_frame);
  // only the bottom two have no title-bar-style chrome to hide behind.
  const showBottomCornerSlivers = IS_MACOS && !isFullscreen;

  const { errorMessage, retryPlayback, isRetrying } = useMpvSession();
  const saveCurrentProgress = useWatchProgress();
  const { handleClose, handleOverlayClick } = usePlayerActions(
    activeStream,
    saveCurrentProgress,
    Boolean(errorMessage),
  );
  const { setPointerOverChrome, cursorStyle } = usePlayerChrome(Boolean(activeStream));

  const customRules = useSettingsStore((s) => s.customTitleRules);
  const badgeVisibility = useSettingsStore((s) => s.badgeVisibility);
  const verifiedMeta = useStreamVerificationStore((s) =>
    activeStream ? s.verifiedStreams[String(activeStream.id)] : undefined,
  );

  if (!activeStream) return null;

  const isLive = activeStream.type === 'live';
  const isRadio = Boolean(activeStream.radio);
  const outputReady = isVideoReady || isRadio;
  const isTwitchAdBreak =
    resolverStatus?.provider === 'twitch' && resolverStatus.phase === 'ad-break';
  const parsedLiveTitle = isLive ? parseLiveChannelTitle(activeStream.title, customRules) : null;
  const parsedMediaTitle = isLive ? null : parseMediaTitle(activeStream.title, customRules);
  const verifiedBadge =
    badgeVisibility?.verified && verifiedMeta
      ? formatVerifiedResolution(verifiedMeta.width, verifiedMeta.height, verifiedMeta.fps)
      : null;
  const providerBadges = mergeMediaTags(
    ...(parsedLiveTitle?.qualityBadges ?? parsedMediaTitle?.tags ?? []),
    ...(activeStream.tags ?? []),
  );
  const badges = withVerifiedResolution(providerBadges, verifiedBadge);
  const filteredBadges = filterMediaTagsByVisibility(badges, badgeVisibility);
  const visibleBadges = getPrimaryMediaTags(filteredBadges);
  const displayTitle = isLive
    ? (parsedLiveTitle?.cleanTitle ?? activeStream.title)
    : activeStream.type === 'series'
      ? formatEpisodePlaybackTitle(
          activeStream.seriesTitle || getSeriesBaseTitle(activeStream.title),
          activeStream.seasonNum,
          activeStream.episodeNum,
          activeStream.episodeTitle || activeStream.title,
        )
      : (parsedMediaTitle?.cleanTitle ?? activeStream.title);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: MOTION_DURATION.normal }}
        className={styles.playerOverlay}
        data-ui-layer="player"
        ref={containerRef}
        onClick={handleOverlayClick}
        onContextMenu={handlePlayerContextMenu}
        style={{ cursor: cursorStyle }}
      >
        <div
          className={styles.windowDragStrip}
          data-tauri-drag-region
          onClick={(event) => event.stopPropagation()}
          aria-hidden="true"
        />

        {showBottomCornerSlivers && (
          <>
            <div className={styles.cornerSliver} data-corner="bl" />
            <div className={styles.cornerSliver} data-corner="br" />
          </>
        )}

        <AnimatePresence>
          {!errorMessage && (!outputReady || isBuffering) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: MOTION_DURATION.normal }}
              className={`${styles.loadingOverlay} ${outputReady ? styles.loadingOverlayBuffering : ''}`}
              onClick={(event) => event.stopPropagation()}
            >
              <div
                className={styles.loadingContent}
                role={isTwitchAdBreak ? 'status' : undefined}
                aria-live={isTwitchAdBreak ? 'polite' : undefined}
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: MOTION_DURATION.loop, ease: 'linear' }}
                  className={styles.loadingSpinner}
                  aria-hidden="true"
                />
                {isTwitchAdBreak && (
                  <div className={styles.loadingMessage}>
                    <strong>{t('Twitch ad blocked')}</strong>
                    <span>{t('Live video resumes automatically.')}</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {errorMessage && (
          <div className={styles.errorOverlay} onClick={(event) => event.stopPropagation()}>
            <ErrorState
              player
              title="Playback Interrupted"
              description="Movena could not continue playback."
              detail={errorMessage}
              actionLabel="Reconnect"
              onAction={retryPlayback}
              secondaryActionLabel="Close Player"
              onSecondaryAction={handleClose}
              isRetrying={isRetrying}
            />
          </div>
        )}

        {isRadio && !errorMessage && (
          <div className={styles.radioStage} aria-label={t('Radio playback')}>
            <div className={styles.radioDisc} aria-hidden="true" />
            <div className={styles.radioCopy}>
              <span className={styles.radioEyebrow}>{t('RADIO')}</span>
              <strong>{activeStream.radioMetadata?.title || displayTitle}</strong>
              {(activeStream.radioMetadata?.artist || activeStream.radioMetadata?.album) && (
                <span>
                  {[activeStream.radioMetadata.artist, activeStream.radioMetadata.album]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </div>
          </div>
        )}

        {!errorMessage && (
          <div
            className={`${styles.controlsContainer} ${showControls ? styles.showControls : ''}`}
            data-ui-layer="player-controls"
          >
            <div
              className={styles.topBar}
              data-tauri-drag-region
              onClick={(event) => event.stopPropagation()}
              onMouseEnter={() => setPointerOverChrome(true)}
              onMouseLeave={() => setPointerOverChrome(false)}
            >
              <div className={styles.titleGroup}>
                <h2 className={styles.title}>{displayTitle}</h2>
                {visibleBadges.length > 0 && (
                  <div className={styles.badgeGroup}>
                    {visibleBadges.map((badge) => (
                      <span
                        key={badge}
                        className={styles.badge}
                        data-tag-type={getTagColorType(badge)}
                      >
                        {badge === 'DV' ? 'DOLBY VISION' : badge}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className={controlStyles.iconBtn}
                onClick={handleClose}
                aria-label={t('Close player')}
              >
                <X size={24} />
              </button>
            </div>

            <div
              onClick={(event) => event.stopPropagation()}
              onMouseEnter={() => setPointerOverChrome(true)}
              onMouseLeave={() => setPointerOverChrome(false)}
            >
              {isLive ? <LiveControls /> : <VodControls />}
            </div>
          </div>
        )}

        {!errorMessage && (
          <>
            <FeedbackHud />
            <SeriesPlaybackPrompts />
            <EpisodesDrawer />
            <ChannelsDrawer />
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
