// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tauriApi } from '@/platform/tauri';
import { SeriesPlaybackPrompts } from '@/modules/playback/components/SeriesPlaybackPrompts';
import { useSeriesInfo } from '@/modules/catalog/data/useDetails';
import { useIntroDbSegments } from '@/modules/playback/data/useIntroDb';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

vi.mock('@/platform/tauri', () => ({
  tauriApi: {
    mpvSeek: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/modules/catalog/data/useDetails', () => ({
  useSeriesInfo: vi.fn(),
}));

vi.mock('@/modules/playback/data/useIntroDb', () => ({
  useIntroDbSegments: vi.fn(),
}));

const mockSeriesData = {
  info: { name: 'Breaking Bad' },
  episodes: {
    '1': [
      { id: 101, episode_num: 1, title: 'Pilot' },
      { id: 102, episode_num: 2, title: "Cat's in the Bag..." },
    ],
  },
};

describe('SeriesPlaybackPrompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      skipIntroEnabled: true,
      skipRecapEnabled: true,
      autoSkipIntro: false,
      introDbEnabled: true,
      autoPlayNextEpisode: true,
    });
    vi.mocked(useSeriesInfo).mockReturnValue({
      data: mockSeriesData,
      isLoading: false,
    } as unknown as ReturnType<typeof useSeriesInfo>);
    vi.mocked(useIntroDbSegments).mockReturnValue({
      data: {
        intro: { startSec: 90, endSec: 150 },
        recap: { startSec: 0, endSec: 30 },
        outro: { startSec: 2700, endSec: 2800 },
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useIntroDbSegments>);
    usePlayerStore.setState({
      activeStream: {
        id: '101',
        sourceItemId: '101',
        seriesId: 'series-1',
        title: 'Breaking Bad S01E01 - Pilot',
        seriesTitle: 'Breaking Bad',
        seasonNum: 1,
        episodeNum: 1,
        type: 'series',
        streamUrl: 'https://example.com/stream.mkv',
      },
      currentTime: 0,
      eofReached: false,
      chapters: [],
    });
  });

  it('renders Skip Recap when within recap window and seeks on click', async () => {
    const user = userEvent.setup();
    usePlayerStore.setState({ currentTime: 15 });

    render(<SeriesPlaybackPrompts />);

    const recapBtn = screen.getByRole('button', { name: /Skip Recap/i });
    expect(recapBtn).toBeTruthy();

    await user.click(recapBtn);
    expect(tauriApi.mpvSeek).toHaveBeenCalledWith(30);
  });

  it('renders Skip Intro when within intro window and seeks on click', async () => {
    const user = userEvent.setup();
    usePlayerStore.setState({ currentTime: 100 });

    render(<SeriesPlaybackPrompts />);

    const introBtn = screen.getByRole('button', { name: /Skip Intro/i });
    expect(introBtn).toBeTruthy();

    await user.click(introBtn);
    expect(tauriApi.mpvSeek).toHaveBeenCalledWith(150);
  });

  it('automatically seeks past intro when autoSkipIntro is enabled', () => {
    useSettingsStore.setState({ autoSkipIntro: true });
    usePlayerStore.setState({ currentTime: 100 });

    render(<SeriesPlaybackPrompts />);

    expect(tauriApi.mpvSeek).toHaveBeenCalledWith(150);
    expect(screen.queryByRole('button', { name: /Skip Intro/i })).toBeNull();
  });

  it('automatically seeks past recap when autoSkipIntro is enabled', () => {
    useSettingsStore.setState({ autoSkipIntro: true });
    usePlayerStore.setState({ currentTime: 15 });

    render(<SeriesPlaybackPrompts />);

    expect(tauriApi.mpvSeek).toHaveBeenCalledWith(30);
    expect(screen.queryByRole('button', { name: /Skip Recap/i })).toBeNull();
  });

  it('hides recap prompt when skipRecapEnabled is false but keeps intro prompt', () => {
    useSettingsStore.setState({ skipRecapEnabled: false, skipIntroEnabled: true });
    usePlayerStore.setState({ currentTime: 15 });

    const { rerender } = render(<SeriesPlaybackPrompts />);
    expect(screen.queryByRole('button', { name: /Skip Recap/i })).toBeNull();

    usePlayerStore.setState({ currentTime: 100 });
    rerender(<SeriesPlaybackPrompts />);
    expect(screen.getByRole('button', { name: /Skip Intro/i })).toBeTruthy();
  });

  it('renders Next Episode button during outro segment', async () => {
    usePlayerStore.setState({ currentTime: 2750 });

    render(<SeriesPlaybackPrompts />);

    expect(screen.getByRole('button', { name: /Next Episode/i })).toBeTruthy();
  });

  it('hides prompts when skipIntroEnabled setting is disabled', () => {
    useSettingsStore.setState({ skipIntroEnabled: false, skipRecapEnabled: false });
    usePlayerStore.setState({ currentTime: 100 });

    render(<SeriesPlaybackPrompts />);

    expect(screen.queryByRole('button', { name: /Skip Intro/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Skip Recap/i })).toBeNull();
  });

  it('does not let a Skip Intro/Recap click bubble to the player overlay (which would toggle play/pause)', async () => {
    const user = userEvent.setup();
    const overlayClick = vi.fn();
    usePlayerStore.setState({ currentTime: 15 });

    const { rerender } = render(
      <div onClick={overlayClick}>
        <SeriesPlaybackPrompts />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: /Skip Recap/i }));
    expect(tauriApi.mpvSeek).toHaveBeenCalledWith(30);
    expect(overlayClick).not.toHaveBeenCalled();

    usePlayerStore.setState({ currentTime: 100 });
    rerender(
      <div onClick={overlayClick}>
        <SeriesPlaybackPrompts />
      </div>,
    );
    await user.click(screen.getByRole('button', { name: /Skip Intro/i }));
    expect(tauriApi.mpvSeek).toHaveBeenCalledWith(150);
    expect(overlayClick).not.toHaveBeenCalled();
  });
});
