import { deleteM3uEditorState, loadM3uEditorState, storeM3uEditorState } from './m3uEditorStorage';

export interface M3uVersionRecord {
  id: string;
  sourceId: string;
  createdAt: number;
  label: string;
  entryCount: number;
  content: string;
}

const MAX_VERSIONS_PER_SOURCE = 10;
const HISTORY_NAMESPACE = 'history';

function makeId(sourceId: string, createdAt: number): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${sourceId}:${createdAt}:${random}`;
}

export async function listM3uVersions(sourceId: string): Promise<M3uVersionRecord[]> {
  const value = await loadM3uEditorState(HISTORY_NAMESPACE, sourceId);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .flatMap((candidate) => {
        if (!candidate || typeof candidate !== 'object') return [];
        const record = candidate as Partial<M3uVersionRecord>;
        if (
          typeof record.id !== 'string' ||
          record.sourceId !== sourceId ||
          typeof record.createdAt !== 'number' ||
          !Number.isFinite(record.createdAt) ||
          typeof record.label !== 'string' ||
          typeof record.entryCount !== 'number' ||
          !Number.isFinite(record.entryCount) ||
          typeof record.content !== 'string'
        )
          return [];
        return [
          {
            id: record.id,
            sourceId,
            createdAt: record.createdAt,
            label: record.label,
            entryCount: Math.max(0, Math.floor(record.entryCount)),
            content: record.content,
          },
        ];
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_VERSIONS_PER_SOURCE);
  } catch {
    return [];
  }
}

export async function saveM3uVersion(
  input: Omit<M3uVersionRecord, 'id' | 'createdAt'>,
): Promise<M3uVersionRecord> {
  const createdAt = Date.now();
  const record: M3uVersionRecord = { ...input, createdAt, id: makeId(input.sourceId, createdAt) };
  const versions = [
    record,
    ...(await listM3uVersions(input.sourceId)).filter((version) => version.id !== record.id),
  ]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_VERSIONS_PER_SOURCE);
  await storeM3uEditorState(HISTORY_NAMESPACE, input.sourceId, JSON.stringify(versions));
  return record;
}

export async function deleteM3uVersion(id: string): Promise<void> {
  const sourceId = id.split(':', 1)[0];
  if (!sourceId) return;
  const versions = (await listM3uVersions(sourceId)).filter((version) => version.id !== id);
  if (versions.length > 0)
    await storeM3uEditorState(HISTORY_NAMESPACE, sourceId, JSON.stringify(versions));
  else await deleteM3uEditorState(HISTORY_NAMESPACE, sourceId);
}

export async function clearM3uVersions(sourceId: string): Promise<void> {
  await deleteM3uEditorState(HISTORY_NAMESPACE, sourceId);
}
