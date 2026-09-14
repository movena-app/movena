import { useEffect, useState } from 'react';
import { getTmdbMovie, getTmdbTv, searchTmdb } from '../data/tmdbClient';
import { uiLanguageDefinition } from '@/shared/i18n/config';
import { notify } from '@/shared/notifications/useNotificationStore';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { getErrorMessage } from '@/shared/lib/error';

type MovieEnrichment = Awaited<ReturnType<typeof getTmdbMovie>>;
type SeriesEnrichment = Awaited<ReturnType<typeof getTmdbTv>>;

export function useTmdbDetailEnrichment(mediaType: 'movie', title: string): MovieEnrichment;
export function useTmdbDetailEnrichment(mediaType: 'tv', title: string): SeriesEnrichment;
export function useTmdbDetailEnrichment(
  mediaType: 'movie' | 'tv',
  title: string,
): MovieEnrichment | SeriesEnrichment {
  const apiKey = useSettingsStore((state) => state.tmdbApiKey);
  const enabled = useSettingsStore((state) => state.tmdbEnabled);
  const configuredLanguage = useSettingsStore((state) => state.tmdbLanguage);
  const imageSize = useSettingsStore((state) => state.tmdbImageSize);
  const includeAdult = useSettingsStore((state) => state.tmdbIncludeAdult);
  const appLanguage = useSettingsStore((state) => state.language);
  const [enriched, setEnriched] = useState<MovieEnrichment | SeriesEnrichment>(null);

  useEffect(() => {
    if (!enabled || !apiKey.trim() || !title.trim()) {
      setEnriched(null);
      return;
    }
    const language =
      configuredLanguage === 'auto' ? uiLanguageDefinition(appLanguage).locale : configuredLanguage;
    const options = { language, includeAdult, imageSize } as const;
    const controller = new AbortController();

    void (async () => {
      const search = await searchTmdb(apiKey, title, controller.signal, options);
      const match = search.results.find((result) => result.mediaType === mediaType);
      const result = !match
        ? null
        : mediaType === 'movie'
          ? await getTmdbMovie(apiKey, match.id, controller.signal, options)
          : await getTmdbTv(apiKey, match.id, controller.signal, options);
      if (!controller.signal.aborted) setEnriched(result);
    })().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setEnriched(null);
      notify.warning(
        'TMDB Enrichment Failed',
        getErrorMessage(error, 'TMDB enrichment failed without an error message.'),
        undefined,
        undefined,
        'connection',
      );
    });

    return () => controller.abort();
  }, [apiKey, appLanguage, configuredLanguage, enabled, imageSize, includeAdult, mediaType, title]);

  return enriched;
}
