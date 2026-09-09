import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
} from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  RefreshCw,
  Replace,
  Search,
  WandSparkles,
  X,
} from 'lucide-react';
import { generateM3u, parseM3u } from '@/modules/sources/public/data/m3uClient';
import { parseM3uAsync } from '../services/m3uParser';
import { Button } from '@/shared/ui/Button';
import { notify } from '@/shared/notifications/useNotificationStore';
import { getErrorMessage } from '@/shared/lib/error';
import styles from './M3uEditorWorkspace.module.css';
import { useI18n } from '@/shared/i18n/i18n';

export interface M3uRawEditorViewState {
  selectionStart: number;
  selectionEnd: number;
  scrollTop: number;
  scrollLeft: number;
}

interface M3uRawCodeEditorProps {
  rawContent: string;
  knownEntryCount?: number | undefined;
  warnings?: string[] | undefined;
  onApplyRawText: (newRawText: string) => void;
  onRequestSave?: ((newRawText: string) => boolean) | undefined;
  onDirtyChange?: ((dirty: boolean) => void) | undefined;
  onSyncFromVisual?: (() => void) | undefined;
  viewState?: M3uRawEditorViewState | undefined;
  onViewStateChange?: ((viewState: M3uRawEditorViewState) => void) | undefined;
}

const attributePattern = /([\w-]+)(=)("[^"]*"|'[^']*'|[^\s,]+)/g;
const DEFAULT_LINE_HEIGHT = 20.8;
const DEFAULT_VIEWPORT_HEIGHT = 800;
const VISIBLE_LINE_OVERSCAN = 8;
const VIEW_STATE_SYNC_DELAY_MS = 120;

interface RawDocumentIndex {
  lines: string[];
  lineStarts: number[];
}

interface RawEditorViewport {
  height: number;
  lineHeight: number;
  scrollLeft: number;
  scrollTop: number;
}

function indexRawDocument(text: string): RawDocumentIndex {
  const lines = text.split('\n');
  const lineStarts = new Array<number>(lines.length);
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    lineStarts[index] = offset;
    offset += (lines[index]?.length ?? 0) + 1;
  }
  return { lines, lineStarts };
}

function lineIndexAtOffset(lineStarts: number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if ((lineStarts[middle] ?? 0) <= offset) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(0, high);
}

function warningLine(warning: string, lineCount: number): number | null {
  const lineMatch = /line\s+(\d+)/i.exec(warning);
  if (lineMatch) return Number(lineMatch[1]);
  return /final playlist entry/i.test(warning) ? lineCount : null;
}

