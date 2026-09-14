import { PanelLeftClose, PanelLeft } from 'lucide-react';
import {
  RiCalendarScheduleFill,
  RiCalendarScheduleLine,
  RiDownload2Fill,
  RiDownload2Line,
  RiFolderFill,
  RiFolderLine,
  RiHeartFill,
  RiHeartLine,
  RiHistoryFill,
  RiHistoryLine,
  RiHome5Fill,
  RiHome5Line,
  RiMovie2Fill,
  RiMovie2Line,
  RiSearchFill,
  RiSearchLine,
  RiSettings3Fill,
  RiSettings3Line,
  RiSlideshow3Fill,
  RiSlideshow3Line,
  RiTv2Fill,
  RiTv2Line,
} from '@/shared/ui/icons';
import { NavLink } from 'react-router-dom';
import { useLibraryStore } from '@/modules/library/store/useLibraryStore';
import { useDownloadStore } from '@/modules/downloads/store/useDownloadStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { StateIcon } from '@/shared/ui/StateIcon';
import { useEnabledSources } from '@/modules/sources/hooks/useEnabledSources';
import { prefetchNavigationData } from '../bootstrap/prefetch';
import styles from './Sidebar.module.css';
import { useI18n } from '@/shared/i18n/i18n';
import { useMediaQuery } from '@/modules/catalog/hooks/useMediaQuery';

const COMPACT_NAVIGATION_QUERY = '(max-width: 640px)';

