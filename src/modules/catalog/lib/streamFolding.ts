import type { MediaItem } from '../model/media';
import { parseLiveChannelTitle } from './titleParser';
import { mergeMediaTags } from '@/shared/lib/mediaTags';

const QUALITY_RANK: Record<string, number> = {
  '8K': 100,
  '4K': 90,
  RAW: 80,
  FHD: 70,
  '1080P': 70,
  HD: 50,
  '720P': 50,
  SD: 30,
  '480P': 30,
};

function getItemQualityRank(item: MediaItem, qualityBadges: string[]): number {
  let highest = 0;
  for (const badge of qualityBadges) {
    const score = QUALITY_RANK[badge.toUpperCase()];
    if (score && score > highest) {
      highest = score;
    }
  }
  if (item.quality) {
    const score = QUALITY_RANK[item.quality.toUpperCase()];
    if (score && score > highest) highest = score;
  }
  return highest;
}

/**
 * Folds duplicate stream entries of the same channel (e.g. 4K, FHD, HD, RAW, Backup)
 * in the same category into a single representative channel with ordered fallbacks.
 */
export function foldLiveChannels(items: readonly MediaItem[]): MediaItem[] {
  if (!items || items.length <= 1) return [...items];

  interface GroupEntry {
    item: MediaItem;
    parsedTitle: ReturnType<typeof parseLiveChannelTitle>;
    qualityBadges: string[];
    rank: number;
  }

  const groups = new Map<string, GroupEntry[]>();

  for (const item of items) {
    if (item.type !== 'live') {
      const key = `non-live::${item.id}`;
      groups.set(key, [
        {
          item,
          parsedTitle: parseLiveChannelTitle(item.title),
          qualityBadges: item.tags ?? [],
          rank: 0,
        },
      ]);
      continue;
    }

    const parsed = parseLiveChannelTitle(item.title);
    const baseName = parsed.cleanTitle.toLowerCase().replace(/\s+/g, ' ').trim();
    const categoryKey = item.categoryId ?? 'default';
    const countryKey = item.country ?? parsed.country ?? '';
    const groupKey = `${categoryKey}::${countryKey}::${baseName}`;

    const qualityBadges = mergeMediaTags(
      ...parsed.qualityBadges,
      ...(item.tags ?? []),
      item.quality,
    );
    const rank = getItemQualityRank(item, qualityBadges);

    const entry: GroupEntry = {
      item,
      parsedTitle: parsed,
      qualityBadges,
      rank,
    };

    const existing = groups.get(groupKey);
    if (existing) {
      existing.push(entry);
    } else {
      groups.set(groupKey, [entry]);
    }
  }

  const result: MediaItem[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]!.item);
      continue;
    }

    // Sort descending by quality rank
    group.sort((a, b) => b.rank - a.rank);

    const primary = group[0]!;
    const allBadges = mergeMediaTags(...group.flatMap((g) => g.qualityBadges));

    // Assemble ordered fallbacks from other quality streams
    const alternativeFallbacks: Array<{
      streamUrl: string;
      httpHeaders?: Record<string, string> | undefined;
    }> = [];
    const seenUrls = new Set<string>();
    if (primary.item.streamUrl) {
      seenUrls.add(primary.item.streamUrl);
    }

    const addFallback = (fallback: {
      streamUrl: string;
      httpHeaders?: Record<string, string> | undefined;
    }) => {
      if (!fallback.streamUrl || seenUrls.has(fallback.streamUrl)) return;
      seenUrls.add(fallback.streamUrl);
      alternativeFallbacks.push(fallback);
    };

    for (const fallback of primary.item.fallbacks ?? []) addFallback(fallback);

    for (let i = 1; i < group.length; i++) {
      const variant = group[i]!.item;
      if (variant.streamUrl) {
        addFallback({
          streamUrl: variant.streamUrl,
          httpHeaders: variant.httpHeaders,
        });
      }
      if (variant.fallbacks) {
        for (const fb of variant.fallbacks) {
          addFallback(fb);
        }
      }
    }

    const foldedItem: MediaItem = {
      ...primary.item,
      tags: allBadges,
      fallbacks: alternativeFallbacks.length > 0 ? alternativeFallbacks : undefined,
    };

    result.push(foldedItem);
  }

  return result;
}
