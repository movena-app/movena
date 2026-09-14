// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearLogoAspectCache,
  detectAspectFromImageData,
  detectLogoAspect,
  getCachedLogoAspect,
} from '@/modules/catalog/lib/logoAspectDetector';

beforeEach(() => {
  clearLogoAspectCache();
});

describe('logoAspectDetector', () => {
  describe('detectAspectFromImageData', () => {
    it('returns original for too small images', () => {
      const data = new Uint8ClampedArray(4 * 4 * 4);
      const imgData = { width: 4, height: 4, data } as ImageData;
      expect(detectAspectFromImageData(imgData)).toBe('original');
    });

    it('returns original for empty/blank images', () => {
      const size = 64;
      const data = new Uint8ClampedArray(size * size * 4);
      // all transparent (0, 0, 0, 0)
      const imgData = { width: size, height: size, data } as ImageData;
      expect(detectAspectFromImageData(imgData)).toBe('original');
    });

    it('returns original when foreground content is already wide', () => {
      const size = 64;
      const data = new Uint8ClampedArray(size * size * 4);

      // Draw a wide rectangle in the middle: width=50 (from x=7 to x=57), height=15 (from y=25 to y=40)
      for (let y = 25; y <= 40; y++) {
        for (let x = 7; x <= 57; x++) {
          const idx = (y * size + x) * 4;
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
          data[idx + 3] = 255;
        }
      }

      const imgData = { width: size, height: size, data } as ImageData;
      expect(detectAspectFromImageData(imgData)).toBe('original');
    });

    it('detects a 16:9 squished pattern with dense vertical strokes and tall foreground in a square box', () => {
      const size = 64;
      const data = new Uint8ClampedArray(size * size * 4);

      // Fill a square content bounding box (x: 6..58, y: 6..58) with dense vertical striped lines (like squished text)
      for (let y = 6; y <= 58; y++) {
        for (let x = 6; x <= 58; x++) {
          const idx = (y * size + x) * 4;
          // Dense vertical stripes: alternating white and black stripes create huge gradX
          const isStripe = x % 4 < 2;
          const val = isStripe ? 255 : 30;
          data[idx] = val;
          data[idx + 1] = val;
          data[idx + 2] = val;
          data[idx + 3] = 255;
        }
      }

      const imgData = { width: size, height: size, data } as ImageData;
      expect(detectAspectFromImageData(imgData)).toBe('16:9');
    });

    it('handles solid non-transparent background correctly', () => {
      const size = 64;
      const data = new Uint8ClampedArray(size * size * 4);

      // Solid black background with alpha=255
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 10;
        data[i + 1] = 10;
        data[i + 2] = 10;
        data[i + 3] = 255;
      }

      // Foreground: bright yellow/white vertically compressed stripes
      for (let y = 8; y <= 56; y++) {
        for (let x = 8; x <= 56; x++) {
          const idx = (y * size + x) * 4;
          const isStripe = x % 3 === 0;
          if (isStripe) {
            data[idx] = 255;
            data[idx + 1] = 220;
            data[idx + 2] = 0;
            data[idx + 3] = 255;
          }
        }
      }

      const imgData = { width: size, height: size, data } as ImageData;
      expect(detectAspectFromImageData(imgData)).toBe('16:9');
    });
  });

  describe('cache and async detection', () => {
    it('returns undefined when URL not cached', () => {
      expect(getCachedLogoAspect('https://example.com/logo.png')).toBeUndefined();
    });

    it('resolves safely when given an empty or invalid URL', async () => {
      const result = await detectLogoAspect('');
      expect(result).toBe('original');
    });

    it('caches detection result for repeated queries', async () => {
      const originalImage = global.Image;
      class MockImage {
        crossOrigin = '';
        width = 64;
        height = 64;
        naturalWidth = 64;
        naturalHeight = 64;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_: string) {
          setTimeout(() => this.onload?.(), 1);
        }
      }
      global.Image = MockImage as unknown as typeof Image;

      try {
        const imgUrl = 'https://example.com/mock-logo.png';
        const result = await detectLogoAspect(imgUrl);
        expect(result).toBe('original');
        expect(getCachedLogoAspect(imgUrl)).toBe('original');
      } finally {
        global.Image = originalImage;
      }
    });

    it('deduplicates concurrent analysis of the same logo', async () => {
      const originalImage = global.Image;
      let imageCount = 0;
      class MockImage {
        crossOrigin = '';
        width = 96;
        height = 54;
        naturalWidth = 96;
        naturalHeight = 54;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor() {
          imageCount += 1;
        }
        set src(_: string) {
          setTimeout(() => this.onload?.(), 1);
        }
      }
      global.Image = MockImage as unknown as typeof Image;

      try {
        const url = 'https://example.com/shared-logo.png';
        const [first, second] = await Promise.all([detectLogoAspect(url), detectLogoAspect(url)]);
        expect(first).toBe('original');
        expect(second).toBe('original');
        expect(imageCount).toBe(1);
      } finally {
        global.Image = originalImage;
      }
    });
  });
});
