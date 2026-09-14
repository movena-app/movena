import { describe, expect, it } from 'vitest';
import {
  sourceScopedItemKey,
  xtreamCategoryId,
  xtreamItemId,
} from '@/modules/sources/lib/sourceIdentity';

describe('multi-source identities', () => {
  it('keeps identical provider ids isolated by source and media kind', () => {
    expect(xtreamItemId('xtream-one', 'live', 42)).not.toBe(xtreamItemId('xtream-two', 'live', 42));
    expect(xtreamItemId('xtream-one', 'live', 42)).not.toBe(xtreamItemId('xtream-one', 'vod', 42));
    expect(xtreamItemId('xtream-one', 'series', 42)).not.toBe(
      xtreamItemId('xtream-one', 'episode', 42),
    );
  });

  it('keeps category filters isolated by source', () => {
    expect(xtreamCategoryId('xtream-one', '7')).toBe('xtream-one:category:7');
    expect(xtreamCategoryId('xtream-two', '7')).toBe('xtream-two:category:7');
    expect(xtreamCategoryId('xtream-one', '')).toBeUndefined();
  });

  it('keeps item preferences isolated when providers reuse an item id', () => {
    expect(sourceScopedItemKey('xtream-one', 42)).toBe('xtream-one::42');
    expect(sourceScopedItemKey('xtream-one', 42)).not.toBe(sourceScopedItemKey('xtream-two', 42));
    expect(sourceScopedItemKey(undefined, 42)).toBe('42');
  });
});