function renderAttributes(value: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  attributePattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = attributePattern.exec(value))) {
    if (match.index > cursor) nodes.push(value.slice(cursor, match.index));
    nodes.push(
      <span className={styles.rawAttribute} key={`${match.index}-name`}>
        {match[1]}
      </span>,
    );
    nodes.push(
      <span className={styles.rawPunctuation} key={`${match.index}-equals`}>
        {match[2]}
      </span>,
    );
    nodes.push(
      <span className={styles.rawAttributeValue} key={`${match.index}-value`}>
        {match[3]}
      </span>,
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

const M3uSyntaxHighlight = memo(function M3uSyntaxHighlight({
  endLine,
  lines,
  offsetTop,
  scrollLeft,
  startLine,
}: {
  endLine: number;
  lines: string[];
  offsetTop: number;
  scrollLeft: number;
  startLine: number;
}) {
  return (
    <pre
      className={styles.rawHighlight}
      style={{ transform: `translate(${-scrollLeft}px, ${offsetTop}px)` }}
      aria-hidden="true"
    >
      {lines.slice(startLine, endLine).map((line, visibleIndex) => {
        const index = startLine + visibleIndex;
        const directive = /^(#[A-Z0-9-]+)(:?)(.*)$/i.exec(line);
        if (directive) {
          return (
            <span className={styles.rawHighlightLine} key={`${index}-${line}`}>
              <span className={styles.rawDirective}>{directive[1]}</span>
              <span className={styles.rawPunctuation}>{directive[2]}</span>
              {renderAttributes(directive[3] ?? '')}
              {'\n'}
            </span>
          );
        }
        if (/^(?:https?|rtmp|rtsp|udp|file):/i.test(line)) {
          return (
            <span className={styles.rawHighlightLine} key={`${index}-${line}`}>
              <span className={styles.rawUrl}>{line}</span>
              {'\n'}
            </span>
          );
        }
        return (
          <span className={styles.rawHighlightLine} key={`${index}-${line}`}>
            {line}
            {'\n'}
          </span>
        );
      })}
    </pre>
  );
});

const M3uVisibleLineNumbers = memo(function M3uVisibleLineNumbers({
  endLine,
  offsetTop,
  startLine,
  warningLines,
}: {
  endLine: number;
  offsetTop: number;
  startLine: number;
  warningLines: Set<number>;
}) {
  return (
    <div
      className={styles.rawLineNumberViewport}
      style={{ transform: `translateY(${offsetTop}px)` }}
    >
      {Array.from({ length: endLine - startLine }, (_, visibleIndex) => {
        const line = startLine + visibleIndex + 1;
        return (
          <span
            className={warningLines.has(line) ? styles.rawWarningLineNumber : undefined}
            data-raw-line-number
            key={line}
          >
            {line}
          </span>
        );
      })}
    </div>
  );
});

export function M3uRawCodeEditor({
  rawContent,
  knownEntryCount,
  warnings = [],
  onApplyRawText,
  onRequestSave,
  onDirtyChange,
  onSyncFromVisual,
  viewState,
  onViewStateChange,
}: M3uRawCodeEditorProps) {
  const { t, number } = useI18n();
  const [text, setText] = useState(rawContent);
  const [copied, setCopied] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [liveWarnings, setLiveWarnings] = useState<string[]>([]);
  const [parsedEntryCount, setParsedEntryCount] = useState<number | null>(knownEntryCount ?? null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [formatPreview, setFormatPreview] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1, selectionLength: 0 });
  const [viewport, setViewport] = useState<RawEditorViewport>({
    height: DEFAULT_VIEWPORT_HEIGHT,
    lineHeight: DEFAULT_LINE_HEIGHT,
    scrollLeft: viewState?.scrollLeft ?? 0,
    scrollTop: viewState?.scrollTop ?? 0,
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const latestViewStateRef = useRef<M3uRawEditorViewState>(
    viewState ?? { selectionStart: 0, selectionEnd: 0, scrollTop: 0, scrollLeft: 0 },
  );
  const onViewStateChangeRef = useRef(onViewStateChange);
  const viewStateTimerRef = useRef<number | null>(null);
  const viewportFrameRef = useRef<number | null>(null);

  useEffect(() => {
    setText(rawContent);
    setParseError(null);
    setFormatPreview(null);
    setLiveWarnings([]);
    setParsedEntryCount(knownEntryCount ?? null);
  }, [knownEntryCount, rawContent]);

  useEffect(() => {
    onViewStateChangeRef.current = onViewStateChange;
  }, [onViewStateChange]);

  useEffect(() => {
    const editor = textareaRef.current;
    if (!editor || !viewState) return;
    editor.setSelectionRange(viewState.selectionStart, viewState.selectionEnd);
    editor.scrollTop = viewState.scrollTop;
    editor.scrollLeft = viewState.scrollLeft;
    latestViewStateRef.current = viewState;
    setViewport((current) => ({
      ...current,
      scrollTop: viewState.scrollTop,
      scrollLeft: viewState.scrollLeft,
    }));
  }, [viewState]);

  useEffect(() => {
    const editor = textareaRef.current;
    if (!editor) return;
    const updateMeasurements = () => {
      const measuredLineHeight = Number.parseFloat(window.getComputedStyle(editor).lineHeight);
      setViewport((current) => ({
        ...current,
        height: editor.clientHeight || current.height,
        lineHeight: Number.isFinite(measuredLineHeight) ? measuredLineHeight : current.lineHeight,
      }));
    };
    updateMeasurements();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateMeasurements);
    observer.observe(editor);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (viewStateTimerRef.current !== null) window.clearTimeout(viewStateTimerRef.current);
      if (viewportFrameRef.current !== null) window.cancelAnimationFrame(viewportFrameRef.current);
      onViewStateChangeRef.current?.(latestViewStateRef.current);
    },
    [],
  );

  useEffect(() => {
    if (findOpen) findInputRef.current?.focus();
  }, [findOpen]);

  const isModified = text !== rawContent;
  const documentIndex = useMemo(() => indexRawDocument(text), [text]);
  const lineCount = text ? documentIndex.lines.length : 0;
  const renderedLineCount = Math.max(1, documentIndex.lines.length);
  const startLine = Math.max(
    0,
    Math.floor(viewport.scrollTop / viewport.lineHeight) - VISIBLE_LINE_OVERSCAN,
  );
  const endLine = Math.min(
    renderedLineCount,
    Math.ceil((viewport.scrollTop + viewport.height) / viewport.lineHeight) + VISIBLE_LINE_OVERSCAN,
  );
  const visibleOffsetTop = startLine * viewport.lineHeight - viewport.scrollTop;
  const allWarnings = useMemo(
    () => [...new Set([...warnings, ...liveWarnings])],
    [liveWarnings, warnings],
  );
  const warningLines = useMemo(
    () =>
      new Set(
        allWarnings
          .map((warning) => warningLine(warning, lineCount))
          .filter((line): line is number => line !== null),
      ),
    [allWarnings, lineCount],
  );
  const matches = useMemo(() => {
    const query = findQuery.trim().toLocaleLowerCase();
    if (!query) return [];
    const lowerText = text.toLocaleLowerCase();
    const values: number[] = [];
    for (let start = 0; start < lowerText.length;) {
      const match = lowerText.indexOf(query, start);
      if (match < 0) break;
      values.push(match);
      start = match + query.length;
    }
    return values;
  }, [findQuery, text]);

  useEffect(() => {
    onDirtyChange?.(isModified);
    return () => onDirtyChange?.(false);
  }, [isModified, onDirtyChange]);

  useEffect(() => {
    if (!isModified && knownEntryCount !== undefined) {
      setParseError(null);
      setLiveWarnings([]);
      setParsedEntryCount(knownEntryCount);
      return;
    }
    let active = true;
    const timer = window.setTimeout(
      () => {
        void parseM3uAsync(text)
          .then((playlist) => {
            if (!active) return;
            setParseError(null);
            setLiveWarnings(playlist.warnings);
            setParsedEntryCount(playlist.entries.length);
          })
          .catch((error: unknown) => {
            if (!active) return;
            setParseError(getErrorMessage(error, t('Invalid M3U format')));
            setLiveWarnings([]);
            setParsedEntryCount(null);
          });
      },
      isModified ? 500 : 100,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isModified, knownEntryCount, t, text]);

  const scheduleViewStateSync = () => {
    if (viewStateTimerRef.current !== null) window.clearTimeout(viewStateTimerRef.current);
    viewStateTimerRef.current = window.setTimeout(() => {
      viewStateTimerRef.current = null;
      onViewStateChangeRef.current?.(latestViewStateRef.current);
    }, VIEW_STATE_SYNC_DELAY_MS);
  };

  const syncViewState = () => {
    const editor = textareaRef.current;
    if (!editor) return;
    const lineIndex = lineIndexAtOffset(documentIndex.lineStarts, editor.selectionStart);
    setCursor({
      line: lineIndex + 1,
      column: editor.selectionStart - (documentIndex.lineStarts[lineIndex] ?? 0) + 1,
      selectionLength: editor.selectionEnd - editor.selectionStart,
    });
    latestViewStateRef.current = {
      selectionStart: editor.selectionStart,
      selectionEnd: editor.selectionEnd,
      scrollTop: editor.scrollTop,
      scrollLeft: editor.scrollLeft,
    };
    scheduleViewStateSync();
  };

  const handleEditorScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    const editor = event.currentTarget;
    latestViewStateRef.current = {
      selectionStart: editor.selectionStart,
      selectionEnd: editor.selectionEnd,
      scrollTop: editor.scrollTop,
      scrollLeft: editor.scrollLeft,
    };
    scheduleViewStateSync();
    if (viewportFrameRef.current !== null) return;
    viewportFrameRef.current = window.requestAnimationFrame(() => {
      viewportFrameRef.current = null;
      const currentEditor = textareaRef.current;
      if (!currentEditor) return;
      setViewport((current) => ({
        ...current,
        height: currentEditor.clientHeight || current.height,
        scrollLeft: currentEditor.scrollLeft,
        scrollTop: currentEditor.scrollTop,
      }));
    });
  };

  const applyText = (): boolean => {
    try {
      const playlist = parseM3u(text);
      setParseError(null);
      onApplyRawText(text);
      notify.success('M3U Applied', `${playlist.entries.length} channels parsed successfully.`);
      return true;
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Invalid M3U format');
      setParseError(message);
      notify.error('M3U Parse Error', message);
      return false;
    }
  };

  const selectMatch = (direction: 1 | -1) => {
    if (matches.length === 0) return;
    const editor = textareaRef.current;
    const current = editor?.selectionStart ?? 0;
    const match =
      direction === 1
        ? (matches.find((value) => value > current) ?? matches[0])
        : ([...matches].reverse().find((value) => value < current) ?? matches.at(-1)!);
    if (match === undefined) return;
    editor?.focus();
    editor?.setSelectionRange(match, match + findQuery.trim().length);
    syncViewState();
  };

  const replaceCurrent = () => {
    const editor = textareaRef.current;
    if (!editor || !findQuery.trim()) return;
    const selection = text.slice(editor.selectionStart, editor.selectionEnd).toLocaleLowerCase();
    if (selection !== findQuery.trim().toLocaleLowerCase()) {
      selectMatch(1);
      return;
    }
    const caret = editor.selectionStart + replaceQuery.length;
    setText(
      `${text.slice(0, editor.selectionStart)}${replaceQuery}${text.slice(editor.selectionEnd)}`,
    );
    window.requestAnimationFrame(() => {
      editor.setSelectionRange(caret, caret);
      syncViewState();
    });
  };

  const replaceAll = () => {
    if (!findQuery.trim() || matches.length === 0) return;
    const escaped = findQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    setText((current) => current.replace(new RegExp(escaped, 'gi'), replaceQuery));
    notify.info('Replaced', `${matches.length} matches updated.`);
  };

  const previewFormatting = () => {
    try {
      const playlist = parseM3u(text);
      setParseError(null);
      setFormatPreview(
        generateM3u({
          name: playlist.name,
          epgUrls: playlist.epgUrls,
          entries: playlist.entries,
          extraHeaderAttributes: playlist.extraHeaderAttributes,
          extraDirectives: playlist.extraDirectives,
          preserveUnknownTags: true,
        }),
      );
    } catch (error: unknown) {
      setParseError(getErrorMessage(error, t('Invalid M3U format')));
    }
  };

  const jumpToLine = (line: number) => {
    const editor = textareaRef.current;
    if (!editor) return;
    const lineIndex = Math.max(0, Math.min(documentIndex.lines.length - 1, line - 1));
    const start = documentIndex.lineStarts[lineIndex] ?? 0;
    editor.focus();
    editor.setSelectionRange(start, start + (documentIndex.lines[lineIndex]?.length ?? 0));
    editor.scrollTop = Math.max(
      0,
      (editor.scrollHeight / Math.max(1, lineCount)) * Math.max(0, line - 3),
    );
    setViewport((current) => ({ ...current, scrollTop: editor.scrollTop }));
    syncViewState();
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLocaleLowerCase();
    if (key === 'f' || key === 'h') {
      event.preventDefault();
      setFindOpen(true);
    } else if (key === 'enter') {
      event.preventDefault();
      applyText();
    } else if (key === 's') {
      event.preventDefault();
      if (onRequestSave) onRequestSave(text);
      else applyText();
    }
  };

  return (
    <div className={styles.rawEditorWrapper}>
      <div className={styles.rawToolbar}>
        <div className={styles.rawToolbarMeta}>
          <span>
            {t('{lines} lines · {chars} KB', {
              lines: number(lineCount),
              chars: number(Math.round(text.length / 1024)),
            })}
          </span>
          {isModified && <span className={styles.rawModified}>{t('Unapplied changes')}</span>}
        </div>
        <div className={styles.rawToolbarActions}>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => setFindOpen((open) => !open)}
            aria-expanded={findOpen}
            aria-controls="m3u-raw-find-replace"
          >
            <Search size={13} /> {t('Find')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={previewFormatting}
            disabled={!text.trim()}
          >
            <WandSparkles size={13} /> {t('Format')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => {
              onSyncFromVisual?.();
              setText(rawContent);
            }}
            disabled={!isModified && !onSyncFromVisual}
          >
            <RefreshCw size={13} /> {t('Restore')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(text);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {t(copied ? 'Copied' : 'Copy')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="button"
            onClick={applyText}
            disabled={!isModified}
          >
            {t('Apply Changes')}
          </Button>
        </div>
      </div>

      {findOpen && (
        <div
          id="m3u-raw-find-replace"
          className={styles.rawFindReplace}
          role="search"
          aria-label={t('Find and replace')}
        >
          <label className={styles.rawFindField}>
            <span>{t('Find')}</span>
            <input
              ref={findInputRef}
              className="uiField"
              value={findQuery}
              onChange={(event) => setFindQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') selectMatch(event.shiftKey ? -1 : 1);
              }}
            />
          </label>
          <span className={styles.rawMatchCount}>
            {number(matches.length)} {t('matches')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => selectMatch(-1)}
            disabled={matches.length === 0}
            aria-label={t('Previous match')}
          >
            <ChevronUp size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => selectMatch(1)}
            disabled={matches.length === 0}
            aria-label={t('Next match')}
          >
            <ChevronDown size={14} />
          </Button>
          <label className={styles.rawFindField}>
            <span>{t('Replace')}</span>
            <input
              className="uiField"
              value={replaceQuery}
              onChange={(event) => setReplaceQuery(event.target.value)}
            />
          </label>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={replaceCurrent}
            disabled={matches.length === 0}
          >
            <Replace size={13} /> {t('Replace')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={replaceAll}
            disabled={matches.length === 0}
          >
            {t('Replace All')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => setFindOpen(false)}
            aria-label={t('Close find and replace')}
          >
            <X size={14} />
          </Button>
        </div>
      )}

      {formatPreview && (
        <div className={styles.rawFormatPreview} role="region" aria-label={t('Formatting preview')}>
          <div className={styles.rawFormatPreviewHeader}>
            <div>
              <strong>{t('Formatting preview')}</strong>
              <span>{t('Review the canonical output before replacing your raw text.')}</span>
            </div>
            <div className={styles.rawToolbarActions}>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setFormatPreview(null)}
              >
                {t('Cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="button"
                onClick={() => {
                  setText(formatPreview);
                  setFormatPreview(null);
                }}
              >
                {t('Use Formatting')}
              </Button>
            </div>
          </div>
          <pre className={styles.rawFormatPreviewCode}>{formatPreview}</pre>
        </div>
      )}

      {parseError && (
        <div className={styles.rawParseError} role="alert">
          {parseError}
        </div>
      )}
      {!parseError && allWarnings.length > 0 && (
        <div className={styles.rawWarnings} role="status">
          {allWarnings.slice(0, 5).map((warning, index) => {
            const line = warningLine(warning, lineCount);
            return line ? (
              <button
                className={styles.rawWarning}
                type="button"
                key={`${index}-${warning}`}
                onClick={() => jumpToLine(line)}
              >
                {warning}
              </button>
            ) : (
              <span key={`${index}-${warning}`}>{warning}</span>
            );
          })}
          {allWarnings.length > 5 && (
            <span>{t('+ {count} more warnings', { count: number(allWarnings.length - 5) })}</span>
          )}
        </div>
      )}

      <div className={styles.rawEditorSurface}>
        <div className={styles.rawLineNumbers} aria-hidden="true">
          <M3uVisibleLineNumbers
            endLine={endLine}
            offsetTop={visibleOffsetTop}
            startLine={startLine}
            warningLines={warningLines}
          />
        </div>
        <div className={styles.rawCodeStack}>
          <M3uSyntaxHighlight
            endLine={endLine}
            lines={documentIndex.lines}
            offsetTop={visibleOffsetTop}
            scrollLeft={viewport.scrollLeft}
            startLine={startLine}
          />
          <textarea
            ref={textareaRef}
            className={`${styles.rawTextarea} subtle-scrollbar`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onSelect={syncViewState}
            onKeyUp={syncViewState}
            onClick={syncViewState}
            onKeyDown={handleEditorKeyDown}
            onScroll={handleEditorScroll}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label={t('Raw M3U Code')}
          />
        </div>
      </div>

      <footer className={styles.rawStatusBar}>
        <span>
          {t('Line {line}, column {column}', {
            line: number(cursor.line),
            column: number(cursor.column),
          })}
        </span>
        {cursor.selectionLength > 0 && (
          <span>
            {number(cursor.selectionLength)} {t('selected')}
          </span>
        )}
        <span>
          {parsedEntryCount === null
            ? t('Checking playlist…')
            : t('{count} channels parsed', { count: number(parsedEntryCount) })}
        </span>
        <span>{t('Ctrl+F Find · Ctrl+H Replace · Ctrl+Enter Apply · Ctrl+S Save')}</span>
      </footer>
    </div>
  );
}
