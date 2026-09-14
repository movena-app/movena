import { useCallback } from 'react';
import {
  Play,
  Heart,
  CheckCircle,
  Circle,
  Trash2,
  FolderPlus,
  Copy,
  Info,
  RotateCcw,
  Tv,
  Download,
} from 'lucide-react';
import {
  useContextMenuStore,
  type ContextMenuItem,
} from '@/shared/ui/context-menu/useContextMenuStore';
import { useLibraryStore } from '@/modules/library/public/store/useLibraryStore';
import { formatRemaining } from '@/shared/lib/time';
import { usePlayerStore } from '@/modules/playback/public/store/usePlayerStore';
import { notify } from '@/shared/notifications/useNotificationStore';
import type { MediaItem } from '../model/media';
import type { HistoryItem } from '@/modules/library/public/store/useLibraryStore';
import { getDisplayTitle } from '../lib/titleParser';
import { downloadMediaItem } from '@/modules/downloads/public/services/mediaDownload';
import { useI18n } from '@/shared/i18n/i18n';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { sourceScopedItemKey } from '@/modules/sources/public/lib/sourceIdentity';

type LogoAspectSettings = Pick<
  ReturnType<typeof useSettingsStore.getState>,
  'channelLogoAspectOverrides' | 'setChannelLogoAspectOverride'
>;

export function buildLogoAspectMenuItem(
  channel: Pick<MediaItem, 'id' | 'sourceId' | 'sourceItemId'>,
  translate: (message: string) => string,
  settings: LogoAspectSettings = useSettingsStore.getState(),
): ContextMenuItem {
  const legacyChannelKey = (channel.sourceItemId || channel.id).toString();
  const channelKey = sourceScopedItemKey(channel.sourceId, legacyChannelKey);
  const currentOverride =
    settings.channelLogoAspectOverrides[channelKey] ??
    settings.channelLogoAspectOverrides[legacyChannelKey] ??
    'auto';
  const choices = [
    ['aspect-auto', 'Smart Auto', 'auto'],
    ['aspect-16-9', 'Widescreen (16:9)', '16:9'],
    ['aspect-4-3', 'Standard (4:3)', '4:3'],
    ['aspect-original', 'Original (1:1)', 'original'],
  ] as const;

  return {
    id: 'logo-aspect-submenu',
    label: translate('Logo Aspect Ratio'),
    icon: <Tv size={16} />,
    submenu: choices.map(([id, label, value]) => ({
      id,
      label: translate(label),
      checked: currentOverride === value,
      action: () => settings.setChannelLogoAspectOverride(channelKey, value),
    })),
  };
}

