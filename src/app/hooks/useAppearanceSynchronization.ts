import { useEffect, useState } from 'react';
import { desktopApi } from '@/platform/desktop';
import {
  activeSeason,
  applyAppearanceTheme,
  msUntilNextLocalMidnight,
  type Season,
} from '@/shared/design/appearance';
import { getUserFacingErrorMessage } from '@/shared/lib/error';
import { uiLanguageDefinition } from '@/shared/i18n/config';
import { notify } from '@/shared/notifications/useNotificationStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

/** Current season, re-evaluated at each local midnight while the app stays open. */
function useActiveSeason(): Season | null {
  const [season, setSeason] = useState(() => activeSeason(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setSeason(activeSeason(new Date()));
        schedule();
      }, msUntilNextLocalMidnight(new Date()));
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  return season;
}

export function useAppearanceSynchronization() {
  const alwaysOnTop = useSettingsStore((state) => state.alwaysOnTop);
  const accentColor = useSettingsStore((state) => state.accentColor);
  const themePreference = useSettingsStore((state) => state.themePreference);
  const motionPreference = useSettingsStore((state) => state.motionPreference);
  const language = useSettingsStore((state) => state.language);
  const season = useActiveSeason();

  useEffect(() => {
    document.documentElement.dataset.motion = motionPreference;
  }, [motionPreference]);

  useEffect(() => {
    const definition = uiLanguageDefinition(language);
    document.documentElement.lang = definition.locale;
    document.documentElement.dir = definition.direction;
  }, [language]);

  useEffect(() => {
    applyAppearanceTheme(themePreference, accentColor, season);
  }, [themePreference, accentColor, season]);

  useEffect(() => {
    if (!desktopApi.isDesktop()) return;
    desktopApi.setAlwaysOnTop(alwaysOnTop).catch((error) => {
      notify.error(
        'Window Setting Failed',
        getUserFacingErrorMessage(error, 'The always-on-top window setting could not be changed.'),
      );
    });
  }, [alwaysOnTop]);
}
