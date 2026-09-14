import { lazy, Suspense, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { getErrorPresentation } from '@/shared/lib/error';
import { configureNotificationRuntime } from '@/shared/notifications/useNotificationStore';
import { ContextMenu } from '@/shared/ui/ContextMenu';
import { ErrorState } from '@/shared/ui/ErrorState';
import { ToastContainer } from '@/shared/ui/ToastContainer';
import { useDownloadEvents } from '@/modules/downloads/hooks/useDownloadEvents';
import { usePlayerContextMenus } from '@/modules/playback/hooks/usePlayerContextMenus';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { ConnectionStatus } from './components/ConnectionStatus';
import { AppProviders } from './providers/AppProviders';
import { AppRoutes } from './router/AppRoutes';
import { Sidebar } from './shell/Sidebar';
import { WindowChrome } from './shell/WindowChrome';
import { useAppearanceSynchronization } from './hooks/useAppearanceSynchronization';
import { useAppStartup } from './hooks/useAppStartup';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useUpdateAnnouncements } from './hooks/useUpdateAnnouncements';
import styles from './shell/AppLayout.module.css';

const PlayerShell = lazy(() =>
  import('@/modules/playback/components/PlayerShell').then((module) => ({
    default: module.PlayerShell,
  })),
);
const DebugOverlay = lazy(() =>
  import('@/modules/diagnostics/components/DebugOverlay').then((module) => ({
    default: module.DebugOverlay,
  })),
);
const OnboardingFlow = lazy(() =>
  import('@/modules/onboarding/components/OnboardingFlow').then((module) => ({
    default: module.OnboardingFlow,
  })),
);
const ShortcutHelperDialog = lazy(() =>
  import('./components/ShortcutHelperDialog').then((module) => ({
    default: module.ShortcutHelperDialog,
  })),
);

configureNotificationRuntime({
  getPreferences: () => useSettingsStore.getState(),
  isPlaybackActive: () => Boolean(usePlayerStore.getState().activeStream),
});

interface AppSurfaceProps {
  children: ReactNode;
  motionPreference: 'system' | 'full' | 'reduced';
  onContextMenu: (event: MouseEvent) => void;
}

function AppSurface({ children, motionPreference, onContextMenu }: AppSurfaceProps) {
  return (
    <MotionConfig
      reducedMotion={
        motionPreference === 'reduced' ? 'always' : motionPreference === 'full' ? 'never' : 'user'
      }
    >
      <div className={styles.appContainer} onContextMenu={onContextMenu}>
        <div className={styles.windowDragArea} data-tauri-drag-region aria-hidden="true" />
        {children}
      </div>
    </MotionConfig>
  );
}

function AppShell() {
  useDownloadEvents();
  useAppearanceSynchronization();
  const navigate = useNavigate();
  useUpdateAnnouncements(navigate);
  const { showShortcutHelper, setShowShortcutHelper } = useGlobalShortcuts(navigate);
  const { startupError, isRetryingStartup, retryStartup, showOnboarding, dismissOnboarding } =
    useAppStartup();
  const motionPreference = useSettingsStore((state) => state.motionPreference);
  const debugMode = useSettingsStore((state) => state.debugMode);
  const showDebugOverlay = useSettingsStore((state) => state.showDebugOverlay);
  const enableNotifications = useSettingsStore((state) => state.enableNotifications);
  const toastPosition = useSettingsStore((state) => state.toastPosition);
  const dndDuringPlayback = useSettingsStore((state) => state.dndDuringPlayback);
  const activeStream = usePlayerStore((state) => state.activeStream);
  const { handleAppBackdropContextMenu } = usePlayerContextMenus();

  if (startupError) {
    const presentation = getErrorPresentation(startupError, 'Saved source');
    return (
      <div className={styles.startupError}>
        <ErrorState
          title={presentation.title}
          description={presentation.description}
          detail={presentation.detail}
          actionLabel="Try Again"
          onAction={() => void retryStartup()}
          isRetrying={isRetryingStartup}
        />
      </div>
    );
  }

  const sharedSurfaces = (
    <>
      <WindowChrome />
      <ConnectionStatus />
      <ToastContainer
        enabled={enableNotifications}
        position={toastPosition}
        suppressDuringPlayback={dndDuringPlayback}
        playbackActive={Boolean(activeStream)}
      />
      <ContextMenu />
    </>
  );

  if (showOnboarding) {
    return (
      <AppSurface motionPreference={motionPreference} onContextMenu={handleAppBackdropContextMenu}>
        <Suspense fallback={null}>
          <OnboardingFlow onDone={dismissOnboarding} />
        </Suspense>
        {sharedSurfaces}
      </AppSurface>
    );
  }

  return (
    <AppSurface motionPreference={motionPreference} onContextMenu={handleAppBackdropContextMenu}>
      <div className={`${styles.appUi} ${activeStream ? styles.appUiHidden : ''}`}>
        <Sidebar />
        <main className={styles.mainContent}>
          <div className={styles.pageContainer}>
            <AppRoutes />
          </div>
        </main>
      </div>

      {activeStream && (
        <Suspense fallback={null}>
          <PlayerShell />
        </Suspense>
      )}
      {sharedSurfaces}
      {debugMode && showDebugOverlay && (
        <Suspense fallback={null}>
          <DebugOverlay />
        </Suspense>
      )}
      {showShortcutHelper && (
        <Suspense fallback={null}>
          <ShortcutHelperDialog onClose={() => setShowShortcutHelper(false)} />
        </Suspense>
      )}
    </AppSurface>
  );
}

export default function App() {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}