export function Sidebar() {
  const { t, number, tn } = useI18n();
  const storedCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const isCompactViewport = useMediaQuery(COMPACT_NAVIGATION_QUERY);
  const isCollapsed = storedCollapsed || isCompactViewport;
  const showCollapsedSidebarBadges = useSettingsStore((state) => state.showCollapsedSidebarBadges);
  const upcomingEnabled = useSettingsStore((state) => state.upcomingEnabled);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const setIsCollapsed = (collapsed: boolean) => updateSetting('sidebarCollapsed', collapsed);

  const history = useLibraryStore((state) => state.history);
  const favorites = useLibraryStore((state) => state.favorites);
  const collections = useLibraryStore((state) => state.collections);
  const downloads = useDownloadStore((state) => state.jobs);
  const sources = useEnabledSources();
  const prefetch = (path: string) => void prefetchNavigationData(path, sources);

  const navItems = [
    { icons: { line: RiHome5Line, fill: RiHome5Fill }, label: 'Home', path: '/' },
    { icons: { line: RiTv2Line, fill: RiTv2Fill }, label: 'Live TV', path: '/live' },
    {
      icons: { line: RiCalendarScheduleLine, fill: RiCalendarScheduleFill },
      label: 'TV Guide',
      path: '/epg',
    },
    { icons: { line: RiMovie2Line, fill: RiMovie2Fill }, label: 'Movies', path: '/movies' },
    { icons: { line: RiSlideshow3Line, fill: RiSlideshow3Fill }, label: 'Series', path: '/series' },
    { icons: { line: RiSearchLine, fill: RiSearchFill }, label: 'Search', path: '/search' },
  ];

  const libraryItems = [
    ...(upcomingEnabled
      ? [
          {
            icons: { line: RiCalendarScheduleLine, fill: RiCalendarScheduleFill },
            label: 'Coming Up',
            path: '/upcoming',
            badge: 0,
          },
        ]
      : []),
    {
      icons: { line: RiHistoryLine, fill: RiHistoryFill },
      label: 'Continue Watching',
      path: '/continue',
      badge: history.length,
    },
    {
      icons: { line: RiHeartLine, fill: RiHeartFill },
      label: 'Favorites',
      path: '/favorites',
      badge: favorites.length,
    },
    {
      icons: { line: RiFolderLine, fill: RiFolderFill },
      label: 'Collections',
      path: '/collections',
      badge: collections.length,
    },
    {
      icons: { line: RiDownload2Line, fill: RiDownload2Fill },
      label: 'Downloads',
      path: '/downloads',
      badge: downloads.length,
    },
  ];

  return (
    <aside
      className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''} ${showCollapsedSidebarBadges ? styles.showCollapsedBadges : ''}`}
      aria-label={t('Primary navigation')}
    >
      {/* Top drag region for macOS frameless window */}
      <div className={styles.dragArea} data-tauri-drag-region />

      <div className={`${styles.content} subtle-scrollbar`}>
        <div className={styles.logoHeader} data-tauri-drag-region>
          <div className={styles.logoVisual} aria-hidden="true">
            <span className={styles.logoWordmark}>
              <span className={styles.logoInitial}>M</span>
              <span className={styles.logoRemainder}>OVENA</span>
            </span>
          </div>
        </div>

        {/* BROWSE */}
        <nav className={styles.navGroup} aria-label={t('Browse')}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={isCollapsed ? t(item.label) : undefined}
              aria-label={isCollapsed ? t(item.label) : undefined}
              onMouseEnter={() => prefetch(item.path)}
              onFocus={() => prefetch(item.path)}
              className={({ isActive }) =>
                isActive ? `${styles.navItem} ${styles.active}` : styles.navItem
              }
            >
              {({ isActive }) => (
                <>
                  <StateIcon
                    icons={item.icons}
                    active={isActive}
                    className={styles.icon}
                    size={20}
                  />
                  <span className={styles.labelSlot}>
                    <span className={styles.label}>{t(item.label)}</span>
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className={styles.divider} />

        {/* LIBRARY */}
        <div className={styles.groupLabel}>{t('Library')}</div>
        <nav className={styles.navGroup} aria-label={t('Library')}>
          {libraryItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={
                isCollapsed
                  ? `${t(item.label)}${item.badge > 0 ? ` (${number(item.badge)})` : ''}`
                  : undefined
              }
              aria-label={
                isCollapsed
                  ? `${t(item.label)}${item.badge > 0 ? `, ${tn('{count} item', '{count} items', item.badge, { count: number(item.badge) })}` : ''}`
                  : undefined
              }
              className={({ isActive }) =>
                isActive ? `${styles.navItem} ${styles.active}` : styles.navItem
              }
            >
              {({ isActive }) => (
                <>
                  <StateIcon
                    icons={item.icons}
                    active={isActive}
                    className={styles.icon}
                    size={20}
                  />
                  <span className={styles.labelSlot}>
                    <span className={styles.label}>{t(item.label)}</span>
                    {item.badge > 0 && (
                      <span className={styles.badge} aria-hidden="true">
                        {item.badge}
                      </span>
                    )}
                  </span>
                  {item.badge > 0 && (
                    <span className={styles.collapsedBadge} aria-hidden="true">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className={styles.spacer} />

        {/* BOTTOM SETTINGS & COLLAPSE */}
        <div className={styles.bottomBar}>
          <NavLink
            to="/settings"
            title={isCollapsed ? t('Settings') : undefined}
            aria-label={isCollapsed ? t('Settings') : undefined}
            className={({ isActive }) =>
              isActive
                ? `${styles.navItem} ${styles.settingsLink} ${styles.active}`
                : `${styles.navItem} ${styles.settingsLink}`
            }
          >
            {({ isActive }) => (
              <>
                <StateIcon
                  icons={{ line: RiSettings3Line, fill: RiSettings3Fill }}
                  active={isActive}
                  className={styles.icon}
                  size={20}
                />
                <span className={styles.labelSlot}>
                  <span className={styles.label}>{t('Settings')}</span>
                </span>
              </>
            )}
          </NavLink>

          <button
            type="button"
            className={styles.bottomToggleBtn}
            onClick={() => setIsCollapsed(!storedCollapsed)}
            title={t(
              isCompactViewport
                ? 'Sidebar stays compact in narrow layouts'
                : storedCollapsed
                  ? 'Expand sidebar'
                  : 'Collapse sidebar',
            )}
            aria-label={t(
              isCompactViewport
                ? 'Sidebar stays compact in narrow layouts'
                : storedCollapsed
                  ? 'Expand sidebar'
                  : 'Collapse sidebar',
            )}
            disabled={isCompactViewport}
          >
            <span className={styles.toggleIcon} aria-hidden="true">
              <PanelLeftClose
                className={`${styles.toggleIconLayer} ${storedCollapsed ? styles.toggleIconHidden : styles.toggleIconVisible}`}
                size={20}
              />
              <PanelLeft
                className={`${styles.toggleIconLayer} ${storedCollapsed ? styles.toggleIconVisible : styles.toggleIconHidden}`}
                size={20}
              />
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
