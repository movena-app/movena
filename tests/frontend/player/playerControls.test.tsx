import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageControls } from '@/modules/playback/components/ImageControls';
import { LiveControls } from '@/modules/playback/components/LiveControls';
import { VolumeControl } from '@/modules/playback/components/SharedControls';
import { VodControls } from '@/modules/playback/components/VodControls';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { useDownloadStore } from '@/modules/downloads/store/useDownloadStore';

const native = vi.hoisted(() => ({
  mpvPlayPause: vi.fn().mockResolvedValue(undefined),
  mpvSeek: vi.fn().mockResolvedValue(undefined),
  mpvSeekRelative: vi.fn().mockResolvedValue(undefined),
  mpvSetSpeed: vi.fn().mockResolvedValue(undefined),
  mpvSetVolume: vi.fn().mockResolvedValue(undefined),
  mpvSetRecording: vi.fn().mockResolvedValue(undefined),
}));
const imageSettings = vi.hoisted(() => ({
  applyImageAdjustment: vi.fn().mockResolvedValue(undefined),
  applyImageAdjustments: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/platform/tauri', () => ({ tauriApi: native }));
vi.mock('@/modules/guide/data/xmltvClient', () => ({
  lookupXmltvChannel: vi.fn(() => undefined),
  useXmltvGuide: vi.fn(() => ({ data: undefined })),
}));
vi.mock('@/modules/catalog/data/useDetails', () => ({
  useSeriesInfo: vi.fn(() => ({ data: undefined })),
}));
vi.mock('@/modules/playback/components/imageSettings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/playback/components/imageSettings')>()),
  ...imageSettings,
}));
vi.mock('@/modules/downloads/services/mediaDownload', () => ({
  startMediaDownload: vi.fn().mockResolvedValue(null),
}));

function withQueryClient(component: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
}

beforeEach(() => {
  for (const mock of Object.values(native)) mock.mockClear();
  for (const mock of Object.values(imageSettings)) mock.mockClear();
  useDownloadStore.setState({ jobs: [], downloadedByLibraryId: {} });
  usePlayerStore.setState({
    activeStream: null,
    isPlaying: false,
    currentTime: 20,
    duration: 100,
    volume: 40,
    isMuted: false,
    playbackSpeed: 1,
    isRecording: false,
    activePopover: null,
    showChannelsDrawer: false,
    showEpisodesDrawer: false,
  });
  useSettingsStore.setState({
    seekJumpSecs: 10,
    lastAudibleVolume: 65,
    instantRecord: false,
    imageSharpness: 0,
    imageBrightness: 100,
    imageContrast: 0,
    imageSaturation: 0,
    imageHue: 0,
    imageGamma: 0,
  });
});

