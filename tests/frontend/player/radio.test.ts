import { describe, expect, it } from 'vitest';
import { isRadioStream, normalizeRadioDisplayMetadata } from '@/modules/playback/lib/radio';

describe('radio metadata helpers', () => {
  it('detects radio=true across common M3U attribute representations', () => {
    expect(isRadioStream({ radio: 'true' })).toBe(true);
    expect(isRadioStream({ RADIO: ' YES ' })).toBe(true);
    expect(isRadioStream({ radio: true })).toBe(true);
    expect(isRadioStream({ radio: 1 })).toBe(true);
  });

  it('fails closed for absent, false, and unknown radio markers', () => {
    expect(isRadioStream({})).toBe(false);
    expect(isRadioStream({ radio: 'false' })).toBe(false);
    expect(isRadioStream({ radio: '0' })).toBe(false);
    expect(isRadioStream({ radio: 'maybe' })).toBe(false);
    expect(isRadioStream({ radio: 2 })).toBe(false);
  });

  it('normalizes audio display metadata from an EXTINF title and attributes', () => {
    expect(
      normalizeRadioDisplayMetadata(
        {
          'tvg-name': 'Fallback Station',
          artist: '  The\tNight\nShow ',
          album: 'Late\u00a0Night',
          genre: 'Jazz',
          'tvg-chno': ' 42 ',
          'tvg-logo': 'https://radio.example.test/logo.png',
        },
        '  Movena FM  ',
      ),
    ).toEqual({
      title: 'Movena FM',
      artist: 'The Night Show',
      album: 'Late Night',
      genre: 'Jazz',
      channelNumber: '42',
      logoUrl: 'https://radio.example.test/logo.png',
    });
  });

  it('uses safe fallback fields and strips control or bidi characters', () => {
    expect(
      normalizeRadioDisplayMetadata(
        {
          title: '\u202e\u0000',
          'station-name': '  Safe\u0007 Station  ',
          artist: 'Ignored\u202aArtist',
          logo: 'javascript:alert(1)',
        },
        undefined,
        '  Default\nStation ',
      ),
    ).toEqual({
      title: 'Safe Station',
      artist: 'IgnoredArtist',
    });
  });

  it('rejects unsafe logo schemes and bounds untrusted display fields', () => {
    const metadata = normalizeRadioDisplayMetadata({
      title: 'A'.repeat(300),
      artist: 'B'.repeat(300),
      logo: 'data:image/svg+xml,<svg onload=alert(1)>',
    });

    expect(metadata.title).toHaveLength(160);
    expect(metadata.artist).toHaveLength(120);
    expect(metadata.logoUrl).toBeUndefined();
  });

  it('accepts only absolute HTTP(S) logos', () => {
    expect(normalizeRadioDisplayMetadata({ logo: '/station.png' }).logoUrl).toBeUndefined();
    expect(
      normalizeRadioDisplayMetadata({ logo: 'https://radio.example.test/logo.png' }).logoUrl,
    ).toBe('https://radio.example.test/logo.png');
  });
});
