// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsNavigation } from '@/modules/settings/components/SettingsNavigation';

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  });
});

describe('responsive settings navigation', () => {
  it('uses a compact section picker at a narrow viewport width', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 800px)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(<SettingsNavigation activeSection="general" onSelect={vi.fn()} />);

    const picker = screen.getByRole('button', { name: 'Settings section' });
    expect(picker.textContent).toContain('General');
    expect(screen.getByText(/Language, window behavior, sidebar/)).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: 'Settings navigation' })).toBeNull();
  });
});
