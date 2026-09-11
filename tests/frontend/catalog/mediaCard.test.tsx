// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { MediaCard } from '@/modules/catalog/components/MediaCard';
import type { MediaItem } from '@/modules/catalog/model/media';
import { useDownloadStore } from '@/modules/downloads/store/useDownloadStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { useStreamVerificationStore } from '@/modules/sources/store/useStreamVerificationStore';

const movieItem: MediaItem = { id: 'movie-1', title: 'Inception', posterUrl: '', type: 'vod' };

function renderCard(item: MediaItem, viewMode?: 'grid' | 'list') {
  return render(
    <MemoryRouter>
      <MediaCard item={item} viewMode={viewMode} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useDownloadStore.setState({ jobs: [], downloadedByLibraryId: {} });
  useSettingsStore.getState().resetSettings();
  useStreamVerificationStore.getState().clearVerifications();
});

describe('MediaCard downloaded indicator', () => {
  it('shows no downloaded badge for a title that has not been downloaded', () => {
    renderCard(movieItem);
    expect(screen.queryByTitle('Downloaded')).toBeNull();
  });

  it('shows a downloaded badge once the title is in the local download library', () => {
    useDownloadStore.getState().addDownloadedItem({
      id: 'movie-1',
      jobId: 'job-1',
      filePath: 'C:\\Downloads\\Inception.mp4',
      fileName: 'Inception.mp4',
      type: 'vod',
      title: 'Inception',
      sizeBytes: 100,
      downloadedAt: Date.now(),
    });
    renderCard(movieItem);
    expect(screen.getByTitle('Downloaded')).toBeTruthy();
  });

  it('only badges the specific downloaded title, not every card', () => {
    useDownloadStore.getState().addDownloadedItem({
      id: 'some-other-movie',
      jobId: 'job-1',
      filePath: 'C:\\Downloads\\Other.mp4',
      fileName: 'Other.mp4',
      type: 'vod',
      title: 'Other Movie',
      sizeBytes: 100,
      downloadedAt: Date.now(),
    });
    renderCard(movieItem);
    expect(screen.queryByTitle('Downloaded')).toBeNull();
  });

  it('renders the downloaded indicator in list view too', () => {
    useDownloadStore.getState().addDownloadedItem({
      id: 'movie-1',
      jobId: 'job-1',
      filePath: 'C:\\Downloads\\Inception.mp4',
      fileName: 'Inception.mp4',
      type: 'vod',
      title: 'Inception',
      sizeBytes: 100,
      downloadedAt: Date.now(),
    });
    renderCard(movieItem, 'list');
    expect(screen.getByTitle('Downloaded')).toBeTruthy();
  });
});

describe('MediaCard quality badge', () => {
  const channelItem: MediaItem = {
    id: 'channel-1',
    title: 'Sports 4K',
    posterUrl: '',
    type: 'live',
  };

  it('shows the provider-declared quality when nothing has been verified yet', () => {
    renderCard(channelItem);
    expect(screen.getAllByText('4K').length).toBeGreaterThan(0);
  });

  it('shows only the verified resolution once it disagrees with the channel name, not both', () => {
    useStreamVerificationStore.getState().recordVerification('channel-1', {
      width: 1920,
      height: 1080,
      fps: 30,
    });
    renderCard(channelItem);
    expect(screen.getAllByText('FHD').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('4K')).toHaveLength(0);
  });
});
