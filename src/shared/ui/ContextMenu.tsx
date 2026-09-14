import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Check } from 'lucide-react';
import { useContextMenuStore, type ContextMenuItem } from './context-menu/useContextMenuStore';
import styles from './ContextMenu.module.css';
import { useI18n } from '../i18n/i18n';

interface SubmenuItemProps {
  item: ContextMenuItem;
  onClose: () => void;
  parentSubmenuDirection?: 'left' | 'right' | undefined;
}

function SubmenuItem({ item, onClose }: SubmenuItemProps) {
  const { t } = useI18n();
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const pointerAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const [submenuDirection, setSubmenuDirection] = useState<'left' | 'right'>('right');
  const [submenuTop, setSubmenuTop] = useState(-6);
  const [corridorStyle, setCorridorStyle] = useState<React.CSSProperties | null>(null);

  const openSubmenu = (pointer?: { x: number; y: number }) => {
    if (item.disabled || !item.submenu || item.submenu.length === 0) return;
    pointerAnchorRef.current = pointer ?? null;
    if (itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      // If expanding to the right would breach screen width, flip left
      if (rect.right + 200 > window.innerWidth) {
        setSubmenuDirection('left');
      } else {
        setSubmenuDirection('right');
      }
    }
    setIsSubmenuOpen(true);
  };

  const handleMouseEnter = (event: React.MouseEvent<HTMLDivElement>) => {
    openSubmenu({ x: event.clientX, y: event.clientY });
  };

  const handleMouseLeave = () => {
    setIsSubmenuOpen(false);
    setCorridorStyle(null);
  };

  useLayoutEffect(() => {
    if (!isSubmenuOpen || !itemRef.current || !submenuRef.current) return;
    const parentRect = itemRef.current.getBoundingClientRect();
    const submenuRect = submenuRef.current.getBoundingClientRect();
    const viewportMargin = 12;
    const naturalTop = parentRect.top - 6;
    const latestTop = Math.max(
      viewportMargin,
      window.innerHeight - submenuRect.height - viewportMargin,
    );
    const viewportTop = Math.min(Math.max(naturalTop, viewportMargin), latestTop);
    setSubmenuTop(viewportTop - parentRect.top);

    const anchor = pointerAnchorRef.current;
    if (!anchor) {
      setCorridorStyle(null);
      return;
    }

    const seamX = submenuDirection === 'right' ? parentRect.right - 2 : parentRect.left + 2;
    const left = Math.min(anchor.x, seamX);
    const right = Math.max(anchor.x, seamX);
    const top = Math.min(anchor.y, viewportTop);
    const bottom = Math.max(anchor.y, viewportTop + submenuRect.height);
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    const apexX = ((anchor.x - left) / width) * 100;
    const apexY = ((anchor.y - top) / height) * 100;
    const seamPercent = submenuDirection === 'right' ? 100 : 0;
    const seamTopY = ((viewportTop - top) / height) * 100;
    const seamBottomY = ((viewportTop + submenuRect.height - top) / height) * 100;

    setCorridorStyle({
      left,
      top,
      width,
      height,
      clipPath: `polygon(${apexX}% ${apexY}%, ${seamPercent}% ${seamTopY}%, ${seamPercent}% ${seamBottomY}%)`,
    });
  }, [isSubmenuOpen, item.submenu?.length, submenuDirection]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowRight' || !item.submenu?.length || item.disabled) return;
    event.preventDefault();
    openSubmenu();
    requestAnimationFrame(() => {
      submenuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    });
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.disabled || item.submenu) return;
    if (item.action) {
      item.action();
    }
    onClose();
  };

  if (item.isDivider) {
    return <div className={styles.divider} />;
  }

  return (
    <div
      ref={itemRef}
      className={styles.menuItemWrapper}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
        aria-label={item.localize === false ? item.label : t(item.label)}
        aria-checked={item.checked === undefined ? undefined : item.checked}
        className={`${styles.menuItem} ${item.danger ? styles.danger : ''} ${
          item.disabled ? styles.disabled : ''
        } ${isSubmenuOpen ? styles.active : ''}`}
        onClick={handleClick}
        onFocus={item.submenu?.length ? () => openSubmenu() : undefined}
        onKeyDown={handleKeyDown}
        disabled={item.disabled}
        aria-haspopup={item.submenu?.length ? 'menu' : undefined}
        aria-expanded={item.submenu?.length ? isSubmenuOpen : undefined}
      >
        <span className={styles.iconSlot}>{item.icon}</span>
        <span className={styles.label}>{item.localize === false ? item.label : t(item.label)}</span>
        {item.checked && (
          <span className={styles.checkSlot}>
            <Check size={14} />
          </span>
        )}
        {item.shortcut && <span className={styles.shortcut}>{item.shortcut}</span>}
        {item.submenu && item.submenu.length > 0 && (
          <span className={styles.arrowSlot}>
            <ChevronRight size={14} />
          </span>
        )}
      </button>

      {isSubmenuOpen && item.submenu && item.submenu.length > 0 && (
        <>
          {corridorStyle && (
            <div className={styles.safeCorridor} style={corridorStyle} aria-hidden="true" />
          )}
          <div
            ref={submenuRef}
            role="menu"
            className={`${styles.submenuContainer} subtle-scrollbar ${
              submenuDirection === 'left' ? styles.submenuLeft : styles.submenuRight
            }`}
            style={{ top: `${submenuTop}px` }}
          >
            {item.submenu.map((subItem) => (
              <SubmenuItem key={subItem.id} item={subItem} onClose={onClose} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export const ContextMenu: React.FC = () => {
  const { t } = useI18n();
  const { isOpen, x, y, items, focusOnOpen, closeContextMenu } = useContextMenuStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [adjustedPos, setAdjustedPos] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });

  // Calculate position with screen boundary collision checks
  useEffect(() => {
    if (!isOpen) return;

    // Small delay to measure mounted menu size
    const frameId = requestAnimationFrame(() => {
      if (menuRef.current) {
        const rect = menuRef.current.getBoundingClientRect();
        let left = x;
        let top = y;

        if (left + rect.width > window.innerWidth - 12) {
          left = Math.max(12, window.innerWidth - rect.width - 12);
        }

        if (top + rect.height > window.innerHeight - 12) {
          top = Math.max(12, window.innerHeight - rect.height - 12);
        }

        setAdjustedPos({ left, top });
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [isOpen, x, y]);

  useEffect(() => {
    if (!isOpen || !focusOnOpen) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frameId = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    });

    return () => {
      cancelAnimationFrame(frameId);
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
      returnFocusRef.current = null;
    };
  }, [isOpen, focusOnOpen]);

  // Handle escape, scroll, resize, click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu();
        return;
      }

      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      const buttons = [
        ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
      ];
      if (buttons.length === 0) return;
      e.preventDefault();
      const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? buttons.length - 1
            : e.key === 'ArrowDown'
              ? currentIndex < 0
                ? 0
                : (currentIndex + 1) % buttons.length
              : currentIndex < 0
                ? buttons.length - 1
                : (currentIndex - 1 + buttons.length) % buttons.length;
      buttons[nextIndex]?.focus();
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };

    const handleScrollOrResize = () => {
      closeContextMenu();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, closeContextMenu]);

  if (!isOpen || items.length === 0) return null;

  return createPortal(
    <div
      className={styles.overlay}
      data-ui-layer="context-menu"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        ref={menuRef}
        role="menu"
        aria-label={t('Actions')}
        className={`${styles.menuContainer} subtle-scrollbar`}
        style={{
          left: `${adjustedPos.left}px`,
          top: `${adjustedPos.top}px`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item) => (
          <SubmenuItem key={item.id} item={item} onClose={closeContextMenu} />
        ))}
      </div>
    </div>,
    document.body,
  );
};
