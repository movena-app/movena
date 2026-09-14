/**
 * Smart aspect ratio detector for Live TV channel logos.
 *
 * Many IPTV providers force 16:9 or 4:3 widescreen logos into 1:1 square raster files
 * without maintaining aspect ratio. This module analyzes logo pixel data to detect
 * squished/stretched patterns and returns the corrective aspect ratio.
 */

export type LogoAspect = 'original' | '16:9' | '4:3';

// Bounded in-memory LRU cache for detection results
const MAX_CACHE_SIZE = 1500;
const MAX_CONCURRENT_DETECTIONS = 3;
const logoAspectCache = new Map<string, LogoAspect>();
const pendingDetections: Array<() => void> = [];
const inFlightDetections = new Map<string, Promise<LogoAspect>>();
let activeDetections = 0;

function pixel(data: ArrayLike<number>, index: number): number {
  return data[index] ?? 0;
}

function pumpDetectionQueue(): void {
  while (activeDetections < MAX_CONCURRENT_DETECTIONS) {
    const start = pendingDetections.shift();
    if (!start) return;
    activeDetections += 1;
    start();
  }
}

/** Clear cache (primarily for tests) */
export function clearLogoAspectCache(): void {
  logoAspectCache.clear();
}

/** Get cached aspect if already analyzed */
export function getCachedLogoAspect(url: string | undefined): LogoAspect | undefined {
  if (!url) return undefined;
  return logoAspectCache.get(url);
}

/**
 * Analyzes pixel data from an ImageData object to detect whether a logo
 * has been squashed horizontally from 16:9 or 4:3 into a square/near-square.
 */
export function detectAspectFromImageData(imageData: ImageData): LogoAspect {
  const { width, height, data } = imageData;
  if (width < 8 || height < 8) return 'original';

  // 1. Estimate background color from outer borders
  let bgR = 0,
    bgG = 0,
    bgB = 0,
    bgA = 0;
  let borderPixelCount = 0;

  for (let x = 0; x < width; x++) {
    // Top and bottom borders
    for (const y of [0, height - 1]) {
      const idx = (y * width + x) * 4;
      bgR += pixel(data, idx);
      bgG += pixel(data, idx + 1);
      bgB += pixel(data, idx + 2);
      bgA += pixel(data, idx + 3);
      borderPixelCount++;
    }
  }

  for (let y = 1; y < height - 1; y++) {
    // Left and right borders
    for (const x of [0, width - 1]) {
      const idx = (y * width + x) * 4;
      bgR += pixel(data, idx);
      bgG += pixel(data, idx + 1);
      bgB += pixel(data, idx + 2);
      bgA += pixel(data, idx + 3);
      borderPixelCount++;
    }
  }

  bgR /= borderPixelCount;
  bgG /= borderPixelCount;
  bgB /= borderPixelCount;
  bgA /= borderPixelCount;

  const isBgTransparent = bgA < 32;

  // 2. Identify foreground pixels and bounding box
  let minX = width,
    maxX = 0,
    minY = height,
    maxY = 0;
  let fgCount = 0;

  // Luminance map for gradient calculation
  const luma = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = pixel(data, idx);
      const g = pixel(data, idx + 1);
      const b = pixel(data, idx + 2);
      const a = pixel(data, idx + 3);

      luma[y * width + x] = 0.299 * r + 0.587 * g + 0.114 * b;

      let isFg = false;
      if (isBgTransparent) {
        isFg = a >= 32;
      } else {
        const colorDiff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
        isFg = colorDiff > 40 && a >= 32;
      }

      if (isFg) {
        fgCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Not enough foreground content to confidently determine squish
  const totalPixels = width * height;
  if (fgCount < totalPixels * 0.04 || maxX <= minX || maxY <= minY) {
    return 'original';
  }

  const fgWidth = maxX - minX + 1;
  const fgHeight = maxY - minY + 1;
  const fgAspectRatio = fgWidth / fgHeight;

  // If the foreground content itself is already distinctly wide (>= 1.45), it's not squished
  if (fgAspectRatio >= 1.45) {
    return 'original';
  }

  // 3. Compute directional gradient energy (Sobel-like difference)
  // Horizontally compressed images feature high-frequency vertical edges (dense x-gradients)
  // relative to horizontal edges (y-gradients).
  let gradX = 0;
  let gradY = 0;
  let gradSamples = 0;

  for (let y = minY + 1; y < maxY - 1; y++) {
    for (let x = minX + 1; x < maxX - 1; x++) {
      const idx = y * width + x;
      const gx = Math.abs(pixel(luma, idx + 1) - pixel(luma, idx - 1));
      const gy = Math.abs(pixel(luma, idx + width) - pixel(luma, idx - width));

      // Only count gradients with meaningful contrast
      if (gx > 15 || gy > 15) {
        gradX += gx;
        gradY += gy;
        gradSamples++;
      }
    }
  }

  if (gradSamples < 16) {
    return 'original';
  }

  const gradRatio = gradX / Math.max(1, gradY);

  // 4. Calculate spatial inertia moments of foreground (to measure elongation of symbols)
  let sumX = 0,
    sumY = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const idx = (y * width + x) * 4;
      const a = pixel(data, idx + 3);
      const isFg = isBgTransparent
        ? a >= 32
        : Math.abs(pixel(data, idx) - bgR) +
            Math.abs(pixel(data, idx + 1) - bgG) +
            Math.abs(pixel(data, idx + 2) - bgB) >
          40;
      if (isFg) {
        sumX += x;
        sumY += y;
      }
    }
  }

  const centerX = sumX / fgCount;
  const centerY = sumY / fgCount;

  let mu20 = 0; // horizontal variance
  let mu02 = 0; // vertical variance

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const idx = (y * width + x) * 4;
      const a = pixel(data, idx + 3);
      const isFg = isBgTransparent
        ? a >= 32
        : Math.abs(pixel(data, idx) - bgR) +
            Math.abs(pixel(data, idx + 1) - bgG) +
            Math.abs(pixel(data, idx + 2) - bgB) >
          40;
      if (isFg) {
        const dx = x - centerX;
        const dy = y - centerY;
        mu20 += dx * dx;
        mu02 += dy * dy;
      }
    }
  }

  // Squished 16:9 logos typically have high vertical extent, high gradX/gradY,
  // and aspect ratio compressed to <= 1.25 inside a square box.
  const inertiaRatio = mu20 > 0 ? mu02 / mu20 : 1.0;

  // Score combining gradient compression and inertia
  if (fgAspectRatio <= 1.25) {
    if (gradRatio >= 1.55 || (gradRatio >= 1.35 && inertiaRatio >= 1.25)) {
      return '16:9';
    }
    if (gradRatio >= 1.22 || (gradRatio >= 1.15 && inertiaRatio >= 1.12)) {
      return '4:3';
    }
  }

  return 'original';
}

