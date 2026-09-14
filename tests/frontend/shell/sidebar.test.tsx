// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/app/shell/Sidebar';
import { useLibraryStore } from '@/modules/library/store/useLibraryStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

describe('Sidebar library counts', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    useLibraryStore.setState({
      history: [
        {
          id: 'history-1',
          title: 'Movie',
          type: 'vod',
          posterUrl: '',
          progressPercentage: 42,
          lastWatchedAt: 1,
        },
      ],
      favorites: [],
      collections: [],
    });
  });

  it('shows a collapsed library count while announcing its full label', () => {
    useSettingsStore.setState({ sidebarCollapsed: true, showCollapsedSidebarBadges: true });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Continue Watching, 1 item' });
    expect(link.getAttribute('title')).toBe('Continue Watching (1)');
    expect(link.querySelector('[class*="collapsedBadge"]')?.textContent).toBe('1');
  });

  it('can hide collapsed library counts without changing their accessible labels', () => {
    useSettingsStore.setState({ sidebarCollapsed: true, showCollapsedSidebarBadges: false });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Continue Watching, 1 item' });
    expect(link.getAttribute('title')).toBe('Continue Watching (1)');
    expect(document.querySelector('aside')?.className).not.toContain('showCollapsedBadges');
  });

  it('shows the restrained inline count when the sidebar is expanded', () => {
    useSettingsStore.setState({ sidebarCollapsed: false });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Continue Watching/ }).textContent).toContain('1');
  });

  it('keeps collapsed navigation links accessible after their labels leave the rail', () => {
    useSettingsStore.setState({ sidebarCollapsed: true });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Home' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy();
  });

  it('uses one explicit sidebar toggle and keeps the wordmark decorative', () => {
    useSettingsStore.setState({ sidebarCollapsed: false });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(screen.getByRole('complementary', { name: 'Primary navigation' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Collapse sidebar' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Expand sidebar' })).toBeNull();
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
  });

  function setCompactViewport(matches: boolean) {
    const mediaQuery = {
      matches,
      media: '(max-width: 640px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } satisfies MediaQueryList;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn(() => mediaQuery),
    });
    return mediaQuery;
  }

  it('hides the Coming Up workspace when its master preference is disabled', () => {
    useSettingsStore.setState({ upcomingEnabled: false, sidebarCollapsed: false });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: 'Coming Up' })).toBeNull();
  });

  it('uses the compact rail without changing the saved normal-width preference', () => {
    setCompactViewport(true);
    useSettingsStore.setState({ sidebarCollapsed: false });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(document.querySelector('aside')?.className).toContain('collapsed');
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('title')).toBe('Home');
    expect(
      (
        screen.getByRole('button', {
          name: 'Sidebar stays compact in narrow layouts',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(useSettingsStore.getState().sidebarCollapsed).toBe(false);
  });
});
