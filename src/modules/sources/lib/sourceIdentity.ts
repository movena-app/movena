export function xtreamItemId(
  sourceId: string,
  type: 'live' | 'vod' | 'series' | 'episode',
  providerId: string | number,
): string {
  return `${sourceId}:${type}:${String(providerId)}`;
}

export function xtreamCategoryId(
  sourceId: string,
  providerCategoryId: unknown,
): string | undefined {
  if (providerCategoryId === null || providerCategoryId === undefined || providerCategoryId === '')
    return undefined;
  return `${sourceId}:category:${String(providerCategoryId)}`;
}

/** Keeps per-item preferences isolated when two providers reuse the same id. */
export function sourceScopedItemKey(sourceId: string | undefined, itemId: string | number): string {
  return sourceId ? `${sourceId}::${String(itemId)}` : String(itemId);
}
