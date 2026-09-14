import { useEffect } from 'react';
import { desktopApi } from '@/platform/desktop';
import { applyAppearanceTheme } from '@/shared/design/appearance';
import { getUserFacingErrorMessage } from '@/shared/lib/error';
import { uiLanguageDefinition } from '@/shared/i18n/config';
import { notify } from '@/shared/notifications/useNotificationStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

export function useAppearanceSynchronization() {
  const alwaysOnTop = useSettingsStore((state) => state.alwaysOnTop);
  const accentColor = useSettingsStore((state) => state.accentColor);
  const themePreference = useSettingsStore((state) => state.themePreference);
  const motionPreference = useSettingsStore((state) => state.motionPreference);
  const language = useSettingsStore((state) => state.language);

  useEffect(() => {
    document.documentElement.dataset.motion = motionPreference;
  }, [motionPreference]);

  useEffect(() => {
    const definition = uiLanguageDefinition(language);
    document.documentElement.lang = definition.locale;
    document.documentElement.dir = definition.direction;
  }, [language]);

  useEffect(() => {
    applyAppearanceTheme(themePreference, accentColor);
  }, [themePreference, accentColor]);

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
