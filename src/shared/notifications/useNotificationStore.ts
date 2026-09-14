import { create } from 'zustand';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';
export type NotificationCategory = 'playback' | 'connection' | 'library' | 'downloads' | 'dev';

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  category?: NotificationCategory | undefined;
  title: string;
  message?: string | undefined;
  duration?: number | undefined; // duration in ms, default from settings
  action?: NotificationAction | undefined;
  timestamp: number;
}

interface NotificationState {
  notifications: NotificationItem[];
  addNotification: (notification: Omit<NotificationItem, 'id' | 'timestamp'>) => string;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

interface NotificationPreferences {
  enableNotifications: boolean;
  notifySound: boolean;
  toastDurationSecs: number;
  dndDuringPlayback: boolean;
  notifyPlaybackEvents: boolean;
  notifyConnectionStatus: boolean;
  notifyLibraryUpdates: boolean;
  notifyDownloadEvents: boolean;
}

export interface NotificationRuntime {
  getPreferences: () => NotificationPreferences;
  isPlaybackActive: () => boolean;
}

const defaultPreferences: NotificationPreferences = {
  enableNotifications: true,
  notifySound: false,
  toastDurationSecs: 4.5,
  dndDuringPlayback: true,
  notifyPlaybackEvents: true,
  notifyConnectionStatus: true,
  notifyLibraryUpdates: true,
  notifyDownloadEvents: true,
};

let notificationRuntime: NotificationRuntime = {
  getPreferences: () => defaultPreferences,
  isPlaybackActive: () => false,
};

/** App composition injects runtime preferences without coupling shared toast
 * infrastructure to product stores. */
export function configureNotificationRuntime(runtime: NotificationRuntime): void {
  notificationRuntime = runtime;
}

let sharedAudioCtx: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (
      window as Window & {
        webkitAudioContext?: typeof AudioContext | undefined;
      }
    ).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

function playNotificationChime(type: NotificationType) {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const freq = type === 'error' ? 330 : type === 'warning' ? 440 : 587.33;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  } catch {
    /* AudioContext unavailable or suspended */
  }
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],

  addNotification: (notification) => {
    const settings = notificationRuntime.getPreferences();

    // 1. Global Enable Check
    if (!settings.enableNotifications) {
      return '';
    }

    // Do this before creating a toast or chime. Filtering only in the visual
    // container still played audio for a notification the user explicitly
    // asked not to be disturbed by.
    if (
      settings.dndDuringPlayback &&
      notificationRuntime.isPlaybackActive() &&
      notification.type !== 'error'
    ) {
      return '';
    }

    // 2. Category Filter Checks
    if (notification.category === 'playback' && !settings.notifyPlaybackEvents) return '';
    if (notification.category === 'connection' && !settings.notifyConnectionStatus) return '';
    if (notification.category === 'library' && !settings.notifyLibraryUpdates) return '';
    if (notification.category === 'downloads' && !settings.notifyDownloadEvents) return '';

    // 3. Audio Chime Playback
    if (settings.notifySound) {
      playNotificationChime(notification.type);
    }

    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const defaultDurationMs = Math.round(settings.toastDurationSecs * 1000);

    const newToast: NotificationItem = {
      ...notification,
      id,
      duration: notification.duration ?? defaultDurationMs,
      timestamp: Date.now(),
    };

    set((state) => ({
      // Keep up to 6 most recent notifications
      notifications: [newToast, ...state.notifications].slice(0, 6),
    }));

    return id;
  },

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((item) => item.id !== id),
    })),

  clearAll: () => set({ notifications: [] }),
}));

// Convenient shorthand helper object
export const notify = {
  success: (
    title: string,
    message?: string,
    duration?: number,
    action?: NotificationAction,
    category?: NotificationCategory,
  ) =>
    useNotificationStore
      .getState()
      .addNotification({ type: 'success', title, message, duration, action, category }),

  error: (
    title: string,
    message?: string,
    duration?: number,
    action?: NotificationAction,
    category?: NotificationCategory,
  ) =>
    useNotificationStore.getState().addNotification({
      type: 'error',
      title,
      message,
      duration: duration ?? 6000,
      action,
      category,
    }),

  warning: (
    title: string,
    message?: string,
    duration?: number,
    action?: NotificationAction,
    category?: NotificationCategory,
  ) =>
    useNotificationStore
      .getState()
      .addNotification({ type: 'warning', title, message, duration, action, category }),

  info: (
    title: string,
    message?: string,
    duration?: number,
    action?: NotificationAction,
    category?: NotificationCategory,
  ) =>
    useNotificationStore
      .getState()
      .addNotification({ type: 'info', title, message, duration, action, category }),

  dismiss: (id: string) => useNotificationStore.getState().removeNotification(id),

  clear: () => useNotificationStore.getState().clearAll(),
};
