// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackSettingsSection } from '@/modules/settings/components/PlaybackSettingsSection';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
});

describe('PlaybackSettingsSection', () => {
  it('switches the live stream format and rebuilds the live catalogue', () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    render(
      <QueryClientProvider client={queryClient}>
        <PlaybackSettingsSection />
      </QueryClientProvider>,
    );

    expect(useSettingsStore.getState().liveStreamFormat).toBe('ts');
    expect(screen.getByRole('radio', { name: 'MPEG-TS' }).getAttribute('aria-checked')).toBe(
      'true',
    );

    fireEvent.click(screen.getByRole('radio', { name: 'HLS' }));

    expect(useSettingsStore.getState().liveStreamFormat).toBe('m3u8');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['catalog', 'live'] });
  });
});
