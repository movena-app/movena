import { describe, expect, it } from 'vitest';
import { migrateLibraryState } from '@/modules/library/store/useLibraryStore';
import { migrateSettingsState } from '@/modules/settings/store/useSettingsStore';

describe('persisted-state migrations', () => {
  it('drops obsolete metadata-only downloads', () => {
    const migrated = migrateLibraryState({
      favorites: [],
      collections: [],
      history: [],
      watched: [],
      downloads: [{ id: '42' }],
    });

    expect(migrated).not.toHaveProperty('downloads');
  });

  it('removes sensitive playback transport from persisted library items', () => {
    const migrated = migrateLibraryState({
      favorites: [
        {
          id: 'one',
          title: 'One',
          type: 'live',
          posterUrl: '',
          streamUrl: 'https://secret.test',
          httpHeaders: { Cookie: 'token' },
        },
      ],
      collections: [
        {
          id: 'collection',
          name: 'Saved',
          items: [
            {
              id: 'two',
              title: 'Two',
              type: 'vod',
              posterUrl: '',
              streamUrl: 'https://secret.test/two',
            },
          ],
        },
      ],
      history: [
        {
          id: 'three',
          title: 'Three',
          type: 'vod',
          posterUrl: '',
          streamUrl: 'https://secret.test/three',
          progressPercentage: 50,
          lastWatchedAt: 1,
        },
      ],
      watched: [],
    });

    expect(migrated.favorites[0]).not.toHaveProperty('streamUrl');
    expect(migrated.favorites[0]).not.toHaveProperty('httpHeaders');
    expect(migrated.collections[0]!.items[0]).not.toHaveProperty('streamUrl');
    expect(migrated.history[0]).not.toHaveProperty('streamUrl');
  });

  it('drops unimplemented playlist and Dolby Vision settings', () => {
    const migrated = migrateSettingsState({
      playlistInput: 'm3u',
      doviSupport: true,
      hdrMode: 'always',
    });

    expect(migrated).not.toHaveProperty('playlistInput');
    expect(migrated).not.toHaveProperty('doviSupport');
    expect(migrated.hdrMode).toBe('auto');
  });

  it('preserves the explicit tone-map-to-SDR setting', () => {
    expect(migrateSettingsState({ hdrMode: 'off' }).hdrMode).toBe('off');
  });

  it('adds safe defaults for newly introduced application preferences', () => {
    const migrated = migrateSettingsState({ motionPreference: 'invalid' });
    expect(migrated.motionPreference).toBe('system');
    expect(migrated.themePreference).toBe('dark');
    expect(migrated.rememberedVolume).toBe(100);
    expect(migrated.lastAudibleVolume).toBe(100);
    expect(migrated.rememberedPlaybackSpeed).toBe(1);
    expect(migrated.subtitlesEnabled).toBe(true);
    expect(migrated.language).toBe('en');
  });

  it('preserves only supported explicit themes', () => {
    expect(migrateSettingsState({ themePreference: 'light' }).themePreference).toBe('light');
    expect(migrateSettingsState({ themePreference: 'system' }).themePreference).toBe('dark');
  });

  it('preserves supported interface languages and rejects unknown locales', () => {
    for (const language of ['de', 'es', 'fr', 'pt-BR', 'it', 'nl', 'pl'] as const) {
      expect(migrateSettingsState({ language }).language).toBe(language);
    }
    expect(migrateSettingsState({ language: 'ar' }).language).toBe('en');
  });

  it('moves the legacy default accent to the accessible system blue', () => {
    expect(migrateSettingsState({ accentColor: '#007aff' }).accentColor).toBe('#0672e5');
    expect(migrateSettingsState({ accentColor: '#af52de' }).accentColor).toBe('#af52de');
    expect(migrateSettingsState({ accentColor: 'invalid' }).accentColor).toBe('#0672e5');
  });

  it('sanitizes persisted player preferences', () => {
    const migrated = migrateSettingsState({
      rememberedVolume: 140,
      lastAudibleVolume: 0,
      rememberedPlaybackSpeed: 5,
      subtitlesEnabled: false,
    });
    expect(migrated.rememberedVolume).toBe(100);
    expect(migrated.lastAudibleVolume).toBe(100);
    expect(migrated.rememberedPlaybackSpeed).toBe(1);
    expect(migrated.subtitlesEnabled).toBe(false);
  });

  it('moves the legacy relative recording folder under the new Downloads-based default', () => {
    expect(migrateSettingsState({ recordingPath: 'Downloads/IPTV_Recordings' }).recordingPath).toBe(
      'Movena Recordings',
    );
    expect(migrateSettingsState({ recordingPath: 'D:\\Recordings' }).recordingPath).toBe(
      'D:\\Recordings',
    );
  });
});
