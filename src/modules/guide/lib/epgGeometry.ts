const MINUTE = 60_000;

export function epgNowScrollLeft(
  now: number,
  windowStart: number,
  pixelsPerMinute: number,
  inset: number,
): number {
  if (!Number.isFinite(now) || !Number.isFinite(windowStart) || !Number.isFinite(pixelsPerMinute))
    return 0;
  return Math.max(0, ((now - windowStart) / MINUTE) * pixelsPerMinute - inset);
}
