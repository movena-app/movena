// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpcomingCalendar } from '@/modules/guide/components/UpcomingCalendar';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { groupUpcomingReleases } from '@/modules/guide/lib/upcoming';

beforeEach(() => {
  useSettingsStore.setState({ language: 'en' });
});

describe('UpcomingCalendar', () => {
  it('labels retained past events as released and keeps them actionable', async () => {
    const user = userEvent.setup();
    const now = new Date(2026, 7, 23, 12);
    const favorite = {
      id: 'series-1',
      title: 'Example Show',
      posterUrl: '',
      type: 'series' as const,
    };
    const groups = groupUpcomingReleases([
      {
        favorite,
        tmdbId: 7,
        airDate: '2026-08-22',
        kind: 'episode',
        title: 'Yesterday',
        seasonNumber: 2,
        episodeNumber: 4,
        artworkUrl: null,
        exactAirTime: null,
        timeSource: 'tmdb',
      },
    ]);
    const onOpen = vi.fn();

    render(<UpcomingCalendar groups={groups} now={now} onOpen={onOpen} />);

    expect(screen.getAllByText('Aired yesterday').length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: 'Open Example Show' })[0]!);
    expect(onOpen).toHaveBeenCalledWith(favorite, { seasonNumber: 2, episodeNumber: 4 });
  });
});
