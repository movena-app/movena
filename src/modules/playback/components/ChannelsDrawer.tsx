import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, Tv, X } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { getXtreamCredentials, useAuthStore } from '@/modules/sources/public/store/useAuthStore';
import { useLiveStreams } from '@/modules/catalog/public/data/useCatalog';
import { useCategories, useHiddenCategoryIds } from '@/modules/catalog/public/data/useCategories';
import { playableFromMediaItem } from '../lib/playback';
import { parseCategoryName } from '@/shared/lib/categoryName';
import { parseLiveChannelTitle } from '@/modules/catalog/public/lib/titleParser';
import { getPrimaryMediaTags, getTagColorType, mergeMediaTags } from '@/shared/lib/mediaTags';
import { useMediaContextMenus } from '@/modules/catalog/public/hooks/useMediaContextMenus';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { MOTION_DURATION, MOTION_EASE } from '@/shared/design/motion';
import styles from './ChannelsDrawer.module.css';
import drawerStyles from './PlayerDrawer.module.css';
import { useI18n } from '@/shared/i18n/i18n';
import { useLogoAspect } from '@/modules/catalog/public/hooks/useLogoAspect';

/**
 * Zapping list for Live TV, opened from the player like EpisodesDrawer is
 * for series. Unlike the episodes drawer, `showChannelsDrawer` is not reset
 * on every `playStream` (see usePlayerStore) — flipping through channels is
 * expected to keep this list open instead of closing after each pick.
 */
const ROW_HEIGHT = 46;

function DrawerChannelLogo({
  posterUrl,
  channelKey,
  sourceId,
}: {
  posterUrl?: string | undefined;
  channelKey: string;
  sourceId?: string | undefined;
}) {
  const logoAspect = useLogoAspect(posterUrl, channelKey, sourceId);
  const aspectClass =
    logoAspect === '16:9'
      ? styles.logoUnsquish169
      : logoAspect === '4:3'
        ? styles.logoUnsquish43
        : '';

  return (
    <div className={styles.channelLogo}>
      {posterUrl ? (
        <img
          src={posterUrl}
          alt=""
          className={aspectClass}
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.visibility = 'hidden';
          }}
        />
      ) : (
        <Tv size={16} className={styles.channelLogoFallback} />
      )}
    </div>
  );
}

const decodeHtml = (html: string) => {
  if (!html) return '';
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
};

