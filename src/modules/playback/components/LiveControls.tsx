import { tauriApi } from '@/platform/tauri';
import { useQuery } from '@tanstack/react-query';
import { usePlayerStore } from '../store/usePlayerStore';
import { getXtreamCredentials, useAuthStore } from '@/modules/sources/public/store/useAuthStore';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { notify } from '@/shared/notifications/useNotificationStore';
import { getShortEPG } from '@/modules/sources/public/data/xtreamClient';
import { decodeEpgText } from '@/modules/guide/public/data/useEpg';
import { getUserFacingErrorMessage } from '@/shared/lib/error';
import { createRecordingOutput } from '../lib/recording';
import { getDisplayTitle, parseLiveChannelTitle } from '@/modules/catalog/public/lib/titleParser';
import { getTagColorType, withVerifiedResolution } from '@/shared/lib/mediaTags';
import { getXtreamQueryScope, queryKeys } from '@/modules/sources/public/model/queryKeys';
import { lookupXmltvChannel, useXmltvGuide } from '@/modules/guide/public/data/xmltvClient';
import {
  formatVerifiedResolution,
  useStreamVerificationStore,
} from '@/modules/sources/public/store/useStreamVerificationStore';
import {
  RiPauseFill,
  RiPlayFill,
  RiPlayList2Fill,
  RiPlayList2Line,
  RiRecordCircleFill,
  RiRecordCircleLine,
} from '@/shared/ui/icons';
import { StateIcon } from '@/shared/ui/StateIcon';
import {
  VolumeControl,
  AudioPopover,
  SubtitlePopover,
  AspectRatioControl,
  FullscreenButton,
} from './SharedControls';
import { ImageControls } from './ImageControls';
import { useI18n } from '@/shared/i18n/i18n';
import styles from './PlayerControls.module.css';

/* Native `title` tooltips are avoided in the player overlay. macOS keeps one on
   screen until the next mouse event over the element, so when the controls fade
   or the window enters fullscreen the tooltip stays behind and trails the
   pointer across the picture. `aria-label` keeps the buttons described for
   assistive technology without drawing anything. */

