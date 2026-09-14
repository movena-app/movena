import { useEffect, useRef, useState, useMemo } from 'react';
import {
  Play,
  Pause,
  Trash2,
  CheckCircle2,
  XCircle,
  FolderSymlink,
  ShieldAlert,
  TimerOff,
  WandSparkles,
  Merge,
  AlertTriangle,
  Info,
} from 'lucide-react';
import type { M3uEntry } from '@/modules/sources/public/data/m3uClient';
import type { M3uProbeResult } from '@/platform/tauri';
import type { XmltvGuide } from '@/modules/guide/public/data/xmltvClient';
import {
  probeStreamHealth,
  detectDuplicates,
  mergeDuplicateEntries,
  validateM3uEntries,
  buildEpgMatchSuggestions,
} from '../lib/m3uEditor';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { Button } from '@/shared/ui/Button';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { M3uChannelDetailsDrawer } from './M3uChannelDetailsDrawer';
import styles from './M3uEditorWorkspace.module.css';
import { useI18n } from '@/shared/i18n/i18n';
import { getErrorMessage } from '@/shared/lib/error';

interface TimedM3uProbeResult extends M3uProbeResult {
  checkedAt: number;
}

export type M3uHealthStatuses = Record<string, TimedM3uProbeResult | 'checking'>;

interface M3uStreamHealthCheckerProps {
  entries: M3uEntry[];
  healthStatuses: M3uHealthStatuses;
  onUpdateHealthStatuses: (statuses: M3uHealthStatuses) => void;
  onUpdateEntries: (entries: M3uEntry[]) => void;
  parserWarnings?: string[] | undefined;
  guide?: XmltvGuide | undefined;
  guideLoading?: boolean | undefined;
  guideError?: unknown | undefined;
  sourceId?: string | undefined;
}

