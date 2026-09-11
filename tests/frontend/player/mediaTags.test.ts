import { describe, expect, it } from 'vitest';
import { isUltraHdQuality, withVerifiedResolution } from '@/shared/lib/mediaTags';

describe('withVerifiedResolution', () => {
  it('replaces a conflicting provider resolution tag with the verified one', () => {
    expect(withVerifiedResolution(['4K'], 'FHD')).toEqual(['FHD']);
  });

  it('keeps non-resolution provider tags alongside the verified resolution', () => {
    expect(withVerifiedResolution(['4K', 'ATMOS'], 'FHD')).toEqual(['FHD', 'ATMOS']);
  });

  it('returns the provider tags unchanged when there is no verified badge', () => {
    expect(withVerifiedResolution(['4K'], null)).toEqual(['4K']);
    expect(withVerifiedResolution(['4K'], undefined)).toEqual(['4K']);
  });

  it('adds the verified resolution even when the provider declared none at all', () => {
    expect(withVerifiedResolution(['ATMOS'], '4K')).toEqual(['4K', 'ATMOS']);
  });
});

describe('isUltraHdQuality', () => {
  it('trusts the provider title/quality/tags when nothing has been verified', () => {
    expect(isUltraHdQuality({ title: 'Sports 4K' })).toBe(true);
    expect(isUltraHdQuality({ title: 'Sports UHD' })).toBe(true);
    expect(isUltraHdQuality({ title: 'News HD' })).toBe(false);
    expect(isUltraHdQuality({ title: 'News', quality: '2160p' })).toBe(true);
    expect(isUltraHdQuality({ title: 'News', tags: ['8K'] })).toBe(true);
  });

  it('lets a verified resolution override a false 4K claim in the title', () => {
    expect(isUltraHdQuality({ title: 'Sports 4K' }, 'FHD')).toBe(false);
  });

  it('lets a verified resolution confirm 4K/8K even without a matching title', () => {
    expect(isUltraHdQuality({ title: 'Sports' }, '4K')).toBe(true);
  });
});
