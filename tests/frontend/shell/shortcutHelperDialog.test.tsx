// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ShortcutHelperDialog } from '@/app/components/ShortcutHelperDialog';

describe('ShortcutHelperDialog Component', () => {
  it('renders all key sections and triggers onClose when clicked', async () => {
    const handleClose = vi.fn();
    render(<ShortcutHelperDialog onClose={handleClose} />);
    const user = userEvent.setup();

    // Check title and categories
    expect(screen.getByText('Keyboard Shortcuts')).toBeTruthy();
    expect(screen.getByText('Global Navigation')).toBeTruthy();
    expect(screen.getByText('Player Controls')).toBeTruthy();

    // Check presence of some shortcut keys
    expect(screen.getAllByText('Ctrl').length).toBeGreaterThan(0);
    expect(screen.getByText(/Space/)).toBeTruthy();
    expect(screen.getByText('Esc')).toBeTruthy();

    // Clicking close button triggers onClose
    const closeBtn = screen.getByRole('button', { name: 'Close shortcuts' });
    await user.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