describe('player control variants', () => {
  it('drives native volume commands from the shared controls', async () => {
    render(<VolumeControl />);
    await userEvent.click(screen.getByRole('button', { name: 'Mute / Unmute (M)' }));
    expect(native.mpvSetVolume).toHaveBeenCalledWith(0);

    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '72' } });
    expect(native.mpvSetVolume).toHaveBeenCalledWith(72);
  });

  it('opens and resets modified image controls', async () => {
    useSettingsStore.setState({ imageBrightness: 125 });
    render(<ImageControls />);
    await userEvent.click(screen.getByRole('button', { name: 'Image Adjustments' }));
    expect(screen.getByText('Image')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Reset image adjustments' }));
    expect(imageSettings.applyImageAdjustments).toHaveBeenCalledOnce();
  });

  it('renders live controls and toggles playback and the channel drawer', async () => {
    usePlayerStore.setState({
      activeStream: {
        id: 'live-1',
        title: 'News',
        type: 'live',
        streamUrl: 'https://media.test/live.m3u8',
      },
    });
    withQueryClient(<LiveControls />);

    await userEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(native.mpvPlayPause).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Channels List' }));
    expect(usePlayerStore.getState().showChannelsDrawer).toBe(true);
  });

  it('renders VOD controls and maps seek/speed interactions to native commands', async () => {
    usePlayerStore.setState({
      activeStream: {
        id: 'vod-1',
        title: 'Film',
        type: 'vod',
        streamUrl: 'https://media.test/film.mp4',
      },
    });
    withQueryClient(<VodControls />);

    await userEvent.click(screen.getByRole('button', { name: 'Forward 10 seconds' }));
    expect(native.mpvSeekRelative).toHaveBeenCalledWith(10);
    expect(usePlayerStore.getState().currentTime).toBe(30);
    expect(usePlayerStore.getState().isBuffering).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Playback Speed' }));
    await userEvent.click(screen.getByRole('button', { name: '1.25×' }));
    expect(native.mpvSetSpeed).toHaveBeenCalledWith(1.25);
  });

  it('displays a hover tooltip with formatted time and dismisses on pointer leave', async () => {
    usePlayerStore.setState({
      activeStream: {
        id: 'vod-1',
        title: 'Film',
        type: 'vod',
        streamUrl: 'https://media.test/film.mp4',
      },
      currentTime: 10,
      duration: 200,
    });
    withQueryClient(<VodControls />);

    const seekbar = screen.getByRole('slider', { name: 'Playback position' });
    expect(screen.queryByTestId('timeline-tooltip')).toBeNull();

    // Mock getBoundingClientRect on seekbar
    vi.spyOn(seekbar, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 300,
      width: 200,
      top: 0,
      bottom: 20,
      height: 20,
      x: 100,
      y: 0,
      toJSON: () => {},
    });

    // Hover at 50% midpoint (clientX = 200 => offsetX = 100 => midpoint = 100s = 01:40)
    fireEvent.pointerMove(seekbar, { clientX: 200 });
    const tooltip = screen.getByTestId('timeline-tooltip');
    expect(tooltip).toBeTruthy();
    expect(tooltip.textContent).toBe('01:40');

    // Move to left track bound (clientX = 108 => 0s = 00:00)
    fireEvent.pointerMove(seekbar, { clientX: 108 });
    expect(screen.getByTestId('timeline-tooltip').textContent).toBe('00:00');

    // Move to right track bound (clientX = 292 => 200s = 03:20)
    fireEvent.pointerMove(seekbar, { clientX: 292 });
    expect(screen.getByTestId('timeline-tooltip').textContent).toBe('03:20');

    // Pointer leave removes the tooltip
    fireEvent.pointerLeave(seekbar);
    expect(screen.queryByTestId('timeline-tooltip')).toBeNull();
  });

  it('optimistically updates timeline position and sets buffering when seeking', async () => {
    usePlayerStore.setState({
      activeStream: {
        id: 'vod-1',
        title: 'Film',
        type: 'vod',
        streamUrl: 'https://media.test/film.mp4',
      },
      currentTime: 10,
      duration: 100,
      isBuffering: false,
    });
    withQueryClient(<VodControls />);

    const seekbar = screen.getByRole('slider', { name: 'Playback position' });
    fireEvent.change(seekbar, { target: { value: '65' } });

    expect(native.mpvSeek).toHaveBeenCalledWith(65);
    expect(usePlayerStore.getState().currentTime).toBe(65);
    expect(usePlayerStore.getState().isBuffering).toBe(true);
  });

  it('offers to download a title that is streaming live from the provider', () => {
    usePlayerStore.setState({
      activeStream: {
        id: 'movie-1',
        title: 'A Movie',
        type: 'vod',
        streamUrl: 'https://provider.test/movie.mp4',
      },
    });
    withQueryClient(<VodControls />);
    expect(screen.getByRole('button', { name: 'Download current media' })).toBeTruthy();
  });

  it('hides the download button once playing straight from a completed download', () => {
    useDownloadStore.getState().addDownloadedItem({
      id: 'movie-1',
      jobId: 'job-1',
      filePath: 'C:\\Downloads\\Movie.mp4',
      fileName: 'Movie.mp4',
      type: 'vod',
      title: 'A Movie',
      sizeBytes: 100,
      downloadedAt: Date.now(),
    });
    usePlayerStore.setState({
      activeStream: {
        id: 'movie-1',
        title: 'A Movie',
        type: 'vod',
        streamUrl: 'C:\\Downloads\\Movie.mp4',
      },
    });

    withQueryClient(<VodControls />);

    expect(screen.queryByRole('button', { name: 'Download current media' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Downloading current media' })).toBeNull();
  });
});
