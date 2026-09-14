import { useEffect, useRef, useState } from 'react';
import { getCombinedErrorMessage } from '@/shared/lib/error';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { useAuthStore } from '@/modules/sources/store/useAuthStore';
import { useSourceStore } from '@/modules/sources/store/useSourceStore';
import { useEnabledSources } from '@/modules/sources/hooks/useEnabledSources';

export function useAppStartup() {
  const isAuthInitializing = useAuthStore((state) => state.isInitializing);
  const authError = useAuthStore((state) => state.initializationError);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const initializeSources = useSourceStore((state) => state.initialize);
  const refreshStaleSources = useSourceStore((state) => state.refreshStaleSources);
  const isSourceInitializing = useSourceStore((state) => state.isInitializing);
  const sourceError = useSourceStore((state) => state.initializationError);
  const onboardingDismissed = useSettingsStore((state) => state.onboardingDismissed);
  const enabledSources = useEnabledSources();
  const onboardingChecked = useRef(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isRetryingStartup, setIsRetryingStartup] = useState(false);
  const startupError = getCombinedErrorMessage([sourceError, authError], '');

  const retryStartup = async () => {
    setIsRetryingStartup(true);
    try {
      await Promise.all([initializeSources(), initializeAuth()]);
      await refreshStaleSources();
    } finally {
      setIsRetryingStartup(false);
    }
  };

  useEffect(() => {
    if (onboardingChecked.current || isAuthInitializing || isSourceInitializing || startupError)
      return;
    onboardingChecked.current = true;
    if (!onboardingDismissed && !enabledSources.isAvailable) setShowOnboarding(true);
  }, [
    isAuthInitializing,
    isSourceInitializing,
    startupError,
    onboardingDismissed,
    enabledSources.isAvailable,
  ]);

  useEffect(() => {
    Promise.all([initializeSources(), initializeAuth()])
      .then(() => refreshStaleSources())
      .catch(() => undefined);
  }, [initializeAuth, initializeSources, refreshStaleSources]);

  useEffect(() => {
    void import('@/modules/m3u-editor/services/m3uEditorStorage')
      .then(({ deleteLegacyM3uEditorDatabase }) => deleteLegacyM3uEditorDatabase())
      .catch(() => undefined);
  }, []);

  return {
    startupError,
    isRetryingStartup,
    retryStartup,
    showOnboarding,
    dismissOnboarding: () => setShowOnboarding(false),
  };
}
