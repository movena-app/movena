import { useQuery } from '@tanstack/react-query';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import type { EpgProgramme } from './useEpg';
import { useEnabledSources } from '@/modules/sources/public/hooks/useEnabledSources';
import { getUrlQueryScope } from '@/modules/sources/public/model/queryKeys';
import { tauriApi } from '@/platform/tauri';
import { hydrateXmltvGuide, parseXmltvTime, type XmltvGuide } from '../model/xmltvNormalizer';

export { hydrateXmltvGuide, parseXmltvTime } from '../model/xmltvNormalizer';
export type { XmltvGuide } from '../model/xmltvNormalizer';

/**
 * XMLTV as a guide source, for providers whose own listings are empty.
 *
 * This is the fallback, never the default. The provider's per-channel guide
 * costs one small request per visible row; an XMLTV file is the whole schedule
 * for every channel in one download, which for a few thousand channels runs to
 * tens of megabytes and has to be parsed in the webview before anything shows.
 * Worth it when there is nothing else, wasteful when there is.
 */

/**
 * Read the body as text, transparently handling a gzipped file.
 *
 * `xmltv.php` is usually served with `Content-Encoding: gzip`, which the fetch
 * layer unwraps on its own. A URL ending in `.gz` is a different matter: the
 * bytes themselves are compressed and arrive intact, so they have to be
 * inflated here.
 */
export function parseXmltv(xml: string): XmltvGuide {
  const document = new DOMParser().parseFromString(xml, 'text/xml');
  if (document.querySelector('parsererror')) {
    throw new Error('This guide is not valid XML.');
  }

  const byChannel = new Map<string, EpgProgramme[]>();
  const idByName = new Map<string, string>();
  const nameById = new Map<string, string>();

  for (const channel of Array.from(document.querySelectorAll('channel'))) {
    const id = channel.getAttribute('id');
    if (!id) continue;
    let preferredName = '';
    for (const name of Array.from(channel.querySelectorAll('display-name'))) {
      const displayName = name.textContent?.trim();
      const text = displayName?.toLowerCase();
      if (displayName && !preferredName) preferredName = displayName;
      if (text && !idByName.has(text)) idByName.set(text, id);
    }
    nameById.set(id, preferredName || id);
  }

  let programmeCount = 0;
  for (const node of Array.from(document.querySelectorAll('programme'))) {
    const channelId = node.getAttribute('channel');
    if (!channelId) continue;

    const start = parseXmltvTime(node.getAttribute('start'));
    const end = parseXmltvTime(node.getAttribute('stop'));
    if (!start || !end || end <= start) continue;

    const list = byChannel.get(channelId) ?? [];
    list.push({
      id: `${channelId}-${start}`,
      title: node.querySelector('title')?.textContent?.trim() || 'No title',
      description: node.querySelector('desc')?.textContent?.trim() || '',
      start,
      end,
    });
    byChannel.set(channelId, list);
    programmeCount += 1;
  }

  for (const list of byChannel.values()) list.sort((a, b) => a.start - b.start);

  return { byChannel, idByName, nameById, channelCount: byChannel.size, programmeCount };
}

export async function fetchXmltvGuide(
  url: string,
  _signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<XmltvGuide> {
  return hydrateXmltvGuide(await tauriApi.xmltvFetch({ url, headers }));
}

type Settled<T> = { status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown };

export async function settleWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  signal: AbortSignal,
  task: (value: T) => Promise<R>,
): Promise<Array<Settled<R>>> {
  const results: Array<Settled<R>> = new Array(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      if (signal.aborted) break;
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: 'fulfilled', value: await task(values[index]!) };
      } catch (reason: unknown) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, worker),
  );
  if (signal.aborted)
    throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
  return results;
}

export function mergeXmltvGuides(
  guides: Array<{ sourceId: string; guide: XmltvGuide }>,
): XmltvGuide {
  const byChannel = new Map<string, EpgProgramme[]>();
  const idByName = new Map<string, string>();
  const nameById = new Map<string, string>();
  let programmeCount = 0;

  for (const { sourceId, guide } of guides) {
    for (const [channelId, programmes] of guide.byChannel) {
      const scopedId = `${sourceId}::${channelId}`;
      byChannel.set(
        scopedId,
        programmes.map((programme) => ({
          ...programme,
          id: `${sourceId}::${programme.id}`,
        })),
      );
      programmeCount += programmes.length;
    }
    for (const [name, channelId] of guide.idByName) {
      idByName.set(`${sourceId}::${name}`, `${sourceId}::${channelId}`);
    }
    for (const [channelId, name] of guide.nameById) {
      nameById.set(`${sourceId}::${channelId}`, name);
    }
  }

  return { byChannel, idByName, nameById, channelCount: byChannel.size, programmeCount };
}

