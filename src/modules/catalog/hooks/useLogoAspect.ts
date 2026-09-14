import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { detectLogoAspect, getCachedLogoAspect, type LogoAspect } from '../lib/logoAspectDetector';
import { sourceScopedItemKey } from '@/modules/sources/public/lib/sourceIdentity';

/**
 * Hook to determine the corrected aspect ratio for a Live TV channel logo.
 *
 * Takes into account:
 * 1. Specific channel override (from context menu)
 * 2. Global smart logo aspect mode (Auto, Force 16:9, Off)
 * 3. Asynchronous pixel analysis with LRU caching
 */
export function useLogoAspect(
  posterUrl: string | undefined,
  channelKey?: string | number,
  sourceId?: string,
): LogoAspect {
  const legacyKey = channelKey !== undefined && channelKey !== null ? String(channelKey) : '';
  const normalizedKey = legacyKey ? sourceScopedItemKey(sourceId, legacyKey) : '';
  const channelOverride = useSettingsStore((s) =>
    normalizedKey
      ? (s.channelLogoAspectOverrides[normalizedKey] ?? s.channelLogoAspectOverrides[legacyKey])
      : undefined,
  );
  const globalMode = useSettingsStore((s) => s.smartLogoAspectMode);

  const initialCached = getCachedLogoAspect(posterUrl);
  const [detectedAspect, setDetectedAspect] = useState<LogoAspect>(initialCached ?? 'original');

  useEffect(() => {
    if (!posterUrl || globalMode !== 'auto' || (channelOverride && channelOverride !== 'auto')) {
      setDetectedAspect('original');
      return;
    }

    const cached = getCachedLogoAspect(posterUrl);
    if (cached) {
      setDetectedAspect(cached);
      return;
    }

    setDetectedAspect('original');

    let active = true;
    void detectLogoAspect(posterUrl).then((aspect) => {
      if (active) {
        setDetectedAspect(aspect);
      }
    });

    return () => {
      active = false;
    };
  }, [posterUrl, globalMode, channelOverride]);

  if (channelOverride && channelOverride !== 'auto') {
    return channelOverride;
  }

  if (globalMode === 'off') {
    return 'original';
  }

  if (globalMode === 'force-16:9') {
    return '16:9';
  }

  return detectedAspect;
}
