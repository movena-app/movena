import { tauriApi } from '@/platform/tauri';
import type { XtreamCredentials } from '../model/xtream';

export async function storeXtreamCredentials(
  sourceId: string,
  credentials: XtreamCredentials,
): Promise<void> {
  await tauriApi.sourceSecretStore(sourceId, JSON.stringify(credentials));
}

export async function loadXtreamCredentials(sourceId: string): Promise<XtreamCredentials | null> {
  const value = await tauriApi.sourceSecretLoad(sourceId);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<XtreamCredentials>;
    if (
      typeof parsed.url !== 'string' ||
      !parsed.url.trim() ||
      typeof parsed.username !== 'string' ||
      !parsed.username.trim() ||
      typeof parsed.password !== 'string'
    )
      return null;
    return {
      // The vault key is the authority for source isolation. A stale or
      // tampered payload must never redirect credentials into another source.
      sourceId,
      url: parsed.url,
      alternativeUrls: Array.isArray(parsed.alternativeUrls)
        ? parsed.alternativeUrls.filter((url): url is string => typeof url === 'string')
        : [],
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : undefined,
      epgUrl: typeof parsed.epgUrl === 'string' ? parsed.epgUrl : undefined,
      username: parsed.username,
      password: parsed.password,
    };
  } catch {
    return null;
  }
}

export async function deleteXtreamCredentials(sourceId: string): Promise<void> {
  await tauriApi.sourceSecretDelete(sourceId);
}