export function useMediaContextMenus() {
  const { t, language } = useI18n();
  const openContextMenu = useContextMenuStore((s) => s.openContextMenu);

  // 1. Media Cards (Movies / Series / Live Items)
  const handleMediaCardContextMenu = useCallback(
    (
      e: React.MouseEvent,
      item: MediaItem,
      options?: {
        onPlay?: ((item: MediaItem) => void) | undefined;
        onViewDetails?: ((item: MediaItem) => void) | undefined;
        currentCollectionId?: string | undefined;
      },
    ) => {
      e.preventDefault();
      e.stopPropagation();

      const state = useLibraryStore.getState();
      const isFav = state.favorites.some((f) => f.id === item.id) || Boolean(item.isFavorite);
      const isW = (state.watched || []).includes(item.id) || Boolean(item.isWatched);
      const inHistory = state.history.some((h) => h.id === item.id);
      const collections = state.collections;

      const canPlay = Boolean(options?.onPlay || item.streamUrl);
      const items: ContextMenuItem[] = canPlay
        ? [
            {
              id: 'play',
              label: t('Play Content'),
              icon: <Play size={16} />,
              action: () => {
                if (options?.onPlay) {
                  options.onPlay(item);
                } else {
                  if (!item.streamUrl) {
                    notify.warning(
                      'Stream Unavailable',
                      'This item needs to be opened from its catalogue.',
                    );
                    return;
                  }
                  usePlayerStore.getState().playStream({
                    id: item.id,
                    title: item.title,
                    type: item.type || 'vod',
                    streamUrl: item.streamUrl,
                    httpHeaders: item.httpHeaders,
                    sourceId: item.sourceId,
                    epgChannelId: item.epgChannelId,
                    posterUrl: item.posterUrl,
                    tags: item.tags,
                    country: item.country,
                  });
                }
              },
            },
          ]
        : [];

      if (options?.onViewDetails) {
        items.push({
          id: 'details',
          label: t('View Details'),
          icon: <Info size={16} />,
          action: () => options.onViewDetails!(item),
        });
      }

      if ((item.type === 'vod' || item.type === 'series') && item.streamUrl) {
        items.push({
          id: 'download',
          label: t('Download Content'),
          icon: <Download size={16} />,
          action: () => {
            void downloadMediaItem(item);
          },
        });
      }

      items.push(
        {
          id: 'favorite',
          label: t(isFav ? 'Remove from Favorites' : 'Add to Favorites'),
          icon: (
            <Heart
              size={16}
              fill={isFav ? 'var(--accent-foreground)' : 'none'}
              color={isFav ? 'var(--accent-foreground)' : 'currentColor'}
            />
          ),
          action: () => {
            if (isFav) {
              state.removeFavorite(item.id);
            } else {
              state.addFavorite(item);
            }
          },
        },
        {
          id: 'watched',
          label: t(isW ? 'Mark as Unwatched' : 'Mark as Watched'),
          icon: isW ? (
            <CheckCircle size={16} color="var(--accent-foreground)" />
          ) : (
            <Circle size={16} />
          ),
          action: () => state.toggleWatched(item.id),
        },
      );

      if (collections.length > 0) {
        items.push({
          id: 'collection-submenu',
          label: t('Add to Collection'),
          icon: <FolderPlus size={16} />,
          submenu: collections.map((collection) => {
            const containsItem = collection.items.some((entry) => entry.id === item.id);
            return {
              id: `collection-${collection.id}`,
              label: collection.name,
              localize: false,
              checked: containsItem,
              action: () =>
                containsItem
                  ? state.removeFromCollection(collection.id, item.id)
                  : state.addToCollection(collection.id, item),
            };
          }),
        });
      }

      if (item.type === 'live') {
        items.push(buildLogoAspectMenuItem(item, t));
      }

      items.push(
        {
          id: 'div-1',
          label: '',
          isDivider: true,
        },
        {
          id: 'copy-url',
          label: t(item.streamUrl ? 'Copy Stream Link' : 'Copy Title'),
          icon: <Copy size={16} />,
          action: () => {
            const url = item.streamUrl || '';
            if (url) {
              navigator.clipboard.writeText(url);
              notify.success('Copied to Clipboard', 'Stream URL copied.');
            } else {
              navigator.clipboard.writeText(item.title);
              notify.info('Copied to Clipboard', getDisplayTitle(item.title, item.type));
            }
          },
        },
      );

      if (options?.currentCollectionId) {
        items.push(
          {
            id: 'div-col-rem',
            label: '',
            isDivider: true,
          },
          {
            id: 'remove-collection-item',
            label: t('Remove from Collection'),
            icon: <Trash2 size={16} />,
            danger: true,
            action: () => state.removeFromCollection(options.currentCollectionId!, item.id),
          },
        );
      }

      if (inHistory) {
        items.push(
          {
            id: 'div-2',
            label: '',
            isDivider: true,
          },
          {
            id: 'remove-history',
            label: t('Remove from Continue Watching'),
            icon: <Trash2 size={16} />,
            danger: true,
            action: () => state.removeFromHistory(item.id),
          },
        );
      }

      openContextMenu(e.clientX, e.clientY, items);
    },
    [openContextMenu, t],
  );

  // 2. Continue Watching Cards
  const handleContinueWatchingContextMenu = useCallback(
    (e: React.MouseEvent, item: HistoryItem, onPlay?: (item: HistoryItem) => void) => {
      e.preventDefault();
      e.stopPropagation();

      const state = useLibraryStore.getState();
      const isFav = state.favorites.some((f) => f.id === item.id);

      const items: ContextMenuItem[] = [
        {
          id: 'resume',
          label: (() => {
            const left = formatRemaining(item.currentTime, item.duration, language);
            return left
              ? t('Resume Playback ({remaining})', { remaining: left })
              : t('Resume Playback');
          })(),
          icon: <Play size={16} />,
          action: () => onPlay?.(item),
        },
        {
          id: 'restart',
          label: t('Restart from Beginning'),
          icon: <RotateCcw size={16} />,
          action: () => {
            const freshItem = { ...item, progressPercentage: 0 };
            onPlay?.(freshItem);
          },
        },
        {
          id: 'favorite',
          label: t(isFav ? 'Remove Favorite' : 'Add to Favorites'),
          icon: (
            <Heart
              size={16}
              fill={isFav ? 'var(--accent-foreground)' : 'none'}
              color={isFav ? 'var(--accent-foreground)' : 'currentColor'}
            />
          ),
          action: () => (isFav ? state.removeFavorite(item.id) : state.addFavorite(item)),
        },
        {
          id: 'mark-finished',
          label: t('Mark as Finished'),
          icon: <CheckCircle size={16} color="var(--accent-foreground)" />,
          action: () => {
            state.toggleWatched(item.id);
            state.removeFromHistory(item.id);
          },
        },
        {
          id: 'div-1',
          label: '',
          isDivider: true,
        },
        {
          id: 'remove-history',
          label: t('Remove from History'),
          icon: <Trash2 size={16} />,
          danger: true,
          action: () => state.removeFromHistory(item.id),
        },
      ];

      openContextMenu(e.clientX, e.clientY, items);
    },
    [language, openContextMenu, t],
  );

  // 3. Live TV Channel
  const handleLiveChannelContextMenu = useCallback(
    (e: React.MouseEvent, channel: MediaItem, onPlay?: (channel: MediaItem) => void) => {
      e.preventDefault();
      e.stopPropagation();

      const state = useLibraryStore.getState();
      const isFav = state.favorites.some((f) => f.id === channel.id);
      const items: ContextMenuItem[] = [
        {
          id: 'tune',
          label: t('Tune Channel'),
          icon: <Tv size={16} />,
          action: () => onPlay?.(channel),
        },
        {
          id: 'favorite',
          label: t(isFav ? 'Remove Favorite' : 'Add to Favorites'),
          icon: (
            <Heart
              size={16}
              fill={isFav ? 'var(--accent-foreground)' : 'none'}
              color={isFav ? 'var(--accent-foreground)' : 'currentColor'}
            />
          ),
          action: () => (isFav ? state.removeFavorite(channel.id) : state.addFavorite(channel)),
        },
        buildLogoAspectMenuItem(channel, t),
        {
          id: 'div-1',
          label: '',
          isDivider: true,
        },
        {
          id: 'copy-link',
          label: t('Copy Channel Stream Link'),
          icon: <Copy size={16} />,
          action: () => {
            const url = channel.streamUrl || channel.title;
            navigator.clipboard.writeText(url);
            notify.success('Copied to Clipboard', getDisplayTitle(channel.title, 'live'));
          },
        },
      ];

      openContextMenu(e.clientX, e.clientY, items);
    },
    [openContextMenu, t],
  );

  return {
    handleMediaCardContextMenu,
    handleContinueWatchingContextMenu,
    handleLiveChannelContextMenu,
  };
}
