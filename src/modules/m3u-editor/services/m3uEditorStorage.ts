import {
  deleteM3uCache,
  loadM3uCache,
  storeM3uCache,
} from '@/modules/sources/public/services/m3uRepository';

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function storageKey(namespace: string, sourceId: string): string {
  return `m3u-editor-${namespace}-${fnv1a(sourceId)}`;
}

/**
 * Stores credential-bearing editor state in Movena's native application-data
 * cache, never localStorage/IndexedDB.
 */
export async function loadM3uEditorState(
  namespace: string,
  sourceId: string,
): Promise<string | null> {
  const key = storageKey(namespace, sourceId);
  return (await loadM3uCache(key))?.content ?? null;
}

export async function storeM3uEditorState(
  namespace: string,
  sourceId: string,
  content: string,
): Promise<void> {
  const key = storageKey(namespace, sourceId);
  await storeM3uCache(key, { content, baseUrl: '', fileName: `${namespace}.json` });
}

export async function deleteM3uEditorState(namespace: string, sourceId: string): Promise<void> {
  const key = storageKey(namespace, sourceId);
  await deleteM3uCache(key);
}

/** Removes the IndexedDB database used by editor builds before native cache storage. */
export function deleteLegacyM3uEditorDatabase(): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('movena-m3u-editor');
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error('Could not remove legacy playlist history.'));
    request.onblocked = () => reject(new Error('Legacy playlist history is still open.'));
  });
}
