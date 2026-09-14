import { useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

const NUMBERED_ROUTES = ['/', '/live', '/epg', '/movies', '/series'] as const;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

export function useGlobalShortcuts(navigate: NavigateFunction) {
  const [showShortcutHelper, setShowShortcutHelper] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      if (event.key === '?') {
        event.preventDefault();
        setShowShortcutHelper((visible) => !visible);
        return;
      }

      if (!event.ctrlKey && !event.metaKey) return;

      if (event.key === '\\') {
        event.preventDefault();
        const settings = useSettingsStore.getState();
        settings.updateSetting('sidebarCollapsed', !settings.sidebarCollapsed);
        return;
      }

      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        navigate('/search');
        return;
      }

      const numberedRoute = NUMBERED_ROUTES[Number.parseInt(event.key, 10) - 1];
      if (numberedRoute) {
        event.preventDefault();
        navigate(numberedRoute);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return { showShortcutHelper, setShowShortcutHelper };
}