export function LiveControls() {
  const { t } = useI18n();
  const activeStream = usePlayerStore((s) => s.activeStream);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isRecording = usePlayerStore((s) => s.isRecording);
  const showChannelsDrawer = usePlayerStore((s) => s.showChannelsDrawer);
  const setShowChannelsDrawer = usePlayerStore((s) => s.setShowChannelsDrawer);
  const sourceId = usePlayerStore((s) => s.activeStream?.sourceId);
  const credentials = useAuthStore((s) =>
    sourceId ? (s.runtimes[sourceId]?.credentials ?? null) : getXtreamCredentials(),
  );
  const authScope = getXtreamQueryScope(sourceId, credentials);
  // Library entries saved before source-aware playback belong to Xtream.
  const activeSourceId = activeStream?.sourceId;
  const { data: xmltv } = useXmltvGuide();
  const instantRecord = useSettingsStore((s) => s.instantRecord);
  const recordingPath = useSettingsStore((s) => s.recordingPath);
  const customRules = useSettingsStore((s) => s.customTitleRules);
  const badgeVisibility = useSettingsStore((s) => s.badgeVisibility);
  const verifiedMeta = useStreamVerificationStore((s) =>
    activeStream ? s.verifiedStreams[String(activeStream.id)] : undefined,
  );

  const { data: epgData } = useQuery({
    queryKey: queryKeys.shortEpg(activeStream?.sourceItemId || activeStream?.id, authScope),
    queryFn: ({ signal }) =>
      getShortEPG(
        credentials!,
        (activeStream!.sourceItemId || activeStream!.id).toString(),
        1,
        signal,
      ),
    enabled: !!credentials && !!activeStream?.id && activeStream.type === 'live',
    refetchInterval: 60000,
    retry: false,
  });

  const handlePlayPause = async () => {
    try {
      await tauriApi.mpvPlayPause();
      // mpv's `pause` property event is the authority for the UI state.
    } catch (error: unknown) {
      notify.error(
        'Playback Control Failed',
        getUserFacingErrorMessage(error, 'Could not change playback state.'),
        undefined,
        undefined,
        'playback',
      );
    }
  };

  const handleToggleRecord = async () => {
    if (!isRecording) {
      const output = createRecordingOutput(
        getDisplayTitle(activeStream?.title || 'Live stream', 'live', customRules),
        recordingPath,
      );

      try {
        await tauriApi.mpvSetRecording(output.path);
        notify.success(
          'Recording Started',
          `Saving ${output.fileName}`,
          undefined,
          undefined,
          'playback',
        );
      } catch (error: unknown) {
        const msg = getUserFacingErrorMessage(error, 'Could not start recording.');
        notify.error('Recording Failed', msg, undefined, undefined, 'playback');
      }
    } else {
      try {
        await tauriApi.mpvSetRecording('');
        notify.info(
          'Recording Stopped',
          'Stream recording completed and saved.',
          undefined,
          undefined,
          'playback',
        );
      } catch (error: unknown) {
        const msg = getUserFacingErrorMessage(error, 'Could not stop recording.');
        notify.error('Recording Error', msg, undefined, undefined, 'playback');
      }
    }
  };

  if (!activeStream || activeStream.type !== 'live') return null;

  const currentXmltvProgramme = lookupXmltvChannel(
    xmltv,
    activeStream.epgChannelId,
    activeStream.title,
    activeSourceId,
  )?.find((programme) => programme.start <= Date.now() && programme.end > Date.now());
  const rawEpgTitle =
    currentXmltvProgramme?.title || decodeEpgText(epgData?.epg_listings?.[0]?.title);
  const parsedEpg = rawEpgTitle ? parseLiveChannelTitle(rawEpgTitle, customRules) : null;
  const epgTitle = parsedEpg?.cleanTitle || rawEpgTitle;
  const verifiedBadge =
    badgeVisibility?.verified && verifiedMeta
      ? formatVerifiedResolution(verifiedMeta.width, verifiedMeta.height, verifiedMeta.fps)
      : null;
  // Same fix as the player title bar: the EPG entry's own quality tag can
  // claim a resolution the channel isn't actually delivering, so the
  // verified (actually-decoded) resolution replaces it instead of joining it.
  const epgBadges = withVerifiedResolution(parsedEpg?.qualityBadges ?? [], verifiedBadge);

  return (
    <div className={styles.bottomBarWrapper}>
      {epgTitle && (
        <div className={styles.epgContainer}>
          <div className={styles.epgInfo}>
            <span className={styles.epgTitle}>{t('Now: {title}', { title: epgTitle })}</span>
            {epgBadges.map((badge) => (
              <span key={badge} className={styles.epgBadge} data-tag-type={getTagColorType(badge)}>
                {badge}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={styles.bottomBar}>
        {/* Left side: Play/Pause, LIVE badge & Volume */}
        <div className={styles.leftControls}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={handlePlayPause}
            aria-label={t(isPlaying ? 'Pause' : 'Play')}
          >
            {isPlaying ? <RiPauseFill size={24} /> : <RiPlayFill size={24} />}
          </button>
          <span className={styles.liveBadge}>{t('LIVE')}</span>
          {instantRecord && (
            <button
              type="button"
              className={`${styles.iconBtn} ${isRecording ? styles.activeIcon : ''}`}
              onClick={handleToggleRecord}
              aria-label={
                isRecording
                  ? t('Stop Recording')
                  : t('Quick Record ({path})', { path: recordingPath })
              }
              data-recording={isRecording || undefined}
            >
              <StateIcon
                icons={{ line: RiRecordCircleLine, fill: RiRecordCircleFill }}
                active={isRecording}
                size={20}
              />
            </button>
          )}
          <VolumeControl />
        </div>

        {/* Right side: Audio/Subtitles, Channels & Fullscreen */}
        <div className={styles.rightControls}>
          <AudioPopover />
          <SubtitlePopover />
          <button
            type="button"
            className={`${styles.iconBtn} ${showChannelsDrawer ? styles.activeIcon : ''}`}
            onClick={() => setShowChannelsDrawer(!showChannelsDrawer)}
            aria-label={t('Channels List')}
          >
            <StateIcon
              icons={{ line: RiPlayList2Line, fill: RiPlayList2Fill }}
              active={showChannelsDrawer}
              size={20}
            />
          </button>
          <ImageControls />
          <AspectRatioControl />
          <FullscreenButton />
        </div>
      </div>
    </div>
  );
}
