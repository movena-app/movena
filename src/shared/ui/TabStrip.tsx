import type { KeyboardEvent } from 'react';
import { useI18n } from '../i18n/i18n';
import styles from './TabStrip.module.css';

interface TabStripOption<T extends string | number> {
  value: T;
  label: string;
}

interface TabStripProps<T extends string | number> {
  options: TabStripOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  id?: string | undefined;
  panelId?: string | undefined;
  className?: string | undefined;
}

export function TabStrip<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  id,
  panelId,
  className = '',
}: TabStripProps<T>) {
  const { t } = useI18n();
  const selectTab = (index: number, currentTarget: HTMLButtonElement) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tabIndex: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    event.preventDefault();
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : (tabIndex + (event.key === 'ArrowLeft' ? -1 : 1) + options.length) % options.length;
    selectTab(nextIndex, event.currentTarget);
  };

  return (
    <div
      className={`${styles.container} ${className}`}
      role="tablist"
      aria-label={t(ariaLabel)}
      aria-orientation="horizontal"
    >
      {options.map((option, index) => {
        const isSelected = option.value === value;
        return (
          <button
            key={String(option.value)}
            id={id ? `${id}-tab-${index}` : undefined}
            type="button"
            className={`${styles.tab} ${isSelected ? styles.active : ''}`}
            role="tab"
            aria-label={t(option.label)}
            aria-selected={isSelected}
            aria-controls={panelId}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {t(option.label)}
          </button>
        );
      })}
    </div>
  );
}
