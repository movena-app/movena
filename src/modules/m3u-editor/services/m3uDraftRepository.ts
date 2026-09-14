import { deleteM3uEditorState, loadM3uEditorState, storeM3uEditorState } from './m3uEditorStorage';

export interface M3uDraftRecord {
  content: string;
  savedAt: number;
}

const DRAFT_NAMESPACE = 'draft';

export async function loadM3uDraft(sourceId: string): Promise<M3uDraftRecord | null> {
  const value = await loadM3uEditorState(DRAFT_NAMESPACE, sourceId);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<M3uDraftRecord>;
    return typeof parsed.content === 'string' &&
      typeof parsed.savedAt === 'number' &&
      Number.isFinite(parsed.savedAt)
      ? { content: parsed.content, savedAt: parsed.savedAt }
      : null;
  } catch {
    return null;
  }
}

export async function saveM3uDraft(sourceId: string, record: M3uDraftRecord): Promise<void> {
  await storeM3uEditorState(DRAFT_NAMESPACE, sourceId, JSON.stringify(record));
}

export async function deleteM3uDraft(sourceId: string): Promise<void> {
  await deleteM3uEditorState(DRAFT_NAMESPACE, sourceId);
}
