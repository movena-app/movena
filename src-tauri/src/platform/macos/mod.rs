//! In-window video embedding for macOS.
//!
//! On Windows and X11 mpv honours `--wid` and parents its output into the
//! window we hand it. macOS has no such path: `video/out/mac/common.swift`
//! unconditionally calls `initWindow()`, so libmpv always spawns its own
//! NSWindow and the `--wid` value is ignored. That is the stray window that
//! shows up next to the app.
//!
//! Since libmpv runs in-process we can fix this from the AppKit side instead:
//! mpv is told to title its window with `SURFACE_TITLE`, we wait for that
//! window to appear, strip its chrome, and add it as a child window ordered
//! *below* the main window. The webview is transparent while `is-playing` is
//! set, so the video shows through it and the React controls keep compositing
//! on top — same visual result as `--wid` embedding elsewhere.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::Duration;

use objc2::rc::Retained;
use objc2::runtime::{AnyClass, NSObjectProtocol};
use objc2::{AnyThread, MainThreadMarker};
use objc2_app_kit::{
    NSApplication, NSApplicationPresentationOptions, NSColor, NSCursor, NSEvent, NSImage, NSView,
    NSWindow, NSWindowCollectionBehavior, NSWindowOrderingMode, NSWindowStyleMask,
};
use objc2_foundation::{NSAlignmentOptions, NSData, NSPoint, NSRect, NSSize};
use objc2_quartz_core::CACornerMask;
use tauri::{AppHandle, Emitter, Manager};

/// Window title handed to mpv via `--title`, used to recognise its NSWindow.
pub const SURFACE_TITLE: &str = "Movena Video Surface";

/// How long to wait for mpv to create its window before giving up. mpv only
/// builds it once the first video frame is configured, so this covers the
/// initial network/demuxer latency of a stream.
const ATTACH_POLL_INTERVAL: Duration = Duration::from_millis(5);
const ATTACH_ATTEMPTS: u32 = 2000;

/// Comfortably longer than the macOS fullscreen animation.
const SETTLE_DELAY: Duration = Duration::from_millis(700);

/// How often to check that mpv has not taken keyboard focus. Rare enough to
/// cost nothing, often enough that a lapse is not noticeable.
const KEY_WATCH_INTERVAL: Duration = Duration::from_millis(500);

/// Whether we currently own an mpv window. Guards the per-resize window scan.
static ATTACHED: AtomicBool = AtomicBool::new(false);

/// Whether a settle re-check is already scheduled.
static RESYNC_PENDING: AtomicBool = AtomicBool::new(false);

/// Last observed fullscreen state of the main window, so `sync` can tell an
/// ordinary resize apart from a fullscreen transition.
static WAS_FULLSCREEN: AtomicBool = AtomicBool::new(false);

/// Bumped on every start/stop so a poller left over from a previous stream
/// cannot adopt a window belonging to the next one.
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// How often the pointer is sampled while it is hidden. Frequent enough to
/// feel immediate, and it runs only while the chrome is out of the way.
const POINTER_POLL_INTERVAL: Duration = Duration::from_millis(80);

/// Invalidates a running pointer watch when the pointer is revealed again.
static CURSOR_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Whether the main window is currently in our own screen-filling mode.
static SIMPLE_FULLSCREEN: AtomicBool = AtomicBool::new(false);

/// Frame to restore when leaving it, as [x, y, width, height].
static WINDOWED_FRAME: Mutex<Option<[f64; 4]>> = Mutex::new(None);

/// Style mask to restore when leaving it.
static WINDOWED_STYLE_MASK: Mutex<Option<usize>> = Mutex::new(None);

/// Our dock icon, compiled in rather than read from the bundle: `cargo run`
/// during development produces a bare executable with no bundle to read from,
/// and that is exactly the case where mpv's icon takeover is visible.
const APP_ICON_ICNS: &[u8] = include_bytes!("../../../icons/icon.icns");

// ── Main-thread plumbing ─────────────────────────────────────

/// Run `f` on the main thread. Executes inline when already there (window
/// event handlers), otherwise hops via the event loop.
fn with_main<F>(app: &AppHandle, f: F)
where
    F: FnOnce(&AppHandle, MainThreadMarker) + Send + 'static,
{
    if let Some(mtm) = MainThreadMarker::new() {
        f(app, mtm);
        return;
    }
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        if let Some(mtm) = MainThreadMarker::new() {
            f(&app, mtm);
        }
    });
}

/// Run `f` on the main thread and wait for its result, bounded by `timeout`.
/// Returns `None` if we are already on the main thread (caller must not block
/// there) or the hop did not complete in time.
fn with_main_blocking<F>(app: &AppHandle, timeout: Duration, f: F) -> Option<bool>
where
    F: FnOnce(&AppHandle, MainThreadMarker) -> bool + Send + 'static,
{
    if let Some(mtm) = MainThreadMarker::new() {
        return Some(f(app, mtm));
    }
    let (tx, rx) = mpsc::channel();
    let app = app.clone();
    app.clone()
        .run_on_main_thread(move || {
            let done = MainThreadMarker::new()
                .map(|mtm| f(&app, mtm))
                .unwrap_or(false);
            let _ = tx.send(done);
        })
        .ok()?;
    rx.recv_timeout(timeout).ok()
}

