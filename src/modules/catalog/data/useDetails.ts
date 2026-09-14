import { useQuery } from '@tanstack/react-query';
import {
  getXtreamCredentials,
  resolveXtreamSourceId,
  useAuthStore,
} from '@/modules/sources/public/store/useAuthStore';
import {
  getSeriesInfo,
  getVodInfo,
  type XtreamSeriesInfoResponse,
  type XtreamVodInfo,
} from '@/modules/sources/public/data/xtreamClient';
import { getXtreamQueryScope, queryKeys } from '@/modules/sources/public/model/queryKeys';

export const detailQueryKeys = {
  vod: queryKeys.vodInfo,
  series: queryKeys.seriesInfo,
};

function useSourceCredentials(sourceId?: string) {
  const resolvedSourceId = resolveXtreamSourceId(sourceId);
  return useAuthStore((state) =>
    resolvedSourceId
      ? (state.runtimes[resolvedSourceId]?.credentials ?? null)
      : getXtreamCredentials(),
  );
}

/** One canonical, source-isolated query per detail resource. */
export function useVodInfo(vodId: string | number | undefined, sourceId?: string, enabled = true) {
  const credentials = useSourceCredentials(sourceId);
  const resolvedSourceId = resolveXtreamSourceId(sourceId);
  const authScope = getXtreamQueryScope(resolvedSourceId, credentials);
  return useQuery<XtreamVodInfo>({
    queryKey: detailQueryKeys.vod(vodId, authScope),
    queryFn: async ({ signal }) => {
      const data = await getVodInfo(credentials!, vodId!, signal);
      return { ...data, movie_data: { ...data.movie_data, source_id: resolvedSourceId } };
    },
    enabled: enabled && !!credentials && vodId !== undefined && vodId !== '',
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 30,
    retry: false,
  });
}

export function useSeriesInfo(
  seriesId: string | number | undefined,
  sourceId?: string,
  enabled = true,
) {
  const credentials = useSourceCredentials(sourceId);
  const resolvedSourceId = resolveXtreamSourceId(sourceId);
  const authScope = getXtreamQueryScope(resolvedSourceId, credentials);
  return useQuery<XtreamSeriesInfoResponse>({
    queryKey: detailQueryKeys.series(seriesId, authScope),
    queryFn: async ({ signal }) => {
      const data = await getSeriesInfo(credentials!, seriesId!.toString(), signal);
      return {
        ...data,
        episodes: Object.fromEntries(
          Object.entries(data.episodes ?? {}).map(([season, episodes]) => [
            season,
            episodes.map((episode) => ({ ...episode, source_id: resolvedSourceId })),
          ]),
        ),
      };
    },
    enabled: enabled && !!credentials && seriesId !== undefined && seriesId !== '',
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 30,
    retry: false,
  });
}
