import { describe, expect, it } from 'vitest';
import type { MediaItem } from '@/modules/catalog/model/media';
import { foldLiveChannels } from '@/modules/catalog/lib/streamFolding';

describe('stream folding', () => {
  it('passes single channels or non-live media through untouched', () => {
    const items: MediaItem[] = [
      { id: '1', title: 'Sky Cinema', posterUrl: '', type: 'live', categoryId: 'cat1' },
      { id: '2', title: 'Avatar', posterUrl: '', type: 'vod' },
    ];
    const result = foldLiveChannels(items);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('1');
    expect(result[1]!.id).toBe('2');
  });

  it('folds duplicate resolution streams of the same live channel into a single item with fallbacks', () => {
    const items: MediaItem[] = [
      {
        id: 'hd',
        title: 'DE| Sky Sport 1 HD',
        posterUrl: '',
        type: 'live',
        categoryId: 'sports',
        country: 'DE',
        streamUrl: 'https://stream.example.test/live/hd.ts',
      },
      {
        id: '4k',
        title: 'DE| Sky Sport 1 UHD',
        posterUrl: '',
        type: 'live',
        categoryId: 'sports',
        country: 'DE',
        streamUrl: 'https://stream.example.test/live/4k.ts',
      },
      {
        id: 'fhd',
        title: 'DE| Sky Sport 1 FHD',
        posterUrl: '',
        type: 'live',
        categoryId: 'sports',
        country: 'DE',
        streamUrl: 'https://stream.example.test/live/fhd.ts',
      },
    ];

    const result = foldLiveChannels(items);
    expect(result).toHaveLength(1);
    const folded = result[0]!;
    // Highest quality (4K/UHD) should be primary
    expect(folded.id).toBe('4k');
    expect(folded.streamUrl).toBe('https://stream.example.test/live/4k.ts');
    expect(folded.tags).toEqual(['4K', 'FHD', 'HD']);
    expect(folded.fallbacks).toEqual([
      { streamUrl: 'https://stream.example.test/live/fhd.ts', httpHeaders: undefined },
      { streamUrl: 'https://stream.example.test/live/hd.ts', httpHeaders: undefined },
    ]);
  });

  it('preserves distinct channels with different names or categories', () => {
    const items: MediaItem[] = [
      { id: '1', title: 'DE| Sky Sport 1 HD', posterUrl: '', type: 'live', categoryId: 'sports' },
      { id: '2', title: 'DE| Sky Sport 2 HD', posterUrl: '', type: 'live', categoryId: 'sports' },
      {
        id: '3',
        title: 'UK| Sky Sport 1 HD',
        posterUrl: '',
        type: 'live',
        categoryId: 'sports',
        country: 'GB',
      },
    ];
    const result = foldLiveChannels(items);
    expect(result).toHaveLength(3);
  });

  it('deduplicates inherited and variant fallback URLs', () => {
    const result = foldLiveChannels([
      {
        id: '4k',
        title: 'News 4K',
        posterUrl: '',
        type: 'live',
        categoryId: 'news',
        streamUrl: 'https://stream/4k',
        fallbacks: [{ streamUrl: 'https://stream/hd' }, { streamUrl: 'https://stream/4k' }],
      },
      {
        id: 'hd',
        title: 'News HD',
        posterUrl: '',
        type: 'live',
        categoryId: 'news',
        streamUrl: 'https://stream/hd',
        fallbacks: [{ streamUrl: 'https://stream/sd' }],
      },
    ]);
    expect(result[0]!.fallbacks?.map((fallback) => fallback.streamUrl)).toEqual([
      'https://stream/hd',
      'https://stream/sd',
    ]);
  });
});
