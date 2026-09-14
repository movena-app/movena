import { Suspense } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useI18n } from '@/shared/i18n/i18n';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { PageTransition } from '../shell/PageTransition';
import styles from '../shell/AppLayout.module.css';
import {
  CollectionsPage,
  ContinueWatchingPage,
  DownloadsPage,
  EpgPage,
  FavoritesPage,
  HomePage,
  LiveTvPage,
  M3uEditorPage,
  MoviesPage,
  SearchPage,
  SeriesPage,
  SettingsPage,
  UpcomingPage,
} from './routeModules';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <PageTransition>
      <div className={styles.page}>
        <EmptyState
          icon={Compass}
          title="Page Not Found"
          description="That page is not part of this Movena workspace. Return to Home to keep browsing."
          actionLabel="Back to Home"
          onAction={() => void navigate('/')}
        />
      </div>
    </PageTransition>
  );
}

export function AppRoutes() {
  const { t } = useI18n();

  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className={styles.routeLoading} role="status" aria-label={t('Loading page')}>
            <span />
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/live" element={<LiveTvPage />} />
          <Route path="/epg" element={<EpgPage />} />
          <Route path="/movies" element={<MoviesPage />} />
          <Route path="/series" element={<SeriesPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/continue" element={<ContinueWatchingPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
          <Route path="/upcoming" element={<UpcomingPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/m3u-editor/:sourceId?" element={<M3uEditorPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
