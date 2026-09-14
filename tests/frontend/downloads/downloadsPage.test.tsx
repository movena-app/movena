// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: () => false,
}));

import { DownloadsPage } from '@/modules/downloads/pages/DownloadsPage';
import { useDownloadStore } from '@/modules/downloads/store/useDownloadStore';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';

describe('Downloads page', () => {
  beforeEach(() => {
    useDownloadStore.setState({ jobs: [], downloadedByLibraryId: {} });
    usePlayerStore.setState({ activeStream: null });
  });

  it('explains where player downloads appear when the queue is empty', () => {
    render(
      <MemoryRouter>
        <DownloadsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Downloads' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'No Downloads Yet' })).toBeTruthy();
  });

  it('renders a completed download and removes it from the page', async () => {
    const now = Date.now();
    useDownloadStore.setState({
      jobs: [
        {
          id: 'job-1',
          sourceUrl: 'https://media.test/movie.mp4',
          fileName: 'Movie.mp4',
          state: 'completed',
          progress: 1,
          downloadedBytes: 1024,
          totalBytes: 1024,
          attempts: 1,
          maxAttempts: 3,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DownloadsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Movie.mp4')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Remove Movie.mp4' }));
    expect(screen.queryByText('Movie.mp4')).toBeNull();
    expect(useDownloadStore.getState().jobs).toHaveLength(0);
  });

  it('shows controls for an active download instead of leaving the row actionless', () => {
    useDownloadStore.setState({
      jobs: [
        {
          id: 'job-active',
          sourceUrl: 'https://media.test/movie.mp4',
          fileName: 'Movie.mp4',
          state: 'downloading',
          progress: null,
          downloadedBytes: 0,
          totalBytes: null,
          attempts: 1,
          maxAttempts: 3,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    render(
      <MemoryRouter>
        <DownloadsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Pause Movie.mp4' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel Movie.mp4' })).toBeTruthy();
  });

  it('lists a downloaded movie under Movies and plays it straight from disk on click', async () => {
    useDownloadStore.getState().addDownloadedItem({
      id: 'movie-1',
      jobId: 'job-1',
      filePath: 'C:\\Downloads\\Dune.mp4',
      fileName: 'Dune.mp4',
      type: 'vod',
      title: 'Dune',
      sizeBytes: 100,
      downloadedAt: Date.now(),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DownloadsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Movies' })).toBeTruthy();
    await user.click(screen.getByRole('heading', { name: 'Dune' }));

    expect(usePlayerStore.getState().activeStream).toMatchObject({
      id: 'movie-1',
      streamUrl: 'C:\\Downloads\\Dune.mp4',
    });
  });

  it('groups downloaded episodes under one series card and opens its episode list', async () => {
    useDownloadStore.setState({
      jobs: [],
      downloadedByLibraryId: {
        'ep-1': {
          id: 'ep-1',
          jobId: 'job-1',
          filePath: 'C:\\ep1.mp4',
          fileName: 'ep1.mp4',
          type: 'series',
          title: 'Show S1E1',
          seriesId: 'show-1',
          seriesTitle: 'Show',
          seasonNum: 1,
          episodeNum: 1,
          episodeTitle: 'Pilot',
          sizeBytes: 100,
          downloadedAt: 1,
        },
        'ep-2': {
          id: 'ep-2',
          jobId: 'job-2',
          filePath: 'C:\\ep2.mp4',
          fileName: 'ep2.mp4',
          type: 'series',
          title: 'Show S1E2',
          seriesId: 'show-1',
          seriesTitle: 'Show',
          seasonNum: 1,
          episodeNum: 2,
          episodeTitle: 'Episode Two',
          sizeBytes: 100,
          downloadedAt: 2,
        },
      },
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DownloadsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Series' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Movies' })).toBeNull();
    await user.click(screen.getByRole('heading', { name: 'Show' }));

    expect(await screen.findByText('E1 · Pilot')).toBeTruthy();
    expect(screen.getByText('E2 · Episode Two')).toBeTruthy();
  });

  it('deletes a downloaded movie from disk and drops it from the grid', async () => {
    useDownloadStore.getState().addDownloadedItem({
      id: 'movie-1',
      jobId: 'job-1',
      filePath: 'C:\\Downloads\\Dune.mp4',
      fileName: 'Dune.mp4',
      type: 'vod',
      title: 'Dune',
      sizeBytes: 100,
      downloadedAt: Date.now(),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DownloadsPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Remove Download' }));

    await waitFor(() => expect(screen.queryByText('Dune')).toBeNull());
    expect(useDownloadStore.getState().downloadedByLibraryId['movie-1']).toBeUndefined();
  });
});
