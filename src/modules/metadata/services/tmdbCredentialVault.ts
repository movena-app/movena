import { tauriApi } from '@/platform/tauri';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';

const TMDB_CREDENTIAL_ID = 'tmdb-api-key';
export async function storeTmdbApiKey(apiKey: string): Promise<void> {
  const value = apiKey.trim();
  if (value) await tauriApi.sourceSecretStore(TMDB_CREDENTIAL_ID, value);
  else await tauriApi.sourceSecretDelete(TMDB_CREDENTIAL_ID);
}

export async function loadTmdbApiKey(): Promise<string | null> {
  return tauriApi.sourceSecretLoad(TMDB_CREDENTIAL_ID);
}

export async function deleteTmdbApiKey(): Promise<void> {
  await tauriApi.sourceSecretDelete(TMDB_CREDENTIAL_ID);
  useSettingsStore.getState().updateSetting('tmdbApiKey', '');
}

/**
 * Moves a key written by versions <= 0.1.23 from persisted Zustand state into
 * the OS vault, then rewrites persisted settings through `partialize` so the
 * plaintext copy disappears from localStorage.
 */
export async function initializeTmdbApiKey(): Promise<void> {
  const legacyKey = useSettingsStore.getState().tmdbApiKey.trim();
  let storedKey = await loadTmdbApiKey();
  if (!storedKey && legacyKey) {
    await storeTmdbApiKey(legacyKey);
    storedKey = legacyKey;
  }
  useSettingsStore.getState().updateSetting('tmdbApiKey', storedKey ?? '');
}
