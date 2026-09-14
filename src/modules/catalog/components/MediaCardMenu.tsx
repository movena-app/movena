import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  CheckCircle,
  ChevronRight,
  Circle,
  Copy,
  Download,
  FolderMinus,
  FolderPlus,
  Heart,
  Info,
  MoreVertical,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { useLibraryStore } from '@/modules/library/public/store/useLibraryStore';
import { notify } from '@/shared/notifications/useNotificationStore';
import type { MediaItem } from '../model/media';
import styles from './MediaCard.module.css';
import { getDisplayTitle } from '../lib/titleParser';
import { downloadMediaItem } from '@/modules/downloads/public/services/mediaDownload';
import { useI18n } from '@/shared/i18n/i18n';
import { IconButton } from '@/shared/ui/Button';

interface MediaCardMenuProps {
  item: MediaItem;
  currentCollectionId?: string | undefined;
  onPlay: () => void;
  onViewDetails: () => void;
}

export function MediaCardMenu({
  item,
  currentCollectionId,
  onPlay,
  onViewDetails,
}: MediaCardMenuProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [showCollections, setShowCollections] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isFavorite =
    useLibraryStore((state) => state.favorites.some((entry) => entry.id === item.id)) ||
    Boolean(item.isFavorite);
  const isWatched =
    useLibraryStore((state) => state.watched.includes(item.id)) || Boolean(item.isWatched);
  const inHistory = useLibraryStore((state) => state.history.some((entry) => entry.id === item.id));
  const collections = useLibraryStore((state) => state.collections);

  const close = () => {
    setIsOpen(false);
    setShowCollections(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const handleViewportChange = () => close();

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [isOpen]);

  const run = (event: React.SyntheticEvent, action: () => void) => {
    event.stopPropagation();
    action();
    close();
  };

  const toggleMenu = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 6, right: Math.max(12, window.innerWidth - rect.right) });
    }
    setIsOpen((current) => !current);
  };

  const createAndAdd = (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const name = newCollectionName.trim();
    if (!name) return;
    const store = useLibraryStore.getState();
    store.createCollection(name);
    const collection = useLibraryStore.getState().collections.find((entry) => entry.name === name);
    if (collection) useLibraryStore.getState().addToCollection(collection.id, item);
    setNewCollectionName('');
    close();
  };

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className={`${styles.iconBtn} ${isOpen ? styles.activeMenu : ''}`}
        onClick={toggleMenu}
        title={t('More options')}
        aria-label={t('More options')}
      >
        <MoreVertical size={16} />
      </button>

      {isOpen &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            className={`${styles.menuDropdown} subtle-scrollbar`}
            style={{ top: `${position.top}px`, right: `${position.right}px` }}
            onClick={(event) => event.stopPropagation()}
          >
            {item.type === 'live' ? (
              <button
                type="button"
                className={styles.menuItem}
                onClick={(event) => run(event, onPlay)}
              >
                <Play size={14} /> <span>{t('Tune Channel')}</span>
              </button>
            ) : (
              <button
                type="button"
                className={styles.menuItem}
                onClick={(event) => run(event, onViewDetails)}
              >
                <Info size={14} /> <span>{t('View Details')}</span>
              </button>
            )}
            {(item.type === 'vod' || item.type === 'series') && item.streamUrl && (
              <button
                type="button"
                className={styles.menuItem}
                onClick={(event) =>
                  run(event, () => {
                    void downloadMediaItem(item);
                  })
                }
              >
                <Download size={14} /> <span>{t('Download Content')}</span>
              </button>
            )}
            <button
              type="button"
              className={styles.menuItem}
              onClick={(event) =>
                run(event, () => {
                  const store = useLibraryStore.getState();
                  if (isFavorite) store.removeFavorite(item.id);
                  else store.addFavorite(item);
                })
              }
            >
              <Heart
                size={14}
                fill={isFavorite ? 'var(--accent-foreground)' : 'none'}
                color={isFavorite ? 'var(--accent-foreground)' : 'currentColor'}
              />
              <span>{t(isFavorite ? 'Remove Favorite' : 'Add to Favorites')}</span>
            </button>
            <button
              type="button"
              className={styles.menuItem}
              onClick={(event) =>
                run(event, () => useLibraryStore.getState().toggleWatched(item.id))
              }
            >
              {isWatched ? (
                <CheckCircle size={14} className={styles.menuItemActive} />
              ) : (
                <Circle size={14} />
              )}
              <span>{t(isWatched ? 'Mark Unwatched' : 'Mark Watched')}</span>
            </button>

            <div className={styles.menuDivider} />
            <button
              type="button"
              className={styles.menuItem}
              onClick={(event) => {
                event.stopPropagation();
                setShowCollections((current) => !current);
              }}
            >
              <FolderPlus size={14} />
              <span className={styles.menuLabel}>{t('Add to Collection')}</span>
              <ChevronRight
                size={12}
                style={{
                  transform: showCollections ? 'rotate(90deg)' : 'none',
                  transition: 'transform var(--duration-normal)',
                  flexShrink: 0,
                }}
              />
            </button>

            {showCollections && (
              <div className={styles.collectionMenuSection}>
                {collections.length > 0 ? (
                  collections.map((collection) => {
                    const containsItem = collection.items.some((entry) => entry.id === item.id);
                    return (
                      <button
                        type="button"
                        key={collection.id}
                        className={`${styles.menuItem} ${containsItem ? styles.menuItemActive : ''}`}
                        aria-label={collection.name}
                        aria-pressed={containsItem}
                        onClick={(event) =>
                          run(event, () => {
                            const store = useLibraryStore.getState();
                            if (containsItem) store.removeFromCollection(collection.id, item.id);
                            else store.addToCollection(collection.id, item);
                          })
                        }
                      >
                        <span className={styles.menuLabel}>{collection.name}</span>
                        {containsItem && <Check size={12} />}
                      </button>
                    );
                  })
                ) : (
                  <span className={styles.subSectionTitle}>{t('No collections yet')}</span>
                )}

                <form className={styles.collectionForm} onSubmit={createAndAdd}>
                  <input
                    type="text"
                    placeholder={t('New collection…')}
                    aria-label={t('New collection…')}
                    className={`uiField ${styles.collectionInput}`}
                    data-size="sm"
                    value={newCollectionName}
                    onChange={(event) => setNewCollectionName(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                  />
                  <IconButton type="submit" size="sm" aria-label="Create and add">
                    <Plus size={12} />
                  </IconButton>
                </form>
              </div>
            )}

            <div className={styles.menuDivider} />
            <button
              type="button"
              className={styles.menuItem}
              onClick={(event) =>
                run(event, () => {
                  const value = item.streamUrl || item.title;
                  void navigator.clipboard.writeText(value);
                  if (item.streamUrl) notify.success('Copied to Clipboard', 'Stream URL copied.');
                  else notify.info('Copied to Clipboard', getDisplayTitle(item.title, item.type));
                })
              }
            >
              <Copy size={14} />{' '}
              <span>{t(item.streamUrl ? 'Copy Stream Link' : 'Copy Title')}</span>
            </button>

            {currentCollectionId && (
              <button
                type="button"
                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                onClick={(event) =>
                  run(event, () =>
                    useLibraryStore.getState().removeFromCollection(currentCollectionId, item.id),
                  )
                }
              >
                <FolderMinus size={14} /> <span>{t('Remove from Collection')}</span>
              </button>
            )}
            {inHistory && (
              <button
                type="button"
                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                onClick={(event) =>
                  run(event, () => useLibraryStore.getState().removeFromHistory(item.id))
                }
              >
                <Trash2 size={14} /> <span>{t('Remove from Continue Watching')}</span>
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
