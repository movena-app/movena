import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu } from '@/shared/ui/ContextMenu';
import { useContextMenuStore } from '@/shared/ui/context-menu/useContextMenuStore';

beforeEach(() => {
  useContextMenuStore.getState().closeContextMenu();
});

describe('ContextMenu interaction contract', () => {
  it('focuses the first action, supports keyboard navigation, and restores focus on Escape', async () => {
    const firstAction = vi.fn();
    render(
      <>
        <button type="button">Launcher</button>
        <ContextMenu />
      </>,
    );
    const launcher = screen.getByRole('button', { name: 'Launcher' });
    launcher.focus();

    act(() =>
      useContextMenuStore.getState().openContextMenu(
        20,
        30,
        [
          { id: 'first', label: 'First action', action: firstAction },
          { id: 'disabled', label: 'Disabled action', disabled: true },
          { id: 'danger', label: 'Danger action', danger: true },
        ],
        { focusOnOpen: true },
      ),
    );

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'First action' })),
    );
    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Danger action' }));
    await userEvent.keyboard('{Home}{Enter}');
    expect(firstAction).toHaveBeenCalledOnce();
    expect(useContextMenuStore.getState().isOpen).toBe(false);

    act(() =>
      useContextMenuStore
        .getState()
        .openContextMenu(20, 30, [{ id: 'first', label: 'First action' }], { focusOnOpen: true }),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'First action' })),
    );
    await userEvent.keyboard('{Escape}');
    expect(useContextMenuStore.getState().isOpen).toBe(false);
    expect(document.activeElement).toBe(launcher);
  });

  it('opens submenus from the keyboard and dismisses on outside pointer input', async () => {
    render(<ContextMenu />);
    act(() =>
      useContextMenuStore.getState().openContextMenu(
        20,
        30,
        [
          {
            id: 'parent',
            label: 'More actions',
            submenu: [{ id: 'child', label: 'Nested action' }],
          },
        ],
        { focusOnOpen: true },
      ),
    );

    const parent = await screen.findByRole('menuitem', { name: 'More actions' });
    parent.focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Nested action' })),
    );

    fireEvent.mouseDown(document.body);
    expect(useContextMenuStore.getState().isOpen).toBe(false);
  });
});
