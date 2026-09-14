import { useEffect, useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Trash2, Edit2, Copy, Plus, Sparkles } from 'lucide-react';
import type { M3uEntry, M3uMediaType } from '@/modules/sources/public/data/m3uClient';
import type { M3uHealthStatuses } from './M3uStreamHealthChecker';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { Button, IconButton } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { WorkspaceSidebar, WorkspaceSidebarSearch } from '@/shared/ui/WorkspaceSidebar';
import { Select } from '@/shared/ui/Select';
import { M3uChannelDetailsDrawer } from './M3uChannelDetailsDrawer';
import { M3uBatchToolsDialog } from './M3uBatchToolsDialog';
import styles from './M3uEditorWorkspace.module.css';
import { useI18n } from '@/shared/i18n/i18n';
import {
  collectM3uGroupStats,
  filterAndSortM3uEntries,
  M3U_TABLE_FILTER_STORAGE_KEY,
  readM3uTableFilters,
  type M3uTableHealthFilter,
  type M3uTableSort,
} from './m3uChannelTableModel';

interface M3uChannelTableProps {
  entries: M3uEntry[];
  healthStatuses: M3uHealthStatuses;
  onUpdateEntries: (entries: M3uEntry[]) => void;
}

export function M3uChannelTable({
  entries,
  healthStatuses,
  onUpdateEntries,
}: M3uChannelTableProps) {
  const { t, number } = useI18n();
  const density = useSettingsStore((state) => state.m3uEditorDensity);
  const sidebarWidth = useSettingsStore((state) => state.m3uEditorSidebarWidth);
  const confirmDestructive = useSettingsStore((state) => state.m3uEditorConfirmDestructive);
  const rememberFilters = useSettingsStore((state) => state.m3uEditorRememberFilters);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  // Search & Filter state
  const initialFilters = useMemo(readM3uTableFilters, []);
  const [searchQuery, setSearchQuery] = useState<string>(
    rememberFilters ? initialFilters.searchQuery : '',
  );
  const [selectedGroup, setSelectedGroup] = useState<string | null>(
    rememberFilters ? initialFilters.selectedGroup : null,
  );
  const [groupSearch, setGroupSearch] = useState('');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | M3uMediaType>(
    rememberFilters ? initialFilters.mediaTypeFilter : 'all',
  );
  const [healthFilter, setHealthFilter] = useState<M3uTableHealthFilter>(
    rememberFilters ? initialFilters.healthFilter : 'all',
  );
  const [sortBy, setSortBy] = useState<M3uTableSort>(
    rememberFilters ? initialFilters.sortBy : 'default',
  );

  // Selection & keyboard state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Modals & Drawers
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [isAddingChannel, setIsAddingChannel] = useState(false);
  const [isBatchToolsOpen, setIsBatchToolsOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<'bulk' | string | null>(null);

  useEffect(() => {
    if (!rememberFilters) {
      localStorage.removeItem(M3U_TABLE_FILTER_STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      M3U_TABLE_FILTER_STORAGE_KEY,
      JSON.stringify({ selectedGroup, mediaTypeFilter, healthFilter, sortBy }),
    );
  }, [healthFilter, mediaTypeFilter, rememberFilters, selectedGroup, sortBy]);

  // Group counts & sidebar
  const groupStats = useMemo(() => collectM3uGroupStats(entries), [entries]);

  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return groupStats;
    const query = groupSearch.toLowerCase();
    return groupStats.filter((g) => g.name.toLowerCase().includes(query));
  }, [groupStats, groupSearch]);

  const allGroupNames = useMemo(() => groupStats.map((g) => g.name), [groupStats]);

  useEffect(() => {
    if (selectedGroup && !allGroupNames.includes(selectedGroup)) setSelectedGroup(null);
  }, [allGroupNames, selectedGroup]);

  // Channel filtering
  const filteredEntries = useMemo(
    () =>
      filterAndSortM3uEntries(entries, healthStatuses, {
        searchQuery,
        selectedGroup,
        mediaTypeFilter,
        healthFilter,
        sortBy,
      }),
    [entries, selectedGroup, mediaTypeFilter, healthFilter, searchQuery, sortBy, healthStatuses],
  );

  const rowSize = density === 'compact' ? 36 : 48;
  const rowVirtualizer = useVirtualizer({
    count: filteredEntries.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => rowSize,
    overscan: 10,
    getItemKey: (index) => filteredEntries[index]?.id ?? index,
    initialRect: { width: 800, height: 600 },
  });
  const measuredRows = rowVirtualizer.getVirtualItems();
  const virtualRows =
    measuredRows.length > 0
      ? measuredRows
      : Array.from({ length: Math.min(50, filteredEntries.length) }, (_, index) => ({
          index,
          key: filteredEntries[index]?.id ?? index,
          start: index * rowSize,
          end: (index + 1) * rowSize,
          size: rowSize,
          lane: 0,
        }));

  useEffect(() => {
    setFocusedIndex((index) => Math.max(0, Math.min(index, filteredEntries.length - 1)));
  }, [filteredEntries.length]);

  // Bulk actions
  const handleToggleSelectAllFiltered = () => {
    const filteredIds = filteredEntries.map((e) => e.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      filteredIds.forEach((id) => next.delete(id));
    } else {
      filteredIds.forEach((id) => next.add(id));
    }
    setSelectedIds(next);
  };

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const performBulkDelete = () => {
    const updated = entries.filter((e) => !selectedIds.has(e.id));
    onUpdateEntries(updated);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () =>
    confirmDestructive ? setPendingDelete('bulk') : performBulkDelete();

  const handleBulkMoveCategory = (targetGroup: string) => {
    if (!targetGroup) return;
    const updated = entries.map((e) =>
      selectedIds.has(e.id) ? { ...e, groupTitle: targetGroup } : e,
    );
    onUpdateEntries(updated);
    setSelectedIds(new Set());
  };

  const handleBulkSetType = (targetType: M3uMediaType) => {
    const updated = entries.map((e) => (selectedIds.has(e.id) ? { ...e, type: targetType } : e));
    onUpdateEntries(updated);
    setSelectedIds(new Set());
  };

  // Single row actions
  const handleSaveEntry = (updated: M3uEntry) => {
    if (isAddingChannel) {
      onUpdateEntries([updated, ...entries]);
      setIsAddingChannel(false);
    } else {
      onUpdateEntries(entries.map((e) => (e.id === updated.id ? updated : e)));
      setEditingEntryId(null);
    }
  };

  const handleDuplicateEntry = (entry: M3uEntry) => {
    const copy: M3uEntry = {
      ...entry,
      id: `m3u-copy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `${entry.title} (Copy)`,
    };
    onUpdateEntries([...entries, copy]);
  };

  const performDeleteEntry = (id: string) => {
    onUpdateEntries(entries.filter((e) => e.id !== id));
    if (selectedIds.has(id)) {
      const next = new Set(selectedIds);
      next.delete(id);
      setSelectedIds(next);
    }
  };

  const handleDeleteEntry = (id: string) =>
    confirmDestructive ? setPendingDelete(id) : performDeleteEntry(id);

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || filteredEntries.length === 0) return;
    let nextIndex = focusedIndex;
    if (event.key === 'ArrowDown')
      nextIndex = Math.min(filteredEntries.length - 1, focusedIndex + 1);
    else if (event.key === 'ArrowUp') nextIndex = Math.max(0, focusedIndex - 1);
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = filteredEntries.length - 1;
    else if (event.key === 'Enter') {
      event.preventDefault();
      setEditingEntryId(filteredEntries[focusedIndex]?.id ?? null);
      return;
    } else if (event.key === ' ') {
      event.preventDefault();
      const entry = filteredEntries[focusedIndex];
      if (entry) handleToggleRow(entry.id);
      return;
    } else if (event.key === 'Delete') {
      event.preventDefault();
      const entry = filteredEntries[focusedIndex];
      if (entry) handleDeleteEntry(entry.id);
      return;
    } else return;
    event.preventDefault();
    setFocusedIndex(nextIndex);
    rowVirtualizer.scrollToIndex(nextIndex, { align: 'auto' });
  };

  const editingEntry = useMemo(
    () => entries.find((e) => e.id === editingEntryId) || null,
    [entries, editingEntryId],
  );
  const editingIndex = editingEntry
    ? filteredEntries.findIndex((e) => e.id === editingEntry.id)
    : -1;

  return (
    <div className={`${styles.workspace} ${density === 'compact' ? styles.workspaceCompact : ''}`}>
      {/* Category Sidebar */}
      <WorkspaceSidebar
        className={styles.categorySidebarLayout}
        title="Categories"
        count={groupStats.length}
        width={sidebarWidth}
        onWidthChange={(width) => updateSetting('m3uEditorSidebarWidth', width)}
        ariaLabel="Playlist categories"
        headerContent={
          <WorkspaceSidebarSearch
            value={groupSearch}
            onChange={setGroupSearch}
            placeholder="Filter categories..."
          />
        }
      >
        <div className={styles.categoryList}>
          <button
            type="button"
            className={`${styles.categoryButton} ${selectedGroup === null ? styles.categoryButtonActive : ''}`}
            onClick={() => setSelectedGroup(null)}
          >
            <span className={styles.categoryName}>{t('All Channels')}</span>
            <span className={styles.categoryBadge}>{number(entries.length)}</span>
          </button>

          {filteredGroups.map((group) => (
            <button
              key={group.name}
              type="button"
              className={`${styles.categoryButton} ${selectedGroup === group.name ? styles.categoryButtonActive : ''}`}
              onClick={() => setSelectedGroup(group.name)}
              title={group.name}
            >
              <span className={styles.categoryName}>{group.name}</span>
              <span className={styles.categoryBadge}>{number(group.count)}</span>
            </button>
          ))}
        </div>
      </WorkspaceSidebar>

      {/* Main Channel Area */}
      <div className={styles.channelArea}>
        {/* Table Filter Toolbar */}
        <div className={styles.tableToolbar}>
          <div className={styles.compactCategoryFilter}>
            <Select
              value={selectedGroup ?? ''}
              options={[
                { value: '', label: t('All Channels') },
                ...groupStats.map((group) => ({
                  value: group.name,
                  label: `${group.name} (${number(group.count)})`,
                })),
              ]}
              onChange={(value) => setSelectedGroup(value || null)}
              width="100%"
              variant="settings"
              ariaLabel={t('Playlist category')}
            />
          </div>
          <div className={styles.searchFilters}>
            <div style={{ position: 'relative', flex: 1, minWidth: '160px', maxWidth: '300px' }}>
              <input
                type="text"
                className={`uiField ${styles.searchInput}`}
                placeholder={t('Search title, URL, EPG ID...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <Select
              value={mediaTypeFilter}
              options={[
                { value: 'all', label: t('All Types') },
                { value: 'live', label: t('Live TV') },
                { value: 'vod', label: t('Movies (VOD)') },
                { value: 'series', label: t('Series') },
              ]}
              onChange={(val) => setMediaTypeFilter(val as M3uMediaType | 'all')}
              width="130px"
              variant="settings"
              ariaLabel={t('Filter by media type')}
            />

            <Select
              value={healthFilter}
              options={[
                { value: 'all', label: t('All Health') },
                { value: 'online', label: t('Online') },
                { value: 'offline', label: t('Offline') },
                { value: 'unauthorized', label: t('Unauthorized') },
                { value: 'timeout', label: t('Timed out') },
                { value: 'untested', label: t('Untested') },
              ]}
              onChange={(val) => setHealthFilter(val as typeof healthFilter)}
              width="120px"
              variant="settings"
              ariaLabel={t('Filter by stream health')}
            />

            <Select
              value={sortBy}
              options={[
                { value: 'default', label: t('Default Order') },
                { value: 'name-asc', label: t('Name (A-Z)') },
                { value: 'name-desc', label: t('Name (Z-A)') },
                { value: 'chno', label: t('Channel Number') },
                { value: 'type', label: t('Media Type') },
              ]}
              onChange={(val) => setSortBy(val as M3uTableSort)}
              width="140px"
              variant="settings"
              ariaLabel={t('Sort channels by')}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setIsBatchToolsOpen(true)}
              title={t('Batch title cleaner, find & replace, renumbering')}
            >
              <Sparkles size={14} /> {t('Batch Tools')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={() => setIsAddingChannel(true)}
            >
              <Plus size={14} /> {t('Add Channel')}
            </Button>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className={styles.bulkBar}>
            <span>{t('{count} channels selected', { count: number(selectedIds.size) })}</span>
            <div className={styles.bulkActions}>
              {selectedIds.size < filteredEntries.length && (
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setSelectedIds(new Set(filteredEntries.map((entry) => entry.id)))}
                >
                  {t('Select all {count} results', { count: number(filteredEntries.length) })}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setSelectedIds(new Set())}
              >
                {t('Clear')}
              </Button>
              <Select
                value=""
                options={[
                  { value: '', label: t('Move to Category...') },
                  ...allGroupNames.map((g) => ({ value: g, label: g })),
                ]}
                onChange={handleBulkMoveCategory}
                width="170px"
                variant="settings"
                ariaLabel={t('Move selected channels to category')}
              />
              <Select
                value=""
                options={[
                  { value: '', label: t('Set Media Type...') },
                  { value: 'live', label: t('Live TV') },
                  { value: 'vod', label: t('Movie (VOD)') },
                  { value: 'series', label: t('Series') },
                ]}
                onChange={(val) => val && handleBulkSetType(val as M3uMediaType)}
                width="150px"
                variant="settings"
                ariaLabel={t('Set media type for selected channels')}
              />
              <Button variant="danger" size="sm" type="button" onClick={handleBulkDelete}>
                <Trash2 size={13} /> {t('Delete Selected')}
              </Button>
            </div>
          </div>
        )}

        {/* Table Headers */}
        <div className={styles.tableHeader}>
          <input
            type="checkbox"
            checked={
              filteredEntries.length > 0 && filteredEntries.every((e) => selectedIds.has(e.id))
            }
            onChange={handleToggleSelectAllFiltered}
            aria-label={t('Select all filtered channels')}
          />
          <span>#</span>
          <span>{t('Logo')}</span>
          <span>{t('Name')}</span>
          <span>{t('Category')}</span>
          <span>{t('Type')}</span>
          <span>{t('Status')}</span>
          <span style={{ textAlign: 'right' }}>{t('Actions')}</span>
        </div>

        {/* Channel Row List */}
        <div
          ref={listRef}
          className={styles.channelList}
          tabIndex={0}
          role="grid"
          aria-label={t(
            'Channels. Use arrow keys to navigate, Enter to edit, Space to select, and Delete to remove.',
          )}
          aria-activedescendant={
            filteredEntries[focusedIndex]
              ? `m3u-row-${filteredEntries[focusedIndex].id}`
              : undefined
          }
          onKeyDown={handleListKeyDown}
        >
          {filteredEntries.length > 0 ? (
            <div
              className={styles.virtualChannelCanvas}
              style={{
                height: `${Math.max(rowVirtualizer.getTotalSize(), filteredEntries.length * rowSize)}px`,
              }}
            >
              {virtualRows.map((virtualRow) => {
                const entry = filteredEntries[virtualRow.index];
                if (!entry) return null;
                const isSelected = selectedIds.has(entry.id);
                const health = healthStatuses[entry.id];
                const healthStatus = health === 'checking' ? 'checking' : health?.status;
                const healthError = health === 'checking' ? undefined : health?.errorMessage;

                return (
                  <div
                    key={entry.id}
                    id={`m3u-row-${entry.id}`}
                    role="row"
                    aria-selected={isSelected}
                    className={`${styles.channelRow} ${styles.channelRowVirtual} ${isSelected ? styles.channelRowSelected : ''} ${focusedIndex === virtualRow.index ? styles.channelRowFocused : ''}`}
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onDoubleClick={() => setEditingEntryId(entry.id)}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('button, input')) return;
                      setFocusedIndex(virtualRow.index);
                      listRef.current?.focus();
                    }}
                  >
                    <div role="gridcell">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleRow(entry.id)}
                        aria-label={t('Select channel {title}', { title: entry.title })}
                      />
                    </div>

                    <span role="gridcell" className={styles.channelNumber}>
                      {entry.channelNumber || '—'}
                    </span>

                    <div role="gridcell" className={styles.channelLogoWrapper}>
                      {entry.logo ? (
                        <img
                          src={entry.logo}
                          alt=""
                          className={styles.channelLogoImg}
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <span className={styles.channelLogoFallback}>
                          {entry.title.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div role="gridcell" className={styles.channelInfo}>
                      <span className={styles.channelTitle} title={entry.title}>
                        {entry.title}
                      </span>
                      {entry.tvgId && (
                        <span className={styles.channelTvg} title={`EPG ID: ${entry.tvgId}`}>
                          EPG: {entry.tvgId}
                        </span>
                      )}
                    </div>

                    <span
                      role="gridcell"
                      className={styles.channelGroupBadge}
                      title={entry.groupTitle}
                    >
                      {entry.groupTitle || 'General'}
                    </span>

                    <span role="gridcell" className={styles.channelTypeBadge}>
                      {entry.type === 'vod'
                        ? t('Movie')
                        : entry.type === 'series'
                          ? t('Series')
                          : t('Live')}
                    </span>

                    <div role="gridcell">
                      <span
                        className={`${styles.healthDot} ${healthStatus === 'online' ? styles.healthOnline : healthStatus === 'offline' ? styles.healthOffline : healthStatus === 'unauthorized' || healthStatus === 'timeout' ? styles.healthWarning : healthStatus === 'checking' ? styles.healthChecking : styles.healthUnknown}`}
                        title={`${healthStatus === 'online' ? t('Online') : healthStatus === 'offline' ? t('Offline') : healthStatus === 'unauthorized' ? t('Unauthorized') : healthStatus === 'timeout' ? t('Timed out') : healthStatus === 'checking' ? t('Testing') : t('Untested')}${healthError ? `: ${healthError}` : ''}`}
                      />
                    </div>

                    <div role="gridcell" className={styles.rowActions}>
                      <IconButton
                        size="sm"
                        type="button"
                        onClick={() => setEditingEntryId(entry.id)}
                        aria-label={t('Edit channel {title}', { title: entry.title })}
                        title={t('Edit Channel')}
                      >
                        <Edit2 size={13} />
                      </IconButton>
                      <IconButton
                        size="sm"
                        type="button"
                        onClick={() => handleDuplicateEntry(entry)}
                        aria-label={t('Duplicate channel {title}', { title: entry.title })}
                        title={t('Duplicate Channel')}
                      >
                        <Copy size={13} />
                      </IconButton>
                      <IconButton
                        size="sm"
                        type="button"
                        onClick={() => handleDeleteEntry(entry.id)}
                        aria-label={t('Delete channel {title}', { title: entry.title })}
                        title={t('Delete Channel')}
                      >
                        <Trash2 size={13} />
                      </IconButton>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyNotice}>
              <p>{t('No channels found matching the current filters.')}</p>
            </div>
          )}
        </div>

        <div className={styles.tableFooter}>
          <span>{t('{count} filtered channels', { count: number(filteredEntries.length) })}</span>
          <span>{t('Arrow keys navigate · Enter edits · Space selects')}</span>
        </div>
      </div>

      {/* Channel Inspector Drawer */}
      <M3uChannelDetailsDrawer
        isOpen={Boolean(editingEntry || isAddingChannel)}
        entry={isAddingChannel ? null : editingEntry}
        existingGroups={allGroupNames}
        onClose={() => {
          setEditingEntryId(null);
          setIsAddingChannel(false);
        }}
        onSave={handleSaveEntry}
        hasPrevious={editingIndex > 0}
        hasNext={editingIndex >= 0 && editingIndex < filteredEntries.length - 1}
        onPrevious={() => {
          const previous = filteredEntries[editingIndex - 1];
          if (previous) setEditingEntryId(previous.id);
        }}
        onNext={() => {
          const next = filteredEntries[editingIndex + 1];
          if (next) setEditingEntryId(next.id);
        }}
      />

      {/* Batch Tools Modal */}
      <M3uBatchToolsDialog
        isOpen={isBatchToolsOpen}
        entries={entries}
        selectedIds={selectedIds}
        onClose={() => setIsBatchToolsOpen(false)}
        onApply={onUpdateEntries}
      />

      {pendingDelete && (
        <ConfirmDialog
          title={t(pendingDelete === 'bulk' ? 'Delete selected channels?' : 'Delete this channel?')}
          description={t(
            'The deletion remains undoable until the editor is closed or its history is cleared.',
          )}
          confirmLabel={t('Delete')}
          danger
          onConfirm={() => {
            if (pendingDelete === 'bulk') performBulkDelete();
            else performDeleteEntry(pendingDelete);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
