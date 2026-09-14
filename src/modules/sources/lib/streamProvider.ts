export type StreamProviderBrand = 'youtube' | 'twitch';

function isHostOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/**
 * Identifies branded web-video URLs without relying on playlist titles or
 * accepting lookalike domains. Direct CDN/HLS URLs intentionally stay neutral.
 */
export function streamProviderBrand(url: string | undefined): StreamProviderBrand | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');

    if (
      hostname === 'youtu.be' ||
      isHostOrSubdomain(hostname, 'youtube.com') ||
      isHostOrSubdomain(hostname, 'youtube-nocookie.com')
    ) {
      return 'youtube';
    }
    if (isHostOrSubdomain(hostname, 'twitch.tv')) return 'twitch';
  } catch {
    return null;
  }

  return null;
}
