import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Minus,
  Pause,
  Play,
  Trash2,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { type LogEntry, useDebugStore } from '../store/useDebugStore';
import { useAuthStore } from '@/modules/sources/public/store/useAuthStore';
import { useLibraryStore } from '@/modules/library/public/store/useLibraryStore';
import { usePlayerStore } from '@/modules/playback/public/store/usePlayerStore';
import { useSourceStore } from '@/modules/sources/public/store/useSourceStore';
import { notify } from '@/shared/notifications/useNotificationStore';
import { getErrorMessage } from '@/shared/lib/error';
import { useGlobalDebugCapture } from '../hooks/useGlobalDebugCapture';
import { useEnabledSources } from '@/modules/sources/public/hooks/useEnabledSources';
import { Select } from '@/shared/ui/Select';
import { TabStrip } from '@/shared/ui/TabStrip';
import styles from './DebugOverlay.module.css';
import { MOTION_DURATION, MOTION_EASE } from '@/shared/design/motion';
import { getDisplayTitle } from '@/modules/catalog/public/lib/titleParser';
import { useI18n } from '@/shared/i18n/i18n';
import {
  formatBitrate,
  formatByteRate,
  formatDebugTime as formatTime,
  formatMilliseconds,
  formatSignedMilliseconds,
  playerPhase,
  searchableDetails,
  type DebugTab,
} from './debugOverlayModel';
import { DebugSparkline } from './DebugSparkline';
import {
  fitHudGeometry,
  initialHudGeometry,
  HUD_DEFAULT_HEIGHT,
  HUD_DEFAULT_WIDTH,
  HUD_KEYBOARD_STEP,
  type HudPointerOperation,
} from './debugOverlayGeometry';

function providerDiagnosticSummary(auth: ReturnType<typeof useAuthStore.getState>) {
  return {
    providerConfigured: auth.profiles.length > 0,
    providerCount: auth.profiles.length,
    serverCount: Object.values(auth.runtimes).reduce(
      (total, runtime) =>
        total + (runtime.credentials ? 1 + (runtime.credentials.alternativeUrls?.length ?? 0) : 0),
      0,
    ),
  };
}

