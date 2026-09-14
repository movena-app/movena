// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { UpcomingReleaseCard } from '@/modules/guide/components/UpcomingReleaseCard';
import type { MediaItem } from '@/modules/catalog/model/media';
import type { UpcomingRelease } from '@/modules/guide/data/useUpcomingReleases';
import { useLibraryStore } from '@/modules/library/store/useLibraryStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

const useUpcomingReleasesMock = vi.hoisted(() => vi.fn());

vi.mock('@/modules/guide/data/useUpcomingReleases', () => ({
  useUpcomingReleases: useUpcomingReleasesMock,
}));

const favorites: MediaItem[] = [
  { id: 'series-1', title: 'First Show', posterUrl: '', type: 'series' },
  { id: 'series-2', title: 'Second Show', posterUrl: '', type: 'series' },
  { id: 'movie-3', title: 'Not Scheduled', posterUrl: '', type: 'vod' },
];

const releases: UpcomingRelease[] = [
  {
    favorite: favorites[0]!,
    tmdbId: 1,
    airDate: '2030-01-02',
    kind: 'episode',
    title: 'Premiere',
    seasonNumber: 1,
    episodeNumber: 1,
    artworkUrl: null,
    exactAirTime: '2030-01-02T20:00:00+01:00',
    timeSource: 'tvmaze',
  },
  {
    favorite: favorites[1]!,
    tmdbId: 2,
    airDate: '2030-02-03',
    kind: 'episode',
    title: 'Return',
    seasonNumber: 2,
    episodeNumber: 4,
    artworkUrl: null,
    exactAirTime: null,
    timeSource: 'tmdb',
  },
];

beforeEach(() => {
  useSettingsStore.setState({ language: 'en', upcomingCountdownEnabled: false });
  useLibraryStore.setState({ favorites, collections: [], history: [], watched: [] });
  useUpcomingReleasesMock.mockReturnValue({
    data: releases,
    isEnabled: true,
    isLoading: false,
    isError: false,
  });
});

describe('UpcomingReleaseCard', () => {
  it('reuses a page-level clock instead of starting a timer per section', () => {
    const intervalSpy = vi.spyOn(window, 'setInterval');
    try {
      render(
        <MemoryRouter>
          <UpcomingReleaseCard variant="schedule" onOpen={vi.fn()} now={new Date(2029, 11, 1)} />
        </MemoryRouter>,
      );
      expect(intervalSpy).not.toHaveBeenCalled();
    } finally {
      intervalSpy.mockRestore();
    }
  });

  it('renders every scheduled release on the full schedule without provider labels', () => {
    const onOpen = vi.fn();
    render(
      <MemoryRouter>
        <UpcomingReleaseCard variant="schedule" onOpen={onOpen} />
      </MemoryRouter>,
    );

    expect(screen.getByText('First Show')).toBeTruthy();
    expect(screen.getByText('Second Show')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Open / })).toHaveLength(2);
    expect(screen.queryByText(/favorite does not have an announced future release/i)).toBeNull();
    expect(screen.queryByText('Exact TV time')).toBeNull();
    expect(screen.queryByText(/TVmaze/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open Second Show' }));
    expect(onOpen).toHaveBeenCalledWith(favorites[1], { seasonNumber: 2, episodeNumber: 4 });
  });

  it('renders multiple releases in Discover mode by default', () => {
    render(
      <MemoryRouter>
        <UpcomingReleaseCard onOpen={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('First Show')).toBeTruthy();
    expect(screen.getByText('Second Show')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Open / })).toHaveLength(2);
  });

  it('respects limit prop in Discover mode when provided', () => {
    render(
      <MemoryRouter>
        <UpcomingReleaseCard onOpen={vi.fn()} limit={1} />
      </MemoryRouter>,
    );

    expect(screen.getByText('First Show')).toBeTruthy();
    expect(screen.queryByText('Second Show')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Open / })).toHaveLength(1);
  });

  it('renders sleek countdown badges when countdown is enabled', () => {
    useSettingsStore.setState({ upcomingCountdownEnabled: true });
    render(
      <MemoryRouter>
        <UpcomingReleaseCard variant="schedule" onOpen={vi.fn()} />
      </MemoryRouter>,
    );

    const countdowns = screen.getAllByLabelText('Release countdown');
    expect(countdowns.length).toBeGreaterThan(0);
    expect(screen.getByText('First Show')).toBeTruthy();
  });

  it('renders elapsed items as recently released instead of hiding them', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const airDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    useUpcomingReleasesMock.mockReturnValue({
      data: [{ ...releases[0], airDate, exactAirTime: null }],
      isEnabled: true,
      isLoading: false,
      isError: false,
    });

    render(
      <MemoryRouter>
        <UpcomingReleaseCard variant="schedule" onOpen={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Recently released')).toBeTruthy();
    expect(screen.getByText('Aired yesterday')).toBeTruthy();
  });

  it('keeps Discover focused on future releases while the schedule retains recent items', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const airDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    useUpcomingReleasesMock.mockReturnValue({
      data: [{ ...releases[1], airDate }, releases[0]],
      isEnabled: true,
      isLoading: false,
      isError: false,
    });

    render(
      <MemoryRouter>
        <UpcomingReleaseCard onOpen={vi.fn()} />
      </MemoryRouter>,
    );

    expect(
      screen
        .getAllByRole('button', { name: /^Open / })
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Open First Show']);
    expect(screen.queryByText('Aired yesterday')).toBeNull();
  });

  it('shows only the next date for a favorite and summarizes later announcements', () => {
    useUpcomingReleasesMock.mockReturnValue({
      data: [
        releases[0],
        { ...releases[0], airDate: '2030-01-09', title: 'Second episode', episodeNumber: 2 },
      ],
      isEnabled: true,
      isLoading: false,
      isError: false,
    });

    render(
      <MemoryRouter>
        <UpcomingReleaseCard onOpen={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('button', { name: 'Open First Show' })).toHaveLength(1);
    expect(screen.getByText(/1 more announced/)).toBeTruthy();
  });
});
