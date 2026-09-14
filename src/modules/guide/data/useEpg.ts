import { useQuery } from '@tanstack/react-query';
import { getChannelEPG } from '@/modules/sources/public/data/xtreamClient';
import { getXtreamCredentials, useAuthStore } from '@/modules/sources/public/store/useAuthStore';
import { getXtreamQueryScope, queryKeys } from '@/modules/sources/public/model/queryKeys';

/** One programme, with times already turned into something JavaScript can use. */
export interface EpgProgramme {
  id: string;
  title: string;
  description: string;
  /** Milliseconds since the epoch. */
  start: number;
  end: number;
}

/**
 * Xtream sends guide text base64-encoded, but not always — some providers put
 * the title in plain.
 *
 * Telling the two apart by looking at the string does not work: a title like
 * "News" is four characters from the base64 alphabet, so it decodes happily
 * into three bytes of nonsense. What does work is insisting the result be valid
 * UTF-8. A strict decoder rejects the nonsense, and the original text is used
 * instead.
 */
const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

export function decodeEpgText(value: string | undefined): string {
  if (!value) return '';
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return strictUtf8.decode(bytes).trim();
  } catch {
    return value.trim();
  }
}

/**
 * Guide entries carry both a `start` string and a `start_timestamp`, and they
 * disagree: the provider writes the string in UTC, so a programme at 22:00 in
 * Berlin is labelled `20:00:00`. Only the timestamp is unambiguous — and it
 * arrives as a string, which is why it is parsed rather than trusted as a
 * number.
 */
const asMillis = (value: number | string | undefined): number => {
  const seconds = typeof value === 'string' ? Number(value.trim()) : value;
  return Number.isFinite(seconds) ? (seconds as number) * 1000 : 0;
};

/**
 * One channel's guide.
 *
 * Called from each visible row, so the guide loads for what the user is
 * actually looking at rather than for a few thousand channels up front. React
 * Query keeps each channel's answer, so scrolling back is instant.
 */
export function useChannelEpg(streamId: string | undefined, enabled = true, sourceId?: string) {
  const credentials = useAuthStore((state) =>
    sourceId ? (state.runtimes[sourceId]?.credentials ?? null) : getXtreamCredentials(),
  );
  const authScope = getXtreamQueryScope(sourceId, credentials);

  const canFetch = Boolean(credentials && streamId);
  const query = useQuery({
    queryKey: queryKeys.channelEpg(streamId, authScope),
    queryFn: async ({ signal }): Promise<EpgProgramme[]> => {
      if (!credentials || !streamId) return [];
      const listings = await getChannelEPG(credentials, streamId, signal);

      return listings
        .map((listing, index) => ({
          id: listing.id || `${streamId}-${index}`,
          title: decodeEpgText(listing.title) || 'No title',
          description: decodeEpgText(listing.description),
          start: asMillis(listing.start_timestamp),
          end: asMillis(listing.stop_timestamp),
        }))
        .filter((programme) => programme.start > 0 && programme.end > programme.start)
        .sort((a, b) => a.start - b.start);
    },
    enabled: enabled && canFetch,
    // A guide changes on programme boundaries, not by the second.
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    retry: false,
  });

  return { ...query, canFetch };
}
