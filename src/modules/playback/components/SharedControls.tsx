import React, { useEffect, useState } from 'react';
import { tauriApi } from '@/platform/tauri';
import { usePlayerStore } from '../store/usePlayerStore';
import { toggleWindowFullscreen } from './fullscreen';
import { applyAspectRatio } from './aspect';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { ASPECT_OPTIONS } from '@/modules/catalog/public/lib/aspect';
import { notify } from '@/shared/notifications/useNotificationStore';
import { getUserFacingErrorMessage } from '@/shared/lib/error';
import { Check, Minus, Plus, RotateCcw } from 'lucide-react';
import {
  RiAspectRatioFill,
  RiAspectRatioLine,
  RiClosedCaptioningFill,
  RiClosedCaptioningLine,
  RiFullscreenExitFill,
  RiFullscreenLine,
  RiMusic2Fill,
  RiMusic2Line,
  RiVolumeDownLine,
  RiVolumeMuteFill,
  RiVolumeUpLine,
} from '@/shared/ui/icons';
import { StateIcon } from '@/shared/ui/StateIcon';
import { IconButton } from '@/shared/ui/Button';
import { formatTrackLabel } from '../lib/trackLabel';
import { useI18n } from '@/shared/i18n/i18n';
import styles from './PlayerControls.module.css';

/* Native `title` tooltips are avoided in the player overlay. macOS keeps one on
   screen until the next mouse event over the element, so when the controls fade
   or the window enters fullscreen the tooltip stays behind and trails the
   pointer across the picture. `aria-label` keeps the buttons described for
   assistive technology without drawing anything. */

// ── 1. Volume Control (Left Side) ────────────────────────────

export function VolumeControl() {
  const { t } = useI18n();
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const lastAudibleVolume = useSettingsStore((state) => state.lastAudibleVolume);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value, 10);
    void tauriApi.mpvSetVolume(newVolume).catch((error: unknown) => {
      notify.error(
        'Volume Failed',
        getUserFacingErrorMessage(error, 'Could not change the volume.'),
      );
    });
  };

  const handleVolumeToggle = () => {
    const newVolume = isMuted || volume === 0 ? lastAudibleVolume : 0;
    void tauriApi.mpvSetVolume(newVolume).catch((error: unknown) => {
      notify.error(
        'Volume Failed',
        getUserFacingErrorMessage(error, 'Could not change the volume.'),
      );
    });
  };

  const VolumeIcon =
    isMuted || volume === 0 ? RiVolumeMuteFill : volume < 50 ? RiVolumeDownLine : RiVolumeUpLine;

  return (
    <div className={styles.volumeContainer}>
      <button
        type="button"
        className={styles.iconBtn}
        onClick={handleVolumeToggle}
        aria-label={t('Mute / Unmute (M)')}
      >
        <VolumeIcon size={22} />
      </button>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={isMuted ? 0 : volume}
        onChange={handleVolumeChange}
        className={styles.volumeSlider}
        style={{ '--progress': `${isMuted ? 0 : volume}%` } as React.CSSProperties}
        aria-label={t('Volume')}
      />
    </div>
  );
}

// ── 2. Audio and subtitle popovers (Right Side) ─────────────

