import { beforeAll, describe, expect, it } from 'vitest';
import { ASPECT_OPTIONS, aspectLabelFor, aspectSettingsFor } from '@/modules/catalog/lib/aspect';
import {
  formatDurationLabel,
  formatRemaining,
  formatTime,
  historyCardSubtitle,
} from '@/shared/lib/time';
import { loadAllUiMessageCatalogs } from '@/shared/i18n/i18n';

beforeAll(async () => {
  await loadAllUiMessageCatalogs();
});

describe('time presentation', () => {
  it('formats invalid, minute, and hour durations', () => {
    expect(formatTime(Number.NaN)).toBe('00:00');
    expect(formatTime(65.9)).toBe('01:05');
    expect(formatTime(3661)).toBe('1:01:01');
  });

  it('formats remaining time and rejects completed or invalid media', () => {
    expect(formatRemaining(60, 120)).toBe('1 min left');
    expect(formatRemaining(60, 4380)).toBe('1 h 12 min left');
    expect(formatRemaining(60, 120, 'de')).toBe('1 min übrig');
    expect(formatRemaining(60, 120, 'es')).toBe('1 min restantes');
    expect(formatRemaining(60, 120, 'nl')).toBe('nog 1 min');
    expect(formatRemaining(60, 120, 'pl')).toBe('pozostało 1 min');
    expect(formatRemaining(120, 120)).toBeNull();
    expect(formatRemaining(0, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('formats API runtimes as readable labels', () => {
    expect(formatDurationLabel('00:48:23')).toBe('48 min');
    expect(formatDurationLabel(undefined, 4380)).toBe('1 h 13 min');
    expect(formatDurationLabel('01:00:00')).toBe('1 h');
    expect(formatDurationLabel()).toBeNull();
  });

  it('combines episode identity with remaining time for history cards', () => {
    expect(
      historyCardSubtitle({
        id: 'series',
        title: 'Show',
        posterUrl: '',
        type: 'series',
        progressPercentage: 50,
        lastWatchedAt: 0,
        currentTime: 60,
        duration: 120,
        seasonNum: 2,
        episodeNum: 3,
      }),
    ).toBe('S2 E3 · 1 min left');
  });
});

describe('aspect ratio contracts', () => {
  it('defines every mode with all four native mpv properties', () => {
    for (const option of ASPECT_OPTIONS) {
      expect(Object.keys(option.settings).sort()).toEqual([
        'keepaspect',
        'panscan',
        'video-aspect-override',
        'video-unscaled',
      ]);
    }
  });

  it('clears mode-specific values when switching back to fit', () => {
    expect(aspectSettingsFor('zoom')).toMatchObject({ panscan: '1', keepaspect: 'yes' });
    expect(aspectSettingsFor('16:9')).toEqual({
      'video-aspect-override': '16:9',
      keepaspect: 'yes',
      panscan: '0',
      'video-unscaled': 'no',
    });
  });

  it('falls back safely if persisted runtime input is unknown', () => {
    expect(aspectLabelFor('unknown' as never)).toBe('Auto');
    expect(aspectSettingsFor('unknown' as never)).toEqual(aspectSettingsFor('auto'));
  });
});
