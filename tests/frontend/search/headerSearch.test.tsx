// @vitest-environment happy-dom

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const { movie } = vi.hoisted(() => ({
  movie: {
    id: 'movie-1',
    title: 'The Stranger (2022)',
    year: '2022',
    posterUrl: '',
    type: 'vod' as const,
    rating: 7.4,
  },
}));

vi.mock('@/modules/catalog/data/useCatalog', () => ({
  useVodStreams: vi.fn(() => ({ data: [movie] })),
  useSeriesList: vi.fn(() => ({ data: [] })),
  useLiveStreams: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/modules/search/lib/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/search/lib/search')>();
  return {
    ...actual,
    smartSearch: vi.fn(actual.smartSearch),
  };
});

import { HeaderSearch } from '@/modules/search/components/HeaderSearch';
import { useLiveStreams, useSeriesList, useVodStreams } from '@/modules/catalog/data/useCatalog';
import { useLibraryStore } from '@/modules/library/store/useLibraryStore';
import { useSearchStore } from '@/modules/search/store/useSearchStore';
import { smartSearch } from '@/modules/search/lib/search';

beforeEach(() => {
  localStorage.clear();
  useLibraryStore.setState({ favorites: [], collections: [], history: [], watched: [] });
  useSearchStore.setState({ recentSearches: [] });
  vi.mocked(smartSearch).mockClear();
});

describe('header search suggestions', () => {
  it('does not activate or combine full catalogs before the user searches', () => {
    render(
      <MemoryRouter>
        <HeaderSearch />
      </MemoryRouter>,
    );

    expect(useVodStreams).toHaveBeenLastCalledWith({ enabled: false });
    expect(useSeriesList).toHaveBeenLastCalledWith({ enabled: false });
    expect(useLiveStreams).toHaveBeenLastCalledWith({ enabled: false });
    expect(smartSearch).not.toHaveBeenCalled();
  });

  it('presents a clean title with year, type, and rating as secondary metadata', async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn();

    render(
      <MemoryRouter>
        <HeaderSearch onItemClick={onItemClick} />
      </MemoryRouter>,
    );

    const input = screen.getByRole('combobox', { name: 'Search your library' });
    expect(input.getAttribute('aria-expanded')).toBe('false');
    await user.type(input, 'stranger');
    expect(smartSearch).not.toHaveBeenCalled();
    expect(screen.queryByRole('row', { name: /The Stranger Movie 2022 7\.4/i })).toBeNull();

    const suggestion = await screen.findByRole('row', {
      name: /The Stranger Movie 2022 7\.4/i,
    });
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(within(suggestion).getByText('The Stranger')).toBeTruthy();
    expect(within(suggestion).queryByText('The Stranger (2022)')).toBeNull();
    expect(within(suggestion).getByText('2022')).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'View all results for “stranger”',
      }),
    ).toBeTruthy();

    await user.click(
      within(suggestion).getByRole('button', {
        name: /The Stranger Movie 2022 7\.4/i,
      }),
    );
    expect(onItemClick).toHaveBeenCalledWith(movie);
  });

  it('keeps settled suggestions visible but inactive while a new query is pending', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <HeaderSearch />
      </MemoryRouter>,
    );

    await user.type(screen.getByRole('combobox'), 'stranger');
    const suggestion = await screen.findByRole('row', {
      name: /The Stranger Movie 2022 7\.4/i,
    });

    await user.type(screen.getByRole('combobox'), 's');
    expect(suggestion.getAttribute('aria-disabled')).toBe('true');
    expect(suggestion.textContent).toContain('The Stranger');
  });

  it('shows a compact empty state only after the debounced quick search settles', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <HeaderSearch />
      </MemoryRouter>,
    );

    await user.type(screen.getByRole('combobox'), 'zzzzzz');
    expect(screen.queryByText('No quick matches')).toBeNull();

    expect(await screen.findByText('No quick matches')).toBeTruthy();
    expect(screen.getByText('Press Enter to search everything')).toBeTruthy();
    expect(smartSearch).toHaveBeenLastCalledWith(expect.any(Array), 'zzzzzz');
  });

  it('supports arrow-key selection and Enter without moving focus out of the combobox', async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn();

    render(
      <MemoryRouter>
        <HeaderSearch onItemClick={onItemClick} />
      </MemoryRouter>,
    );

    const input = screen.getByRole('combobox', { name: 'Search your library' });
    await user.type(input, 'stranger');
    const suggestion = await screen.findByRole('row', {
      name: /The Stranger Movie 2022 7\.4/i,
    });

    await user.keyboard('{ArrowDown}');
    expect(input.getAttribute('aria-activedescendant')).toBe(suggestion.id);
    expect(suggestion.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(input);

    await user.keyboard('{Enter}');
    expect(onItemClick).toHaveBeenCalledWith(movie);
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes an open suggestion popup with Escape', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <HeaderSearch />
      </MemoryRouter>,
    );

    const input = screen.getByRole('combobox', { name: 'Search your library' });
    await user.type(input, 'stranger');
    await screen.findByRole('grid', { name: 'Search suggestions' });

    await user.keyboard('{Escape}');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('grid', { name: 'Search suggestions' })).toBeNull();
  });

  it('toggles result actions without opening the item or closing search', async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn();

    render(
      <MemoryRouter>
        <HeaderSearch onItemClick={onItemClick} />
      </MemoryRouter>,
    );

    await user.type(screen.getByRole('combobox'), 'stranger');
    const suggestion = await screen.findByRole('row', {
      name: /The Stranger Movie 2022 7\.4/i,
    });
    const favoriteButton = within(suggestion).getByRole('button', { name: 'Add to favorites' });
    const watchedButton = within(suggestion).getByRole('button', { name: 'Mark Watched' });

    await user.click(favoriteButton);
    await user.click(watchedButton);

    expect(useLibraryStore.getState().favorites).toEqual([movie]);
    expect(useLibraryStore.getState().watched).toEqual([movie.id]);
    expect(
      within(suggestion)
        .getByRole('button', { name: 'Remove from favorites' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      within(suggestion)
        .getByRole('button', { name: 'Mark Unwatched' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(onItemClick).not.toHaveBeenCalled();
    expect(screen.getByRole('grid', { name: 'Search suggestions' })).toBeTruthy();
  });
});
