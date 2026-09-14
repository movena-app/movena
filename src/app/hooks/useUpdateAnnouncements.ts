import { useEffect, useRef } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { notify } from '@/shared/notifications/useNotificationStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { useUpdateStore } from '@/modules/updates/store/useUpdateStore';

export function useUpdateAnnouncements(navigate: NavigateFunction) {
  const autoCheckUpdates = useSettingsStore((state) => state.autoCheckUpdates);
  const dismissedUpdateVersion = useSettingsStore((state) => state.dismissedUpdateVersion);
  const updatePhase = useUpdateStore((state) => state.phase);
  const updateInfo = useUpdateStore((state) => state.info);
  const announcedVersion = useRef<string | null>(null);

  useEffect(() => {
    if (!autoCheckUpdates) return;
    const timer = window.setTimeout(() => void useUpdateStore.getState().check(), 4000);
    return () => window.clearTimeout(timer);
  }, [autoCheckUpdates]);

  useEffect(() => {
    if (updatePhase !== 'available' || !updateInfo) return;
    if (updateInfo.version === dismissedUpdateVersion) return;
    if (announcedVersion.current === updateInfo.version) return;

    announcedVersion.current = updateInfo.version;
    notify.info('Update Available', `Movena v${updateInfo.version} is now available.`, 8000, {
      label: 'View',
      onClick: () => navigate('/settings?section=about'),
    });
  }, [updatePhase, updateInfo, dismissedUpdateVersion, navigate]);
}
