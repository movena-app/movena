// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/catalog/data/useDetails', () => ({
  useSeriesInfo: vi.fn(),
}));

vi.mock('@/modules/catalog/public', () => ({
  useMediaContextMenus: () => ({ handleMediaCardContextMenu: vi.fn() }),
}));

import { EpisodesDrawer } from '@/modules/playback/components/EpisodesDrawer';
import { useSeriesInfo } from '@/modules/catalog/data/useDetails';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';

const seriesData = {
  info: { name: 'South Park' },
  episodes: {
    '1': [
      {
        id: 101,
        episode_num: 1,
        title: 'Pilot',
        info: { duration: '22m', movie_image: 'https://example.com/pilot.jpg' },
        stream_url: 'https://example.com/pilot.mkv',
      },
      {
        id: 102,
        episode_num: 2,
        title: 'Volcano',
        info: { duration: '22m', movie_image: 'https://example.com/volcano.jpg' },
        stream_url: 'https://example.com/volcano.mkv',
      },
    ],
    '2': [
      {
        id: 201,
        episode_num: 1,
        title: 'Terrance and Phillip',
        info: { duration: '22m', movie_image: 'https://example.com/season-2.jpg' },
        stream_url: 'https://example.com/season-2.mkv',
      },
    ],
  },
};

beforeEach(() => {
  vi.mocked(useSeriesInfo).mockReturnValue({
    data: seriesData,
    isLoading: false,
  } as unknown as ReturnType<typeof useSeriesInfo>);
  usePlayerStore.setState({
    activeStream: {
      id: '101',
      sourceItemId: '101',
      seriesId: 'series-1',
      title: 'South Park S01E01 - Pilot',
      seriesTitle: 'South Park',
      seasonNum: 1,
      episodeNum: 1,
      type: 'series',
      streamUrl: 'https://example.com/pilot.mkv',
    },
    showEpisodesDrawer: true,
  });
});

describe('EpisodesDrawer', () => {
  it('shows a compact current episode row and the series title', () => {
    render(<EpisodesDrawer />);

    expect(screen.getByText('South Park')).toBeTruthy();
    expect(screen.getByLabelText('Now playing')).toBeTruthy();
    expect(screen.getByText('Pilot').closest('[aria-current="true"]')).toBeTruthy();
    expect(screen.getByText('Volcano')).toBeTruthy();
  });

  it('switches seasons through the shared select control', async () => {
    const user = userEvent.setup();
    render(<EpisodesDrawer />);

    await user.click(screen.getByRole('button', { name: 'Season 1' }));
    await user.click(await screen.findByRole('option', { name: 'Season 2' }));

    expect(screen.getByText('Terrance and Phillip')).toBeTruthy();
    expect(screen.queryByText('Pilot')).toBeNull();
  });

  it('exposes episode rows as keyboard-operable buttons', async () => {
    const user = userEvent.setup();
    render(<EpisodesDrawer />);

    expect(screen.getByRole('button', { name: /Pilot/ }).hasAttribute('disabled')).toBe(true);
    const episodeButton = screen.getByRole('button', { name: /Volcano/ });
    episodeButton.focus();
    await user.keyboard('{Enter}');

    expect(usePlayerStore.getState().activeStream?.sourceItemId).toBe('102');
  });

  it('closes from the header action', async () => {
    const user = userEvent.setup();
    render(<EpisodesDrawer />);

    await user.click(screen.getByRole('button', { name: 'Close Episodes' }));
    expect(usePlayerStore.getState().showEpisodesDrawer).toBe(false);
  });
});
