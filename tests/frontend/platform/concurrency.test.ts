import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '@/shared/lib/concurrency';

describe('mapWithConcurrency', () => {
  it('keeps input order while never running more than the limit at once', async () => {
    let running = 0;
    let peak = 0;
    const result = await mapWithConcurrency([30, 5, 20, 1, 10], 2, async (delay) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, delay));
      running -= 1;
      return delay * 2;
    });

    expect(result).toEqual([60, 10, 40, 2, 20]);
    expect(peak).toBe(2);
  });

  it('handles empty input and treats a limit below one as one', async () => {
    await expect(mapWithConcurrency([], 4, async () => 1)).resolves.toEqual([]);
    let running = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3], 0, async (value) => {
      running += 1;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running -= 1;
      return value;
    });
    expect(peak).toBe(1);
  });

  it('rejects with the first worker failure', async () => {
    await expect(
      mapWithConcurrency([1, 2], 2, async (value) => {
        if (value === 2) throw new Error('lookup failed');
        return value;
      }),
    ).rejects.toThrow('lookup failed');
  });
});
