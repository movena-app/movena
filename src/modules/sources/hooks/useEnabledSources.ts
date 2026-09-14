import { useMemo } from 'react';
import {
  getCombinedSourceQueryScope,
  getM3uQueryScope,
  getXtreamQueryScope,
} from '../model/queryKeys';
import {
  useAuthStore,
  type XtreamSourceProfile,
  type XtreamSourceRuntime,
} from '../store/useAuthStore';
import type { XtreamCredentials } from '../model/xtream';
import {
  useSourceStore,
  type M3uSourceProfile,
  type M3uSourceRuntime,
} from '../store/useSourceStore';

export interface EnabledXtreamSource {
  id: string;
  profile: XtreamSourceProfile;
  runtime: XtreamSourceRuntime | null;
  credentials: XtreamCredentials | null;
  queryScope: string;
  isAvailable: boolean;
}

export interface EnabledM3uSource {
  id: string;
  profile: M3uSourceProfile;
  runtime: M3uSourceRuntime | null;
  queryScope: string;
  isAvailable: boolean;
}

export interface EnabledSourcesSnapshot {
  enabledSourceIds: string[];
  xtreamEnabled: boolean;
  xtreamAvailable: boolean;
  xtreamSources: EnabledXtreamSource[];
  availableXtreamSources: EnabledXtreamSource[];
  m3uSources: EnabledM3uSource[];
  availableM3uSources: EnabledM3uSource[];
  isAvailable: boolean;
  isLoading: boolean;
  errors: string[];
  queryScope: string;
}

export function useEnabledSources(): EnabledSourcesSnapshot {
  const enabledSourceIds = useSourceStore((state) => state.enabledSourceIds);
  const profiles = useSourceStore((state) => state.profiles);
  const runtimes = useSourceStore((state) => state.runtimes);
  const xtreamProfiles = useAuthStore((state) => state.profiles);
  const xtreamRuntimes = useAuthStore((state) => state.runtimes);

  return useMemo(() => {
    const xtreamSources = xtreamProfiles
      .filter((profile) => enabledSourceIds.includes(profile.id))
      .map((profile): EnabledXtreamSource => {
        const runtime = xtreamRuntimes[profile.id] ?? null;
        const credentials = runtime?.credentials ?? null;
        return {
          id: profile.id,
          profile,
          runtime,
          credentials,
          queryScope: getXtreamQueryScope(profile.id, credentials),
          isAvailable: Boolean(credentials && profile.userInfo.auth === 1),
        };
      });
    const availableXtreamSources = xtreamSources.filter((source) => source.isAvailable);
    const xtreamEnabled = xtreamSources.length > 0;
    const xtreamAvailable = availableXtreamSources.length > 0;
    const m3uSources = profiles
      .filter((profile) => enabledSourceIds.includes(profile.id))
      .map((profile): EnabledM3uSource => {
        const runtime = runtimes[profile.id] ?? null;
        return {
          id: profile.id,
          profile,
          runtime,
          queryScope: getM3uQueryScope(profile.id, runtime?.revision ?? 0),
          isAvailable: Boolean(runtime?.playlist),
        };
      });
    const availableM3uSources = m3uSources.filter((source) => source.isAvailable);
    const queryScopes = [
      ...xtreamSources.map((source) => source.queryScope),
      ...m3uSources.map((source) => source.queryScope),
    ];

    return {
      enabledSourceIds,
      xtreamEnabled,
      xtreamAvailable,
      xtreamSources,
      availableXtreamSources,
      m3uSources,
      availableM3uSources,
      isAvailable: xtreamAvailable || availableM3uSources.length > 0,
      isLoading: [...xtreamSources, ...m3uSources].some(
        (source) => source.runtime?.status === 'loading',
      ),
      errors: [...xtreamSources, ...m3uSources].flatMap((source) =>
        source.runtime?.error ? [`${source.profile.name}: ${source.runtime.error}`] : [],
      ),
      queryScope: getCombinedSourceQueryScope(queryScopes),
    };
  }, [enabledSourceIds, profiles, runtimes, xtreamProfiles, xtreamRuntimes]);
}
