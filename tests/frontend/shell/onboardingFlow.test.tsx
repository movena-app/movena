// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/sources/components/AccountConnectionForm', () => ({
  AccountConnectionForm: ({ onSuccess }: { onSuccess?: () => void }) => (
    <button onClick={onSuccess}>Mock connect Xtream</button>
  ),
}));
vi.mock('@/modules/sources/components/M3uSourceForm', () => ({
  M3uSourceForm: ({ onSuccess, onCancel }: { onSuccess?: () => void; onCancel?: () => void }) => (
    <>
      <button onClick={onSuccess}>Mock connect M3U</button>
      <button onClick={onCancel}>Mock cancel M3U</button>
    </>
  ),
}));

import { OnboardingFlow } from '@/modules/onboarding/components/OnboardingFlow';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

beforeEach(() => useSettingsStore.getState().resetSettings());

describe('first-run onboarding flow', () => {
  it('connects a source, chooses a destination, and dismisses itself', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(
      <MemoryRouter initialEntries={['/']}>
        <OnboardingFlow onDone={onDone} />
        <LocationProbe />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Xtream Account/i }));
    await user.click(await screen.findByRole('button', { name: 'Mock connect Xtream' }));
    expect(await screen.findByText('Where should we start?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Movies Browse the film library/i }));
    expect(await screen.findByText('You’re ready to watch.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Start watching/i }));

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().onboardingDismissed).toBe(true);
    expect(screen.getByTestId('location').textContent).toContain('/movies');
  });

  it('allows setup to be skipped and still latches the dismissed preference', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(
      <MemoryRouter>
        <OnboardingFlow onDone={onDone} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Set up later' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().onboardingDismissed).toBe(true);
  });

  it('returns to the source chooser when an M3U connection is cancelled', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <OnboardingFlow onDone={vi.fn()} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /M3U playlist/i }));
    await user.click(await screen.findByRole('button', { name: 'Mock cancel M3U' }));

    expect(await screen.findByRole('button', { name: /Xtream account/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /M3U playlist/i })).toBeTruthy();
  });
});
