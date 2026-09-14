import { describe, expect, it } from 'vitest';
import {
  filterSettingsSections,
  resolveSettingsSectionId,
  SETTINGS_SECTIONS,
} from '@/modules/settings/lib/settingsNavigation';

describe('settings navigation search', () => {
  it('finds settings by feature keywords, not only their visible labels', () => {
    expect(filterSettingsSections('HDR').map((item) => item.id)).toEqual(['playback']);
    expect(filterSettingsSections('xmltv').map((item) => item.id)).toEqual(['sources']);
    expect(filterSettingsSections('m3u').map((item) => item.id)).toEqual(['sources']);
    expect(filterSettingsSections('credentials').map((item) => item.id)).toEqual(['sources']);
    expect(filterSettingsSections('motion').map((item) => item.id)).toEqual(['general']);
    expect(filterSettingsSections('backup').map((item) => item.id)).toEqual(['config']);
    expect(filterSettingsSections('concurrent').map((item) => item.id)).toEqual(['storage']);
  });

  it('returns every section for an empty query and none for an unknown feature', () => {
    expect(filterSettingsSections('')).toEqual(SETTINGS_SECTIONS);
    expect(filterSettingsSections('definitely-not-a-setting')).toEqual([]);
  });

  it('folds legacy routes into their new locations', () => {
    expect(SETTINGS_SECTIONS.some((item) => String(item.id) === 'account')).toBe(false);
    expect(resolveSettingsSectionId('account')).toBe('sources');
    expect(resolveSettingsSectionId('guide')).toBe('sources');
    expect(resolveSettingsSectionId('metadata')).toBe('library-metadata');
    expect(resolveSettingsSectionId('recording')).toBe('storage');
    expect(resolveSettingsSectionId('downloads')).toBe('storage');
    expect(resolveSettingsSectionId('m3u-editor')).toBe('sources');
  });
});
