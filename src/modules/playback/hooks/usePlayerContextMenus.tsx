import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bug, Gauge, ListVideo, MessageSquare, Music, RefreshCw, X } from 'lucide-react';
import {
  RiFolderLine,
  RiFullscreenExitFill,
  RiFullscreenLine,
  RiHeartLine,
  RiHomeLine,
  RiLiveLine,
  RiMovie2Line,
  RiPauseFill,
  RiPlayFill,
  RiSearchLine,
  RiSettings3Line,
  RiTv2Line,
  RiVolumeUpLine,
} from '@/shared/ui/icons';
import { tauriApi } from '@/platform/tauri';
import { toggleWindowFullscreen } from '../components/fullscreen';
import { formatTrackLabel } from '../lib/trackLabel';
import {
  useContextMenuStore,
  type ContextMenuItem,
} from '@/shared/ui/context-menu/useContextMenuStore';
import { notify } from '@/shared/notifications/useNotificationStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { getUserFacingErrorMessage } from '@/shared/lib/error';
import { useI18n } from '@/shared/i18n/i18n';

function runPlayerCommand(command: () => Promise<unknown>, message: string) {
  void command().catch((error: unknown) => {
    notify.error('Playback Control Failed', getUserFacingErrorMessage(error, message));
  });
}

