// @vitest-environment happy-dom

import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Select } from '@/shared/ui/Select';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { TabStrip } from '@/shared/ui/TabStrip';
import { SettingsRange, SettingsToggle } from '@/modules/settings/components/SettingsControls';
import { ErrorState } from '@/shared/ui/ErrorState';
import { ToastContainer } from '@/shared/ui/ToastContainer';
import { useNotificationStore } from '@/shared/notifications/useNotificationStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import {
  WORKSPACE_SIDEBAR_DEFAULT_WIDTH,
  WORKSPACE_SIDEBAR_MAX_WIDTH,
  WorkspaceSidebar,
} from '@/shared/ui/WorkspaceSidebar';
import { Button, IconButton } from '@/shared/ui/Button';
import { MediaCardMenu } from '@/modules/catalog/components/MediaCardMenu';
import { MediaCard } from '@/modules/catalog/components/MediaCard';
import { useLibraryStore } from '@/modules/library/store/useLibraryStore';

describe('custom control keyboard contracts', () => {
  it('keeps shared actions on the canonical button contract', async () => {
    const onSave = vi.fn();
    render(
      <>
        <Button variant="primary" size="lg" onClick={onSave}>
          Save changes
        </Button>
        <IconButton aria-label="Dismiss" disabled>
          ×
        </IconButton>
      </>,
    );

    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save.getAttribute('data-variant')).toBe('primary');
    expect(save.getAttribute('data-size')).toBe('lg');
    await userEvent.click(save);
    expect(onSave).toHaveBeenCalledOnce();
    expect((screen.getByRole('button', { name: 'Dismiss' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('keeps modal error retry actions accessible and exposes retry progress', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <ErrorState
        modal
        title="Couldn’t load details"
        description="The provider did not respond."
        actionLabel="Try Again"
        onAction={onRetry}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert').textContent).toContain('Couldn’t load details');

    rerender(
      <ErrorState
        modal
        title="Couldn’t load details"
        description="The provider did not respond."
        actionLabel="Try Again"
        onAction={onRetry}
        isRetrying
      />,
    );
    expect(
      (screen.getByRole('button', { name: 'Trying again' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('announces error toasts and lets the user dismiss them', async () => {
    useSettingsStore.setState({ enableNotifications: true, dndDuringPlayback: false });
    useNotificationStore.setState({
      notifications: [
        {
          id: 'error-toast',
          type: 'error',
          title: 'Connection failed',
          message: 'The provider did not respond.',
          duration: 0,
          timestamp: Date.now(),
        },
      ],
    });

    render(<ToastContainer enabled suppressDuringPlayback={false} />);
    expect(screen.getByRole('alert').textContent).toContain('Connection failed');

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('moves segmented-control selection with arrows and wraps at the ends', async () => {
    function Harness() {
      const [value, setValue] = useState('grid');
      return (
        <SegmentedControl
          ariaLabel="Layout"
          value={value}
          onChange={setValue}
          options={[
            { value: 'grid', label: 'Grid' },
            { value: 'list', label: 'List' },
          ]}
        />
      );
    }

    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('radio', { name: 'Grid' }));
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'List' }).getAttribute('aria-checked')).toBe('true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Grid' }).getAttribute('aria-checked')).toBe('true');
  });

  it('keeps compact icon-only segmented options accessible by their labels', () => {
    render(
      <SegmentedControl
        ariaLabel="Editor view"
        value="channels"
        onChange={() => undefined}
        iconOnlyAtCompact
        options={[
          {
            value: 'channels',
            label: 'Channels',
            icon: ({ className }) => (
              <span className={className} aria-hidden="true">
                C
              </span>
            ),
          },
          {
            value: 'raw',
            label: 'Raw M3U',
            icon: ({ className }) => (
              <span className={className} aria-hidden="true">
                R
              </span>
            ),
          },
        ]}
      />,
    );

    expect(screen.getByRole('radio', { name: 'Channels' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Raw M3U' })).toBeTruthy();
  });

  it('keeps settings ranges labelled and reports formatted values', async () => {
    const onChange = vi.fn();
    render(
      <SettingsRange
        aria-label="Subtitle opacity"
        min={0}
        max={100}
        value={75}
        onChange={onChange}
        formatValue={(value) => `${value}%`}
      />,
    );

    expect(
      (screen.getByRole('slider', { name: 'Subtitle opacity' }) as HTMLInputElement).value,
    ).toBe('75');
    expect(screen.getByText('75%')).toBeTruthy();
    fireEvent.change(screen.getByRole('slider', { name: 'Subtitle opacity' }), {
      target: { value: '80' },
    });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('does not put a retry glyph on non-retry error actions', () => {
    render(
      <ErrorState
        modal
        title="Item unavailable"
        description="The item no longer exists."
        actionLabel="Close"
        onAction={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Close' }).querySelector('svg')).toBeNull();
  });

  it('keeps settings toggles labelled and exposes their native checked state', async () => {
    const onChange = vi.fn();
    render(<SettingsToggle checked={false} onChange={onChange} label="Autoplay next episode" />);

    const toggle = screen.getByRole('checkbox', { name: 'Autoplay next episode' });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('gives the media-card quick-create field and submit action accessible names', async () => {
    useLibraryStore.setState({ favorites: [], collections: [], history: [], watched: [] });
    render(
      <MediaCardMenu
        item={{ id: 'movie-1', title: 'Movie', posterUrl: '', type: 'vod' }}
        onPlay={vi.fn()}
        onViewDetails={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'More options' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add to Collection' }));

    expect(screen.getByRole('textbox', { name: 'New collection…' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create and add' })).toBeTruthy();
  });

  it('keeps the Play quick action while avoiding duplicate menu commands', async () => {
    useLibraryStore.setState({ favorites: [], collections: [], history: [], watched: [] });
    const openDetails = vi.fn();
    const { unmount } = render(
      <MemoryRouter>
        <MediaCard
          item={{ id: 'series-1', title: 'Example Series', posterUrl: '', type: 'series' }}
          onClick={openDetails}
        />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Play Example Series' }));
    expect(openDetails).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('button', { name: 'View Details' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy Title' })).toBeTruthy();

    unmount();
    render(
      <MemoryRouter>
        <MediaCard
          item={{
            id: 'live-1',
            title: 'News Live',
            posterUrl: '',
            type: 'live',
            streamUrl: 'https://stream.test/live',
          }}
          onClick={vi.fn()}
        />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('button', { name: 'Tune Channel' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'View Details' })).toBeNull();
  });

  it('opens a media card from the keyboard without re-triggering nested actions', async () => {
    useLibraryStore.setState({ favorites: [], collections: [], history: [], watched: [] });
    const openDetails = vi.fn();
    render(
      <MemoryRouter>
        <MediaCard
          item={{ id: 'movie-keyboard', title: 'Keyboard Movie', posterUrl: '', type: 'vod' }}
          onClick={openDetails}
        />
      </MemoryRouter>,
    );

    const card = screen.getByRole('group', { name: 'Open Keyboard Movie' });
    card.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');

    expect(openDetails).toHaveBeenCalledTimes(2);
  });

  it('uses provider marks only for logo-less YouTube and Twitch live cards', () => {
    render(
      <MemoryRouter>
        <MediaCard
          item={{
            id: 'youtube-live',
            title: 'YouTube Live',
            posterUrl: '',
            type: 'live',
            streamUrl: 'https://www.youtube.com/@channel/live',
          }}
        />
        <MediaCard
          item={{
            id: 'twitch-live',
            title: 'Twitch Live',
            posterUrl: '',
            type: 'live',
            streamUrl: 'https://www.twitch.tv/channel',
          }}
        />
        <MediaCard
          item={{
            id: 'ordinary-live',
            title: 'Ordinary Live',
            posterUrl: '',
            type: 'live',
            streamUrl: 'https://stream.example.test/live.m3u8',
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: 'YouTube' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Twitch' })).toBeTruthy();
    expect(screen.getAllByText('YouTube Live')).toHaveLength(1);
    expect(screen.getAllByText('Twitch Live')).toHaveLength(1);
    expect(
      screen
        .getByRole('group', { name: 'Ordinary Live' })
        .querySelector('[aria-label="YouTube"], [aria-label="Twitch"]'),
    ).toBeNull();
  });

  it('moves content-tab selection with arrows, Home, and End', async () => {
    function Harness() {
      const [value, setValue] = useState('one');
      return (
        <>
          <TabStrip
            id="seasons"
            panelId="episodes"
            ariaLabel="Seasons"
            value={value}
            onChange={setValue}
            options={[
              { value: 'one', label: 'Season 1' },
              { value: 'two', label: 'Season 2' },
              { value: 'three', label: 'Season 3' },
            ]}
          />
          <div id="episodes" role="tabpanel" />
        </>
      );
    }

    const user = userEvent.setup();
    render(<Harness />);
    const first = screen.getByRole('tab', { name: 'Season 1' });
    await user.click(first);
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Season 3' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    await user.keyboard('{Home}');
    expect(first.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Season 3' }));
    expect(first.getAttribute('aria-controls')).toBe('episodes');
  });

  it('opens the custom select and commits the active option from the keyboard', async () => {
    function Harness() {
      const [value, setValue] = useState('one');
      return (
        <Select
          value={value}
          onChange={setValue}
          options={[
            { value: 'one', label: 'One' },
            { value: 'two', label: 'Two' },
          ]}
        />
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: /One/ });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const listbox = await screen.findByRole('listbox');
    await waitFor(() => expect(document.activeElement).toBe(listbox));
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'Enter' });

    expect(screen.getByRole('button', { name: /Two/ })).toBe(document.activeElement);
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });

  it('keeps disabled custom selects closed', async () => {
    const user = userEvent.setup();
    render(
      <Select disabled value="one" onChange={vi.fn()} options={[{ value: 'one', label: 'One' }]} />,
    );
    await user.click(screen.getByRole('button', { name: /One/ }));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('resizes the shared sidebar with bounded keyboard steps and Home reset', () => {
    const onWidthChange = vi.fn();
    render(
      <WorkspaceSidebar
        className="embedded-sidebar"
        width={WORKSPACE_SIDEBAR_MAX_WIDTH}
        onWidthChange={onWidthChange}
      >
        Content
      </WorkspaceSidebar>,
    );
    expect(
      screen.getByText('Content').closest('aside')?.classList.contains('embedded-sidebar'),
    ).toBe(true);
    const handle = screen.getByRole('button', { name: /Resize sidebar/ });

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(onWidthChange.mock.calls).toEqual([
      [WORKSPACE_SIDEBAR_MAX_WIDTH],
      [WORKSPACE_SIDEBAR_DEFAULT_WIDTH],
    ]);
  });
});
