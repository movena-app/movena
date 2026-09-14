// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';

function DialogHarness() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open dialog
      </button>
      {isOpen && (
        <ConfirmDialog
          title="Remove source?"
          description="This source can be added again later."
          confirmLabel="Remove Source"
          onConfirm={vi.fn()}
          onCancel={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

describe('shared modal focus behavior', () => {
  it('locks scrolling, traps focus, closes on Escape, and restores the trigger', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);

    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(trigger);

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Remove Source' });
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.parentElement?.dataset.uiLayer).toBe('modal');
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(trigger);
  });

  it('dismisses from the backdrop without leaking the click through the panel', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));

    const dialog = screen.getByRole('alertdialog');
    fireEvent.mouseDown(dialog);
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    fireEvent.mouseDown(dialog.parentElement!);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
