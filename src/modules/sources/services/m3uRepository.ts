import { tauriApi, type M3uDocument } from '@/platform/tauri';

export interface M3uConnectionSecret {
  location: string;
  epgUrl?: string | undefined;
  headers?: Record<string, string> | undefined;
}

export async function storeM3uConnection(
  sourceId: string,
  secret: M3uConnectionSecret,
): Promise<void> {
  await tauriApi.sourceSecretStore(sourceId, JSON.stringify(secret));
}

export async function loadM3uConnection(sourceId: string): Promise<M3uConnectionSecret | null> {
  const value = await tauriApi.sourceSecretLoad(sourceId);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<M3uConnectionSecret>;
    if (typeof parsed.location !== 'string' || !parsed.location) return null;
    const headers =
      parsed.headers && typeof parsed.headers === 'object' && !Array.isArray(parsed.headers)
        ? Object.fromEntries(
            Object.entries(parsed.headers).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
          )
        : undefined;
    return {
      location: parsed.location,
      epgUrl: typeof parsed.epgUrl === 'string' && parsed.epgUrl ? parsed.epgUrl : undefined,
      headers,
    };
  } catch {
    return null;
  }
}

export async function deleteM3uConnection(sourceId: string): Promise<void> {
  await tauriApi.sourceSecretDelete(sourceId);
}

export async function fetchRemoteM3u(
  secret: M3uConnectionSecret,
  sourceId?: string,
): Promise<M3uDocument> {
  return tauriApi.m3uFetch({ url: secret.location, headers: secret.headers, cacheKey: sourceId });
}

export async function readLocalM3u(path: string): Promise<M3uDocument> {
  return tauriApi.m3uReadFile(path);
}

export async function writeLocalM3u(path: string, content: string): Promise<void> {
  await tauriApi.m3uWriteFile(path, content);
}

export async function storeM3uCache(sourceId: string, document: M3uDocument): Promise<void> {
  await tauriApi.m3uCacheStore(sourceId, document);
}

export async function loadM3uCache(sourceId: string): Promise<M3uDocument | null> {
  return tauriApi.m3uCacheLoad(sourceId);
}

export async function deleteM3uCache(sourceId: string): Promise<void> {
  await tauriApi.m3uCacheDelete(sourceId);
}