export function usePlayerContextMenus() {
  const { t, number } = useI18n();
  const navigate = useNavigate();
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);

  const handlePlayerContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const player = usePlayerStore.getState();
      const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
      const volumes = [100, 80, 60, 40, 20, 0];
      const items: ContextMenuItem[] = [
        {
          id: 'play-pause',
          label: t(player.isPlaying ? 'Pause' : 'Play'),
          icon: player.isPlaying ? <RiPauseFill size={16} /> : <RiPlayFill size={16} />,
          shortcut: 'Space / K',
          action: () => runPlayerCommand(tauriApi.mpvPlayPause, 'Could not change playback state.'),
        },
        {
          id: 'volume-submenu',
          label: t('Volume ({state})', {
            state: player.isMuted ? t('Muted') : `${number(Math.round(player.volume))}%`,
          }),
          icon: <RiVolumeUpLine size={16} />,
          submenu: volumes.map((volume) => ({
            id: `volume-${volume}`,
            label: volume === 0 ? t('Mute') : `${number(volume)}%`,
            checked: player.isMuted ? volume === 0 : Math.round(player.volume) === volume,
            action: () =>
              runPlayerCommand(() => tauriApi.mpvSetVolume(volume), 'Could not change the volume.'),
          })),
        },
        {
          id: 'speed-submenu',
          label: t('Playback Speed ({speed})', {
            speed: `${number(player.playbackSpeed, { maximumFractionDigits: 2 })}×`,
          }),
          icon: <Gauge size={16} />,
          submenu: speeds.map((speed) => ({
            id: `speed-${speed}`,
            label:
              speed === 1
                ? t('{speed} (Normal)', {
                    speed: `${number(speed, { minimumFractionDigits: 1 })}×`,
                  })
                : `${number(speed, { maximumFractionDigits: 2 })}×`,
            checked: player.playbackSpeed === speed,
            action: () =>
              runPlayerCommand(
                () => tauriApi.mpvSetSpeed(speed),
                'Could not change the playback speed.',
              ),
          })),
        },
        { id: 'tracks-divider', label: '', isDivider: true },
      ];

      if (player.audioTracks.length > 0) {
        items.push({
          id: 'audio-tracks',
          label: t('Audio Track'),
          icon: <Music size={16} />,
          submenu: player.audioTracks.map((track) => ({
            id: `audio-${track.id}`,
            label: formatTrackLabel(track, t('Track {number}', { number: number(track.id) })),
            localize: false,
            checked: player.currentAudioTrack === track.id,
            action: () =>
              runPlayerCommand(
                () => tauriApi.mpvSetAudioTrack(track.id),
                'Could not switch the audio track.',
              ),
          })),
        });
      }

      if (player.subtitleTracks.length > 0) {
        items.push({
          id: 'subtitle-tracks',
          label: t('Subtitle Track'),
          icon: <MessageSquare size={16} />,
          submenu: [
            {
              id: 'subtitle-off',
              label: t('Off'),
              checked: !player.subtitlesVisible || player.currentSubTrack === 0,
              action: () =>
                runPlayerCommand(() => tauriApi.mpvSetSubTrack(0), 'Could not disable subtitles.'),
            },
            ...player.subtitleTracks.map((track) => ({
              id: `subtitle-${track.id}`,
              label: formatTrackLabel(track, t('Track {number}', { number: number(track.id) })),
              localize: false,
              checked: player.subtitlesVisible && player.currentSubTrack === track.id,
              action: () =>
                runPlayerCommand(
                  () => tauriApi.mpvSetSubTrack(track.id),
                  'Could not switch the subtitle track.',
                ),
            })),
          ],
        });
      }

      if (player.activeStream?.type === 'series') {
        items.push({
          id: 'episodes',
          label: t('Choose Episode'),
          icon: <ListVideo size={16} />,
          action: () => player.setShowEpisodesDrawer(true),
        });
      }

      const settings = useSettingsStore.getState();

      items.push({
        id: 'fullscreen',
        label: t(player.isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'),
        icon: player.isFullscreen ? (
          <RiFullscreenExitFill size={16} />
        ) : (
          <RiFullscreenLine size={16} />
        ),
        shortcut: 'F',
        // Routed through the same queued helper as the `F` key and the
        // overlay double-click, not a second direct `playerSetFullscreen`
        // call — two independent call sites racing the same native round
        // trip is exactly the state corruption that helper exists to rule
        // out (see its doc comment), and this one also skipped its
        // guaranteed fallback to `isFullscreen: false` on a failed exit.
        action: () =>
          runPlayerCommand(() => toggleWindowFullscreen(), 'Could not change fullscreen mode.'),
      });

      if (settings.debugMode) {
        items.push({
          id: 'debug',
          label: t(settings.showDebugOverlay ? 'Hide Developer HUD' : 'Show Developer HUD'),
          icon: <Bug size={16} />,
          action: () => settings.updateSetting('showDebugOverlay', !settings.showDebugOverlay),
        });
      }

      items.push(
        { id: 'close-divider', label: '', isDivider: true },
        {
          id: 'close-player',
          label: t('Close Player'),
          icon: <X size={16} />,
          danger: true,
          shortcut: 'Esc',
          // PlayerShell owns native teardown. Closing state here prevents a
          // second stop racing a subsequent stream start.
          action: () => player.closePlayer(),
        },
      );

      openContextMenu(event.clientX, event.clientY, items);
    },
    [number, openContextMenu, t],
  );

  const handleAppBackdropContextMenu = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      event.preventDefault();
      const settings = useSettingsStore.getState();
      const items: ContextMenuItem[] = [
        {
          id: 'nav-home',
          label: t('Home'),
          icon: <RiHomeLine size={16} />,
          action: () => navigate('/'),
        },
        {
          id: 'nav-live',
          label: t('Live TV'),
          icon: <RiLiveLine size={16} />,
          action: () => navigate('/live'),
        },
        {
          id: 'nav-movies',
          label: t('Movies'),
          icon: <RiMovie2Line size={16} />,
          action: () => navigate('/movies'),
        },
        {
          id: 'nav-series',
          label: t('Series'),
          icon: <RiTv2Line size={16} />,
          action: () => navigate('/series'),
        },
        {
          id: 'nav-favorites',
          label: t('Favorites'),
          icon: <RiHeartLine size={16} />,
          action: () => navigate('/favorites'),
        },
        {
          id: 'nav-collections',
          label: t('Collections'),
          icon: <RiFolderLine size={16} />,
          action: () => navigate('/collections'),
        },
        { id: 'navigation-divider', label: '', isDivider: true },
        {
          id: 'nav-search',
          label: t('Search'),
          icon: <RiSearchLine size={16} />,
          shortcut: 'Ctrl+K',
          action: () => navigate('/search'),
        },
        {
          id: 'reload',
          label: t('Reload Interface'),
          icon: <RefreshCw size={16} />,
          action: () => window.location.reload(),
        },
        {
          id: 'settings',
          label: t('Settings'),
          icon: <RiSettings3Line size={16} />,
          action: () => navigate('/settings'),
        },
      ];

      if (settings.debugMode) {
        items.push({
          id: 'debug',
          label: t(settings.showDebugOverlay ? 'Hide Debug HUD' : 'Show Debug HUD'),
          icon: <Bug size={16} />,
          action: () => settings.updateSetting('showDebugOverlay', !settings.showDebugOverlay),
        });
      }

      openContextMenu(event.clientX, event.clientY, items);
    },
    [navigate, openContextMenu, t],
  );

  return { handlePlayerContextMenu, handleAppBackdropContextMenu };
}