/**
 * Guides for every enabled source, downloaded and parsed into one scoped index.
 *
 * A playlist's embedded guide wins; the configured XMLTV URL is used only as
 * the selected fallback. Identical requests are downloaded once and shared.
 */
export function useXmltvGuide(enabled = true) {
  const sourceSetting = useSettingsStore((state) => state.epgSource);
  const configuredUrl = useSettingsStore((state) => state.epgXmltvUrl);
  const sources = useEnabledSources();
  const fallbackUrl = sourceSetting === 'xmltv' ? configuredUrl.trim() : '';
  const descriptors = [
    ...sources.availableXtreamSources.flatMap((source) =>
      source.credentials?.epgUrl || fallbackUrl
        ? [
            {
              sourceId: source.id,
              url: source.credentials?.epgUrl || fallbackUrl,
              headers: undefined,
            },
          ]
        : [],
    ),
    ...sources.availableM3uSources.flatMap((source) => {
      const playlistUrl =
        source.runtime?.connection?.epgUrl || source.runtime?.playlist?.epgUrls[0] || fallbackUrl;
      return playlistUrl.trim()
        ? [
            {
              sourceId: source.id,
              url: playlistUrl.trim(),
              headers: source.runtime?.connection?.headers,
            },
          ]
        : [];
    }),
  ];
  const descriptorScope = descriptors
    .map((descriptor) => `${descriptor.sourceId}:${getUrlQueryScope(descriptor.url)}`)
    .sort()
    .join('|');

  return useQuery({
    queryKey: ['xmltv_guides', sources.queryScope, descriptorScope],
    queryFn: async ({ signal }) => {
      const requests = new Map<
        string,
        {
          url: string;
          headers?: Record<string, string> | undefined;
          sourceIds: string[];
        }
      >();
      for (const descriptor of descriptors) {
        const headerKey = JSON.stringify(Object.entries(descriptor.headers ?? {}).sort());
        const key = `${descriptor.url}\n${headerKey}`;
        const request = requests.get(key);
        if (request) request.sourceIds.push(descriptor.sourceId);
        else
          requests.set(key, {
            url: descriptor.url,
            headers: descriptor.headers,
            sourceIds: [descriptor.sourceId],
          });
      }
      const results = await settleWithConcurrency(
        [...requests.values()],
        2,
        signal,
        async (request) => ({
          request,
          guide: await fetchXmltvGuide(request.url, signal, request.headers),
        }),
      );
      const loaded = results.flatMap((result) =>
        result.status === 'fulfilled'
          ? result.value.request.sourceIds.map((sourceId) => ({
              sourceId,
              guide: result.value.guide,
            }))
          : [],
      );
      if (loaded.length === 0) {
        const failure = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        if (failure) throw failure.reason;
      }
      return mergeXmltvGuides(loaded);
    },
    enabled: enabled && descriptors.length > 0,
    // A schedule is worth re-downloading a couple of times a day, not hourly.
    staleTime: 1000 * 60 * 60 * 6,
    gcTime: 1000 * 60 * 60 * 12,
    retry: false,
  });
}

/**
 * Find a channel's listings in an XMLTV guide.
 *
 * Providers rarely agree with the guide file on channel ids, so the name is
 * tried as well before giving up.
 */
export function lookupXmltvChannel(
  guide: XmltvGuide | undefined,
  epgChannelId: string | undefined,
  title: string,
  sourceId?: string,
): EpgProgramme[] | undefined {
  if (!guide) return undefined;
  if (epgChannelId) {
    const scoped = sourceId ? guide.byChannel.get(`${sourceId}::${epgChannelId}`) : undefined;
    if (scoped?.length) return scoped;
    const direct = guide.byChannel.get(epgChannelId);
    if (direct?.length) return direct;
  }
  const normalizedTitle = title.trim().toLowerCase();
  const byName =
    (sourceId ? guide.idByName.get(`${sourceId}::${normalizedTitle}`) : undefined) ||
    guide.idByName.get(normalizedTitle);
  return byName ? guide.byChannel.get(byName) : undefined;
}
