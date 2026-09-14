import { useCallback, useEffect, useState } from 'react';
import { History, RotateCcw, Save, Trash2, X, Download } from 'lucide-react';
import { desktopApi } from '@/platform/desktop';
import {
  clearM3uVersions,
  deleteM3uVersion,
  listM3uVersions,
  saveM3uVersion,
  type M3uVersionRecord,
} from '../services/m3uVersionHistory';
import { Button, IconButton } from '@/shared/ui/Button';
import { DialogShell } from '@/shared/ui/DialogShell';
import { useI18n } from '@/shared/i18n/i18n';
import { tauriApi } from '@/platform/tauri';
import { notify } from '@/shared/notifications/useNotificationStore';
import { getErrorMessage } from '@/shared/lib/error';
import styles from './M3uEditorWorkspace.module.css';

interface M3uVersionHistoryDialogProps {
  sourceId: string;
  currentContent: string;
  entryCount: number;
  onRestore: (content: string) => void;
  onClose: () => void;
}

export function M3uVersionHistoryDialog({
  sourceId,
  currentContent,
  entryCount,
  onRestore,
  onClose,
}: M3uVersionHistoryDialogProps) {
  const { t, number } = useI18n();
  const [versions, setVersions] = useState<M3uVersionRecord[]>([]);
  const [isWorking, setIsWorking] = useState(false);

  const refresh = useCallback(async () => setVersions(await listM3uVersions(sourceId)), [sourceId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createCheckpoint = async () => {
    setIsWorking(true);
    try {
      await saveM3uVersion({
        sourceId,
        content: currentContent,
        entryCount,
        label: 'Manual checkpoint',
      });
      await refresh();
    } finally {
      setIsWorking(false);
    }
  };

  const exportVersion = async (version: M3uVersionRecord) => {
    const fileName = `playlist-backup-${new Date(version.createdAt).toISOString().slice(0, 10)}.m3u`;
    try {
      const path = await desktopApi.savePath({
        defaultPath: fileName,
        filters: [{ name: 'M3U playlist', extensions: ['m3u', 'm3u8'] }],
      });
      if (!path || Array.isArray(path)) return;
      await tauriApi.m3uWriteFile(path, version.content);
      notify.success('Version Exported', 'The playlist checkpoint was exported successfully.');
    } catch (error: unknown) {
      notify.error(
        'Export Failed',
        getErrorMessage(error, 'Playlist checkpoint export failed without an error message.'),
      );
    }
  };

  return (
    <DialogShell
      onClose={onClose}
      className={styles.historyDialog}
      ariaLabel={t('Playlist Version History')}
      initialFocusSelector="[data-modal-initial-focus]"
    >
      <div className={styles.modalHeader}>
        <div>
          <h2 className={styles.drawerHeaderTitle}>{t('Playlist Version History')}</h2>
          <p className={styles.sectionDescription}>
            {t('Movena retains the ten most recent checkpoints for this source.')}
          </p>
        </div>
        <IconButton size="sm" type="button" onClick={onClose} aria-label={t('Close')}>
          <X size={16} />
        </IconButton>
      </div>
      <div className={styles.modalBody}>
        <div className={styles.historyActions}>
          <Button
            data-modal-initial-focus
            variant="primary"
            size="sm"
            type="button"
            onClick={() => void createCheckpoint()}
            disabled={isWorking}
          >
            <Save size={14} /> {t('Create Checkpoint')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() =>
              void (async () => {
                await clearM3uVersions(sourceId);
                await refresh();
              })()
            }
            disabled={versions.length === 0 || isWorking}
          >
            <Trash2 size={14} /> {t('Clear History')}
          </Button>
        </div>
        <div className={styles.historyList}>
          {versions.map((version) => (
            <div key={version.id} className={styles.historyRow}>
              <History size={16} aria-hidden="true" />
              <div className={styles.historyInfo}>
                <strong>{t(version.label)}</strong>
                <span>
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(version.createdAt)}{' '}
                  · {number(version.entryCount)} {t('items')}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  onRestore(version.content);
                  onClose();
                }}
              >
                <RotateCcw size={13} /> {t('Restore')}
              </Button>
              <IconButton
                size="sm"
                type="button"
                onClick={() => void exportVersion(version)}
                aria-label={t('Export version')}
              >
                <Download size={13} />
              </IconButton>
              <IconButton
                size="sm"
                type="button"
                onClick={() =>
                  void (async () => {
                    await deleteM3uVersion(version.id);
                    await refresh();
                  })()
                }
                aria-label={t('Delete version')}
              >
                <Trash2 size={13} />
              </IconButton>
            </div>
          ))}
          {versions.length === 0 && (
            <p className={styles.emptyNotice}>
              {t('No saved versions yet. A checkpoint is created before every source save.')}
            </p>
          )}
        </div>
      </div>
    </DialogShell>
  );
}
