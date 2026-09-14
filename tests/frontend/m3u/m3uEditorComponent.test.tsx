// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock, isTauri: () => false }));

import { M3uEditor } from '@/modules/m3u-editor/components/M3uEditor';
import { M3uChannelTable } from '@/modules/m3u-editor/components/M3uChannelTable';
import { M3uGroupManager } from '@/modules/m3u-editor/components/M3uGroupManager';
import { M3uStreamHealthChecker } from '@/modules/m3u-editor/components/M3uStreamHealthChecker';
import { M3uRawCodeEditor } from '@/modules/m3u-editor/components/M3uRawCodeEditor';
import { useSourceStore, type M3uSourceProfile } from '@/modules/sources/store/useSourceStore';
import type { M3uEntry } from '@/modules/sources/data/m3uClient';
import type { XmltvGuide } from '@/modules/guide/data/xmltvClient';

const sampleProfile: M3uSourceProfile = {
  id: 'm3u-demo-1',
  kind: 'm3u',
  name: 'Demo Playlist',
  locationType: 'remote',
  locationLabel: 'demo.test',
  refreshIntervalMinutes: 360,
  lastRefreshAt: 1,
  entryCount: 3,
  liveCount: 2,
  vodCount: 1,
  seriesCount: 0,
  hasEpg: true,
};

const sampleEntries: M3uEntry[] = [
  {
    id: 'entry-1',
    sourceId: 'm3u-demo-1',
    title: '[4K] BBC One HD |UK|',
    url: 'http://stream.test/bbc1.m3u8',
    type: 'live',
    duration: -1,
    groupTitle: 'UK Live',
    categoryId: 'cat-uk-live',
    channelNumber: '101',
    tvgId: 'bbc1.uk',
    logo: 'http://logo.test/bbc1.png',
    headers: {},
    description: 'BBC flagship channel',
    catchupSource: 'https://archive.test/{utc}',
    year: '2024',
    rating: 8.2,
    extraAttributes: { 'vendor-id': 'bbc-one' },
  },
  {
    id: 'entry-2',
    sourceId: 'm3u-demo-1',
    title: 'Sky Sports Premier League',
    url: 'http://stream.test/skysports.m3u8',
    type: 'live',
    duration: -1,
    groupTitle: 'Sports',
    categoryId: 'cat-sports',
    channelNumber: '102',
    tvgId: 'skysports.uk',
    headers: {},
  },
  {
    id: 'entry-3',
    sourceId: 'm3u-demo-1',
    title: 'Inception (2010)',
    url: 'http://stream.test/inception.mp4',
    type: 'vod',
    duration: 8880,
    groupTitle: 'Movies',
    categoryId: 'cat-movies',
    headers: {},
  },
];

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('indexedDB', undefined);
  vi.clearAllMocks();
  invokeMock.mockReset();
  useSourceStore.setState({
    profiles: [sampleProfile],
    runtimes: {
      [sampleProfile.id]: {
        connection: { location: 'https://demo.test/list.m3u' },
        playlist: {
          entries: sampleEntries,
          epgUrls: ['https://epg.test/epg.xml'],
          warnings: [],
        },
        status: 'ready',
        error: null,
        revision: 1,
      },
    },
    enabledSourceIds: [sampleProfile.id],
    isInitializing: false,
    initializationError: null,
  });
});

