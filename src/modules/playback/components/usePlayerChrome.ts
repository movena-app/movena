import { useCallback, useEffect, useRef } from 'react';
import { desktopApi } from '@/platform/desktop';
import { tauriApi } from '@/platform/tauri';
import { usePlayerStore } from '../store/usePlayerStore';

/** Idle time before the controls and the pointer step out of the way. */
const IDLE_MS = 3000;

/**
 * Owns when the player chrome is visible, and keeps the pointer in step with it.
 *
 * Everything that reveals the chrome runs through `reveal`, and one predicate
 * decides whether it may hide again — previously the rules were spread across
 * the mouse handler and the timer callback, so cases like "a menu is open" or
 * "the pointer is resting on the controls" were only half covered.
 *
 * The pointer is hidden natively rather than with `cursor: none`. That CSS stops
 * WebKit delivering further mouse-move events, which removes the only signal
 * that could bring the pointer back; AppKit's equivalent is restored by macOS
 * itself on the next movement, so it cannot strand anyone. On platforms with no
 * native path the backend reports so and this falls back to CSS.
 */
export function usePlayerChrome(isActive: boolean) {
  const idleTimer = useRef<number | null>(null);
  const pointerOverChrome = useRef(false);
  const cursorHidden = useRef(false);
  const nativeCursor = useRef<boolean | null>(null);
  const isFullscreen = usePlayerStore((state) => state.isFullscreen);

  const setCursorHidden = useCallback(async (hidden: boolean) => {
    if (cursorHidden.current === hidden) return;
    cursorHidden.current = hidden;
    try {
      const handled = await tauriApi.playerSetCursorHidden(hidden);
      nativeCursor.current = handled;
    } catch {
      nativeCursor.current = false;
    }
  }, []);

  /** Whether the chrome is allowed to disappear right now. */
  const mayHide = useCallback(() => {
    const state = usePlayerStore.getState();
    return (
      state.isPlaying &&
      // `isPlaying` goes true the moment `playStream` is called, well before
      // mpv has actually decoded a frame — without this, the title and close
      // button could fade away 3s into a still-loading VOD or channel switch,
      // leaving nothing but the bare spinner on screen with no way to tell
      // what's loading or back out short of Esc. Also keeps the chrome up
      // through a later rebuffer, not just the initial load.
      (state.isVideoReady || Boolean(state.activeStream?.radio)) &&
      !state.isBuffering &&
      !state.activePopover &&
      !state.showEpisodesDrawer &&
      !state.showChannelsDrawer &&
      !pointerOverChrome.current
    );
  }, []);

  const reveal = useCallback(() => {
    usePlayerStore.getState().setShowControls(true);
    void setCursorHidden(false);

    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      if (!mayHide()) {
        // Not a good moment — look again rather than dropping the schedule,
        // otherwise the chrome would stay up until the next mouse move.
        reveal();
        return;
      }
      // The bars lose pointer-events as they fade, so a matching mouseleave is
      // not guaranteed — clear the flag here rather than trust one to arrive.
      pointerOverChrome.current = false;
      usePlayerStore.getState().setShowControls(false);
      void setCursorHidden(true);
    }, IDLE_MS);
  }, [mayHide, setCursorHidden]);

  /** Call from the controls container so resting on it keeps it up. */
  const setPointerOverChrome = useCallback(
    (over: boolean) => {
      pointerOverChrome.current = over;
      if (over) reveal();
    },
    [reveal],
  );

  // The window itself moves and resizes on a fullscreen transition (macOS
  // grows it to the screen's frame; other platforms hand it to the OS). A
  // window changing shape under a *stationary* pointer is not pointer motion,
  // so WebKit/Chromium never synthesize the mouseenter/mouseleave that would
  // normally keep `pointerOverChrome` honest — it simply keeps whatever value
  // it had before the transition, right or wrong. Wrongly stuck `true` means
  // `mayHide` can never pass, and `reveal`'s own timeout keeps re-arming
  // itself forever: the chrome and pointer stop hiding for the rest of the
  // session. Dropping the assumption on every transition costs at most one
  // extra hide/show cycle if it guessed wrong — the next real mouse move
  // corrects it immediately via a genuine enter/leave event.
  useEffect(() => {
    pointerOverChrome.current = false;
    if (isActive) reveal();
  }, [isActive, isFullscreen, reveal]);

  useEffect(() => {
    if (!isActive) return;

    reveal();
    const onActivity = () => reveal();

    // Movement, clicks and keys all count as "someone is here".
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('mousedown', onActivity);
    window.addEventListener('keydown', onActivity);

    // The DOM stops seeing mouse-moves while the pointer is hidden, so the
    // backend watches the pointer during exactly that window and says when it
    // stirs. Without this, only a click could bring the controls back.
    const unlisten = desktopApi.onPointerMoved(onActivity);

    return () => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('mousedown', onActivity);
      window.removeEventListener('keydown', onActivity);
      void unlisten.then((off) => off());
      if (idleTimer.current) clearTimeout(idleTimer.current);
      // Never leave the pointer hidden behind us.
      void setCursorHidden(false);
    };
  }, [isActive, reveal, setCursorHidden]);

  return {
    reveal,
    setPointerOverChrome,
    /** CSS fallback for platforms without a native hide. */
    cursorStyle:
      nativeCursor.current === false && cursorHidden.current
        ? ('none' as const)
        : ('default' as const),
  };
}
