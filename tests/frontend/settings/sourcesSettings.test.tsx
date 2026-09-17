// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

import { M3uSourceForm } from '@/modules/sources/components/M3uSourceForm';
import { AccountConnectionForm } from '@/modules/sources/components/AccountConnectionForm';
import { SourcesSettingsSection } from '@/modules/settings/components/SourcesSettingsSection';
import { useAuthStore, type XtreamSourceProfile } from '@/modules/sources/store/useAuthStore';
import { useSourceStore, type M3uSourceProfile } from '@/modules/sources/store/useSourceStore';
import { useNotificationStore } from '@/shared/notifications/useNotificationStore';

const remoteProfile: M3uSourceProfile = {
  id: 'm3u-12345678',
  kind: 'm3u',
  name: 'Living Room',
  locationType: 'remote',
  locationLabel: 'list.test',
  refreshIntervalMinutes: 360,
  lastRefreshAt: 1,
  entryCount: 12,
  liveCount: 12,
  vodCount: 0,
  seriesCount: 0,
  hasEpg: true,
};
const xtreamProfile: XtreamSourceProfile = {
  id: 'xtream-12345678',
  kind: 'xtream',
  name: 'Main Provider',
  locationLabel: 'provider.test',
  username: 'alice',
  userInfo: {
    username: 'alice',
    message: '',
    auth: 1,
    status: 'Active',
    exp_date: '0',
    is_trial: '0',
    active_cons: '1',
    created_at: '',
    max_connections: '2',
    allowed_output_formats: ['m3u8'],
  },
  serverInfo: {
    url: 'provider.test',
    port: '80',
    https_port: '443',
    server_protocol: 'https',
    rtmp_port: '',
    timestamp_now: 0,
    time_now: '',
    timezone: 'UTC',
  },
  createdAt: 1,
  updatedAt: 1,
};

const emptyProps = {
  onAddSource: vi.fn(),
  onEditXtream: vi.fn(),
  onEditM3u: vi.fn(),
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  useNotificationStore.setState({ notifications: [] });
  useAuthStore.setState({
    profiles: [],
    runtimes: {},
    isInitializing: false,
    initializationError: null,
  });
  useSourceStore.setState({
    profiles: [],
    runtimes: {},
    enabledSourceIds: [],
    isInitializing: false,
    initializationError: null,
  });
});

