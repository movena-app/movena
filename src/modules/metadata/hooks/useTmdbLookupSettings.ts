import { useMemo } from 'react';
import { uiLanguageDefinition } from '@/shared/i18n/config';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import type { TmdbLookupOptions } from '../data/tmdbTitleLookup';

export interface TmdbLookupSettings {
  /** TMDB is switched on and has a key to ask with. */
  enabled: boolean;
  apiKey: string;
  options: TmdbLookupOptions;
}

/** The user's TMDB configuration, resolved once for every lookup made with it. */
export function useTmdbLookupSettings(): TmdbLookupSettings {
  const apiKey = useSettingsStore((state) => state.tmdbApiKey);
  const tmdbEnabled = useSettingsStore((state) => state.tmdbEnabled);
  const configuredLanguage = useSettingsStore((state) => state.tmdbLanguage);
  const imageSize = useSettingsStore((state) => state.tmdbImageSize);
  const includeAdult = useSettingsStore((state) => state.tmdbIncludeAdult);
  const appLanguage = useSettingsStore((state) => state.language);
  const language =
    configuredLanguage === 'auto' ? uiLanguageDefinition(appLanguage).locale : configuredLanguage;
  const key = apiKey.trim();

  return useMemo(
    () => ({
      enabled: tmdbEnabled && key.length > 0,
      apiKey: key,
      options: { language, includeAdult, imageSize },
    }),
    [imageSize, includeAdult, key, language, tmdbEnabled],
  );
}