export function ChannelsDrawer() {
  const { t } = useI18n();
  const { handleMediaCardContextMenu } = useMediaContextMenus();
  // Individually selected, not `usePlayerStore()` destructured — that pulled
  // in every field, including currentTime, which mpv ticks multiple times a
  // second during live playback. Reconciling this whole tree on every one of
  // those ticks could land squarely inside the open/close transition and
  // steal a frame from it, which is exactly the kind of thing that only
  // shows up "sometimes" depending on timing.
  const showChannelsDrawer = usePlayerStore((s) => s.showChannelsDrawer);
  const setShowChannelsDrawer = usePlayerStore((s) => s.setShowChannelsDrawer);
  const activeStream = usePlayerStore((s) => s.activeStream);
  const playStream = usePlayerStore((s) => s.playStream);
  const credentials = useAuthStore((s) =>
    activeStream?.sourceId
      ? (s.runtimes[activeStream.sourceId]?.credentials ?? null)
      : getXtreamCredentials(),
  );

  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const numberBufferRef = useRef('');
  const numberTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const customRules = useSettingsStore((s) => s.customTitleRules);
  const isLive = activeStream?.type === 'live';
  // Drives both the query and the AnimatePresence below — returning null
  // early instead (as this used to) skips AnimatePresence's exit render
  // entirely, so closing just snapped the drawer away instead of animating.
  const shouldShow = isLive && showChannelsDrawer;
  const activeKey = activeStream ? (activeStream.sourceItemId || activeStream.id).toString() : '';

  const { data: allChannels = [] } = useLiveStreams({ enabled: shouldShow });
  const { data: categories = [] } = useCategories('live');
  const hiddenCategoryIds = useHiddenCategoryIds('live');

  const activeCategoryId = activeStream?.categoryId;

  // Scoped to the category the current channel was opened from — the full
  // catalogue is what caused the freeze this replaces, and it's also just
  // more list than anyone wants while zapping.
  const categoryLabel = useMemo(() => {
    if (!activeCategoryId) return null;
    const match = categories.find((c) => String(c.category_id) === activeCategoryId);
    return match ? parseCategoryName(decodeHtml(match.category_name || '')).label : null;
  }, [categories, activeCategoryId]);

  const channels = useMemo(() => {
    const scoped = activeCategoryId
      ? allChannels.filter((c) => c.categoryId === activeCategoryId)
      : allChannels;
    const visible = scoped.filter((c) => !c.categoryId || !hiddenCategoryIds.has(c.categoryId));
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return visible;
    return visible.filter((c) => c.title.toLowerCase().includes(trimmed));
  }, [allChannels, activeCategoryId, hiddenCategoryIds, query]);

  // Provider lists routinely run into the thousands of channels — an
  // un-virtualized render of every row froze the whole window (the same
  // reason the main catalogue grid virtualizes). Only the visible slice of
  // rows is ever mounted here.
  const rowVirtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  // Focus once the slide-in has actually finished, not via the motion.div's
  // onAnimationComplete — that fires on the exit transition too (same DOM
  // node throughout its lifetime), and by the time it's a no-op guard can
  // check, `shouldShow` in that closure is always true (it only renders
  // when true), so it was calling .focus() on a node mid-removal and
  // flickering the close. Tying it to this effect instead means it only
  // ever runs on the true transition, and cleans itself up on the way out.
  useEffect(() => {
    if (!shouldShow) return;
    const timer = window.setTimeout(
      () => searchInputRef.current?.focus(),
      MOTION_DURATION.normal * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [shouldShow]);

  useEffect(() => {
    if (!shouldShow || !isLive || !activeStream) return;
    const playByIndex = (delta: number) => {
      const current = channels.findIndex(
        (channel) => (channel.sourceItemId || channel.id).toString() === activeKey,
      );
      const next = channels[(current + delta + channels.length) % channels.length];
      if (!next) return;
      const playable = playableFromMediaItem({ ...next, type: 'live' }, credentials);
      if (playable) playStream(playable);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        playByIndex(event.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      if (!/^\d$/.test(event.key)) return;
      event.preventDefault();
      numberBufferRef.current = `${numberBufferRef.current}${event.key}`.slice(-6);
      if (numberTimerRef.current) clearTimeout(numberTimerRef.current);
      numberTimerRef.current = setTimeout(() => {
        const number = numberBufferRef.current;
        numberBufferRef.current = '';
        const target = channels.find(
          (channel) => String(channel.channelNum ?? '').replace(/^#/, '') === number,
        );
        if (target) {
          const playable = playableFromMediaItem({ ...target, type: 'live' }, credentials);
          if (playable) playStream(playable);
        }
      }, 650);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (numberTimerRef.current) clearTimeout(numberTimerRef.current);
    };
  }, [activeKey, activeStream, channels, credentials, isLive, playStream, shouldShow]);

  const playChannel = (item: (typeof channels)[number]) => {
    const playable = playableFromMediaItem({ ...item, type: 'live' }, credentials);
    if (playable) playStream(playable);
  };

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          className={drawerStyles.drawer}
          data-ui-layer="player-popover"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: MOTION_DURATION.normal, ease: MOTION_EASE.standard }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={drawerStyles.header}>
            <div className={drawerStyles.headerTitleRow}>
              <span className={drawerStyles.headerTitle}>{categoryLabel ?? t('Channels')}</span>
              <button
                type="button"
                className={drawerStyles.iconBtn}
                onClick={() => setShowChannelsDrawer(false)}
                aria-label={t('Close Channels')}
              >
                <X size={20} />
              </button>
            </div>
            <div className={styles.searchWrapper}>
              <Search size={15} className={styles.searchIcon} />
              <input
                ref={searchInputRef}
                type="text"
                className={`uiField ${styles.searchInput}`}
                placeholder={t('Search channels...')}
                aria-label={t('Search channels')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div ref={listRef} className={`${drawerStyles.list} subtle-scrollbar`}>
            {channels.length === 0 ? (
              <div className={styles.channelsEmpty}>{t('No channels found.')}</div>
            ) : (
              <div
                style={{
                  position: 'relative',
                  height: rowVirtualizer.getTotalSize(),
                  width: '100%',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const channel = channels[virtualRow.index];
                  if (!channel) return null;
                  const isActive = (channel.sourceItemId || channel.id).toString() === activeKey;
                  const parsed = parseLiveChannelTitle(channel.title, customRules);
                  const badges = getPrimaryMediaTags(
                    mergeMediaTags(...(parsed.qualityBadges ?? []), ...(channel.tags ?? [])),
                    1,
                  );

                  return (
                    <button
                      type="button"
                      key={channel.id}
                      className={`${drawerStyles.row} ${isActive ? drawerStyles.rowActive : ''}`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: virtualRow.size,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      onClick={() => playChannel(channel)}
                      onContextMenu={(e) =>
                        handleMediaCardContextMenu(
                          e,
                          { ...channel, type: 'live' },
                          { onPlay: () => playChannel(channel) },
                        )
                      }
                    >
                      {channel.channelNum !== undefined && (
                        <span className={drawerStyles.rowIndex}>{channel.channelNum}</span>
                      )}
                      <DrawerChannelLogo
                        posterUrl={channel.posterUrl}
                        channelKey={(channel.sourceItemId || channel.id).toString()}
                        sourceId={channel.sourceId}
                      />
                      <span className={drawerStyles.rowTitle}>
                        {parsed.cleanTitle || channel.title}
                      </span>
                      {badges.length > 0 && (
                        <span
                          className={styles.channelBadge}
                          data-tag-type={getTagColorType(badges[0]!)}
                        >
                          {badges[0]}
                        </span>
                      )}
                      {isActive && (
                        <span
                          className={drawerStyles.nowPlayingDot}
                          aria-label={t('Now playing')}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
