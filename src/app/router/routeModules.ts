import { lazy } from 'react';

const loaders = {
  '/': () => import('@/modules/catalog/pages/HomePage'),
  '/live': () => import('@/modules/catalog/pages/LiveTVPage'),
  '/epg': () => import('@/modules/guide/pages/EpgPage'),
  '/movies': () => import('@/modules/catalog/pages/MoviesPage'),
  '/series': () => import('@/modules/catalog/pages/SeriesPage'),
  '/search': () => import('@/modules/search/pages/SearchPage'),
  '/continue': () => import('@/modules/library/pages/ContinueWatchingPage'),
  '/favorites': () => import('@/modules/library/pages/FavoritesPage'),
  '/collections': () => import('@/modules/library/pages/CollectionsPage'),
  '/downloads': () => import('@/modules/downloads/pages/DownloadsPage'),
  '/upcoming': () => import('@/modules/guide/pages/UpcomingPage'),
  '/settings': () => import('@/modules/settings/pages/SettingsPage'),
  '/m3u-editor': () => import('@/modules/m3u-editor/pages/M3uEditorPage'),
} as const;

type PreloadableRoute = keyof typeof loaders;

export function preloadRouteModule(path: string): Promise<unknown> | undefined {
  const route = path.startsWith('/m3u-editor') ? '/m3u-editor' : path;
  return loaders[route as PreloadableRoute]?.();
}

export const HomePage = lazy(() => loaders['/']().then((module) => ({ default: module.HomePage })));
export const LiveTvPage = lazy(() =>
  loaders['/live']().then((module) => ({ default: module.LiveTvPage })),
);
export const EpgPage = lazy(() =>
  loaders['/epg']().then((module) => ({ default: module.EpgPage })),
);
export const MoviesPage = lazy(() =>
  loaders['/movies']().then((module) => ({ default: module.MoviesPage })),
);
export const SeriesPage = lazy(() =>
  loaders['/series']().then((module) => ({ default: module.SeriesPage })),
);
export const SearchPage = lazy(() =>
  loaders['/search']().then((module) => ({ default: module.SearchPage })),
);
export const FavoritesPage = lazy(() =>
  loaders['/favorites']().then((module) => ({ default: module.FavoritesPage })),
);
export const CollectionsPage = lazy(() =>
  loaders['/collections']().then((module) => ({ default: module.CollectionsPage })),
);
export const ContinueWatchingPage = lazy(() =>
  loaders['/continue']().then((module) => ({ default: module.ContinueWatchingPage })),
);
export const DownloadsPage = lazy(() =>
  loaders['/downloads']().then((module) => ({ default: module.DownloadsPage })),
);
export const UpcomingPage = lazy(() =>
  loaders['/upcoming']().then((module) => ({ default: module.UpcomingPage })),
);
export const SettingsPage = lazy(() =>
  loaders['/settings']().then((module) => ({ default: module.SettingsPage })),
);
export const M3uEditorPage = lazy(() =>
  loaders['/m3u-editor']().then((module) => ({ default: module.M3uEditorPage })),
);
