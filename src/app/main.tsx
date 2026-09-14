import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/shared/design/index.css';
import App from './App';
import { ensureUiMessages } from '@/shared/i18n/i18n';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { initializeTmdbApiKey } from '@/modules/metadata/services/tmdbCredentialVault';
import { applyAppearanceTheme } from '@/shared/design/appearance';

const initialSettings = useSettingsStore.getState();
applyAppearanceTheme(initialSettings.themePreference, initialSettings.accentColor);
const root = createRoot(document.getElementById('root')!);

async function renderApp() {
  // Loaded only by the feature-gated desktop E2E build. Production bundles do
  // not include the WebDriver bridge or expose its invoke interception.
  if (import.meta.env.MODE === 'desktop-e2e') {
    await import('@wdio/tauri-plugin');
  }
  await initializeTmdbApiKey().catch((error) => {
    console.warn('Could not initialize the TMDB credential vault', error);
  });
  const language = useSettingsStore.getState().language;
  await ensureUiMessages(language).catch((error) => {
    console.warn(`Could not preload the ${language} interface catalog`, error);
  });
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void renderApp();
