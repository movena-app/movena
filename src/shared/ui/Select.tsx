import { useState, useRef, useEffect, useCallback, useLayoutEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import styles from './Select.module.css';
import { MOTION_DURATION, MOTION_EASE } from '../design/motion';
import { useI18n } from '../i18n/i18n';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  /** Keep provider data and language autonyms out of interface translation. */
  localize?: boolean | undefined;
}

export interface SelectProps<T extends string | number> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean | undefined;
  className?: string | undefined;
  width?: string | number | undefined;
  variant?: 'default' | 'player' | 'settings' | undefined;
  ariaLabel?: string | undefined;
}

interface DropdownCoords {
  left: number;
  width: number;
  top?: number | undefined;
  bottom?: number | undefined;
  placement: 'top' | 'bottom';
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  disabled = false,
  className,
  width,
  variant = 'default',
  ariaLabel,
}: SelectProps<T>) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState<DropdownCoords | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selectedOption = options.find((opt) => opt.value === value) || options[0];
  const selectedIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value),
  );

  const open = useCallback(
    (index = selectedIndex) => {
      if (disabled || options.length === 0) return;
      setActiveIndex(index);
      setIsOpen(true);
    },
    [disabled, options.length, selectedIndex],
  );

  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    const estimatedHeight = Math.min(options.length * 36 + 12, 260);
    const placement = spaceBelow < estimatedHeight && spaceAbove > spaceBelow ? 'top' : 'bottom';

    if (placement === 'top') {
      setCoords({
        left: rect.left,
        width: rect.width,
        bottom: viewportHeight - rect.top + 4,
        placement: 'top',
      });
    } else {
      setCoords({
        left: rect.left,
        width: rect.width,
        top: rect.bottom + 4,
        placement: 'bottom',
      });
    }
  }, [options.length]);

  useLayoutEffect(() => {
    if (isOpen) {
      updateCoords();
    }
  }, [isOpen, updateCoords]);

  useEffect(() => {
    if (!isOpen || !coords) return;
    const frame = requestAnimationFrame(() => dropdownRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isOpen, coords]);

  useEffect(() => {
    if (!isOpen) return;
    document
      .getElementById(`${listboxId}-option-${activeIndex}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen, listboxId]);

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updateCoords();
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updateCoords]);

  const handleSelect = (val: T) => {
    onChange(val);
    setIsOpen(false);
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open(event.key === 'ArrowDown' ? selectedIndex : Math.max(0, selectedIndex - 1));
    }
  };

  const handleListboxKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) => (index + direction + options.length) % options.length);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (options[activeIndex]) handleSelect(options[activeIndex].value);
      triggerRef.current?.focus();
    }
  };

  return (
    <div
      className={`${styles.selectContainer} ${className || ''}`}
      style={{
        width: width || 'auto',
        minWidth: typeof width === 'number' ? `${width}px` : width || '200px',
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${variant === 'player' ? styles.playerTrigger : ''} ${variant === 'settings' ? styles.settingsTrigger : ''} ${isOpen ? styles.triggerOpen : ''}`}
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-label={ariaLabel ? t(ariaLabel) : undefined}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
      >
        <span className={styles.triggerText}>
          {selectedOption
            ? selectedOption.localize === false
              ? selectedOption.label
              : t(selectedOption.label)
            : ''}
        </span>
        <ChevronDown
          size={14}
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
        />
      </button>

      {createPortal(
        <AnimatePresence>
          {isOpen && !disabled && coords && (
            <motion.div
              ref={dropdownRef}
              id={listboxId}
              className={`${styles.dropdown} ${variant === 'player' ? styles.playerDropdown : ''} subtle-scrollbar`}
              data-ui-layer={variant === 'player' ? 'player-popover' : 'dropdown'}
              role="listbox"
              tabIndex={-1}
              aria-activedescendant={`${listboxId}-option-${activeIndex}`}
              onKeyDown={handleListboxKeyDown}
              style={{
                left: `${coords.left}px`,
                width: `${coords.width}px`,
                top: coords.top !== undefined ? `${coords.top}px` : undefined,
                bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
              }}
              initial={{
                opacity: 0,
                y: coords.placement === 'top' ? 4 : -4,
                scale: 0.98,
              }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{
                opacity: 0,
                y: coords.placement === 'top' ? 4 : -4,
                scale: 0.98,
              }}
              transition={{ duration: MOTION_DURATION.normal, ease: MOTION_EASE.standard }}
            >
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={String(option.value)}
                    id={`${listboxId}-option-${options.indexOf(option)}`}
                    type="button"
                    role="option"
                    aria-label={option.localize === false ? option.label : t(option.label)}
                    aria-selected={isSelected}
                    tabIndex={-1}
                    className={`${styles.option} ${isSelected ? styles.selectedOption : ''} ${options.indexOf(option) === activeIndex ? styles.activeOption : ''}`}
                    onClick={() => handleSelect(option.value)}
                    onMouseEnter={() => setActiveIndex(options.indexOf(option))}
                  >
                    <span>{option.localize === false ? option.label : t(option.label)}</span>
                    {isSelected && <Check size={14} className={styles.checkIcon} />}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