describe('M3U Editor UI components', () => {
  it('renders stats bar, channel rows, and handles search filtering', async () => {
    render(<M3uEditor initialSourceId={sampleProfile.id} />);

    await waitFor(() => expect(screen.getByText('[4K] BBC One HD |UK|')).toBeTruthy());
    expect(screen.getByText(/All changes saved/)).toBeTruthy();
    expect(screen.getByText('Sky Sports Premier League')).toBeTruthy();

    const searchInput = screen.getByPlaceholderText('Search title, URL, EPG ID...');
    fireEvent.change(searchInput, { target: { value: 'Inception' } });

    expect(screen.getByText('Inception (2010)')).toBeTruthy();
    expect(screen.queryByText('Sky Sports Premier League')).toBeNull();
  });

  it('allows editing a single channel via the inspector drawer', () => {
    const onUpdateEntries = vi.fn();
    render(
      <M3uChannelTable
        entries={sampleEntries}
        healthStatuses={{}}
        onUpdateEntries={onUpdateEntries}
      />,
    );

    const editButtons = screen.getAllByLabelText(/Edit channel/);
    fireEvent.click(editButtons[0]!);

    expect(screen.getByRole('dialog', { name: 'Edit Channel' })).toBeTruthy();
    const titleInput = screen.getByLabelText('Channel Name');
    fireEvent.change(titleInput, { target: { value: 'BBC One FHD' } });

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onUpdateEntries).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'entry-1',
          title: 'BBC One FHD',
          description: 'BBC flagship channel',
          catchupSource: 'https://archive.test/{utc}',
          year: '2024',
          rating: 8.2,
          extraAttributes: { 'vendor-id': 'bbc-one' },
        }),
      ]),
    );
  });

  it('supports undo after editing a channel', async () => {
    render(<M3uEditor initialSourceId={sampleProfile.id} />);
    await waitFor(() => expect(screen.getAllByLabelText(/Edit channel/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByLabelText(/Edit channel/)[0]!);
    fireEvent.change(screen.getByLabelText('Channel Name'), {
      target: { value: 'BBC One Edited' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByText('BBC One Edited')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('[4K] BBC One HD |UK|')).toBeTruthy();
  });

  it('migrates and restores a source-scoped legacy autosaved draft', async () => {
    localStorage.setItem(
      `movena-m3u-editor-draft-v1:${sampleProfile.id}`,
      JSON.stringify({
        content:
          '#EXTM3U\n#EXTINF:-1 group-title="Drafts",Recovered Channel\nhttps://stream.test/recovered.m3u8',
        savedAt: Date.now(),
      }),
    );
    render(<M3uEditor initialSourceId={sampleProfile.id} />);
    await waitFor(() => expect(screen.getByText('Recovered Channel')).toBeTruthy());
    expect(screen.getByText(/Unsaved draft/)).toBeTruthy();
  });

  it('runs batch title cleanup and updates entries', () => {
    const onUpdateEntries = vi.fn();
    render(
      <M3uChannelTable
        entries={sampleEntries}
        healthStatuses={{}}
        onUpdateEntries={onUpdateEntries}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Batch Tools' }));
    const batchDialog = screen.getByRole('dialog', { name: 'Batch Tools' });
    expect(batchDialog.closest('[data-ui-layer="modal"]')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Apply Clean/ }));
    expect(onUpdateEntries).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'entry-1' })]),
    );
  });

  it('supports keyboard-first row navigation and selection', () => {
    render(
      <M3uChannelTable entries={sampleEntries} healthStatuses={{}} onUpdateEntries={vi.fn()} />,
    );
    const grid = screen.getByRole('grid', { name: /Channels\. Use arrow keys/ });
    grid.focus();
    fireEvent.keyDown(grid, { key: ' ' });
    expect(
      (screen.getByLabelText(`Select channel ${sampleEntries[0]!.title}`) as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(grid, { key: 'Enter' });
    const editDialog = screen.getByRole('dialog', { name: 'Edit Channel' });
    expect(editDialog.closest('[data-ui-layer="modal"]')).toBeTruthy();
    expect(screen.getByLabelText('Channel Name')).toHaveProperty('value', sampleEntries[1]!.title);
  });

  it('opens the editor command palette with Ctrl+K', () => {
    render(<M3uEditor initialSourceId={sampleProfile.id} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: 'Editor Command Palette' })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Show Diagnostics/ })).toBeTruthy();
  });

  it('renames and merges groups in the Category Manager', () => {
    const onUpdateEntries = vi.fn();
    render(<M3uGroupManager entries={sampleEntries} onUpdateEntries={onUpdateEntries} />);

    expect(screen.getByText('UK Live')).toBeTruthy();
    expect(screen.getByText('Sports')).toBeTruthy();

    const renameButtons = screen.getAllByLabelText('Rename category');
    fireEvent.click(renameButtons[0]!);

    const input = screen.getByDisplayValue('Movies');
    fireEvent.change(input, { target: { value: 'Cinema' } });
    fireEvent.click(screen.getByLabelText('Save rename'));

    expect(onUpdateEntries).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ groupTitle: 'Cinema' })]),
    );
  });

  it('detects duplicate streams and reports counts', () => {
    const duplicates: M3uEntry[] = [
      ...sampleEntries,
      {
        id: 'entry-dup',
        sourceId: 'm3u-demo-1',
        title: 'BBC One Backup',
        url: 'http://stream.test/bbc1.m3u8', // identical URL
        type: 'live',
        duration: -1,
        groupTitle: 'UK Live',
        categoryId: 'cat-uk-live',
        headers: {},
      },
    ];

    render(
      <M3uStreamHealthChecker
        entries={duplicates}
        healthStatuses={{}}
        onUpdateHealthStatuses={vi.fn()}
        onUpdateEntries={vi.fn()}
      />,
    );

    expect(screen.getByText(/1 exact URL duplicates can be removed safely/)).toBeTruthy();
  });

  it('validates playlist entries and applies EPG suggestions', () => {
    const guide: XmltvGuide = {
      byChannel: new Map([['m3u-demo-1::bbc.one', []]]),
      idByName: new Map([['m3u-demo-1::bbc one', 'm3u-demo-1::bbc.one']]),
      nameById: new Map([['m3u-demo-1::bbc.one', 'BBC One']]),
      channelCount: 1,
      programmeCount: 0,
    };
    const entries = [
      sampleEntries[0]!,
      { ...sampleEntries[1]!, title: 'BBC One [HD]', tvgId: undefined, url: 'invalid' },
    ];
    const onUpdateEntries = vi.fn();
    render(
      <M3uStreamHealthChecker
        entries={entries}
        healthStatuses={{}}
        onUpdateHealthStatuses={vi.fn()}
        onUpdateEntries={onUpdateEntries}
        guide={guide}
        sourceId="m3u-demo-1"
      />,
    );
    expect(screen.getByText('Playlist Validation')).toBeTruthy();
    expect(screen.getByText('EPG Matching Assistant')).toBeTruthy();
    expect(screen.getByText('Stream URL uses an invalid or unsupported scheme.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apply High Confidence' }));
    expect(onUpdateEntries).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'entry-2', tvgId: 'bbc.one' })]),
    );
  });

  it('runs the stream checker and records timed results', async () => {
    invokeMock.mockResolvedValue({ status: 'online', latencyMs: 12 });
    const onUpdateHealthStatuses = vi.fn();
    render(
      <M3uStreamHealthChecker
        entries={[sampleEntries[0]!]}
        healthStatuses={{}}
        onUpdateHealthStatuses={onUpdateHealthStatuses}
        onUpdateEntries={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start Check' }));
    await waitFor(() =>
      expect(onUpdateHealthStatuses).toHaveBeenLastCalledWith({
        'entry-1': expect.objectContaining({ status: 'online', checkedAt: expect.any(Number) }),
      }),
    );
  });

  it('clears in-progress statuses when a stream check is stopped', async () => {
    let resolveProbe!: (value: { status: string; latencyMs: number }) => void;
    invokeMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProbe = resolve;
        }),
    );
    const updates = vi.fn();

    function Harness() {
      const [statuses, setStatuses] = useState({});
      return (
        <M3uStreamHealthChecker
          entries={[sampleEntries[0]!]}
          healthStatuses={statuses}
          onUpdateHealthStatuses={(next) => {
            setStatuses(next);
            updates(next);
          }}
          onUpdateEntries={vi.fn()}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Check' }));
    await waitFor(() => expect(updates).toHaveBeenCalledWith({ 'entry-1': 'checking' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(updates).toHaveBeenLastCalledWith({});
    expect(screen.getByRole('button', { name: 'Start Check' })).toBeTruthy();
    resolveProbe({ status: 'online', latencyMs: 12 });
  });

  it('drops diagnostic statuses for entries that no longer exist', async () => {
    const onUpdateHealthStatuses = vi.fn();
    render(
      <M3uStreamHealthChecker
        entries={[sampleEntries[0]!]}
        healthStatuses={{ removed: { status: 'offline', latencyMs: 20, checkedAt: 1 } }}
        onUpdateHealthStatuses={onUpdateHealthStatuses}
        onUpdateEntries={vi.fn()}
      />,
    );
    await waitFor(() => expect(onUpdateHealthStatuses).toHaveBeenCalledWith({}));
    expect(screen.queryByRole('button', { name: /Delete Offline/ })).toBeNull();
  });

  it('edits raw M3U code and syncs with visual state', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(
      <M3uRawCodeEditor
        rawContent="#EXTM3U\n#EXTINF:-1,Sample Channel\nhttps://stream.example.test/stream\n"
        onApplyRawText={onApply}
        onSyncFromVisual={vi.fn()}
      />,
    );

    const textarea = screen.getByLabelText('Raw M3U Code');
    await user.clear(textarea);
    await user.type(
      textarea,
      '#EXTM3U\n#EXTINF:-1,Modified Channel\nhttps://stream.example.test/mod\n',
    );

    const applyButton = screen.getByRole('button', { name: 'Apply Changes' });
    await user.click(applyButton);

    expect(onApply).toHaveBeenCalled();
  });

  it('supports keyboard find and replace in raw M3U code', async () => {
    const user = userEvent.setup();
    render(
      <M3uRawCodeEditor
        rawContent="#EXTM3U\n#EXTINF:-1,Sample Channel\nhttps://stream.example.test/stream\n"
        onApplyRawText={vi.fn()}
      />,
    );

    const textarea = screen.getByLabelText('Raw M3U Code');
    await user.click(textarea);
    await user.keyboard('{Control>}h{/Control}');
    expect(screen.getByRole('search', { name: 'Find and replace' })).toBeTruthy();

    const findInput = screen.getByLabelText('Find');
    const replaceInput = screen.getByLabelText('Replace');
    await user.type(findInput, 'Sample');
    await user.type(replaceInput, 'Updated');
    await user.click(screen.getByRole('button', { name: 'Replace All' }));

    expect((textarea as HTMLTextAreaElement).value).toContain('Updated Channel');
  });

  it('keeps large raw playlists virtualized and shows a scrollbar', async () => {
    const rawContent = [
      '#EXTM3U',
      ...Array.from({ length: 6_100 }, (_, index) => `#EXTINF:-1,Channel ${index + 1}`),
    ].join('\n');
    const { container } = render(
      <M3uRawCodeEditor rawContent={rawContent} knownEntryCount={3_050} onApplyRawText={vi.fn()} />,
    );

    const textarea = screen.getByLabelText('Raw M3U Code');
    expect(textarea.className).toContain('subtle-scrollbar');
    expect(container.querySelectorAll('[data-raw-line-number]').length).toBeLessThan(100);
    expect(container.querySelector('pre[aria-hidden="true"]')?.children.length).toBeLessThan(100);

    (textarea as HTMLTextAreaElement).scrollTop = 100_000;
    fireEvent.scroll(textarea);
    await waitFor(() =>
      expect(
        Number(container.querySelector('[data-raw-line-number]')?.textContent),
      ).toBeGreaterThan(1_000),
    );
    expect(container.querySelectorAll('[data-raw-line-number]').length).toBeLessThan(100);
  });
});
