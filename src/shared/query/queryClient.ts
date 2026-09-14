import { QueryClient } from '@tanstack/react-query';
import { shouldRetryQuery } from '../lib/error';

/**
 * Shared QueryClient instance.
 *
 * Extracted from App.tsx so that non-React code (Zustand stores) can
 * invalidate queries after source changes without importing the React
 * component tree.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false, // Don't refetch on window focus for desktop apps
      refetchOnReconnect: true,
      // Desktop webviews can report offline for an entire outage. Running the
      // request lets it settle into an error instead of pausing on a skeleton forever.
      networkMode: 'always',
      retry: shouldRetryQuery,
    },
  },
});

const SOURCE_QUERY_ROOTS = new Set([
  'catalog',
  'categories',
  'vod_info',
  'series_info',
  'epg_channel',
  'epg_short',
  'xmltv_guides',
]);

/** Mark every source-backed query stale after a source or connection changes. */
export function invalidateSourceQueries(): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => SOURCE_QUERY_ROOTS.has(String(query.queryKey[0] ?? '')),
  });
}
