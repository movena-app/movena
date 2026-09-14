export interface PlaybackRecoveryRecord {
  streamId: string;
  title: string;
  type: 'live' | 'vod' | 'series';
  sourceId?: string | undefined;
  sourceItemId?: string | undefined;
  currentTime: number;
  duration: number;
  savedAt: number;
}

const PLAYBACK_RECOVERY_KEY = 'movena-playback-recovery-v1';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function readPlaybackRecovery(
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined'
    ? null
    : localStorage,
  now = Date.now(),
): PlaybackRecoveryRecord | null {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(
      storage.getItem(PLAYBACK_RECOVERY_KEY) || 'null',
    ) as Partial<PlaybackRecoveryRecord> | null;
    if (
      !parsed ||
      typeof parsed.streamId !== 'string' ||
      typeof parsed.title !== 'string' ||
      typeof parsed.savedAt !== 'number'
    )
      return null;
    if (
      !Number.isFinite(parsed.savedAt) ||
      now - parsed.savedAt < 0 ||
      now - parsed.savedAt > MAX_AGE_MS
    )
      return null;
    if (parsed.type !== 'live' && parsed.type !== 'vod' && parsed.type !== 'series') return null;
    return {
      streamId: parsed.streamId,
      title: parsed.title,
      type: parsed.type,
      sourceId: typeof parsed.sourceId === 'string' ? parsed.sourceId : undefined,
      sourceItemId: typeof parsed.sourceItemId === 'string' ? parsed.sourceItemId : undefined,
      currentTime:
        typeof parsed.currentTime === 'number' && Number.isFinite(parsed.currentTime)
          ? Math.max(0, parsed.currentTime)
          : 0,
      duration:
        typeof parsed.duration === 'number' && Number.isFinite(parsed.duration)
          ? Math.max(0, parsed.duration)
          : 0,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function writePlaybackRecovery(
  record: PlaybackRecoveryRecord,
  storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined'
    ? null
    : localStorage,
): void {
  if (!storage) return;
  try {
    storage.setItem(PLAYBACK_RECOVERY_KEY, JSON.stringify(record));
  } catch {
    /* storage is optional */
  }
}

export function clearPlaybackRecovery(
  storage: Pick<Storage, 'removeItem'> | null = typeof localStorage === 'undefined'
    ? null
    : localStorage,
): void {
  try {
    storage?.removeItem(PLAYBACK_RECOVERY_KEY);
  } catch {
    /* storage is optional */
  }
}
