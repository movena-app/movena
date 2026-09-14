import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { desktopApi } from '@/platform/desktop';
import {
  ArrowLeft,
  Save,
  Download,
  Upload,
  Link,
  Tv,
  Layers,
  Activity,
  Code2,
  FolderTree,
  Undo2,
  Redo2,
  History,
} from 'lucide-react';
import {
  parseM3u,
  generateM3u,
  type M3uPlaylist,
  type M3uEntry,
} from '@/modules/sources/public/data/m3uClient';
import { tauriApi } from '@/platform/tauri';
import { useSourceStore } from '@/modules/sources/public/store/useSourceStore';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { notify } from '@/shared/notifications/useNotificationStore';
import { Button, IconButton } from '@/shared/ui/Button';
import { Select } from '@/shared/ui/Select';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { DialogShell } from '@/shared/ui/DialogShell';
import { M3uChannelTable } from './M3uChannelTable';
import { M3uGroupManager } from './M3uGroupManager';
import { type M3uHealthStatuses } from './M3uStreamHealthChecker';
import { M3uDiagnosticsWorkspace } from './M3uDiagnosticsWorkspace';
import { M3uRawCodeEditor, type M3uRawEditorViewState } from './M3uRawCodeEditor';
import { M3uVersionHistoryDialog } from './M3uVersionHistoryDialog';
import { M3uCommandPalette, type M3uEditorCommand } from './M3uCommandPalette';
import { saveM3uVersion } from '../services/m3uVersionHistory';
import { deleteM3uDraft, loadM3uDraft, saveM3uDraft } from '../services/m3uDraftRepository';
import styles from './M3uEditorWorkspace.module.css';
import { useI18n } from '@/shared/i18n/i18n';
import { getErrorMessage } from '@/shared/lib/error';
import {
  emptyPlaylist,
  emptyRawEditorViewState,
  legacyDraftKey,
  playlistSnapshot,
  type EditorMode,
  type PendingAction,
  type PlaylistSnapshot,
} from './m3uEditorController';

interface M3uEditorProps {
  initialSourceId?: string | undefined;
  initialMode?: EditorMode | undefined;
  onClose?: (() => void) | undefined;
}

