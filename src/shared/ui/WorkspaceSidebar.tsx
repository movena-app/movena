import type React from 'react';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import styles from './WorkspaceSidebar.module.css';
import { useI18n } from '../i18n/i18n';

export const WORKSPACE_SIDEBAR_DEFAULT_WIDTH = 260;
const WORKSPACE_SIDEBAR_MIN_WIDTH = 180;
export const WORKSPACE_SIDEBAR_MAX_WIDTH = 520;

interface WorkspaceSidebarProps {
  className?: string | undefined;
  title?: string | undefined;
  count?: number | undefined;
  width: number;
  onWidthChange: (width: number) => void;
  headerAction?: ReactNode | undefined;
  headerContent?: ReactNode | undefined;
  ariaLabel?: string | undefined;
  children: ReactNode;
}

/** Shared shell for secondary navigation beside the main application rail. */
export function WorkspaceSidebar({
  className,
  title,
  count,
  width,
  onWidthChange,
  headerAction,
  headerContent,
  ariaLabel,
  children,
}: WorkspaceSidebarProps) {
  const { t, number } = useI18n();
  const sidebarRef = useRef<HTMLElement>(null);
  const drag = useRef({ x: 0, startWidth: 0, width: 0 });
  const [isResizing, setIsResizing] = useState(false);

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, startWidth: width, width };
      setIsResizing(true);
    },
    [width],
  );

  const handleResizeMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = Math.min(
      WORKSPACE_SIDEBAR_MAX_WIDTH,
      Math.max(
        WORKSPACE_SIDEBAR_MIN_WIDTH,
        drag.current.startWidth + (event.clientX - drag.current.x),
      ),
    );
    drag.current.width = next;
    sidebarRef.current?.style.setProperty('--sidebar-width', `${next}px`);
  }, []);

  const handleResizeEnd = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setIsResizing(false);
      if (drag.current.width !== drag.current.startWidth) onWidthChange(drag.current.width);
    },
    [onWidthChange],
  );

  const handleResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 40 : 10;
      const next =
        event.key === 'Home'
          ? WORKSPACE_SIDEBAR_DEFAULT_WIDTH
          : Math.min(
              WORKSPACE_SIDEBAR_MAX_WIDTH,
              Math.max(
                WORKSPACE_SIDEBAR_MIN_WIDTH,
                width + (event.key === 'ArrowRight' ? step : -step),
              ),
            );
      onWidthChange(next);
    },
    [onWidthChange, width],
  );

  return (
    <aside
      ref={sidebarRef}
      className={`${styles.sidebar} ${isResizing ? styles.resizing : ''} ${className ?? ''}`}
      style={{ '--sidebar-width': `${width}px` } as React.CSSProperties}
      aria-label={t(ariaLabel ?? title ?? 'Sidebar')}
    >
      <div className={styles.header}>
        {(title || headerAction) && (
          <div className={styles.titleRow}>
            {title && (
              <h3 className={styles.title}>
                {t(title)}
                {count !== undefined && count > 0 && (
                  <span className={styles.count}> ({number(count)})</span>
                )}
              </h3>
            )}
            {headerAction}
          </div>
        )}
        {headerContent}
      </div>

      <div className={`${styles.list} subtle-scrollbar`}>{children}</div>

      <button
        type="button"
        className={`${styles.resizeHandle} ${isResizing ? styles.resizeHandleActive : ''}`}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        onKeyDown={handleResizeKeyDown}
        onDoubleClick={() => onWidthChange(WORKSPACE_SIDEBAR_DEFAULT_WIDTH)}
        aria-label={t('Resize sidebar. Use left and right arrows; Home resets.')}
      />
    </aside>
  );
}

interface WorkspaceSidebarSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  ariaLabel?: string | undefined;
}

/** Consistent filtering control for shared secondary navigation. */
export function WorkspaceSidebarSearch({
  value,
  onChange,
  placeholder = 'Search...',
  ariaLabel = placeholder,
}: WorkspaceSidebarSearchProps) {
  const { t } = useI18n();
  return (
    <div className={styles.searchBox}>
      <Search size={14} className={styles.searchIcon} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            onChange('');
          }
        }}
        className={`${styles.searchInput} uiField`}
        placeholder={t(placeholder)}
        aria-label={t(ariaLabel)}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
      />
      {value && (
        <button
          type="button"
          className={styles.clearSearchButton}
          onClick={() => onChange('')}
          aria-label={t('Clear search')}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

interface WorkspaceSidebarNavItemProps {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}

export function WorkspaceSidebarNavItem({
  label,
  icon,
  active,
  onClick,
}: WorkspaceSidebarNavItemProps) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
      onClick={onClick}
      aria-current={active ? 'location' : undefined}
    >
      <span className={styles.navIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.navLabel}>{t(label)}</span>
    </button>
  );
}
