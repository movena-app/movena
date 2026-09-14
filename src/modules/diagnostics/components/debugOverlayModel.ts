import type { LogEntry } from '../store/useDebugStore';
import type { usePlayerStore } from '@/modules/playback/public/store/usePlayerStore';

export type DebugTab = 'overview' | 'logs' | 'network' | 'player' | 'state';
export type NumberFormatter = (value: number, options?: Intl.NumberFormatOptions) => string;

export function formatDebugTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function formatMilliseconds(
  value: number | null | undefined,
  number: NumberFormatter,
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value >= 1000
    ? `${number(value / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`
    : `${number(Math.round(value))} ms`;
}

export function formatBitrate(bitsPerSecond: number | undefined, number: NumberFormatter): string {
  if (typeof bitsPerSecond !== 'number' || !Number.isFinite(bitsPerSecond)) return '—';
  if (bitsPerSecond >= 1_000_000)
    return `${number(bitsPerSecond / 1_000_000, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mbps`;
  return `${number(Math.round(bitsPerSecond / 1000))} kbps`;
}

export function formatByteRate(
  bytesPerSecond: number | undefined,
  number: NumberFormatter,
): string {
  if (typeof bytesPerSecond !== 'number' || !Number.isFinite(bytesPerSecond)) return '—';
  if (bytesPerSecond >= 1_000_000)
    return `${number(bytesPerSecond / 1_000_000, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MB/s`;
  return `${number(Math.round(bytesPerSecond / 1000))} kB/s`;
}

export function formatSignedMilliseconds(
  seconds: number | undefined,
  number: NumberFormatter,
): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—';
  const milliseconds = seconds * 1000;
  return `${milliseconds > 0 ? '+' : ''}${number(milliseconds, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ms`;
}

export function playerPhase(player: ReturnType<typeof usePlayerStore.getState>): string {
  if (!player.activeStream) return 'Idle';
  if (player.eofReached) return 'Ended';
  if (!player.isVideoReady) return 'Starting';
  if (player.isBuffering) return 'Buffering';
  return player.isPlaying ? 'Playing' : 'Paused';
}

export function searchableDetails(log: LogEntry): string {
  if (log.details === undefined || log.details === null) return '';
  return typeof log.details === 'string' ? log.details : JSON.stringify(log.details);
}
