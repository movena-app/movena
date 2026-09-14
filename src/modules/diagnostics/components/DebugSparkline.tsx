import { useI18n } from '@/shared/i18n/i18n';
import styles from './DebugOverlay.module.css';

interface DebugSparklineProps {
  label: string;
  values: Array<number | undefined>;
  formatValue: (value: number | undefined) => string;
}

export function DebugSparkline({ label, values, formatValue }: DebugSparklineProps) {
  const { t } = useI18n();
  const points = values
    .map((value, index) => ({ value, index }))
    .filter(
      (point): point is { value: number; index: number } =>
        typeof point.value === 'number' && Number.isFinite(point.value),
    );
  const latest = points.at(-1)?.value;
  const min = points.length > 0 ? Math.min(...points.map((point) => point.value)) : 0;
  const max = points.length > 0 ? Math.max(...points.map((point) => point.value)) : 0;
  const range = Math.max(max - min, 0.0001);
  const denominator = Math.max(values.length - 1, 1);
  const polyline = points
    .map(
      (point) => `${(point.index / denominator) * 240},${40 - ((point.value - min) / range) * 34}`,
    )
    .join(' ');

  return (
    <div className={styles.sparklineCard}>
      <div className={styles.sparklineHeading}>
        <span>{label}</span>
        <strong>{formatValue(latest)}</strong>
      </div>
      {points.length > 1 ? (
        <svg
          viewBox="0 0 240 44"
          role="img"
          aria-label={t('{label} history, latest {value}', { label, value: formatValue(latest) })}
        >
          <line x1="0" y1="40" x2="240" y2="40" />
          <polyline points={polyline} />
        </svg>
      ) : (
        <div className={styles.sparklineEmpty}>{t('Collecting samples…')}</div>
      )}
    </div>
  );
}