export function AudioPopover() {
  const { t } = useI18n();
  const activePopover = usePlayerStore((s) => s.activePopover);
  const setActivePopover = usePlayerStore((s) => s.setActivePopover);
  const audioTracks = usePlayerStore((s) => s.audioTracks);
  const currentAudioTrack = usePlayerStore((s) => s.currentAudioTrack);
  const audioDelayMs = useSettingsStore((s) => s.audioDelayMs);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const isOpen = activePopover === 'audio';
  const [audioDelayDraft, setAudioDelayDraft] = useState(String(audioDelayMs));

  useEffect(() => {
    setAudioDelayDraft(String(audioDelayMs));
  }, [audioDelayMs]);

  const handleAudioTrack = (trackId: number) => {
    void tauriApi.mpvSetAudioTrack(trackId).catch((error: unknown) => {
      notify.error(
        'Track Selection Failed',
        getUserFacingErrorMessage(error, 'Could not switch the audio track.'),
      );
    });
  };

  const setAudioDelay = (value: number) => {
    const next = Number.isFinite(value) ? Math.max(-5000, Math.min(5000, value)) : 0;
    updateSetting('audioDelayMs', next);
    void tauriApi
      .mpvSetProperty({ property: 'audio-delay', value: next / 1000 })
      .catch((error: unknown) => {
        notify.error(
          'Audio Sync Failed',
          getUserFacingErrorMessage(error, 'Could not change the audio delay.'),
        );
      });
  };

  const commitAudioDelayDraft = () => {
    const parsed = Number.parseInt(audioDelayDraft.trim(), 10);
    if (!Number.isFinite(parsed)) {
      setAudioDelayDraft(String(audioDelayMs));
      return;
    }
    setAudioDelay(parsed);
  };

  return (
    <div className={styles.popoverContainer} data-popover>
      <button
        type="button"
        className={`${styles.iconBtn} ${isOpen || audioDelayMs !== 0 ? styles.activeIcon : ''}`}
        onClick={() => setActivePopover(isOpen ? null : 'audio')}
        aria-label={t('Audio')}
      >
        <StateIcon
          icons={{ line: RiMusic2Line, fill: RiMusic2Fill }}
          active={isOpen || audioDelayMs !== 0}
          size={20}
        />
      </button>

      {isOpen && (
        <div className={`${styles.popoverMenu} ${styles.audioPopoverMenu} subtle-scrollbar`}>
          {audioTracks.length > 0 && (
            <>
              <div className={styles.popoverTitle}>{t('Audio Tracks')}</div>
              {audioTracks.map((track) => (
                <button
                  type="button"
                  key={`audio-${track.id}`}
                  className={`${styles.popoverItem} ${currentAudioTrack === track.id ? styles.popoverItemActive : ''}`}
                  onClick={() => handleAudioTrack(track.id)}
                >
                  <span>{formatTrackLabel(track, t('Audio #{number}', { number: track.id }))}</span>
                  {currentAudioTrack === track.id && <Check size={14} />}
                </button>
              ))}
            </>
          )}

          <div
            className={styles.popoverTitle}
            style={{ marginTop: audioTracks.length > 0 ? 6 : 0 }}
          >
            {t('Audio Sync')}
          </div>
          <div className={styles.audioSyncControl}>
            <div className="uiFieldGroup">
              <IconButton
                size="sm"
                className={styles.audioSyncNudgeButton}
                onClick={() => setAudioDelay(audioDelayMs - 1)}
                aria-label="Decrease audio sync by 1 millisecond"
              >
                <Minus size={14} />
              </IconButton>
              <div className={styles.audioSyncInputWrap}>
                <input
                  className={`uiField ${styles.audioSyncInput}`}
                  data-variant="embedded"
                  type="text"
                  inputMode="numeric"
                  value={audioDelayDraft}
                  onChange={(event) =>
                    setAudioDelayDraft(
                      event.target.value.replace(/[^\d-]/g, '').replace(/(?!^)-/g, ''),
                    )
                  }
                  onBlur={commitAudioDelayDraft}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitAudioDelayDraft();
                      event.currentTarget.blur();
                    } else if (event.key === 'Escape') {
                      setAudioDelayDraft(String(audioDelayMs));
                      event.currentTarget.blur();
                    }
                  }}
                  aria-label={t('Audio sync in milliseconds')}
                />
                <span className={styles.audioSyncUnit}>ms</span>
              </div>
              <IconButton
                size="sm"
                className={styles.audioSyncNudgeButton}
                onClick={() => setAudioDelay(audioDelayMs + 1)}
                aria-label="Increase audio sync by 1 millisecond"
              >
                <Plus size={14} />
              </IconButton>
              <IconButton
                size="sm"
                className={styles.audioSyncResetButton}
                onClick={() => setAudioDelay(0)}
                aria-label="Reset audio sync"
              >
                <RotateCcw size={13} />
              </IconButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SubtitlePopover() {
  const { t } = useI18n();
  const activePopover = usePlayerStore((s) => s.activePopover);
  const setActivePopover = usePlayerStore((s) => s.setActivePopover);
  const subtitleTracks = usePlayerStore((s) => s.subtitleTracks);
  const currentSubTrack = usePlayerStore((s) => s.currentSubTrack);
  const subtitlesVisible = usePlayerStore((s) => s.subtitlesVisible);
  const subtitleFontSize = useSettingsStore((s) => s.subtitleFontSize);
  const subtitleOpacity = useSettingsStore((s) => s.subtitleOpacity);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const isOpen = activePopover === 'subtitles';
  const isSubActive = subtitlesVisible && currentSubTrack > 0;
  const hasCustomStyle = subtitleFontSize !== 38 || subtitleOpacity !== 100;

  const handleSubTrack = (trackId: number) => {
    void tauriApi.mpvSetSubTrack(trackId).catch((error: unknown) => {
      notify.error(
        'Track Selection Failed',
        getUserFacingErrorMessage(error, 'Could not switch subtitles.'),
      );
    });
  };

  const setSubtitleStyle = (key: 'subtitleFontSize' | 'subtitleOpacity', value: number) => {
    const limits = key === 'subtitleFontSize' ? ([12, 96] as const) : ([0, 100] as const);
    const next = Math.max(limits[0], Math.min(limits[1], value));
    updateSetting(key, next);
    const update =
      key === 'subtitleFontSize'
        ? { property: 'sub-font-size' as const, value: next }
        : {
            property: 'sub-color' as const,
            value: `#FFFFFF${Math.round(next * 2.55)
              .toString(16)
              .padStart(2, '0')}`,
          };
    void tauriApi.mpvSetProperty(update).catch((error: unknown) => {
      notify.error(
        'Subtitle Style Failed',
        getUserFacingErrorMessage(error, 'Could not update the subtitle style.'),
      );
    });
  };

  return (
    <div className={styles.popoverContainer} data-popover>
      <button
        type="button"
        className={`${styles.iconBtn} ${isOpen || isSubActive || hasCustomStyle ? styles.activeIcon : ''}`}
        onClick={() => setActivePopover(isOpen ? null : 'subtitles')}
        aria-label={t('Subtitles and closed captions')}
      >
        <StateIcon
          icons={{ line: RiClosedCaptioningLine, fill: RiClosedCaptioningFill }}
          active={isOpen || isSubActive || hasCustomStyle}
          size={20}
        />
      </button>

      {isOpen && (
        <div className={`${styles.popoverMenu} subtle-scrollbar`}>
          <div className={styles.popoverTitle}>{t('Subtitles & CC')}</div>
          <button
            type="button"
            className={`${styles.popoverItem} ${!isSubActive ? styles.popoverItemActive : ''}`}
            onClick={() => handleSubTrack(0)}
          >
            <span>{t('Off')}</span>
            {!isSubActive && <Check size={14} />}
          </button>
          {subtitleTracks.map((track) => (
            <button
              type="button"
              key={`sub-${track.id}`}
              className={`${styles.popoverItem} ${subtitlesVisible && currentSubTrack === track.id ? styles.popoverItemActive : ''}`}
              onClick={() => handleSubTrack(track.id)}
            >
              <span>{formatTrackLabel(track, t('Subtitle #{number}', { number: track.id }))}</span>
              {subtitlesVisible && currentSubTrack === track.id && <Check size={14} />}
            </button>
          ))}

          <div className={styles.popoverTitle}>{t('Quick Adjustments')}</div>
          <label className={styles.popoverAdjustment}>
            <span className={styles.popoverAdjustmentHeader}>
              <span>{t('Subtitle size')}</span>
              <strong>{subtitleFontSize}px</strong>
            </span>
            <input
              className={styles.popoverRange}
              type="range"
              min="12"
              max="96"
              step="1"
              value={subtitleFontSize}
              onChange={(event) => setSubtitleStyle('subtitleFontSize', Number(event.target.value))}
              aria-label={t('Subtitle size')}
            />
          </label>
          <label className={styles.popoverAdjustment}>
            <span className={styles.popoverAdjustmentHeader}>
              <span>{t('Subtitle opacity')}</span>
              <strong>{subtitleOpacity}%</strong>
            </span>
            <input
              className={styles.popoverRange}
              type="range"
              min="0"
              max="100"
              step="1"
              value={subtitleOpacity}
              onChange={(event) => setSubtitleStyle('subtitleOpacity', Number(event.target.value))}
              aria-label={t('Subtitle opacity')}
            />
          </label>
        </div>
      )}
    </div>
  );
}

// ── Aspect Ratio (Right Side) ────────────────────────────────

/**
 * Global picture framing, applied the moment it is picked.
 *
 * The choice lives in settings rather than on the stream, so it carries across
 * channels and titles and survives a restart — and it is re-applied whenever a
 * new stream starts, since each one gets a fresh mpv instance.
 */
export function AspectRatioControl() {
  const { t } = useI18n();
  const activePopover = usePlayerStore((s) => s.activePopover);
  const setActivePopover = usePlayerStore((s) => s.setActivePopover);
  const aspectRatio = useSettingsStore((s) => s.aspectRatio);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const isOpen = activePopover === 'aspect';

  return (
    <div className={styles.popoverContainer} data-popover>
      <button
        type="button"
        className={`${styles.iconBtn} ${aspectRatio !== 'auto' ? styles.activeIcon : ''}`}
        onClick={() => setActivePopover(isOpen ? null : 'aspect')}
        aria-label={t('Aspect Ratio')}
      >
        <StateIcon
          icons={{ line: RiAspectRatioLine, fill: RiAspectRatioFill }}
          active={aspectRatio !== 'auto'}
          size={20}
        />
      </button>

      {isOpen && (
        <div className={`${styles.popoverMenu} subtle-scrollbar`} style={{ minWidth: '190px' }}>
          <div className={styles.popoverTitle}>{t('Aspect Ratio')}</div>
          {ASPECT_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.mode}
              className={`${styles.popoverItem} ${aspectRatio === option.mode ? styles.popoverItemActive : ''}`}
              aria-label={t(option.label)}
              aria-pressed={aspectRatio === option.mode}
              onClick={() => {
                updateSetting('aspectRatio', option.mode);
                void applyAspectRatio(option.mode, true).catch((error: unknown) => {
                  notify.error(
                    'Aspect Ratio Failed',
                    getUserFacingErrorMessage(
                      error,
                      `Could not apply aspect ratio mode "${option.mode}".`,
                    ),
                  );
                });
                setActivePopover(null);
              }}
            >
              <span>{t(option.label)}</span>
              {aspectRatio === option.mode && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 3. Fullscreen Button (Right Side) ────────────────────────

export function FullscreenButton() {
  const { t } = useI18n();
  const isFullscreen = usePlayerStore((s) => s.isFullscreen);

  return (
    <button
      type="button"
      className={styles.iconBtn}
      onClick={() => void toggleWindowFullscreen()}
      aria-label={t('Toggle Fullscreen (F)')}
    >
      {isFullscreen ? <RiFullscreenExitFill size={22} /> : <RiFullscreenLine size={22} />}
    </button>
  );
}