export function M3uEditor({ initialSourceId, initialMode, onClose }: M3uEditorProps) {
  const { t, number } = useI18n();
  const m3uProfiles = useSourceStore((state) => state.profiles);
  const m3uRuntimes = useSourceStore((state) => state.runtimes);
  const saveEditedSource = useSourceStore((state) => state.saveEditedSource);
  const autosaveDrafts = useSettingsStore((state) => state.m3uEditorAutosaveDrafts);
  const preserveUnknownTags = useSettingsStore((state) => state.m3uPreserveUnknownTags);
  const sidebarWidth = useSettingsStore((state) => state.m3uEditorSidebarWidth);

  const [selectedSourceId, setSelectedSourceId] = useState(() =>
    initialSourceId && m3uProfiles.some((profile) => profile.id === initialSourceId)
      ? initialSourceId
      : m3uProfiles[0]?.id || 'blank',
  );
  const [ephemeralLabel, setEphemeralLabel] = useState('Imported playlist');
  const [activeMode, setActiveMode] = useState<EditorMode>(() => initialMode ?? 'channels');
  const [snapshot, setSnapshot] = useState<PlaylistSnapshot>(emptyPlaylist);
  const [baseline, setBaseline] = useState<PlaylistSnapshot>(emptyPlaylist);
  const [past, setPast] = useState<PlaylistSnapshot[]>([]);
  const [future, setFuture] = useState<PlaylistSnapshot[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [rawDirty, setRawDirty] = useState(false);
  const [rawEditorViewState, setRawEditorViewState] =
    useState<M3uRawEditorViewState>(emptyRawEditorViewState);
  const [isSaving, setIsSaving] = useState(false);
  const [healthStatuses, setHealthStatuses] = useState<M3uHealthStatuses>({});
  const [loadUrlModal, setLoadUrlModal] = useState(false);
  const [remoteUrlInput, setRemoteUrlInput] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const loadedSourceRef = useRef<{ id: string; revision: number } | null>(null);
  const draftLoadGenerationRef = useRef(0);
  const draftSaveWarningRef = useRef(false);

  const persistedSource = m3uProfiles.some((profile) => profile.id === selectedSourceId);
  const currentParseOptions = useCallback(() => {
    const runtime = persistedSource ? m3uRuntimes[selectedSourceId] : undefined;
    return {
      sourceId: persistedSource ? selectedSourceId : 'm3u-import',
      baseUrl: runtime?.baseUrl,
      headers: runtime?.connection?.headers,
    };
  }, [m3uRuntimes, persistedSource, selectedSourceId]);

  const resetSession = useCallback((next: PlaylistSnapshot, dirty = false) => {
    setSnapshot(next);
    setBaseline(next);
    setPast([]);
    setFuture([]);
    setIsDirty(dirty);
    setRawDirty(false);
    setRawEditorViewState(emptyRawEditorViewState());
    setHealthStatuses({});
  }, []);

  const loadSourceContent = useCallback(
    async (sourceId: string) => {
      const generation = ++draftLoadGenerationRef.current;
      if (sourceId === 'blank') {
        resetSession(emptyPlaylist());
        return;
      }
      const runtime = m3uRuntimes[sourceId];
      if (!runtime?.playlist) {
        resetSession(emptyPlaylist());
        return;
      }
      const sourceSnapshot = playlistSnapshot(runtime.playlist);
      if (autosaveDrafts) {
        try {
          let draft = await loadM3uDraft(sourceId);
          const legacy = localStorage.getItem(legacyDraftKey(sourceId));
          if (!draft && legacy) {
            const parsed = JSON.parse(legacy) as {
              content?: unknown | undefined;
              savedAt?: unknown | undefined;
            };
            if (typeof parsed.content === 'string') {
              draft = {
                content: parsed.content,
                savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
              };
              await saveM3uDraft(sourceId, draft);
            }
          }
          localStorage.removeItem(legacyDraftKey(sourceId));
          if (generation !== draftLoadGenerationRef.current) return;
          if (draft) {
            const restored = playlistSnapshot(
              parseM3u(draft.content, {
                sourceId,
                baseUrl: runtime.baseUrl,
                headers: runtime.connection?.headers,
              }),
            );
            setSnapshot(restored);
            setBaseline(sourceSnapshot);
            setPast([]);
            setFuture([]);
            setIsDirty(true);
            setRawDirty(false);
            setHealthStatuses({});
            notify.info('Draft Restored', 'Recovered unsaved playlist changes from this device.');
            return;
          }
        } catch {
          localStorage.removeItem(legacyDraftKey(sourceId));
          await deleteM3uDraft(sourceId).catch(() => {});
        }
      }
      if (generation !== draftLoadGenerationRef.current) return;
      resetSession(sourceSnapshot);
    },
    [autosaveDrafts, m3uRuntimes, resetSession],
  );

  useEffect(() => {
    if (selectedSourceId === 'custom-file' || selectedSourceId === 'custom-url') return;
    const revision = m3uRuntimes[selectedSourceId]?.revision ?? 0;
    const loaded = loadedSourceRef.current;
    if (loaded?.id === selectedSourceId && (isDirty || loaded.revision === revision)) return;
    void loadSourceContent(selectedSourceId);
    loadedSourceRef.current = { id: selectedSourceId, revision };
  }, [isDirty, loadSourceContent, m3uRuntimes, selectedSourceId]);

  const currentM3uContent = useMemo(
    () =>
      generateM3u({
        name: snapshot.name,
        entries: snapshot.entries,
        epgUrls: snapshot.epgUrls,
        extraHeaderAttributes: preserveUnknownTags ? snapshot.extraHeaderAttributes : undefined,
        extraDirectives: preserveUnknownTags ? snapshot.extraDirectives : undefined,
        preserveUnknownTags,
      }),
    [preserveUnknownTags, snapshot],
  );

  useEffect(() => {
    if (!persistedSource) return;
    if (!autosaveDrafts) {
      void deleteM3uDraft(selectedSourceId);
      localStorage.removeItem(legacyDraftKey(selectedSourceId));
      return;
    }
    if (!isDirty) return;
    const timer = window.setTimeout(() => {
      void saveM3uDraft(selectedSourceId, {
        content: currentM3uContent,
        savedAt: Date.now(),
      })
        .then(() => {
          draftSaveWarningRef.current = false;
        })
        .catch((error: unknown) => {
          if (!draftSaveWarningRef.current) {
            draftSaveWarningRef.current = true;
            notify.error(
              'Draft Save Failed',
              getErrorMessage(error, 'Draft storage failed without an error message.'),
            );
          }
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [autosaveDrafts, currentM3uContent, isDirty, persistedSource, selectedSourceId]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty && !rawDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty, rawDirty]);

  const commitSnapshot = useCallback(
    (next: PlaylistSnapshot) => {
      setPast((items) => [...items.slice(-49), snapshot]);
      setSnapshot(next);
      setFuture([]);
      setIsDirty(true);
    },
    [snapshot],
  );

  const handleUpdateEntries = useCallback(
    (entries: M3uEntry[]) => {
      commitSnapshot({ ...snapshot, entries });
    },
    [commitSnapshot, snapshot],
  );

  const handleUndo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [snapshot, ...items].slice(0, 50));
    setSnapshot(previous);
    setIsDirty(true);
  };

  const handleRedo = () => {
    const next = future[0];
    if (!next) return;
    setFuture((items) => items.slice(1));
    setPast((items) => [...items.slice(-49), snapshot]);
    setSnapshot(next);
    setIsDirty(true);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingText =
        target instanceof HTMLElement &&
        target.matches('input, textarea, [contenteditable="true"]');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowCommands(true);
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || editingText) return;
      if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      } else if (
        event.key.toLowerCase() === 'y' ||
        (event.key.toLowerCase() === 'z' && event.shiftKey)
      ) {
        event.preventDefault();
        handleRedo();
      } else if (event.key.toLowerCase() === 's' && isDirty && !rawDirty) {
        event.preventDefault();
        if (persistedSource) setConfirmSave(true);
        else void handleExportFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const stats = useMemo(() => {
    let live = 0;
    let vod = 0;
    let series = 0;
    const groups = new Set<string>();
    for (const entry of snapshot.entries) {
      if (entry.type === 'vod') vod += 1;
      else if (entry.type === 'series') series += 1;
      else live += 1;
      groups.add(entry.groupTitle || 'General');
    }
    return { total: snapshot.entries.length, live, vod, series, groups: groups.size };
  }, [snapshot.entries]);

  const changeSummary = useMemo(() => {
    const before = new Map(baseline.entries.map((entry) => [entry.id, entry]));
    const after = new Map(snapshot.entries.map((entry) => [entry.id, entry]));
    const added = snapshot.entries.filter((entry) => !before.has(entry.id)).length;
    const removed = baseline.entries.filter((entry) => !after.has(entry.id)).length;
    const changed = snapshot.entries.filter((entry) => {
      const original = before.get(entry.id);
      return original && JSON.stringify(original) !== JSON.stringify(entry);
    }).length;
    return { added, removed, changed };
  }, [baseline.entries, snapshot.entries]);

  const requestAction = (action: PendingAction) => {
    if (isDirty || rawDirty) setPendingAction(action);
    else performAction(action);
  };

  const performAction = (action: PendingAction) => {
    const discardingSession = action.type !== 'mode' && (isDirty || rawDirty);
    if (discardingSession) {
      if (selectedSourceId && selectedSourceId !== 'blank') {
        void deleteM3uDraft(selectedSourceId);
        localStorage.removeItem(legacyDraftKey(selectedSourceId));
      }
      resetSession(baseline);
    }

    if (action.type === 'source') {
      setSelectedSourceId(action.sourceId);
    } else if (action.type === 'mode') {
      setRawDirty(false);
      setActiveMode(action.mode);
    } else if (action.type === 'open-file') {
      void handleOpenFile();
    } else if (action.type === 'load-url') {
      setLoadUrlModal(true);
    } else onClose?.();
    setPendingAction(null);
  };

  const handleSelectSource = (sourceId: string) => {
    if (sourceId !== selectedSourceId) requestAction({ type: 'source', sourceId });
  };

  const handleModeChange = (mode: EditorMode) => {
    if (mode === activeMode) return;
    if (rawDirty) setPendingAction({ type: 'mode', mode });
    else setActiveMode(mode);
  };

  const handleApplyRawText = (rawText: string) => {
    try {
      commitSnapshot(playlistSnapshot(parseM3u(rawText, currentParseOptions())));
      setRawDirty(false);
    } catch (error: unknown) {
      notify.error(
        'Parse Error',
        getErrorMessage(error, 'M3U parsing failed without an error message.'),
      );
    }
  };

  const finishImport = (
    playlist: M3uPlaylist,
    sourceId: 'custom-file' | 'custom-url',
    label: string,
  ) => {
    setSelectedSourceId(sourceId);
    loadedSourceRef.current = null;
    setEphemeralLabel(label);
    resetSession(playlistSnapshot(playlist), true);
  };

  const handleOpenFile = async () => {
    try {
      const path = await desktopApi.openPath({
        multiple: false,
        filters: [{ name: 'M3U playlist', extensions: ['m3u', 'm3u8', 'txt'] }],
      });
      if (!path || Array.isArray(path)) return;
      const document = await tauriApi.m3uReadFile(path);
      finishImport(
        parseM3u(document.content, { sourceId: 'm3u-import', baseUrl: document.baseUrl }),
        'custom-file',
        document.fileName || 'Local file',
      );
    } catch (error: unknown) {
      notify.error(
        'File Error',
        getErrorMessage(error, 'Playlist file loading failed without an error message.'),
      );
    }
  };

  const handleFetchUrl = async () => {
    const url = remoteUrlInput.trim();
    if (!url) return;
    try {
      const document = await tauriApi.m3uFetch({ url });
      finishImport(
        parseM3u(document.content, { sourceId: 'm3u-import', baseUrl: document.baseUrl }),
        'custom-url',
        new URL(url).host,
      );
      setLoadUrlModal(false);
      setRemoteUrlInput('');
    } catch (error: unknown) {
      notify.error(
        'URL Fetch Failed',
        getErrorMessage(error, 'Playlist URL fetch failed without an error message.'),
      );
    }
  };

  const handleExportFile = async (content = currentM3uContent) => {
    const fileName = `${snapshot.name?.trim().replace(/[^a-z0-9-]+/gi, '-') || 'playlist'}-${new Date().toISOString().slice(0, 10)}.m3u`;
    try {
      const path = await desktopApi.savePath({
        defaultPath: fileName,
        filters: [{ name: 'M3U playlist', extensions: ['m3u', 'm3u8'] }],
      });
      if (!path || Array.isArray(path)) return;
      await tauriApi.m3uWriteFile(path, content);
      notify.success('Playlist Exported', 'The edited playlist was saved successfully.');
    } catch (error: unknown) {
      notify.error(
        'Export Failed',
        getErrorMessage(error, 'Playlist export failed without an error message.'),
      );
    }
  };

  const handleRequestSaveRawText = (rawText: string): boolean => {
    try {
      commitSnapshot(playlistSnapshot(parseM3u(rawText, currentParseOptions())));
      setRawDirty(false);
      if (persistedSource) setConfirmSave(true);
      else void handleExportFile(rawText);
      return true;
    } catch (error: unknown) {
      notify.error(
        'Parse Error',
        getErrorMessage(error, 'M3U parsing failed without an error message.'),
      );
      return false;
    }
  };

  const handleSaveToSource = async () => {
    if (!persistedSource) {
      await handleExportFile();
      return;
    }
    setIsSaving(true);
    try {
      const baselineContent = generateM3u({
        name: baseline.name,
        entries: baseline.entries,
        epgUrls: baseline.epgUrls,
        extraHeaderAttributes: preserveUnknownTags ? baseline.extraHeaderAttributes : undefined,
        extraDirectives: preserveUnknownTags ? baseline.extraDirectives : undefined,
        preserveUnknownTags,
      });
      await saveM3uVersion({
        sourceId: selectedSourceId,
        content: baselineContent,
        entryCount: baseline.entries.length,
        label: 'Before save',
      }).catch((error: unknown) =>
        notify.error(
          'History Warning',
          getErrorMessage(error, 'Playlist checkpoint storage failed without an error message.'),
        ),
      );
      await saveEditedSource(selectedSourceId, currentM3uContent);
      setBaseline(snapshot);
      setIsDirty(false);
      await deleteM3uDraft(selectedSourceId);
      localStorage.removeItem(legacyDraftKey(selectedSourceId));
      notify.success('Source Updated', 'Changes are saved and available throughout Movena.');
    } catch (error: unknown) {
      notify.error(
        'Save Failed',
        getErrorMessage(error, 'Playlist saving failed without an error message.'),
      );
    } finally {
      setIsSaving(false);
      setConfirmSave(false);
    }
  };

  const sourceOptions = useMemo(() => {
    const options = m3uProfiles.map((profile) => ({
      value: profile.id,
      label: `${profile.name} (${profile.entryCount})`,
    }));
    if (selectedSourceId === 'custom-file' || selectedSourceId === 'custom-url') {
      options.unshift({ value: selectedSourceId, label: ephemeralLabel });
    }
    options.push({ value: 'blank', label: 'Blank playlist' });
    return options;
  }, [ephemeralLabel, m3uProfiles, selectedSourceId]);

  const commands: M3uEditorCommand[] = [
    { id: 'channels', label: 'Show Channels', run: () => handleModeChange('channels') },
    { id: 'categories', label: 'Show Categories', run: () => handleModeChange('groups') },
    { id: 'diagnostics', label: 'Show Diagnostics', run: () => handleModeChange('diagnostics') },
    { id: 'raw', label: 'Show Raw M3U', run: () => handleModeChange('raw') },
    { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', disabled: past.length === 0, run: handleUndo },
    {
      id: 'redo',
      label: 'Redo',
      shortcut: 'Ctrl+Y',
      disabled: future.length === 0,
      run: handleRedo,
    },
    {
      id: 'save',
      label: persistedSource ? 'Review & Save' : 'Export Playlist',
      shortcut: 'Ctrl+S',
      disabled: !isDirty || rawDirty,
      run: () => (persistedSource ? setConfirmSave(true) : void handleExportFile()),
    },
    { id: 'export', label: 'Export Playlist', run: () => void handleExportFile() },
    { id: 'open', label: 'Open File', run: () => requestAction({ type: 'open-file' }) },
    { id: 'url', label: 'Load URL', run: () => requestAction({ type: 'load-url' }) },
    {
      id: 'history',
      label: 'Playlist Version History',
      disabled: !persistedSource,
      run: () => setShowHistory(true),
    },
  ];

  return (
    <div className={styles.editorContainer}>
      <header className={styles.workspaceHeader}>
        <div className={styles.workspaceTitleRow}>
          {onClose && (
            <IconButton
              type="button"
              onClick={() => requestAction({ type: 'close' })}
              aria-label={t('Back to Sources')}
            >
              <ArrowLeft size={16} />
            </IconButton>
          )}
          <div>
            <h1 className={styles.workspaceTitle}>{t('M3U Playlist Editor')}</h1>
            <p className={styles.workspaceSubtitle}>
              {isDirty ? t('Unsaved draft') : t('All changes saved')} · {number(stats.total)}{' '}
              {t('items')}
            </p>
          </div>
        </div>
        <div className={styles.workspaceActions}>
          <IconButton
            type="button"
            onClick={handleUndo}
            disabled={past.length === 0}
            aria-label={t('Undo')}
          >
            <Undo2 size={15} />
          </IconButton>
          <IconButton
            type="button"
            onClick={handleRedo}
            disabled={future.length === 0}
            aria-label={t('Redo')}
          >
            <Redo2 size={15} />
          </IconButton>
          <IconButton
            type="button"
            onClick={() => setShowHistory(true)}
            disabled={!persistedSource}
            aria-label={t('Version history')}
          >
            <History size={15} />
          </IconButton>
          <Button variant="ghost" size="sm" type="button" onClick={() => void handleExportFile()}>
            <Download size={14} /> {t('Export')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="button"
            onClick={() => (persistedSource ? setConfirmSave(true) : void handleExportFile())}
            disabled={!isDirty || isSaving || rawDirty}
          >
            <Save size={14} />{' '}
            {t(persistedSource ? (isSaving ? 'Saving...' : 'Review & Save') : 'Export Playlist')}
          </Button>
        </div>
      </header>

      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <Select
            value={selectedSourceId}
            options={sourceOptions}
            onChange={handleSelectSource}
            width={`${Math.max(156, sidebarWidth - 24)}px`}
            ariaLabel={t('Select source to edit')}
          />
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => requestAction({ type: 'open-file' })}
          >
            <Upload size={13} /> {t('Open File')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => requestAction({ type: 'load-url' })}
          >
            <Link size={13} /> {t('Load URL')}
          </Button>
          <div className={styles.statsBar}>
            <span className={styles.statPill}>
              <Tv size={12} /> {number(stats.live)} {t('live')}
            </span>
            {stats.vod > 0 && (
              <span className={styles.statPill}>
                {number(stats.vod)} {t('movies')}
              </span>
            )}
            {stats.series > 0 && (
              <span className={styles.statPill}>
                {number(stats.series)} {t('series')}
              </span>
            )}
            <span className={styles.statPill}>
              <Layers size={12} /> {number(stats.groups)} {t('groups')}
            </span>
          </div>
        </div>
        <SegmentedControl
          iconOnlyAtCompact
          options={[
            { value: 'channels', label: t('Channels'), icon: Tv },
            { value: 'groups', label: t('Categories'), icon: FolderTree },
            { value: 'diagnostics', label: t('Diagnostics'), icon: Activity },
            { value: 'raw', label: t('Raw M3U'), icon: Code2 },
          ]}
          value={activeMode}
          onChange={handleModeChange}
          ariaLabel={t('Editor view mode')}
        />
      </div>

      <div className={styles.workspaceBody}>
        {snapshot.warnings.length > 0 && (
          <div className={styles.warningBanner} role="status">
            {t('{count} import warnings. Review Raw M3U for line details.', {
              count: number(snapshot.warnings.length),
            })}
          </div>
        )}
        {activeMode === 'channels' && (
          <M3uChannelTable
            entries={snapshot.entries}
            healthStatuses={healthStatuses}
            onUpdateEntries={handleUpdateEntries}
          />
        )}
        {activeMode === 'groups' && (
          <M3uGroupManager entries={snapshot.entries} onUpdateEntries={handleUpdateEntries} />
        )}
        {activeMode === 'diagnostics' && (
          <M3uDiagnosticsWorkspace
            entries={snapshot.entries}
            healthStatuses={healthStatuses}
            onUpdateHealthStatuses={setHealthStatuses}
            onUpdateEntries={handleUpdateEntries}
            parserWarnings={snapshot.warnings}
            sourceId={persistedSource ? selectedSourceId : undefined}
          />
        )}
        {activeMode === 'raw' && (
          <M3uRawCodeEditor
            rawContent={currentM3uContent}
            knownEntryCount={snapshot.entries.length}
            warnings={snapshot.warnings}
            onApplyRawText={handleApplyRawText}
            onRequestSave={handleRequestSaveRawText}
            onDirtyChange={setRawDirty}
            viewState={rawEditorViewState}
            onViewStateChange={setRawEditorViewState}
          />
        )}
      </div>

      {loadUrlModal && (
        <DialogShell
          onClose={() => setLoadUrlModal(false)}
          className={styles.modalDialog}
          ariaLabel={t('Load from URL')}
          initialFocusSelector="input"
        >
          <div className={styles.modalHeader}>
            <h2 className={styles.drawerHeaderTitle}>{t('Load Playlist from URL')}</h2>
          </div>
          <div className={styles.modalBody}>
            <label className={styles.formGroup} htmlFor="m3u-remote-url-input">
              <span className={styles.formLabel}>{t('Playlist URL')}</span>
              <input
                id="m3u-remote-url-input"
                type="url"
                className="uiField"
                value={remoteUrlInput}
                onChange={(event) => setRemoteUrlInput(event.target.value)}
                placeholder="https://example.com/playlist.m3u"
                autoFocus
              />
            </label>
          </div>
          <div className={styles.modalFooter}>
            <Button variant="ghost" type="button" onClick={() => setLoadUrlModal(false)}>
              {t('Cancel')}
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={() => void handleFetchUrl()}
              disabled={!remoteUrlInput.trim()}
            >
              {t('Load Playlist')}
            </Button>
          </div>
        </DialogShell>
      )}

      {pendingAction && (
        <ConfirmDialog
          title={t(rawDirty ? 'Discard unapplied Raw M3U changes?' : 'Discard unsaved edits?')}
          description={t(
            'The current draft has changes that have not been saved. This action cannot be undone after leaving the workspace.',
          )}
          confirmLabel={t('Discard Changes')}
          danger
          onConfirm={() => performAction(pendingAction)}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {confirmSave && (
        <ConfirmDialog
          title={t('Save playlist changes?')}
          description={t(
            '{added} added, {changed} changed, and {removed} removed. Movena will update the source cache and refresh its catalogue.',
            {
              added: number(changeSummary.added),
              changed: number(changeSummary.changed),
              removed: number(changeSummary.removed),
            },
          )}
          confirmLabel={t('Save Changes')}
          onConfirm={() => void handleSaveToSource()}
          onCancel={() => setConfirmSave(false)}
        />
      )}

      {showHistory && persistedSource && (
        <M3uVersionHistoryDialog
          sourceId={selectedSourceId}
          currentContent={currentM3uContent}
          entryCount={snapshot.entries.length}
          onRestore={(content) => {
            try {
              commitSnapshot(playlistSnapshot(parseM3u(content, currentParseOptions())));
              notify.success(
                'Version Restored',
                'The selected checkpoint is now an unsaved editor draft.',
              );
            } catch (error: unknown) {
              notify.error(
                'Restore Failed',
                getErrorMessage(
                  error,
                  'Playlist checkpoint parsing failed without an error message.',
                ),
              );
            }
          }}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showCommands && (
        <M3uCommandPalette commands={commands} onClose={() => setShowCommands(false)} />
      )}
    </div>
  );
}