/**
 * Asynchronously detects the squish aspect ratio of a logo image URL.
 */
function performLogoAspectDetection(url: string): Promise<LogoAspect> {
  return new Promise<LogoAspect>((resolve) => {
    // If running in an environment without DOM (like node tests without canvas mock), fallback safely
    if (typeof window === 'undefined' || typeof Image === 'undefined') {
      resolve('original');
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    let settled = false;

    const finish = (result: LogoAspect, cacheResult: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      if (cacheResult && logoAspectCache.size >= MAX_CACHE_SIZE) {
        // Drop oldest entries
        const firstKey = logoAspectCache.keys().next().value;
        if (firstKey) logoAspectCache.delete(firstKey);
      }
      if (cacheResult) logoAspectCache.set(url, result);
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish('original', false);
      img.src = '';
    }, 2500);

    img.onload = () => {
      const analyze = () => {
        try {
          const naturalWidth = img.naturalWidth || img.width;
          const naturalHeight = img.naturalHeight || img.height;

          // If the raster image is already explicitly wide (e.g. 16:9 file), no unsquish needed
          if (naturalWidth / naturalHeight >= 1.45) {
            finish('original', true);
            return;
          }

          // Draw to small offscreen canvas for fast analysis
          const canvas = document.createElement('canvas');
          const targetSize = 64;
          canvas.width = targetSize;
          canvas.height = targetSize;

          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            finish('original', true);
            return;
          }

          ctx.drawImage(img, 0, 0, targetSize, targetSize);
          const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
          finish(detectAspectFromImageData(imageData), true);
        } catch {
          // Cross-origin taint or canvas error -> fallback safely
          finish('original', false);
        }
      };

      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(analyze, { timeout: 250 });
      } else {
        setTimeout(analyze, 0);
      }
    };

    img.onerror = () => {
      finish('original', false);
    };

    img.src = url;
  });
}

function runLogoAspectDetection(url: string): Promise<LogoAspect> {
  return new Promise<LogoAspect>((resolve) => {
    const complete = (result: LogoAspect) => {
      activeDetections = Math.max(0, activeDetections - 1);
      resolve(result);
      pumpDetectionQueue();
    };
    void performLogoAspectDetection(url).then(complete, () => complete('original'));
  });
}

export async function detectLogoAspect(url: string): Promise<LogoAspect> {
  if (!url) return 'original';

  const cached = logoAspectCache.get(url);
  if (cached) return cached;
  const inFlight = inFlightDetections.get(url);
  if (inFlight) return inFlight;

  const request = new Promise<LogoAspect>((resolve) => {
    pendingDetections.push(() => {
      void runLogoAspectDetection(url).then(resolve);
    });
    pumpDetectionQueue();
  });
  inFlightDetections.set(url, request);
  void request.then(() => {
    if (inFlightDetections.get(url) === request) inFlightDetections.delete(url);
  });
  return request;
}
