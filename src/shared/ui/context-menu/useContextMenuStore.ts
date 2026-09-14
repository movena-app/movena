import { create } from 'zustand';
import type { ReactNode } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  /** False for provider- or user-authored labels that must remain verbatim. */
  localize?: boolean | undefined;
  icon?: ReactNode | undefined;
  shortcut?: string | undefined;
  danger?: boolean | undefined;
  checked?: boolean | undefined;
  disabled?: boolean | undefined;
  isDivider?: boolean | undefined;
  action?: (() => void) | undefined;
  submenu?: ContextMenuItem[] | undefined;
}

interface ContextMenuStore {
  isOpen: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  focusOnOpen: boolean;
  openContextMenu: (
    x: number,
    y: number,
    items: ContextMenuItem[],
    options?: { focusOnOpen?: boolean | undefined },
  ) => void;
  closeContextMenu: () => void;
}

export const useContextMenuStore = create<ContextMenuStore>((set) => ({
  isOpen: false,
  x: 0,
  y: 0,
  items: [],
  focusOnOpen: false,
  openContextMenu: (x, y, items, options) =>
    set({
      isOpen: true,
      x,
      y,
      items,
      focusOnOpen: options?.focusOnOpen ?? false,
    }),
  closeContextMenu: () =>
    set({
      isOpen: false,
      items: [],
      focusOnOpen: false,
    }),
}));
