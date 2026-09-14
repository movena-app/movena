import { describe, expect, it } from 'vitest';
import { streamProviderBrand } from '@/modules/sources/lib/streamProvider';

describe('stream provider branding', () => {
  it.each([
    ['https://www.youtube.com/c/todonoticias/live', 'youtube'],
    ['https://youtu.be/abc123', 'youtube'],
    ['https://www.youtube-nocookie.com/embed/abc123', 'youtube'],
    ['https://www.twitch.tv/gleggmire', 'twitch'],
    ['https://player.twitch.tv/?channel=gleggmire', 'twitch'],
  ] as const)('recognizes %s as %s', (url, provider) => {
    expect(streamProviderBrand(url)).toBe(provider);
  });

  it.each([
    undefined,
    '',
    'not a URL',
    'ftp://www.youtube.com/video',
    'https://youtube.com.example.test/live',
    'https://fake-twitch.tv/channel',
    'https://usher.ttvnw.net/api/channel/hls/channel.m3u8',
    'https://video.example.test/live.m3u8',
  ])('keeps non-provider and direct stream URLs neutral', (url) => {
    expect(streamProviderBrand(url)).toBeNull();
  });
});
