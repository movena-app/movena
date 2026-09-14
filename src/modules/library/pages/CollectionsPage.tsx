import { useState, useEffect, useCallback } from 'react';
import { VirtualizedGrid } from '@/modules/catalog/public/components/VirtualizedGrid';
import { useLibraryStore } from '../store/useLibraryStore';
import { CatalogViewToggle } from '@/modules/catalog/public/components/CatalogViewToggle';
import { FolderHeart, Plus, Edit2, Trash2, X } from 'lucide-react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { HeaderSearch } from '@/modules/search/public/components/HeaderSearch';
import appStyles from '@/app/shell/AppLayout.module.css';
import styles from './CollectionsPage.module.css';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { WorkspaceSidebar } from '@/shared/ui/WorkspaceSidebar';
import { CatalogPageHeader } from '@/modules/catalog/public/components/CatalogPageHeader';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Button, IconButton } from '@/shared/ui/Button';
import { DialogShell } from '@/shared/ui/DialogShell';
import { MediaDetailsDialogs } from '@/modules/catalog/public/details/MediaDetailsDialogs';
import { useMediaDetailState } from '@/modules/catalog/public/hooks/useMediaDetailsState';
import { useI18n } from '@/shared/i18n/i18n';

export function CollectionsPage() {
  const { t, tn, number } = useI18n();
  const collections = useLibraryStore((state) => state.collections);
  const createCollection = useLibraryStore((state) => state.createCollection);
  const renameCollection = useLibraryStore((state) => state.renameCollection);
  const deleteCollection = useLibraryStore((state) => state.deleteCollection);
  const sidebarWidth = useSettingsStore((state) => state.sidebarWidth);
  const activeCollectionId = useSettingsStore((state) => state.lastCollectionId);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const setActiveCollectionId = useCallback(
    (id: string | null) => updateSetting('lastCollectionId', id),
    [updateSetting],
  );

  const { selectedMovie, selectedSeries, handleCloseMovie, handleCloseSeries, handleItemClick } =
    useMediaDetailState({ enableSourceOnOpen: true });

  // Modal states for Create, Rename, Delete
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameCollectionName, setRenameCollectionName] = useState('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const closeCreateModal = useCallback(() => setIsCreateOpen(false), []);
  const closeRenameModal = useCallback(() => setIsRenameOpen(false), []);

  // Keep activeCollectionId synced if collection list changes
  useEffect(() => {
    if (collections.length === 0) {
      setActiveCollectionId(null);
    } else if (activeCollectionId && !collections.some((c) => c.id === activeCollectionId)) {
      setActiveCollectionId(collections[0]!.id);
    } else if (!activeCollectionId && collections.length > 0) {
      setActiveCollectionId(collections[0]!.id);
    }
  }, [collections, activeCollectionId, setActiveCollectionId]);

  const activeCollection = collections.find((c) => c.id === activeCollectionId);

  const openCreateModal = () => {
    setNewCollectionName('');
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCollectionName && newCollectionName.trim()) {
      const trimmed = newCollectionName.trim();
      createCollection(trimmed);
      setIsCreateOpen(false);
      queueMicrotask(() => {
        const latest = useLibraryStore.getState().collections;
        const created = latest.find((c) => c.name === trimmed);
        if (created) setActiveCollectionId(created.id);
      });
    }
  };

  const openRenameModal = () => {
    if (!activeCollection) return;
    setRenameCollectionName(activeCollection.name);
    setIsRenameOpen(true);
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeCollection && renameCollectionName && renameCollectionName.trim()) {
      renameCollection(activeCollection.id, renameCollectionName.trim());
      setIsRenameOpen(false);
    }
  };

  const openDeleteModal = () => {
    if (!activeCollection) return;
    setIsDeleteOpen(true);
  };

  const handleDeleteSubmit = () => {
    if (!activeCollection) return;
    deleteCollection(activeCollection.id);
    setIsDeleteOpen(false);
  };

  return (
    <>
      <div className={`${appStyles.page} ${styles.collectionsPage}`}>
        <WorkspaceSidebar
          title="Collections"
          count={collections.length}
          width={sidebarWidth}
          onWidthChange={(width) => updateSetting('sidebarWidth', width)}
          headerAction={
            <Button
              size="sm"
              onClick={openCreateModal}
              title="Create Collection"
              aria-label="Create Collection"
              className={styles.newBtn}
            >
              <Plus size={13} />
              <span>{t('New')}</span>
            </Button>
          }
        >
          {collections.length === 0 ? (
            <p className={styles.emptySidebarText}>{t('No custom collections.')}</p>
          ) : (
            <>
              {collections.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setActiveCollectionId(c.id)}
                  className={`${styles.collectionRow} ${activeCollectionId === c.id ? styles.active : ''}`}
                  aria-label={c.name}
                  aria-current={activeCollectionId === c.id ? 'page' : undefined}
                >
                  <span className={styles.collectionName}>{c.name}</span>
                  <span className={styles.collectionCount}>{c.items.length}</span>
                </button>
              ))}
            </>
          )}
        </WorkspaceSidebar>

        <div className={appStyles.catalogMain}>
          <CatalogPageHeader
            title={activeCollection ? activeCollection.name : 'Collections'}
            meta={
              activeCollection
                ? tn('{count} item', '{count} items', activeCollection.items.length, {
                    count: number(activeCollection.items.length),
                  })
                : t('Create collections to group your content')
            }
            titleActions={
              activeCollection ? (
                <div className={styles.collectionActions}>
                  <IconButton
                    size="sm"
                    onClick={openRenameModal}
                    title="Rename Collection"
                    aria-label="Rename Collection"
                    className={styles.actionBtn}
                  >
                    <Edit2 size={13} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    onClick={openDeleteModal}
                    title="Delete Collection"
                    aria-label="Delete Collection"
                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              ) : undefined
            }
            actions={
              <>
                <HeaderSearch onItemClick={handleItemClick} />
                <CatalogViewToggle />
              </>
            }
          />

          {activeCollection && activeCollection.items.length > 0 ? (
            <div className={appStyles.catalogContent}>
              <VirtualizedGrid
                items={activeCollection.items}
                onItemClick={handleItemClick}
                currentCollectionId={activeCollection.id}
              />
            </div>
          ) : (
            <EmptyState
              icon={FolderHeart}
              title={activeCollection ? 'Collection Empty' : 'No Collections Found'}
              description={
                activeCollection
                  ? t(
                      '"{name}" has no items yet. Add movies or series from their detail modals or context menus.',
                      { name: activeCollection.name },
                    )
                  : 'Group your favorite movies and shows into custom playlists and collections.'
              }
              actionLabel={!activeCollection ? 'Create Collection' : undefined}
              actionIcon={!activeCollection ? Plus : undefined}
              onAction={!activeCollection ? openCreateModal : undefined}
            />
          )}
        </div>

        <MediaDetailsDialogs
          selectedMovie={selectedMovie}
          selectedSeries={selectedSeries}
          onCloseMovie={handleCloseMovie}
          onCloseSeries={handleCloseSeries}
        />

        {/* Create Collection Modal */}
        {isCreateOpen && (
          <DialogShell
            onClose={closeCreateModal}
            className={styles.modalContent}
            ariaLabel={t('Create new collection')}
            initialFocusSelector="[data-modal-initial-focus]"
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>{t('Create New Collection')}</h3>
              <IconButton
                size="sm"
                className={styles.modalCloseBtn}
                onClick={closeCreateModal}
                aria-label="Close"
              >
                <X size={16} />
              </IconButton>
            </div>
            <form onSubmit={handleCreateSubmit} className={styles.modalForm}>
              <input
                type="text"
                placeholder={t('Collection Name (e.g. Marvel Movies)')}
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                className={`${styles.modalInput} uiField`}
                data-modal-initial-focus
                aria-label={t('Collection name')}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
              />
              <div className={styles.modalFooter}>
                <Button type="button" className={styles.modalCancelBtn} onClick={closeCreateModal}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" className={styles.modalSubmitBtn}>
                  Create Collection
                </Button>
              </div>
            </form>
          </DialogShell>
        )}

        {/* Rename Collection Modal */}
        {isRenameOpen && activeCollection && (
          <DialogShell
            onClose={closeRenameModal}
            className={styles.modalContent}
            ariaLabel={t('Rename {name}', { name: activeCollection.name })}
            initialFocusSelector="[data-modal-initial-focus]"
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>{t('Rename Collection')}</h3>
              <IconButton
                size="sm"
                className={styles.modalCloseBtn}
                onClick={closeRenameModal}
                aria-label="Close"
              >
                <X size={16} />
              </IconButton>
            </div>
            <form onSubmit={handleRenameSubmit} className={styles.modalForm}>
              <input
                type="text"
                placeholder={t('Collection Name')}
                value={renameCollectionName}
                onChange={(e) => setRenameCollectionName(e.target.value)}
                className={`${styles.modalInput} uiField`}
                data-modal-initial-focus
                aria-label={t('Collection name')}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
              />
              <div className={styles.modalFooter}>
                <Button type="button" className={styles.modalCancelBtn} onClick={closeRenameModal}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" className={styles.modalSubmitBtn}>
                  Save Changes
                </Button>
              </div>
            </form>
          </DialogShell>
        )}

        {/* Delete Collection Confirmation Modal */}
        {isDeleteOpen && activeCollection && (
          <ConfirmDialog
            title="Delete Collection?"
            description={t(
              'This removes “{name}” and its list. Media items and files are not deleted.',
              { name: activeCollection.name },
            )}
            confirmLabel="Delete Collection"
            danger
            onCancel={() => setIsDeleteOpen(false)}
            onConfirm={handleDeleteSubmit}
          />
        )}
      </div>
    </>
  );
}
