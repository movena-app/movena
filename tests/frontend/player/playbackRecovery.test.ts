import { describe, expect, it } from 'vitest';
import {
  clearPlaybackRecovery,
  readPlaybackRecovery,
  writePlaybackRecovery,
} from '@/modules/playback/lib/playbackRecovery';

describe('playback recovery marker', () => {
  it('round trips safe playback metadata without a stream URL', () => {
    const values = new Map<string, string>();
    const storage = {
      setItem: (key: string, value: string) => values.set(key, value),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
    };
    writePlaybackRecovery(
      { streamId: '7', title: 'News', type: 'live', currentTime: 2, duration: 0, savedAt: 100 },
      storage,
    );
    expect(readPlaybackRecovery(storage, 200)?.title).toBe('News');
    expect(values.get('movena-playback-recovery-v1')).not.toContain('http');
    clearPlaybackRecovery(storage);
    expect(readPlaybackRecovery(storage, 200)).toBeNull();
  });

  it('rejects stale or malformed markers', () => {
    const storage = { getItem: () => '{"streamId":"x","title":"x","type":"vod","savedAt":0}' };
    expect(readPlaybackRecovery(storage, Date.now())).toBeNull();
  });
});