// ── AppKit helpers ───────────────────────────────────────────

fn parent_window(app: &AppHandle) -> Option<Retained<NSWindow>> {
    let ptr = app.get_webview_window("main")?.ns_window().ok()? as *mut NSWindow;
    unsafe { Retained::retain(ptr) }
}

/// Look up mpv's window by the title we gave it. Re-scanned on every use
/// rather than cached, so a window mpv tears down and rebuilds can never
/// leave us holding a dangling pointer.
///
/// Only *visible* windows count. `mpv_terminate_destroy` closes mpv's window,
/// but a closed NSWindow lingers in `NSApp.windows` until the autorelease pool
/// drains — so when one instance is replaced by another (React StrictMode
/// double-invokes the start effect in development, and every stream switch does
/// the same thing), a title-only match can return the corpse of the previous
/// instance. Adopting that one parks an invisible window inside the UI and
/// leaves the real video floating in its own window.
fn find_surface(mtm: MainThreadMarker) -> Option<Retained<NSWindow>> {
    let windows = NSApplication::sharedApplication(mtm).windows();
    for i in 0..windows.count() {
        let window = windows.objectAtIndex(i);
        if window.title().to_string() == SURFACE_TITLE && window.isVisible() {
            return Some(window);
        }
    }
    None
}

/// The main window's content area in screen coordinates — the region the
/// webview covers, and therefore where the video belongs.
///
/// Deliberately `contentLayoutRect`, not `contentView().bounds()`. This
/// window carries `NSFullSizeContentViewWindowMask` (Tauri's default on
/// macOS — see `TitleBarStyle::Visible` in tauri-runtime-wry), which is what
/// lets the webview draw its own UI behind the traffic lights: the content
/// view's *bounds* cover the entire window, title bar included.
/// `contentLayoutRect` is AppKit's own answer to "the portion of that not
/// obscured under the title bar" (Apple's docs, verbatim) — sizing the video
/// to the full content view instead put mpv's square top corners directly
/// behind the title bar, and its own corners are rounded, so they exposed a
/// sliver of that square video right where the curve pulls away. Stopping
/// short of the title bar avoids that sliver outright, with nothing here
/// guessing at *how much* to round off.
///
/// The rect is snapped outward to whole backing-store pixels. Converting view
/// bounds to screen coordinates readily yields fractional values (window at a
/// half-point position, odd content height on a Retina display), and a window
/// frame that lands between device pixels gets composited with a blended edge —
/// visible as a faint hairline along the top and bottom of the video.
fn video_frame(parent: &NSWindow) -> NSRect {
    let rect = if SIMPLE_FULLSCREEN.load(Ordering::SeqCst) {
        // Screen-filling mode has no title bar, so the video is the whole
        // window — and the content view cannot be asked. Its geometry is still
        // laid out for the title bar that the style mask change just removed:
        // measured 1470x956+0+-32, the video pushed down by exactly the menu
        // bar height, leaving a strip of desktop showing through the top of the
        // transparent webview.
        parent.frame()
    } else {
        // Already in the window's own coordinate space (per Apple's docs),
        // unlike a view's `bounds` — no `convertRect_toView` round trip needed.
        parent.convertRectToScreen(parent.contentLayoutRect())
    };
    parent.backingAlignedRect_options(rect, NSAlignmentOptions::AlignAllEdgesOutward)
}

/// macOS rounds an ordinary window's corners at the system compositor level,
/// which the mpv surface — a separate, borderless child window — never gets.
/// `video_frame` already keeps it out from under the title bar entirely (see
/// its own doc comment), which is what the *top* corners needed — there's a
/// real API for "the part not obscured by the title bar" to line up with.
/// The bottom two have no such chrome to hide behind and no public API
/// reports the system's actual radius, so this only matches the commonly
/// measured default for standard-style windows rather than something
/// verified exact. `PlayerShell`'s corner-sliver overlay (rendered in the
/// webview, above this surface) is the belt to this braces: a wrong radius
/// here only leaves this layer's flat black square corner peeking a little
/// past that overlay's own rounded cutout, or short of it — either way a
/// small, forgiving mismatch rather than a hard edge. Screen-filling mode has
/// no border to round to, so corners go back to square there.
const SURFACE_CORNER_RADIUS: f64 = 10.0;

