import { describe, expect, it } from 'vitest';
import { withVerifiedResolution } from '@/shared/lib/mediaTags';

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
