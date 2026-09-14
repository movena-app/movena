import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ensureUiMessages } from '@/shared/i18n/i18n';
import { isUiLanguage } from '@/shared/i18n/config';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { applyAppearanceTheme } from '@/shared/design/appearance';
import '@/shared/design/index.css';
import { ComponentHarness } from './ComponentHarness';
import { ReadmeHarness } from './ReadmeHarness';
import { README_SURFACES, type ReadmeSurface } from '../readmeSurfaces';

async function renderHarness() {
  const searchParams = new URLSearchParams(window.location.search);
  const requestedLocale = searchParams.get('locale');
  const language = isUiLanguage(requestedLocale) ? requestedLocale : 'en';
  const theme =
    searchParams.get('theme') === 'light' || searchParams.get('readme') === 'light-theme'
      ? 'light'
      : 'dark';
  await ensureUiMessages(language);
  useSettingsStore.setState({ language, themePreference: theme });
  applyAppearanceTheme(theme, useSettingsStore.getState().accentColor);
  document.documentElement.lang = language;
  document.documentElement.dataset.motion = 'reduced';

  const readmeSurface = searchParams.get('readme');
  const isReadmeSurface = README_SURFACES.includes(readmeSurface as ReadmeSurface);
  const settingsSection = searchParams.get('settingsSection');

  createRoot(document.getElementById('root')!).render(
    isReadmeSurface ? (
      <ReadmeHarness surface={readmeSurface as ReadmeSurface} settingsSection={settingsSection} />
    ) : (
      <BrowserRouter>
        <ComponentHarness language={language} />
      </BrowserRouter>
    ),
  );
}

void renderHarness();