export function DebugOverlay() {
  const { t, tn, number, time } = useI18n();
  const settings = useSettingsStore();
  const { logs, networkLogs, clearLogs, clearNetworkLogs, exportDebugReport } = useDebugStore();
  const authStore = useAuthStore();
  const providerSummary = providerDiagnosticSummary(authStore);
  const sources = useEnabledSources();
  const sourceCount = useSourceStore((state) => state.profiles.length + authStore.profiles.length);
  const libraryStore = useLibraryStore();
  const playerStore = usePlayerStore();
  const queryClient = useQueryClient();
  const queryCache = queryClient.getQueryCache();

  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<DebugTab>('overview');
  const [logFilterCategory, setLogFilterCategory] = useState('all');
  const [logFilterLevel, setLogFilterLevel] = useState('all');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(() => new Set());
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(() => new Set());
  const [pausedLogs, setPausedLogs] = useState<LogEntry[] | null>(null);
  const [copiedReport, setCopiedReport] = useState(false);
  const [hudGeometry, setHudGeometry] = useState(initialHudGeometry);
  const [pointerOperation, setPointerOperation] = useState<HudPointerOperation['kind'] | null>(
    null,
  );
  const pointerOperationRef = useRef<HudPointerOperation | null>(null);

  useEffect(() => {
    const handleViewportResize = () => setHudGeometry((current) => fitHudGeometry(current));
    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, []);

  useGlobalDebugCapture(settings.debugMode);

  const subscribeToQueries = useCallback(
    (onStoreChange: () => void) => {
      let active = true;
      const unsubscribe = queryCache.subscribe(() => {
        queueMicrotask(() => {
          if (active) onStoreChange();
        });
      });
      return () => {
        active = false;
        unsubscribe();
      };
    },
    [queryCache],
  );
  const getQuerySnapshot = useCallback(
    () =>
      queryCache
        .getAll()
        .map((query) =>
          [
            query.queryHash,
            query.state.dataUpdatedAt,
            query.state.errorUpdatedAt,
            query.state.fetchStatus,
            query.state.status,
            query.isStale(),
          ].join(':'),
        )
        .join('|'),
    [queryCache],
  );
  useSyncExternalStore(subscribeToQueries, getQuerySnapshot, getQuerySnapshot);

  const queries = queryCache.getAll();
  const queryStats = {
    total: queries.length,
    fetching: queries.filter((query) => query.state.fetchStatus === 'fetching').length,
    failed: queries.filter((query) => query.state.status === 'error').length,
    stale: queries.filter((query) => query.isStale()).length,
  };
  const logSource = pausedLogs ?? logs;
  const errorCount = logs.filter((log) => log.level === 'error').length;
  const warningCount = logs.filter((log) => log.level === 'warn').length;
  const failedRequestCount = networkLogs.filter(
    (entry) => Boolean(entry.error) || (entry.status ?? 0) >= 400,
  ).length;
  const slowRequestCount = networkLogs.filter((entry) => (entry.durationMs ?? 0) >= 1000).length;
  const diagnostics = playerStore.diagnostics;
  const latestSample = diagnostics.latest;
  const activeVideoTrack =
    playerStore.videoTracks.find((track) => track.selected) ?? playerStore.videoTracks[0];
  const activeAudioTrack =
    playerStore.audioTracks.find((track) => track.selected) ?? playerStore.audioTracks[0];
  const totalBitrate =
    (latestSample?.videoBitrateBitsPerSecond ?? 0) + (latestSample?.audioBitrateBitsPerSecond ?? 0);
  const bandwidthMargin =
    totalBitrate > 0 && typeof latestSample?.cacheSpeedBytesPerSecond === 'number'
      ? (latestSample.cacheSpeedBytesPerSecond * 8) / totalBitrate
      : null;
  const currentRebufferMs =
    diagnostics.rebufferStartedAt === null
      ? diagnostics.totalRebufferMs
      : diagnostics.totalRebufferMs + Date.now() - diagnostics.rebufferStartedAt;
  const sourceStatus = sources.isLoading
    ? 'Loading'
    : sources.isAvailable
      ? 'Ready'
      : sources.errors.length > 0
        ? 'Error'
        : 'Unavailable';
  const sourceSummary = t('{enabled} enabled · {configured} configured', {
    enabled: number(sources.enabledSourceIds.length),
    configured: number(sourceCount),
  });
  const sourceDiagnostics = {
    status: sourceStatus,
    configuredSourceCount: sourceCount,
    enabledSourceCount: sources.enabledSourceIds.length,
    xtreamEnabled: sources.xtreamEnabled,
    playlists: sources.m3uSources.map((source) => ({
      id: source.id,
      name: source.profile.name,
      status: source.runtime?.status ?? 'unavailable',
      entryCount: source.profile.entryCount,
      lastRefreshAt: source.profile.lastRefreshAt,
      error: source.runtime?.error ?? null,
    })),
  };

  const filteredLogs = useMemo(() => {
    const query = logSearchQuery.trim().toLowerCase();
    return logSource.filter((log) => {
      if (logFilterCategory !== 'all' && log.category !== logFilterCategory) return false;
      if (logFilterLevel !== 'all' && log.level !== logFilterLevel) return false;
      if (!query) return true;
      return `${log.category} ${log.level} ${log.message} ${searchableDetails(log)}`
        .toLowerCase()
        .includes(query);
    });
  }, [logFilterCategory, logFilterLevel, logSearchQuery, logSource]);

  if (!settings.debugMode || !settings.showDebugOverlay) return null;

  const handleCopyReport = async () => {
    const report = exportDebugReport({
      buildMode: import.meta.env.MODE,
      auth: {
        authenticated: authStore.isAuthenticated(),
        initializing: authStore.isInitializing,
        initializationError: authStore.initializationError,
        ...providerSummary,
      },
      source: sourceDiagnostics,
      player: {
        phase: playerPhase(playerStore),
        activeStream: playerStore.activeStream
          ? {
              id: playerStore.activeStream.id,
              title: getDisplayTitle(playerStore.activeStream.title, playerStore.activeStream.type),
              type: playerStore.activeStream.type,
            }
          : null,
        isVideoReady: playerStore.isVideoReady,
        isBuffering: playerStore.isBuffering,
        position: playerStore.currentTime,
        duration: playerStore.duration,
        videoTrackCount: playerStore.videoTracks.length,
        audioTrackCount: playerStore.audioTracks.length,
        subtitleTrackCount: playerStore.subtitleTracks.length,
        diagnostics: {
          hardwareDecoder: diagnostics.hardwareDecoder,
          videoParams: diagnostics.videoParams,
          audioParams: diagnostics.audioParams,
          mpvStartMs: diagnostics.mpvStartMs,
          videoReadyMs: diagnostics.videoReadyMs,
          firstPositionMs: diagnostics.firstPositionMs,
          lastSeekMs: diagnostics.lastSeekMs,
          rebufferCount: diagnostics.rebufferCount,
          totalRebufferMs: currentRebufferMs,
          latestSample,
          retainedSamples: diagnostics.samples.length,
        },
      },
      queries: queryStats,
      library: {
        favorites: libraryStore.favorites.length,
        collections: libraryStore.collections.length,
        history: libraryStore.history.length,
        watched: libraryStore.watched.length,
      },
      settings: {
        debugLogLevel: settings.debugLogLevel,
        logApiRequests: settings.logApiRequests,
        hardwareAcceleration: settings.hardwareAcceleration,
        hwdecMode: settings.hwdecMode,
        cacheSecs: settings.cacheSecs,
        demuxerMaxBytes: settings.demuxerMaxBytes,
      },
    });

    try {
      await navigator.clipboard.writeText(report);
      setCopiedReport(true);
      notify.success('Report Copied', 'Sanitized diagnostic report copied to the clipboard.');
      window.setTimeout(() => setCopiedReport(false), 2000);
    } catch (error: unknown) {
      notify.error(
        'Copy Failed',
        getErrorMessage(error, 'Clipboard write failed without an error message.'),
      );
    }
  };

  const toggleLog = (id: string) => {
    setExpandedLogs((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleRequest = (id: string) => {
    setExpandedRequests((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePaused = () => {
    setPausedLogs((current) => (current ? null : [...logs]));
  };

  const startPointerOperation = (
    kind: HudPointerOperation['kind'],
    event: PointerEvent<HTMLElement>,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerOperationRef.current = {
      kind,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      geometry: hudGeometry,
    };
    setPointerOperation(kind);
  };

  const handlePointerOperationMove = (event: PointerEvent<HTMLElement>) => {
    const operation = pointerOperationRef.current;
    if (!operation || operation.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - operation.clientX;
    const deltaY = event.clientY - operation.clientY;

    setHudGeometry(
      fitHudGeometry(
        operation.kind === 'move'
          ? {
              ...operation.geometry,
              x: operation.geometry.x + deltaX,
              y: operation.geometry.y + deltaY,
            }
          : {
              ...operation.geometry,
              width: operation.geometry.width + deltaX,
              height: operation.geometry.height + deltaY,
            },
      ),
    );
  };

  const endPointerOperation = (event: PointerEvent<HTMLElement>) => {
    const operation = pointerOperationRef.current;
    if (!operation || operation.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerOperationRef.current = null;
    setPointerOperation(null);
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? HUD_KEYBOARD_STEP * 2 : HUD_KEYBOARD_STEP;
    setHudGeometry((current) =>
      fitHudGeometry({
        ...current,
        width:
          event.key === 'Home'
            ? HUD_DEFAULT_WIDTH
            : current.width +
              (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
        height:
          event.key === 'Home'
            ? HUD_DEFAULT_HEIGHT
            : current.height +
              (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0),
      }),
    );
  };

  const categoryOptions = [
    { label: 'All Categories', value: 'all' },
    { label: 'API', value: 'api' },
    { label: 'Player', value: 'player' },
    { label: 'Auth', value: 'auth' },
    { label: 'System', value: 'system' },
    { label: 'Library', value: 'library' },
    { label: 'Search', value: 'search' },
  ];

  const levelOptions = [
    { label: 'All Levels', value: 'all' },
    { label: 'Info', value: 'info' },
    { label: 'Warning', value: 'warn' },
    { label: 'Error', value: 'error' },
    { label: 'Debug', value: 'debug' },
  ];

  if (isMinimized) {
    return (
      <motion.button
        type="button"
        drag
        dragMomentum={false}
        className={styles.debugPill}
        data-ui-layer="debug"
        onClick={() => setIsMinimized(false)}
        aria-label={t('Open Developer HUD')}
      >
        <span className={styles.statusDot} aria-hidden="true" />
        <span>{t('DEV HUD')}</span>
        <span className={styles.logBadge}>
          {errorCount > 0
            ? tn('{count} error', '{count} errors', errorCount, { count: number(errorCount) })
            : tn('{count} log', '{count} logs', logs.length, { count: number(logs.length) })}
        </span>
      </motion.button>
    );
  }

  const tabOptions: Array<{ value: DebugTab; label: string }> = [
    { value: 'overview', label: t('Overview') },
    { value: 'logs', label: t('Logs {count}', { count: number(logs.length) }) },
    { value: 'network', label: t('Requests {count}', { count: number(networkLogs.length) }) },
    { value: 'player', label: t('Player') },
    { value: 'state', label: t('State') },
  ];

  return (
    <AnimatePresence>
      <motion.div
        className={styles.debugOverlayWindow}
        data-ui-layer="debug"
        style={{
          left: hudGeometry.x,
          top: hudGeometry.y,
          width: hudGeometry.width,
          height: hudGeometry.height,
        }}
        data-pointer-operation={pointerOperation ?? undefined}
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.96 }}
        transition={{ duration: MOTION_DURATION.normal, ease: MOTION_EASE.standard }}
        role="region"
        aria-label={t('Developer HUD')}
      >
        <div
          className={styles.header}
          onPointerDown={(event) => startPointerOperation('move', event)}
          onPointerMove={handlePointerOperationMove}
          onPointerUp={endPointerOperation}
          onPointerCancel={endPointerOperation}
        >
          <div className={styles.headerTitle}>
            <Activity size={15} />
            <span>{t('Developer HUD')}</span>
            <span className={styles.phaseText}>{t(playerPhase(playerStore))}</span>
          </div>
          <div className={styles.headerActions} onPointerDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => void handleCopyReport()}
              aria-label={t('Copy diagnostic report')}
            >
              {copiedReport ? (
                <Check size={14} className={styles.successIcon} />
              ) : (
                <Copy size={14} />
              )}
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setIsMinimized(true)}
              aria-label={t('Minimize Developer HUD')}
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => settings.updateSetting('showDebugOverlay', false)}
              aria-label={t('Hide Developer HUD')}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <TabStrip
          id="developer-hud"
          panelId="developer-hud-panel"
          ariaLabel={t('Developer HUD sections')}
          value={activeTab}
          onChange={setActiveTab}
          options={tabOptions}
          className={styles.tabsBar}
        />

        <div
          id="developer-hud-panel"
          className={`${styles.tabContent} subtle-scrollbar`}
          role="tabpanel"
          aria-labelledby={`developer-hud-tab-${tabOptions.findIndex((tab) => tab.value === activeTab)}`}
        >
          {activeTab === 'overview' && (
            <div className={styles.dashboard}>
              <section className={styles.metricGrid} aria-label={t('Runtime status')}>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>{t('Source')}</span>
                  <strong>{t(sourceStatus)}</strong>
                  <span>{sourceSummary}</span>
                </div>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>{t('Player')}</span>
                  <strong>{t(playerPhase(playerStore))}</strong>
                  <span>
                    {playerStore.activeStream
                      ? getDisplayTitle(
                          playerStore.activeStream.title,
                          playerStore.activeStream.type,
                        )
                      : t('No active stream')}
                  </span>
                </div>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>{t('Queries')}</span>
                  <strong>
                    {queryStats.fetching > 0
                      ? t('{count} fetching', { count: number(queryStats.fetching) })
                      : t('{count} cached', { count: number(queryStats.total) })}
                  </strong>
                  <span>
                    {t('{failed} failed · {stale} stale', {
                      failed: number(queryStats.failed),
                      stale: number(queryStats.stale),
                    })}
                  </span>
                </div>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>{t('Connectivity')}</span>
                  <strong>{t(navigator.onLine ? 'Online' : 'Offline')}</strong>
                  <span>
                    {tn(
                      '{count} recorded request',
                      '{count} recorded requests',
                      networkLogs.length,
                      { count: number(networkLogs.length) },
                    )}
                  </span>
                </div>
              </section>

              <section className={styles.sectionCard}>
                <div className={styles.sectionHeading}>
                  <span>{t('Current signals')}</span>
                  <span className={styles.sectionMeta}>{t('This session')}</span>
                </div>
                <div className={styles.signalList}>
                  <button
                    type="button"
                    onClick={() => {
                      setLogFilterLevel('error');
                      setActiveTab('logs');
                    }}
                  >
                    <span>{t('Errors')}</span>
                    <strong className={errorCount > 0 ? styles.errorText : ''}>
                      {number(errorCount)}
                    </strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLogFilterLevel('warn');
                      setActiveTab('logs');
                    }}
                  >
                    <span>{t('Warnings')}</span>
                    <strong className={warningCount > 0 ? styles.warningText : ''}>
                      {number(warningCount)}
                    </strong>
                  </button>
                  <button type="button" onClick={() => setActiveTab('network')}>
                    <span>{t('Failed requests')}</span>
                    <strong className={failedRequestCount > 0 ? styles.errorText : ''}>
                      {number(failedRequestCount)}
                    </strong>
                  </button>
                  <button type="button" onClick={() => setActiveTab('network')}>
                    <span>{t('Slow requests')}</span>
                    <strong>{number(slowRequestCount)}</strong>
                  </button>
                </div>
              </section>

              <section className={styles.sectionCard}>
                <div className={styles.sectionHeading}>
                  <span>{t('Library snapshot')}</span>
                </div>
                <dl className={styles.definitionGrid}>
                  <div>
                    <dt>{t('Favorites')}</dt>
                    <dd>{number(libraryStore.favorites.length)}</dd>
                  </div>
                  <div>
                    <dt>{t('Collections')}</dt>
                    <dd>{number(libraryStore.collections.length)}</dd>
                  </div>
                  <div>
                    <dt>{t('History')}</dt>
                    <dd>{number(libraryStore.history.length)}</dd>
                  </div>
                  <div>
                    <dt>{t('Watched')}</dt>
                    <dd>{number(libraryStore.watched.length)}</dd>
                  </div>
                </dl>
              </section>
            </div>
          )}

          {activeTab === 'logs' && (
            <>
              <div className={styles.filterRow}>
                <Select
                  value={logFilterCategory}
                  options={categoryOptions}
                  onChange={setLogFilterCategory}
                  width={144}
                />
                <Select
                  value={logFilterLevel}
                  options={levelOptions}
                  onChange={setLogFilterLevel}
                  width={112}
                />
                <input
                  type="search"
                  aria-label={t('Search diagnostic logs')}
                  placeholder={t('Search messages and details')}
                  value={logSearchQuery}
                  onChange={(event) => setLogSearchQuery(event.target.value)}
                  className={`uiField ${styles.searchInput}`}
                  data-size="sm"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                />
                <button
                  type="button"
                  className={styles.toolbarBtn}
                  onClick={togglePaused}
                  aria-pressed={pausedLogs !== null}
                  aria-label={t(pausedLogs ? 'Resume live logs' : 'Pause live logs')}
                >
                  {pausedLogs ? <Play size={13} /> : <Pause size={13} />}
                  <span>{t(pausedLogs ? 'Resume' : 'Pause')}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.toolbarBtn} ${styles.dangerBtn}`}
                  onClick={() => {
                    clearLogs();
                    setPausedLogs(pausedLogs ? [] : null);
                  }}
                  aria-label={t('Clear diagnostic logs')}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className={styles.resultSummary}>
                <span>
                  {t('Showing {visible} of {total}', {
                    visible: number(filteredLogs.length),
                    total: number(logSource.length),
                  })}
                </span>
                {pausedLogs && logs.length > pausedLogs.length && (
                  <span>
                    {tn(
                      '{count} new while paused',
                      '{count} new while paused',
                      logs.length - pausedLogs.length,
                      { count: number(logs.length - pausedLogs.length) },
                    )}
                  </span>
                )}
              </div>
              <div className={styles.logsList}>
                {filteredLogs.length === 0 ? (
                  <div className={styles.emptyState}>{t('No logs match the current filters.')}</div>
                ) : (
                  filteredLogs.map((log) => {
                    const hasDetails = log.details !== undefined && log.details !== null;
                    const isExpanded = expandedLogs.has(log.id);
                    const detailId = `debug-log-${log.id}`;
                    return (
                      <article key={log.id} className={`${styles.logRow} ${styles[log.level]}`}>
                        <button
                          type="button"
                          className={styles.logSummaryButton}
                          onClick={() => hasDetails && toggleLog(log.id)}
                          aria-expanded={hasDetails ? isExpanded : undefined}
                          aria-controls={hasDetails ? detailId : undefined}
                        >
                          <span className={styles.expandIcon} aria-hidden="true">
                            {hasDetails ? (
                              isExpanded ? (
                                <ChevronDown size={13} />
                              ) : (
                                <ChevronRight size={13} />
                              )
                            ) : null}
                          </span>
                          <time>{time(log.timestamp, { second: '2-digit' })}</time>
                          <span className={styles.logCategory}>{t(log.category)}</span>
                          <span className={styles.logLevel}>{t(log.level)}</span>
                          <span className={styles.logMsg}>{log.message}</span>
                        </button>
                        {hasDetails && isExpanded && (
                          <pre id={detailId} className={`${styles.logDetails} subtle-scrollbar`}>
                            {typeof log.details === 'object'
                              ? JSON.stringify(log.details, null, 2)
                              : String(log.details)}
                          </pre>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </>
          )}

          {activeTab === 'network' && (
            <>
              <div className={styles.resultSummary}>
                <span>
                  {t('{requests} recorded · {failed} failed · {slow} slow', {
                    requests: number(networkLogs.length),
                    failed: number(failedRequestCount),
                    slow: number(slowRequestCount),
                  })}
                </span>
                <button
                  type="button"
                  className={`${styles.toolbarBtn} ${styles.dangerBtn}`}
                  onClick={clearNetworkLogs}
                >
                  <Trash2 size={13} />
                  <span>{t('Clear')}</span>
                </button>
              </div>
              <div className={styles.logsList}>
                {networkLogs.length === 0 ? (
                  <div className={styles.emptyState}>{t('No provider requests recorded yet.')}</div>
                ) : (
                  networkLogs.map((request) => {
                    const hasResponse = Boolean(request.responsePreview || request.error);
                    const isExpanded = expandedRequests.has(request.id);
                    const responseId = `debug-net-${request.id}`;
                    return (
                      <article
                        key={request.id}
                        className={`${styles.requestRow} ${request.error || (request.status ?? 0) >= 400 ? styles.error : ''}`}
                      >
                        <button
                          type="button"
                          className={styles.logSummaryButton}
                          onClick={() => hasResponse && toggleRequest(request.id)}
                          aria-expanded={hasResponse ? isExpanded : undefined}
                          aria-controls={hasResponse ? responseId : undefined}
                        >
                          <span className={styles.expandIcon} aria-hidden="true">
                            {hasResponse ? (
                              isExpanded ? (
                                <ChevronDown size={13} />
                              ) : (
                                <ChevronRight size={13} />
                              )
                            ) : null}
                          </span>
                          <time>{time(request.timestamp, { second: '2-digit' })}</time>
                          <strong>{request.method}</strong>
                          <span
                            className={
                              (request.status ?? 0) >= 400
                                ? styles.errorText
                                : (request.status ?? 0) >= 200 && (request.status ?? 0) < 300
                                  ? styles.successText
                                  : ''
                            }
                          >
                            {request.status ?? t('Pending')}
                          </span>
                          <span>
                            {typeof request.durationMs === 'number'
                              ? `${number(request.durationMs)} ms`
                              : '—'}
                          </span>
                          {request.contentType && (
                            <span className={styles.logCategory}>
                              {request.contentType.split(';')[0]}
                            </span>
                          )}
                          {typeof request.responseSize === 'number' && (
                            <span className={styles.logCategory}>
                              {request.responseSize >= 1024
                                ? `${number(request.responseSize / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KB`
                                : `${number(request.responseSize)} B`}
                            </span>
                          )}
                        </button>
                        <div className={styles.requestUrl}>{request.url}</div>
                        {request.error && <pre className={styles.logDetails}>{request.error}</pre>}
                        {hasResponse && isExpanded && (
                          <pre id={responseId} className={`${styles.logDetails} subtle-scrollbar`}>
                            {request.responsePreview
                              ? (() => {
                                  try {
                                    return JSON.stringify(
                                      JSON.parse(request.responsePreview),
                                      null,
                                      2,
                                    );
                                  } catch {
                                    return request.responsePreview;
                                  }
                                })()
                              : request.error}
                          </pre>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </>
          )}

          {activeTab === 'player' && (
            <div className={styles.dashboard}>
              <section className={styles.metricGrid} aria-label={t('Player quality status')}>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>{t('Buffer')}</span>
                  <strong>
                    {typeof latestSample?.cacheDurationSeconds === 'number'
                      ? `${number(latestSample.cacheDurationSeconds, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`
                      : '—'}
                  </strong>
                  <span>
                    {tn('{count} rebuffer', '{count} rebuffers', diagnostics.rebufferCount, {
                      count: number(diagnostics.rebufferCount),
                    })}{' '}
                    · {formatMilliseconds(currentRebufferMs, number)}
                  </span>
                </div>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>{t('Bandwidth margin')}</span>
                  <strong>
                    {bandwidthMargin === null
                      ? '—'
                      : `${number(bandwidthMargin, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`}
                  </strong>
                  <span>
                    {t('{rate} ingest', {
                      rate: formatByteRate(latestSample?.cacheSpeedBytesPerSecond, number),
                    })}
                  </span>
                </div>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>{t('Dropped frames')}</span>
                  <strong>
                    {typeof latestSample?.frameDropCount === 'number'
                      ? number(latestSample.frameDropCount)
                      : '—'}
                  </strong>
                  <span>
                    {t('{count} decoder drops', {
                      count:
                        typeof latestSample?.decoderFrameDropCount === 'number'
                          ? number(latestSample.decoderFrameDropCount)
                          : '—',
                    })}
                  </span>
                </div>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>{t('A/V sync')}</span>
                  <strong>{formatSignedMilliseconds(latestSample?.avSyncSeconds, number)}</strong>
                  <span>
                    {typeof latestSample?.estimatedFps === 'number'
                      ? `${number(latestSample.estimatedFps, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} fps`
                      : t('FPS unavailable')}
                  </span>
                </div>
              </section>

              <section className={styles.sectionCard}>
                <div className={styles.sectionHeading}>
                  <span>{t('Startup & recovery')}</span>
                  <span className={styles.sectionMeta}>{t(playerPhase(playerStore))}</span>
                </div>
                <dl className={styles.definitionGrid}>
                  <div>
                    <dt>{t('mpv start')}</dt>
                    <dd>{formatMilliseconds(diagnostics.mpvStartMs, number)}</dd>
                  </div>
                  <div>
                    <dt>{t('Video ready')}</dt>
                    <dd>{formatMilliseconds(diagnostics.videoReadyMs, number)}</dd>
                  </div>
                  <div>
                    <dt>{t('First position')}</dt>
                    <dd>{formatMilliseconds(diagnostics.firstPositionMs, number)}</dd>
                  </div>
                  <div>
                    <dt>{t('Last seek')}</dt>
                    <dd>
                      {diagnostics.seekStartedAt === null
                        ? formatMilliseconds(diagnostics.lastSeekMs, number)
                        : t('Seeking…')}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className={styles.sectionCard}>
                <div className={styles.sectionHeading}>
                  <span>{t('Quality history')}</span>
                  <span className={styles.sectionMeta}>
                    {t('{current}/{maximum} samples', {
                      current: number(diagnostics.samples.length),
                      maximum: number(60),
                    })}
                  </span>
                </div>
                <div className={styles.sparklineGrid}>
                  <DebugSparkline
                    label={t('Buffer duration')}
                    values={diagnostics.samples.map((sample) => sample.cacheDurationSeconds)}
                    formatValue={(value) =>
                      typeof value === 'number'
                        ? `${number(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`
                        : '—'
                    }
                  />
                  <DebugSparkline
                    label={t('Estimated FPS')}
                    values={diagnostics.samples.map((sample) => sample.estimatedFps)}
                    formatValue={(value) =>
                      typeof value === 'number'
                        ? number(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '—'
                    }
                  />
                </div>
              </section>

              <section className={styles.sectionCard}>
                <div className={styles.sectionHeading}>
                  <span>{t('Decode pipeline')}</span>
                  <span className={styles.sectionMeta}>{t('Observed from mpv')}</span>
                </div>
                <dl className={styles.playerDetails}>
                  <div>
                    <dt>{t('Hardware decoder')}</dt>
                    <dd>{diagnostics.hardwareDecoder ?? t('Not reported')}</dd>
                  </div>
                  <div>
                    <dt>{t('Video codec')}</dt>
                    <dd>
                      {activeVideoTrack?.codecDescription ?? activeVideoTrack?.codec ?? '—'}
                      {activeVideoTrack?.codecProfile ? ` · ${activeVideoTrack.codecProfile}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('Video size')}</dt>
                    <dd>
                      {diagnostics.videoParams?.width && diagnostics.videoParams?.height
                        ? `${diagnostics.videoParams.width}×${diagnostics.videoParams.height}`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('Pixel format')}</dt>
                    <dd>
                      {diagnostics.videoParams?.hardwarePixelFormat ??
                        diagnostics.videoParams?.pixelFormat ??
                        '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('Color')}</dt>
                    <dd>
                      {[
                        diagnostics.videoParams?.colorPrimaries,
                        diagnostics.videoParams?.colorTransfer,
                        diagnostics.videoParams?.colorMatrix,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('HDR metadata')}</dt>
                    <dd>
                      {diagnostics.videoParams?.maxCll !== undefined
                        ? `${number(diagnostics.videoParams.maxCll)} / ${typeof diagnostics.videoParams.maxFall === 'number' ? number(diagnostics.videoParams.maxFall) : '—'} nits`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('Audio codec')}</dt>
                    <dd>{activeAudioTrack?.codecDescription ?? activeAudioTrack?.codec ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('Audio output')}</dt>
                    <dd>
                      {[
                        diagnostics.audioParams?.format,
                        diagnostics.audioParams?.sampleRate
                          ? `${number(diagnostics.audioParams.sampleRate / 1000)} kHz`
                          : null,
                        diagnostics.audioParams?.channels,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('Media bitrate')}</dt>
                    <dd>{formatBitrate(totalBitrate || undefined, number)}</dd>
                  </div>
                  <div>
                    <dt>{t('Total A/V correction')}</dt>
                    <dd>
                      {formatSignedMilliseconds(latestSample?.totalAvSyncChangeSeconds, number)}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className={styles.sectionCard}>
                <div className={styles.sectionHeading}>
                  <span>{t('Active media')}</span>
                  <span className={styles.sectionMeta}>
                    {t(playerStore.activeStream?.type ?? 'none')}
                  </span>
                </div>
                <dl className={styles.playerDetails}>
                  <div>
                    <dt>{t('Title')}</dt>
                    <dd>
                      {playerStore.activeStream
                        ? getDisplayTitle(
                            playerStore.activeStream.title,
                            playerStore.activeStream.type,
                          )
                        : t('No active stream')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('Stream ID')}</dt>
                    <dd>{playerStore.activeStream?.id ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('Playing')}</dt>
                    <dd>{t(playerStore.isPlaying ? 'Yes' : 'No')}</dd>
                  </div>
                  <div>
                    <dt>{t('Buffering')}</dt>
                    <dd>{t(playerStore.isBuffering ? 'Yes' : 'No')}</dd>
                  </div>
                  <div>
                    <dt>{t('Fullscreen')}</dt>
                    <dd>{t(playerStore.isFullscreen ? 'Yes' : 'No')}</dd>
                  </div>
                  <div>
                    <dt>{t('Subtitles visible')}</dt>
                    <dd>{t(playerStore.subtitlesVisible ? 'Yes' : 'No')}</dd>
                  </div>
                  <div>
                    <dt>{t('Position')}</dt>
                    <dd>
                      {formatTime(playerStore.currentTime)} / {formatTime(playerStore.duration)}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('Tracks')}</dt>
                    <dd>
                      {number(playerStore.videoTracks.length)}V ·{' '}
                      {number(playerStore.audioTracks.length)}A ·{' '}
                      {number(playerStore.subtitleTracks.length)}S
                    </dd>
                  </div>
                </dl>
              </section>
              <section className={styles.sectionCard}>
                <div className={styles.sectionHeading}>
                  <span>{t('Engine configuration')}</span>
                </div>
                <dl className={styles.playerDetails}>
                  <div>
                    <dt>{t('Hardware decoding')}</dt>
                    <dd>{settings.hardwareAcceleration ? settings.hwdecMode : t('disabled')}</dd>
                  </div>
                  <div>
                    <dt>{t('Cache target')}</dt>
                    <dd>{t('{count} seconds', { count: number(settings.cacheSecs) })}</dd>
                  </div>
                  <div>
                    <dt>{t('Demuxer buffer')}</dt>
                    <dd>{settings.demuxerMaxBytes}</dd>
                  </div>
                  <div>
                    <dt>{t('HDR mode')}</dt>
                    <dd>{settings.hdrMode}</dd>
                  </div>
                  <div>
                    <dt>{t('Tone mapping')}</dt>
                    <dd>{settings.toneMappingMode}</dd>
                  </div>
                </dl>
              </section>
            </div>
          )}

          {activeTab === 'state' && (
            <pre className={`${styles.jsonViewer} subtle-scrollbar`}>
              {JSON.stringify(
                {
                  auth: {
                    isAuthenticated: authStore.isAuthenticated(),
                    isInitializing: authStore.isInitializing,
                    ...providerSummary,
                  },
                  source: sourceDiagnostics,
                  player: {
                    phase: playerPhase(playerStore),
                    isPlaying: playerStore.isPlaying,
                    isBuffering: playerStore.isBuffering,
                    isVideoReady: playerStore.isVideoReady,
                    currentTime: playerStore.currentTime,
                    duration: playerStore.duration,
                    videoTracks: playerStore.videoTracks.length,
                    audioTracks: playerStore.audioTracks.length,
                    subtitleTracks: playerStore.subtitleTracks.length,
                    diagnostics: {
                      ...playerStore.diagnostics,
                      sessionStartedAt: playerStore.diagnostics.sessionStartedAt
                        ? new Date(playerStore.diagnostics.sessionStartedAt).toISOString()
                        : null,
                    },
                  },
                  library: {
                    favorites: libraryStore.favorites.length,
                    collections: libraryStore.collections.length,
                    history: libraryStore.history.length,
                    watched: libraryStore.watched.length,
                  },
                  queries: queryStats,
                },
                null,
                2,
              )}
            </pre>
          )}
        </div>

        <button
          type="button"
          className={styles.resizeHandle}
          onPointerDown={(event) => startPointerOperation('resize', event)}
          onPointerMove={handlePointerOperationMove}
          onPointerUp={endPointerOperation}
          onPointerCancel={endPointerOperation}
          onKeyDown={handleResizeKeyDown}
          onDoubleClick={() =>
            setHudGeometry((current) =>
              fitHudGeometry({
                ...current,
                width: HUD_DEFAULT_WIDTH,
                height: HUD_DEFAULT_HEIGHT,
              }),
            )
          }
          aria-label={t('Resize Developer HUD. Use arrow keys; Home resets.')}
        />
      </motion.div>
    </AnimatePresence>
  );
}
