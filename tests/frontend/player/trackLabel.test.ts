import { describe, expect, it } from 'vitest';
import { formatTrackLabel } from '@/modules/playback/lib/trackLabel';

describe('track labels', () => {
  it('keeps language visible when tracks share a provider title', () => {
    expect(formatTrackLabel({ title: 'Surround', lang: 'de-DE' }, 'Audio #1')).toBe(
      'DE · Surround',
    );
    expect(formatTrackLabel({ title: 'Surround', lang: 'en' }, 'Audio #2')).toBe('EN · Surround');
  });

  it('falls back cleanly when metadata is partial or duplicates the language', () => {
    expect(formatTrackLabel({ title: ' English ', lang: 'en' }, 'Audio #1')).toBe('EN · English');
    expect(formatTrackLabel({ lang: 'fr-FR' }, 'Audio #1')).toBe('FR');
    expect(formatTrackLabel({}, 'Audio #1')).toBe('Audio #1');
  });
});