describe('unified source settings', () => {
  it('associates every Xtream field label with its control', async () => {
    render(<AccountConnectionForm onCancel={vi.fn()} />);
    const user = userEvent.setup();

    expect(screen.getByLabelText('Display Name')).toBeTruthy();
    expect(screen.getByLabelText(/Primary Server/)).toBeTruthy();
    expect(screen.getByLabelText(/Username/).getAttribute('aria-required')).toBe('true');
    expect(screen.getByLabelText(/Password/).getAttribute('aria-required')).toBe('true');
    expect(screen.getByLabelText('XMLTV Override (Optional)')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Add alternate server' }));
    expect(screen.getByLabelText('Alternate #1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove alternate server 1' })).toBeTruthy();
  });

  it('gives M3U connection and request identity fields explicit names', () => {
    render(<M3uSourceForm onCancel={vi.fn()} />);

    expect(screen.getByLabelText('Display Name')).toBeTruthy();
    expect(screen.getByLabelText('Playlist URL').getAttribute('aria-required')).toBe('true');
    expect(screen.getByLabelText('Refresh Every (Hours)')).toBeTruthy();
    expect(screen.getByLabelText('User agent')).toBeTruthy();
    expect(screen.getByLabelText('HTTP referrer')).toBeTruthy();
    expect(screen.getByLabelText('XMLTV Override (Optional)')).toBeTruthy();
  });

  it('has one Add Source entry point for every source type', async () => {
    const onAddSource = vi.fn();
    render(<SourcesSettingsSection {...emptyProps} onAddSource={onAddSource} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add Source' }));
    expect(onAddSource).toHaveBeenCalledOnce();
    expect(
      screen.getByText('Xtream accounts and M3U playlists live together in one source list.'),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Global Fallback Guide' })).toBeTruthy();
  });

  it('toggles M3U sources independently and exposes edit and refresh', async () => {
    const setSourceEnabled = vi.fn();
    const onEditM3u = vi.fn();
    useSourceStore.setState({
      profiles: [remoteProfile],
      runtimes: {
        [remoteProfile.id]: {
          connection: { location: 'https://list.test/main.m3u' },
          playlist: { entries: [], epgUrls: [], warnings: [] },
          status: 'ready',
          error: null,
          revision: 1,
        },
      },
      enabledSourceIds: [],
      setSourceEnabled,
    });
    render(<SourcesSettingsSection {...emptyProps} onEditM3u={onEditM3u} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Enable' }));
    expect(setSourceEnabled).toHaveBeenCalledWith(remoteProfile.id, true);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEditM3u).toHaveBeenCalledWith(remoteProfile.id);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
  });

  it('states exactly how a refresh treats an edited M3U copy', async () => {
    const setEditorRefreshPolicy = vi.fn();
    const editedProfile = {
      ...remoteProfile,
      hasLocalEdits: true,
      editorRefreshPolicy: 'preserve-edits' as const,
    };
    useSourceStore.setState({
      profiles: [editedProfile],
      runtimes: {
        [editedProfile.id]: {
          connection: { location: 'https://list.test/main.m3u' },
          playlist: { entries: [], epgUrls: [], warnings: [] },
          status: 'ready',
          error: null,
          revision: 1,
        },
      },
      enabledSourceIds: [editedProfile.id],
      setEditorRefreshPolicy,
    });
    render(<SourcesSettingsSection {...emptyProps} />);

    const policy = screen.getByRole('button', { name: 'Keep Edits on Refresh' });
    expect(policy.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(policy);
    expect(setEditorRefreshPolicy).toHaveBeenCalledWith(editedProfile.id, 'replace-edits');
  });

  it('refreshes every source from one button and keeps protected edits', async () => {
    const refreshSource = vi.fn().mockResolvedValue(undefined);
    const testSource = vi.fn().mockResolvedValue(undefined);
    const editedProfile: M3uSourceProfile = {
      ...remoteProfile,
      id: 'm3u-87654321',
      name: 'Edited List',
      hasLocalEdits: true,
      editorRefreshPolicy: 'preserve-edits',
    };
    const readyRuntime = {
      connection: { location: 'https://list.test/main.m3u' },
      playlist: { entries: [], epgUrls: [], warnings: [] },
      status: 'ready' as const,
      error: null,
      revision: 1,
    };
    useSourceStore.setState({
      profiles: [remoteProfile, editedProfile],
      runtimes: { [remoteProfile.id]: readyRuntime, [editedProfile.id]: readyRuntime },
      enabledSourceIds: [remoteProfile.id, editedProfile.id],
      refreshSource,
    });
    useAuthStore.setState({
      profiles: [xtreamProfile],
      runtimes: {
        [xtreamProfile.id]: {
          credentials: {
            sourceId: xtreamProfile.id,
            url: 'https://provider.test',
            username: 'alice',
            password: 'secret',
          },
          status: 'ready',
          error: null,
          revision: 1,
        },
      },
      testSource,
    });
    render(<SourcesSettingsSection {...emptyProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'Refresh All' }));

    await waitFor(() => expect(refreshSource).toHaveBeenCalledWith(remoteProfile.id));
    expect(refreshSource).not.toHaveBeenCalledWith(editedProfile.id);
    expect(testSource).toHaveBeenCalledWith(xtreamProfile.id);

    // The store keeps notifications newest first.
    const messages = useNotificationStore.getState().notifications;
    expect(messages.map((item) => item.title)).toEqual([
      'Edited Playlists Kept',
      'Sources Refreshed',
    ]);
    expect(messages[0]?.message).toBe(
      'Edited List kept the edited copy. Allow refresh overwrite to replace it.',
    );
    expect(messages[1]?.message).toBe('2 of 3 sources reloaded.');
  });

  it('names the sources a refresh could not reach', async () => {
    const refreshSource = vi.fn().mockRejectedValue(new Error('Playlist host is offline'));
    useSourceStore.setState({
      profiles: [remoteProfile],
      runtimes: {
        [remoteProfile.id]: {
          connection: { location: 'https://list.test/main.m3u' },
          playlist: { entries: [], epgUrls: [], warnings: [] },
          status: 'ready',
          error: null,
          revision: 1,
        },
      },
      enabledSourceIds: [remoteProfile.id],
      refreshSource,
    });
    render(<SourcesSettingsSection {...emptyProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'Refresh All' }));

    await waitFor(() => expect(useNotificationStore.getState().notifications).toHaveLength(1));
    const [message] = useNotificationStore.getState().notifications;
    expect(message?.type).toBe('error');
    expect(message?.title).toBe('Refresh Incomplete');
    expect(message?.message).toBe('0 of 1 sources reloaded. Could not reach: Living Room');
  });

  it('offers no refresh entry point until a source exists', () => {
    render(<SourcesSettingsSection {...emptyProps} />);

    expect(screen.queryByRole('button', { name: 'Refresh All' })).toBeNull();
  });

  it('manages multiple Xtream rows independently', async () => {
    const removeSource = vi.fn().mockResolvedValue(undefined);
    const setSourceEnabled = vi.fn();
    const onEditXtream = vi.fn();
    useAuthStore.setState({
      profiles: [xtreamProfile],
      runtimes: {
        [xtreamProfile.id]: {
          credentials: {
            sourceId: xtreamProfile.id,
            url: 'https://provider.test',
            username: 'alice',
            password: 'secret',
          },
          status: 'ready',
          error: null,
          revision: 1,
        },
      },
      removeSource,
    });
    useSourceStore.setState({ enabledSourceIds: [xtreamProfile.id], setSourceEnabled });

    render(<SourcesSettingsSection {...emptyProps} onEditXtream={onEditXtream} />);
    const user = userEvent.setup();

    expect(screen.getByRole('button', { name: 'Enabled' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEditXtream).toHaveBeenCalledWith(xtreamProfile.id);
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Remove Source' }));
    await waitFor(() => expect(removeSource).toHaveBeenCalledWith(xtreamProfile.id));
  });

  it('submits all remote M3U fields through the shared source editor', async () => {
    const addRemoteSource = vi.fn().mockResolvedValue(remoteProfile);
    useSourceStore.setState({ addRemoteSource });
    render(<M3uSourceForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Living Room' } });
    fireEvent.change(screen.getByLabelText('Playlist URL'), {
      target: { value: 'https://list.test/main.m3u' },
    });
    fireEvent.change(screen.getByLabelText('XMLTV Override (Optional)'), {
      target: { value: 'https://guide.test/epg.xml' },
    });
    fireEvent.change(screen.getByLabelText('Refresh Every (Hours)'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('User agent'), { target: { value: 'Provider App' } });
    fireEvent.change(screen.getByLabelText('HTTP referrer'), {
      target: { value: 'https://portal.test/' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Source' }));

    expect(addRemoteSource).toHaveBeenCalledWith({
      name: 'Living Room',
      url: 'https://list.test/main.m3u',
      epgUrl: 'https://guide.test/epg.xml',
      userAgent: 'Provider App',
      referrer: 'https://portal.test/',
      refreshIntervalMinutes: 720,
    });
  });

  it('accepts a plain HTTP playlist without any extra acknowledgement', async () => {
    const addRemoteSource = vi.fn().mockResolvedValue(remoteProfile);
    useSourceStore.setState({ addRemoteSource });
    render(<M3uSourceForm />);

    fireEvent.change(screen.getByLabelText('Playlist URL'), {
      target: { value: 'http://list.test/main.m3u' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Source' }));

    expect(addRemoteSource).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://list.test/main.m3u',
      }),
    );
  });

  it('edits an existing M3U source without changing its identity', async () => {
    const updateRemoteSource = vi.fn().mockResolvedValue({ ...remoteProfile, name: 'Edited' });
    useSourceStore.setState({
      profiles: [remoteProfile],
      runtimes: {
        [remoteProfile.id]: {
          connection: {
            location: 'https://list.test/main.m3u',
            epgUrl: 'https://guide.test/old.xml',
          },
          playlist: { entries: [], epgUrls: [], warnings: [] },
          status: 'ready',
          error: null,
          revision: 1,
        },
      },
      updateRemoteSource,
    });
    render(<M3uSourceForm sourceId={remoteProfile.id} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    const name = screen.getByPlaceholderText('Living Room IPTV');
    fireEvent.change(name, { target: { value: 'Edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Source' }));

    expect(updateRemoteSource).toHaveBeenCalledWith(
      remoteProfile.id,
      expect.objectContaining({
        name: 'Edited',
        url: 'https://list.test/main.m3u',
        epgUrl: 'https://guide.test/old.xml',
      }),
    );
  });
});