export function M3uStreamHealthChecker({
  entries,
  healthStatuses,
  onUpdateHealthStatuses,
  onUpdateEntries,
  parserWarnings = [],
  guide,
  guideLoading = false,
  guideError = null,
  sourceId,
}: M3uStreamHealthCheckerProps) {
  const { t, number } = useI18n();
  const timeoutMs = useSettingsStore((state) => state.m3uHealthTimeoutMs);
  const concurrency = useSettingsStore((state) => state.m3uHealthConcurrency);
  const confirmDestructive = useSettingsStore((state) => state.m3uEditorConfirmDestructive);
  const [isRunning, setIsRunning] = useState(false);
  const [targetScope, setTargetScope] = useState<'all' | 'untested'>('untested');
  const [processedCount, setProcessedCount] = useState(0);
  const [activeTotal, setActiveTotal] = useState(0);
  const [validationFilter, setValidationFilter] = useState<'all' | 'error' | 'warning' | 'info'>(
    'all',
  );
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [duplicatePrimaries, setDuplicatePrimaries] = useState<Record<string, string>>({});
  const [pendingDestructiveAction, setPendingDestructiveAction] = useState<
    'offline' | 'duplicates' | null
  >(null);
  const runToken = useRef(0);
  const runBaseStatuses = useRef<M3uHealthStatuses>({});
  const workingStatuses = useRef<M3uHealthStatuses>({});

  const duplicateClusters = useMemo(() => detectDuplicates(entries), [entries]);
  const validationIssues = useMemo(
    () => validateM3uEntries(entries, parserWarnings),
    [entries, parserWarnings],
  );
  const epgSuggestions = useMemo(
    () => buildEpgMatchSuggestions(entries, guide, sourceId),
    [entries, guide, sourceId],
  );
  const exactUrlClusters = duplicateClusters.filter((cluster) => cluster.type === 'url');
  const nameClusters = duplicateClusters.filter((cluster) => cluster.type === 'name');
  const exactDuplicateCount = exactUrlClusters.reduce(
    (sum, cluster) => sum + cluster.entries.length - 1,
    0,
  );
  const entryIds = useMemo(() => new Set(entries.map((entry) => entry.id)), [entries]);
  const statusCount = (status: M3uProbeResult['status']) =>
    Object.entries(healthStatuses).filter(
      ([entryId, result]) =>
        entryIds.has(entryId) && result !== 'checking' && result.status === status,
    ).length;
  const onlineCount = statusCount('online');
  const offlineCount = statusCount('offline');
  const unauthorizedCount = statusCount('unauthorized');
  const timeoutCount = statusCount('timeout');
  const visibleValidationIssues =
    validationFilter === 'all'
      ? validationIssues
      : validationIssues.filter((issue) => issue.severity === validationFilter);
  const validationErrors = validationIssues.filter((issue) => issue.severity === 'error').length;
  const validationWarnings = validationIssues.filter(
    (issue) => issue.severity === 'warning',
  ).length;
  const matchedEpg = epgSuggestions.filter((suggestion) => suggestion.status === 'matched').length;
  const suggestedEpg = epgSuggestions.filter((suggestion) => suggestion.status === 'suggested');
  const unmatchedEpg = epgSuggestions.filter(
    (suggestion) => suggestion.status === 'unmatched',
  ).length;

  useEffect(
    () => () => {
      runToken.current += 1;
    },
    [],
  );

  useEffect(() => {
    const staleIds = Object.keys(healthStatuses).filter((entryId) => !entryIds.has(entryId));
    if (staleIds.length === 0) return;
    const nextStatuses = { ...healthStatuses };
    staleIds.forEach((entryId) => delete nextStatuses[entryId]);
    workingStatuses.current = nextStatuses;
    onUpdateHealthStatuses(nextStatuses);
  }, [entryIds, healthStatuses, onUpdateHealthStatuses]);

  const runHealthCheck = async () => {
    const token = runToken.current + 1;
    runToken.current = token;
    setIsRunning(true);
    const toTest = entries.filter((entry) => targetScope === 'all' || !healthStatuses[entry.id]);
    setProcessedCount(0);
    setActiveTotal(toTest.length);
    let index = 0;
    const nextStatuses: M3uHealthStatuses = { ...healthStatuses };
    runBaseStatuses.current = { ...healthStatuses };
    workingStatuses.current = nextStatuses;

    if (toTest.length === 0) {
      setIsRunning(false);
      return;
    }

    const worker = async () => {
      while (index < toTest.length && runToken.current === token) {
        const item = toTest[index++];
        if (!item) break;
        nextStatuses[item.id] = 'checking';
        workingStatuses.current = { ...nextStatuses };
        onUpdateHealthStatuses({ ...nextStatuses });
        const result = await probeStreamHealth(item.url, item.headers, timeoutMs);
        if (runToken.current !== token) break;
        nextStatuses[item.id] = { ...result, checkedAt: Date.now() };
        workingStatuses.current = { ...nextStatuses };
        onUpdateHealthStatuses({ ...nextStatuses });
        setProcessedCount((count) => count + 1);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, toTest.length || 1) }, () => worker()),
    );
    if (runToken.current === token) setIsRunning(false);
  };

  const handleStop = () => {
    runToken.current += 1;
    const restored = { ...workingStatuses.current };
    for (const [entryId, result] of Object.entries(restored)) {
      if (result !== 'checking') continue;
      const previous = runBaseStatuses.current[entryId];
      if (previous) restored[entryId] = previous;
      else delete restored[entryId];
    }
    workingStatuses.current = restored;
    onUpdateHealthStatuses(restored);
    setIsRunning(false);
  };

  const idsForStatus = (status: M3uProbeResult['status']) =>
    new Set(
      Object.entries(healthStatuses)
        .filter(([, result]) => result !== 'checking' && result.status === status)
        .map(([id]) => id),
    );

  const deleteOffline = () => {
    const ids = idsForStatus('offline');
    onUpdateEntries(entries.filter((entry) => !ids.has(entry.id)));
  };

  const handleDeleteOffline = () => {
    if (confirmDestructive) setPendingDestructiveAction('offline');
    else deleteOffline();
  };

  const handleMoveDeadToGroup = () => {
    const ids = idsForStatus('offline');
    onUpdateEntries(
      entries.map((entry) =>
        ids.has(entry.id) ? { ...entry, groupTitle: 'Dead Streams' } : entry,
      ),
    );
  };

  const removeExactDuplicates = () => {
    const remove = new Set<string>();
    exactUrlClusters.forEach((cluster) =>
      cluster.entries.slice(1).forEach((entry) => remove.add(entry.id)),
    );
    onUpdateEntries(entries.filter((entry) => !remove.has(entry.id)));
  };

  const handleRemoveExactDuplicates = () => {
    if (confirmDestructive) setPendingDestructiveAction('duplicates');
    else removeExactDuplicates();
  };

  const applyEpgMatch = (entryId: string, tvgId: string) => {
    onUpdateEntries(entries.map((entry) => (entry.id === entryId ? { ...entry, tvgId } : entry)));
  };

  const applyHighConfidenceEpgMatches = () => {
    const matches = new Map(
      suggestedEpg
        .filter((suggestion) => suggestion.confidence >= 0.86 && suggestion.suggestedTvgId)
        .map((suggestion) => [suggestion.entryId, suggestion.suggestedTvgId!]),
    );
    onUpdateEntries(
      entries.map((entry) =>
        matches.has(entry.id) ? { ...entry, tvgId: matches.get(entry.id) } : entry,
      ),
    );
  };

  const mergeCluster = (clusterKey: string, clusterEntries: M3uEntry[]) => {
    const primaryId = duplicatePrimaries[clusterKey] || clusterEntries[0]?.id;
    const primary = clusterEntries.find((entry) => entry.id === primaryId);
    if (!primary) return;
    const clusterIds = new Set(clusterEntries.map((entry) => entry.id));
    const merged = mergeDuplicateEntries(primary, clusterEntries);
    onUpdateEntries(
      entries.flatMap((entry) => {
        if (entry.id === primary.id) return [merged];
        return clusterIds.has(entry.id) ? [] : [entry];
      }),
    );
  };

  const editingEntry = entries.find((entry) => entry.id === editingEntryId) ?? null;
  const existingGroups = [...new Set(entries.map((entry) => entry.groupTitle || 'General'))].sort();

  const progressPercent =
    activeTotal > 0 ? Math.min(100, Math.round((processedCount / activeTotal) * 100)) : 0;

  return (
    <div className={styles.diagnosticsContainer}>
      <section className={styles.diagnosticsSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>{t('Playlist Validation')}</h2>
            <p className={styles.sectionDescription}>
              {t('Review structural problems before exporting or saving the playlist.')}
            </p>
          </div>
          <div className={styles.diagnosticStats}>
            <span>
              <XCircle size={15} className={styles.statusError} />
              <strong>{number(validationErrors)}</strong> {t('Errors')}
            </span>
            <span>
              <AlertTriangle size={15} className={styles.statusWarning} />
              <strong>{number(validationWarnings)}</strong> {t('Warnings')}
            </span>
          </div>
        </div>
        <SegmentedControl
          options={[
            { value: 'all', label: t('All ({count})', { count: number(validationIssues.length) }) },
            { value: 'error', label: t('Errors') },
            { value: 'warning', label: t('Warnings') },
            { value: 'info', label: t('Info') },
          ]}
          value={validationFilter}
          onChange={setValidationFilter}
          ariaLabel={t('Validation severity')}
        />
        <div className={styles.reviewList}>
          {visibleValidationIssues.slice(0, 250).map((issue) => (
            <button
              key={issue.id}
              type="button"
              className={styles.reviewRow}
              onClick={() => issue.entryId && setEditingEntryId(issue.entryId)}
              disabled={!issue.entryId}
            >
              {issue.severity === 'error' ? (
                <XCircle size={15} className={styles.statusError} />
              ) : issue.severity === 'warning' ? (
                <AlertTriangle size={15} className={styles.statusWarning} />
              ) : (
                <Info size={15} />
              )}
              <span>
                <strong>{issue.entryTitle || t('Playlist')}</strong>
                <small>{t(issue.message)}</small>
              </span>
            </button>
          ))}
          {visibleValidationIssues.length === 0 && (
            <p className={styles.emptyNotice}>{t('No issues in this severity group.')}</p>
          )}
        </div>
      </section>

      <section className={styles.diagnosticsSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>{t('EPG Matching Assistant')}</h2>
            <p className={styles.sectionDescription}>
              {t(
                'Matches live channels against the loaded XMLTV guide without changing provider data.',
              )}
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            type="button"
            onClick={applyHighConfidenceEpgMatches}
            disabled={suggestedEpg.every((suggestion) => suggestion.confidence < 0.86)}
          >
            <WandSparkles size={14} /> {t('Apply High Confidence')}
          </Button>
        </div>
        <div className={styles.diagnosticStats}>
          <span>
            <CheckCircle2 size={15} className={styles.statusSuccess} />
            <strong>{number(matchedEpg)}</strong> {t('Matched')}
          </span>
          <span>
            <WandSparkles size={15} />
            <strong>{number(suggestedEpg.length)}</strong> {t('Suggestions')}
          </span>
          <span>
            <Info size={15} />
            <strong>{number(unmatchedEpg)}</strong> {t('Unmatched')}
          </span>
        </div>
        {guideLoading && <p className={styles.emptyNotice}>{t('Loading XMLTV guide...')}</p>}
        {Boolean(guideError) && (
          <p className={styles.technicalError}>
            {getErrorMessage(
              guideError,
              t('The XMLTV guide could not be loaded. Check the source guide URL in Settings.'),
            )}
          </p>
        )}
        {!guideLoading && !guideError && !guide && (
          <p className={styles.emptyNotice}>{t('No XMLTV guide is configured for this source.')}</p>
        )}
        <div className={styles.reviewList}>
          {suggestedEpg.slice(0, 250).map((suggestion) => (
            <div key={suggestion.entryId} className={styles.epgMatchRow}>
              <span>
                <strong>{suggestion.entryTitle}</strong>
                <small>{suggestion.guideName || t('No guide match')}</small>
              </span>
              <span className={styles.confidenceBadge}>
                {Math.round(suggestion.confidence * 100)}%
              </span>
              {suggestion.suggestedTvgId && suggestion.status === 'suggested' && (
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => applyEpgMatch(suggestion.entryId, suggestion.suggestedTvgId!)}
                >
                  {t('Apply')}
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className={styles.diagnosticsSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>{t('Native Stream Diagnostics')}</h2>
            <p className={styles.sectionDescription}>
              {t('Tests streams outside the webview with their configured request headers.')}
            </p>
          </div>
          {isRunning ? (
            <Button variant="danger" size="sm" type="button" onClick={handleStop}>
              <Pause size={14} /> {t('Stop')}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={() => void runHealthCheck()}
              disabled={entries.length === 0}
            >
              <Play size={14} /> {t('Start Check')}
            </Button>
          )}
        </div>
        <div className={styles.diagnosticStats}>
          <span>
            <CheckCircle2 size={16} className={styles.statusSuccess} />
            <strong>{number(onlineCount)}</strong> {t('Online')}
          </span>
          <span>
            <XCircle size={16} className={styles.statusError} />
            <strong>{number(offlineCount)}</strong> {t('Offline')}
          </span>
          <span>
            <ShieldAlert size={16} className={styles.statusWarning} />
            <strong>{number(unauthorizedCount)}</strong> {t('Unauthorized')}
          </span>
          <span>
            <TimerOff size={16} />
            <strong>{number(timeoutCount)}</strong> {t('Timed out')}
          </span>
          <div className={styles.diagnosticScope}>
            <label>
              <input
                type="radio"
                name="healthScope"
                checked={targetScope === 'untested'}
                onChange={() => setTargetScope('untested')}
                disabled={isRunning}
              />{' '}
              {t('Untested only')}
            </label>
            <label>
              <input
                type="radio"
                name="healthScope"
                checked={targetScope === 'all'}
                onChange={() => setTargetScope('all')}
                disabled={isRunning}
              />{' '}
              {t('Re-test all')}
            </label>
          </div>
        </div>
        {isRunning && (
          <div>
            <div className={styles.progressBarWrapper}>
              <div className={styles.progressBarFill} style={{ width: `${progressPercent}%` }} />
            </div>
            <p className={styles.progressLabel}>
              {progressPercent}% · {number(processedCount)} / {number(activeTotal)}
            </p>
          </div>
        )}
        {offlineCount > 0 && !isRunning && (
          <div className={styles.diagnosticActions}>
            <Button variant="danger" size="sm" type="button" onClick={handleDeleteOffline}>
              <Trash2 size={14} /> {t('Delete Offline ({count})', { count: number(offlineCount) })}
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={handleMoveDeadToGroup}>
              <FolderSymlink size={14} /> {t('Move to Dead Streams')}
            </Button>
          </div>
        )}
      </section>

      <section className={styles.diagnosticsSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>{t('Duplicate Review')}</h2>
            <p className={styles.sectionDescription}>
              {t(
                '{exact} exact URL duplicates can be removed safely. {names} same-name groups need manual review.',
                { exact: number(exactDuplicateCount), names: number(nameClusters.length) },
              )}
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            type="button"
            onClick={handleRemoveExactDuplicates}
            disabled={exactDuplicateCount === 0}
          >
            <Trash2 size={14} />{' '}
            {t('Remove Exact Duplicates ({count})', { count: number(exactDuplicateCount) })}
          </Button>
        </div>
        <div className={styles.duplicateList}>
          {duplicateClusters.slice(0, 100).map((cluster) => {
            const clusterKey = `${cluster.type}-${cluster.key}-${cluster.entries.map((entry) => entry.id).join('-')}`;
            return (
              <div key={clusterKey} className={styles.duplicateReviewRow}>
                <div className={styles.duplicateSummary}>
                  <strong>{cluster.entries[0]?.title ?? t('Untitled stream')}</strong>
                  <span>
                    {cluster.signals
                      .map((signal) =>
                        t(
                          signal === 'url'
                            ? 'Same URL'
                            : signal === 'epg'
                              ? 'Same EPG ID'
                              : signal === 'logo'
                                ? 'Same logo'
                                : 'Normalized name',
                        ),
                      )
                      .join(' · ')}
                  </span>
                </div>
                <div className={styles.duplicateChoices}>
                  {cluster.entries.map((entry) => (
                    <label key={entry.id}>
                      <input
                        type="radio"
                        name={clusterKey}
                        checked={
                          (duplicatePrimaries[clusterKey] || cluster.entries[0]?.id) === entry.id
                        }
                        onChange={() =>
                          setDuplicatePrimaries((values) => ({ ...values, [clusterKey]: entry.id }))
                        }
                      />{' '}
                      <span>
                        {entry.title}
                        <small>{entry.tvgId || entry.url}</small>
                      </span>
                    </label>
                  ))}
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  type="button"
                  onClick={() => mergeCluster(clusterKey, cluster.entries)}
                >
                  <Merge size={14} /> {t('Merge Metadata')}
                </Button>
              </div>
            );
          })}
          {duplicateClusters.length === 0 && (
            <p className={styles.emptyNotice}>{t('No duplicates detected.')}</p>
          )}
        </div>
      </section>

      <M3uChannelDetailsDrawer
        isOpen={Boolean(editingEntry)}
        entry={editingEntry}
        existingGroups={existingGroups}
        onClose={() => setEditingEntryId(null)}
        onSave={(updated) => {
          onUpdateEntries(entries.map((entry) => (entry.id === updated.id ? updated : entry)));
          setEditingEntryId(null);
        }}
      />

      {pendingDestructiveAction && (
        <ConfirmDialog
          title={t(
            pendingDestructiveAction === 'offline'
              ? 'Delete offline streams?'
              : 'Remove exact duplicates?',
          )}
          description={t(
            pendingDestructiveAction === 'offline'
              ? 'Every stream currently marked offline will be removed from this draft.'
              : 'Movena will keep the first entry for each identical URL and remove the remaining copies.',
          )}
          confirmLabel={t('Delete')}
          danger
          onConfirm={() => {
            if (pendingDestructiveAction === 'offline') deleteOffline();
            else removeExactDuplicates();
            setPendingDestructiveAction(null);
          }}
          onCancel={() => setPendingDestructiveAction(null)}
        />
      )}
    </div>
  );
}
