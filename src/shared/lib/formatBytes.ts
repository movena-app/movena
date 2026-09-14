import type { I18nApi } from '../i18n/i18n';

/** Formats a byte count as a locale-aware, unit-scaled string (e.g. "12.4 MB"). */
export function formatBytes(value: number | null, number: I18nApi['number']): string | null {
  if (value === null || value <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${number(value / 1024 ** index, { minimumFractionDigits: 0, maximumFractionDigits: index === 0 ? 0 : 1 })} ${units[index]}`;
}
