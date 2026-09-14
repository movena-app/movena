import { useState, useMemo } from 'react';
import { Edit2, Combine, Trash2, Folder, Check } from 'lucide-react';
import type { M3uEntry } from '@/modules/sources/public/data/m3uClient';
import { Button, IconButton } from '@/shared/ui/Button';
import { Select } from '@/shared/ui/Select';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import styles from './M3uEditorWorkspace.module.css';
import { useI18n } from '@/shared/i18n/i18n';
import { DialogShell } from '@/shared/ui/DialogShell';

interface M3uGroupManagerProps {
  entries: M3uEntry[];
  onUpdateEntries: (updated: M3uEntry[]) => void;
}

export function M3uGroupManager({ entries, onUpdateEntries }: M3uGroupManagerProps) {
  const { t, number } = useI18n();
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [mergingGroup, setMergingGroup] = useState<string | null>(null);
  const [mergeTargetGroup, setMergeTargetGroup] = useState('');
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);
  const categoryId = (entry: M3uEntry, groupTitle: string) =>
    `m3u-category-${entry.type}-${groupTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`;

  // Group statistics
  const groupStats = useMemo(() => {
    const stats = new Map<string, { total: number; live: number; vod: number; series: number }>();
    for (const entry of entries) {
      const g = entry.groupTitle || 'General';
      const existing = stats.get(g) || { total: 0, live: 0, vod: 0, series: 0 };
      existing.total++;
      if (entry.type === 'vod') existing.vod++;
      else if (entry.type === 'series') existing.series++;
      else existing.live++;
      stats.set(g, existing);
    }
    return Array.from(stats.entries())
      .map(([name, counts]) => ({
        name,
        ...counts,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const allGroupNames = useMemo(() => groupStats.map((g) => g.name), [groupStats]);

  const handleStartRename = (group: string) => {
    setEditingGroup(group);
    setRenameValue(group);
  };

  const handleConfirmRename = () => {
    if (!editingGroup || !renameValue.trim() || editingGroup === renameValue.trim()) {
      setEditingGroup(null);
      return;
    }
    const oldName = editingGroup;
    const newName = renameValue.trim();
    const updated = entries.map((entry) =>
      (entry.groupTitle || 'General') === oldName
        ? { ...entry, groupTitle: newName, categoryId: categoryId(entry, newName) }
        : entry,
    );
    onUpdateEntries(updated);
    setEditingGroup(null);
  };

  const handleStartMerge = (group: string) => {
    setMergingGroup(group);
    const candidate = allGroupNames.find((g) => g !== group) || '';
    setMergeTargetGroup(candidate);
  };

  const handleConfirmMerge = () => {
    if (!mergingGroup || !mergeTargetGroup || mergingGroup === mergeTargetGroup) {
      setMergingGroup(null);
      return;
    }
    const sourceGroup = mergingGroup;
    const target = mergeTargetGroup;
    const updated = entries.map((entry) =>
      (entry.groupTitle || 'General') === sourceGroup
        ? { ...entry, groupTitle: target, categoryId: categoryId(entry, target) }
        : entry,
    );
    onUpdateEntries(updated);
    setMergingGroup(null);
  };

  const handleConfirmDelete = () => {
    if (!deletingGroup) return;
    const target = deletingGroup;
    const updated = entries.filter((entry) => (entry.groupTitle || 'General') !== target);
    onUpdateEntries(updated);
    setDeletingGroup(null);
  };

  return (
    <div className={styles.groupManager}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 'var(--font-size-title)',
              fontWeight: 'var(--font-weight-semibold)',
            }}
          >
            {t('Category & Group Manager')}
          </h2>
          <span style={{ fontSize: 'var(--font-size-small)', color: 'var(--text-muted)' }}>
            {t('{count} categories across {entries} channels', {
              count: number(groupStats.length),
              entries: number(entries.length),
            })}
          </span>
        </div>
        <span className={styles.sectionDescription}>
          {t('Create a category by assigning channels from the Channels view.')}
        </span>
      </div>

      <div className={styles.groupGrid}>
        {groupStats.map((group) => {
          const isEditing = editingGroup === group.name;

          return (
            <div key={group.name} className={styles.groupCard}>
              <div className={styles.groupCardHeader}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <Folder size={16} style={{ color: 'var(--accent-foreground)', flexShrink: 0 }} />
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: 'var(--space-1)', flex: 1 }}>
                      <input
                        type="text"
                        className={`uiField`}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        autoFocus
                      />
                      <IconButton
                        size="sm"
                        type="button"
                        onClick={handleConfirmRename}
                        aria-label={t('Save rename')}
                      >
                        <Check size={14} />
                      </IconButton>
                    </div>
                  ) : (
                    <span className={styles.groupCardTitle} title={group.name}>
                      {group.name}
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.groupCardStats}>
                <span>{t('{count} channels', { count: number(group.total) })}</span>
                {group.live > 0 && (
                  <span>· {t('{count} live', { count: number(group.live) })}</span>
                )}
                {group.vod > 0 && (
                  <span>· {t('{count} movies', { count: number(group.vod) })}</span>
                )}
                {group.series > 0 && (
                  <span>· {t('{count} series', { count: number(group.series) })}</span>
                )}
              </div>

              <div className={styles.groupCardActions}>
                <IconButton
                  size="sm"
                  type="button"
                  onClick={() => handleStartRename(group.name)}
                  aria-label={t('Rename category')}
                >
                  <Edit2 size={13} />
                </IconButton>
                <IconButton
                  size="sm"
                  type="button"
                  onClick={() => handleStartMerge(group.name)}
                  aria-label={t('Merge into another category')}
                >
                  <Combine size={13} />
                </IconButton>
                <IconButton
                  size="sm"
                  type="button"
                  onClick={() => setDeletingGroup(group.name)}
                  aria-label={t('Delete category')}
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>
            </div>
          );
        })}
      </div>

      {mergingGroup && (
        <DialogShell
          onClose={() => setMergingGroup(null)}
          overlayClassName={styles.drawerOverlay}
          className={styles.modalDialog}
          ariaLabel={t('Merge Category')}
          initialFocusSelector="button"
        >
          <div className={styles.modalHeader}>
            <h3 className={styles.drawerHeaderTitle}>
              {t('Merge Category: {name}', { name: mergingGroup })}
            </h3>
          </div>
          <div className={styles.modalBody}>
            <p style={{ color: 'var(--text-secondary)' }}>
              {t('All channels currently under "{name}" will be moved to the target category.', {
                name: mergingGroup,
              })}
            </p>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t('Target Category')}</label>
              <Select
                value={mergeTargetGroup}
                options={allGroupNames
                  .filter((g) => g !== mergingGroup)
                  .map((g) => ({ value: g, label: g }))}
                onChange={setMergeTargetGroup}
                width="100%"
                variant="settings"
                ariaLabel={t('Target Category')}
              />
            </div>
          </div>
          <div className={styles.modalFooter}>
            <Button variant="ghost" type="button" onClick={() => setMergingGroup(null)}>
              {t('Cancel')}
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={handleConfirmMerge}
              disabled={!mergeTargetGroup}
            >
              {t('Merge Channels')}
            </Button>
          </div>
        </DialogShell>
      )}

      {deletingGroup && (
        <ConfirmDialog
          title={t('Delete Category "{name}"?', { name: deletingGroup })}
          description={t(
            'This will remove all channels in "{name}" from this playlist. This action can be undone by not saving changes.',
            { name: deletingGroup },
          )}
          confirmLabel={t('Delete Category')}
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingGroup(null)}
        />
      )}
    </div>
  );
}
