import { create } from 'zustand';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { redactDiagnosticText, redactDiagnosticValue } from '@/shared/lib/redact';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogCategory = 'api' | 'player' | 'auth' | 'system' | 'library' | 'search';

/**
 * Ordering for the level filter. The store speaks 'debug' where the setting
 * says 'verbose'; they mean the same thing.
 */
const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function configuredFloor(): LogLevel {
  const configured = useSettingsStore.getState().debugLogLevel;
  return configured === 'verbose' ? 'debug' : configured;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: unknown | undefined;
}

export interface NetworkLogEntry {
  id: string;
  timestamp: number;
  url: string;
  method: string;
  status?: number | undefined;
  durationMs?: number | undefined;
  error?: string | undefined;
  contentType?: string | undefined;
  responseSize?: number | undefined;
  responsePreview?: string | undefined;
}

interface DebugState {
  logs: LogEntry[];
  networkLogs: NetworkLogEntry[];

  addLog: (level: LogLevel, category: LogCategory, message: string, details?: unknown) => void;
  addNetworkLog: (entry: Omit<NetworkLogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  clearNetworkLogs: () => void;
  exportDebugReport: (context?: Record<string, unknown>) => string;
}

export const useDebugStore = create<DebugState>((set, get) => ({
  logs: [
    {
      id: 'init-log',
      timestamp: Date.now(),
      level: 'info',
      category: 'system',
      message: 'Developer Debug Toolkit initialized',
      details: { environment: 'production/desktop', tauri: true },
    },
  ],
  networkLogs: [],

  addLog: (level, category, message, details) => {
    // Honour the configured threshold. The setting existed but nothing read
    // it, so picking "error" still filled the log with everything.
    if (LEVEL_RANK[level] < LEVEL_RANK[configuredFloor()]) return;

    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      level,
      category,
      message: redactDiagnosticText(message),
      details: redactDiagnosticValue(details),
    };
    set((state) => ({
      logs: [entry, ...state.logs].slice(0, 200), // keep latest 200 logs
    }));
  },

  addNetworkLog: (entryData) => {
    const entry: NetworkLogEntry = {
      ...entryData,
      url: redactDiagnosticText(entryData.url),
      error: entryData.error ? redactDiagnosticText(entryData.error) : undefined,
      responsePreview: entryData.responsePreview
        ? (() => {
            try {
              const parsed = JSON.parse(entryData.responsePreview);
              const redacted = redactDiagnosticValue(parsed);
              return JSON.stringify(redacted);
            } catch {
              return redactDiagnosticText(entryData.responsePreview);
            }
          })()
        : undefined,
      id: `net-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
    };
    set((state) => ({
      networkLogs: [entry, ...state.networkLogs].slice(0, 100), // keep latest 100 network logs
    }));
  },

  clearLogs: () => set({ logs: [] }),
  clearNetworkLogs: () => set({ networkLogs: [] }),

  exportDebugReport: (context = {}) => {
    const { logs, networkLogs } = get();
    const levels = logs.reduce<Record<LogLevel, number>>(
      (counts, entry) => ({ ...counts, [entry.level]: counts[entry.level] + 1 }),
      { debug: 0, info: 0, warn: 0, error: 0 },
    );
    const categories = logs.reduce<Partial<Record<LogCategory, number>>>(
      (counts, entry) => ({ ...counts, [entry.category]: (counts[entry.category] ?? 0) + 1 }),
      {},
    );
    const measuredRequests = networkLogs.filter(
      (entry): entry is NetworkLogEntry & { durationMs: number } =>
        typeof entry.durationMs === 'number',
    );
    const report = {
      exportedAt: new Date().toISOString(),
      environment: {
        userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
        language: typeof navigator === 'undefined' ? 'unknown' : navigator.language,
        online: typeof navigator === 'undefined' ? null : navigator.onLine,
      },
      logsCount: logs.length,
      networkLogsCount: networkLogs.length,
      summary: {
        levels,
        categories,
        failedRequests: networkLogs.filter((entry) => entry.error || (entry.status ?? 0) >= 400)
          .length,
        averageRequestMs:
          measuredRequests.length > 0
            ? Math.round(
                measuredRequests.reduce((total, entry) => total + entry.durationMs, 0) /
                  measuredRequests.length,
              )
            : null,
      },
      context,
      logs,
      networkLogs,
    };
    return JSON.stringify(redactDiagnosticValue(report), null, 2);
  },
}));

// Quick helper function for debug logging anywhere in the app
export const debugLog = {
  info: (category: LogCategory, message: string, details?: unknown) =>
    useDebugStore.getState().addLog('info', category, message, details),
  warn: (category: LogCategory, message: string, details?: unknown) =>
    useDebugStore.getState().addLog('warn', category, message, details),
  error: (category: LogCategory, message: string, details?: unknown) =>
    useDebugStore.getState().addLog('error', category, message, details),
  debug: (category: LogCategory, message: string, details?: unknown) =>
    useDebugStore.getState().addLog('debug', category, message, details),
};