/// Clip the surface's bottom two corners to (a close match of) the system's
/// own window corner radius, so nothing paints past where the parent's
/// rounded frame already stops contributing pixels. The top two are left
/// square: `video_frame` no longer extends the surface under the title bar,
/// so its top corners now land on the flat seam between the title bar and
/// the content below — a straight line, nothing there to round off.
///
/// This masks the *content view's* layer rather than making the window
/// itself non-opaque: opacity is load-bearing elsewhere (see `adopt`'s note
/// on the hairline seam an alpha-blended window edge produces), and clipping
/// the layer leaves it intact — the corner simply paints the window's own
/// black background instead of video, rather than turning translucent.
fn round_surface_corners(surface: &NSWindow) {
    let Some(content_view) = surface.contentView() else {
        return;
    };
    content_view.setWantsLayer(true);
    let Some(layer) = content_view.layer() else {
        return;
    };
    let radius = if SIMPLE_FULLSCREEN.load(Ordering::SeqCst) {
        0.0
    } else {
        SURFACE_CORNER_RADIUS
    };
    layer.setCornerRadius(radius);
    layer.setMasksToBounds(true);
    // AppKit/Core Animation's layer space has its origin at the bottom-left,
    // so "MinY" is the *bottom* of the surface here.
    layer.setMaskedCorners(CACornerMask::LayerMinXMinYCorner | CACornerMask::LayerMaxXMinYCorner);
}

/// Move mpv's window to `frame`.
///
/// `setFrame:display:` alone is not enough. mpv's NSWindow subclass overrides
/// `constrainFrameRect:toScreen:` and clamps the frame to the screen's
/// *visibleFrame* — the area below the menu bar (mpv's window.swift:465). In
/// screen-filling mode that turns a requested 1470x956+0+0 into +0+-32, pushing
/// the video down by exactly the menu bar height and leaving a strip of desktop
/// showing through the top of the transparent webview. `setFrameOrigin:` is not
/// routed through that constraint, so it puts the origin back.
fn place_surface(surface: &NSWindow, frame: NSRect) {
    surface.setFrame_display(frame, true);
    surface.setFrameOrigin(frame.origin);
    round_surface_corners(surface);
}

/// Whether `surface` is currently parented to `parent`.
///
/// Worth re-checking rather than assuming: AppKit tears down child-window
/// relationships across a native fullscreen transition. Once detached, mpv's
/// window is an ordinary top-level window again and floats *above* the main
/// window instead of below it — covering the whole control overlay.
fn is_child_of(parent: &NSWindow, surface: &NSWindow) -> bool {
    surface
        .parentWindow()
        .is_some_and(|current| current.windowNumber() == parent.windowNumber())
}

fn adopt(parent: &NSWindow, surface: &NSWindow) {
    surface.setStyleMask(NSWindowStyleMask::Borderless);
    surface.setHasShadow(false);
    surface.setMovable(false);
    // Belt and braces only — mpv reassigns this property from its own
    // `input-cursor-passthrough` option, which is where we actually set it.
    surface.setIgnoresMouseEvents(true);
    // Opaque black behind the video: an alpha-blended window edge is exactly
    // what produces the hairline seams against the transparent webview.
    surface.setOpaque(true);
    surface.setBackgroundColor(Some(&NSColor::blackColor()));
    // Only keep it out of Cmd-` cycling. Explicitly *not* FullScreenAuxiliary:
    // that marks a window as able to share a fullscreen window's space, and
    // such windows are drawn above the fullscreen window — which put the video
    // over the control overlay and hid it completely. A child window follows
    // its parent into fullscreen on its own, so the flag bought nothing.
    surface.setCollectionBehavior(NSWindowCollectionBehavior::IgnoresCycle);
    let frame = video_frame(parent);
    place_surface(surface, frame);

    // Stop the main window casting a shadow for as long as it is transparent.
    // macOS derives a window's shadow from its *opaque* pixels, and during
    // playback the only opaque things in this window are the control popovers
    // and the play/pause badge — so the system drew a window shadow tracing
    // each of them, the halo that looked like a stray bubble around the UI.
    parent.setHasShadow(false);
    parent.invalidateShadow();
    unsafe { parent.addChildWindow_ordered(surface, NSWindowOrderingMode::Below) };
    log::info!(
        "mpv surface adopted into main window at {}x{} +{}+{} (ignoresMouseEvents {})",
        frame.size.width,
        frame.size.height,
        frame.origin.x,
        frame.origin.y,
        surface.ignoresMouseEvents(),
    );
}

/// Stamp our icon onto the dock.
///
/// mpv replaces the process icon with its own logo from `setAppIcon` in
/// `video/out/mac/common.swift`, which hangs off `initApp` and therefore runs
/// on every video-output reconfiguration, not just once per stream. Setting our
/// icon explicitly rather than restoring a previously captured one is also what
/// gets development builds right: those run unbundled, so there is no bundle
/// icon to fall back to.
fn apply_app_icon(mtm: MainThreadMarker) {
    let data = NSData::with_bytes(APP_ICON_ICNS);
    let Some(icon) = NSImage::initWithData(NSImage::alloc(), &data) else {
        log::warn!("could not decode the embedded app icon");
        return;
    };
    unsafe { NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&icon)) };
}

include!("fullscreen.rs");
include!("input.rs");
include!("surface.rs");
