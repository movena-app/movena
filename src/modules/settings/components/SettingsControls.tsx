import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Button } from '@/shared/ui/Button';
import { useI18n } from '@/shared/i18n/i18n';
import styles from './SettingsControls.module.css';

export function SettingsPageContent({ children }: { children: ReactNode }) {
  return <div className={styles.pageContent}>{children}</div>;
}

interface SettingsGroupProps {
  title: string;
  description?: string | undefined;
  children: ReactNode;
  danger?: boolean | undefined;
}

export function SettingsGroup({
  title,
  description,
  children,
  danger = false,
}: SettingsGroupProps) {
  const { t } = useI18n();
  return (
    <section className={`${styles.group} ${danger ? styles.groupDanger : ''}`}>
      <header className={styles.groupHeader}>
        <h2 className={styles.groupTitle}>{t(title)}</h2>
        {description && <p className={styles.groupDescription}>{t(description)}</p>}
      </header>
      <div className={styles.groupRows}>{children}</div>
    </section>
  );
}

interface SettingsRowProps {
  title: string;
  description?: ReactNode | undefined;
  children: ReactNode;
  disabled?: boolean | undefined;
  alignStart?: boolean | undefined;
  wideControl?: boolean | undefined;
}

export function SettingsRow({
  title,
  description,
  children,
  disabled = false,
  alignStart = false,
  wideControl = false,
}: SettingsRowProps) {
  const { t } = useI18n();
  return (
    <div
      className={`${styles.row} ${disabled ? styles.rowDisabled : ''} ${alignStart ? styles.rowAlignStart : ''} ${wideControl ? styles.rowWideControl : ''}`}
    >
      <div className={styles.rowInfo}>
        <span className={styles.rowTitle}>{t(title)}</span>
        {description && (
          <span className={styles.rowDescription}>
            {typeof description === 'string' ? t(description) : description}
          </span>
        )}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  );
}

interface SettingsToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean | undefined;
}

export function SettingsToggle({
  checked,
  onChange,
  label,
  disabled = false,
}: SettingsToggleProps) {
  const id = useId();
  const { t } = useI18n();
  return (
    <label className={styles.toggle} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        aria-label={t(label)}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.toggleTrack} aria-hidden="true">
        <span className={styles.toggleThumb} />
      </span>
    </label>
  );
}

type SettingsButtonVariant = 'default' | 'primary' | 'danger';

interface SettingsButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: SettingsButtonVariant | undefined;
  iconOnly?: boolean | undefined;
}

export function SettingsButton({
  variant = 'default',
  iconOnly = false,
  className = '',
  type = 'button',
  children,
  ...props
}: SettingsButtonProps) {
  return (
    <Button
      {...props}
      type={type}
      variant={variant}
      className={`${styles.button} ${iconOnly ? styles.buttonIconOnly : ''} ${className}`}
    >
      {children}
    </Button>
  );
}

export function SettingsInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useI18n();
  const label = props['aria-label'];
  return (
    <input
      {...props}
      className={`uiField ${styles.input} ${className}`}
      aria-label={typeof label === 'string' ? t(label) : label}
      placeholder={typeof props.placeholder === 'string' ? t(props.placeholder) : props.placeholder}
      title={typeof props.title === 'string' ? t(props.title) : props.title}
    />
  );
}

interface SettingsRangeProps extends InputHTMLAttributes<HTMLInputElement> {
  formatValue?: ((value: number) => string) | undefined;
}

export function SettingsRange({
  formatValue = (value) => String(value),
  className = '',
  ...props
}: SettingsRangeProps) {
  const numericValue = typeof props.value === 'number' ? props.value : Number(props.value ?? 0);
  const { t } = useI18n();
  const label = props['aria-label'];
  return (
    <div className={styles.rangeControl}>
      <input
        {...props}
        type="range"
        className={`${styles.range} ${className}`}
        aria-label={typeof label === 'string' ? t(label) : label}
        title={typeof props.title === 'string' ? t(props.title) : props.title}
      />
      <output className={styles.rangeValue}>{formatValue(numericValue)}</output>
    </div>
  );
}
