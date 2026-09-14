/// One-time setup of the main window. Run at startup, before any stream.
pub fn prepare_main_window(app: &AppHandle) {
    with_main(app, |app, mtm| {
        apply_app_icon(mtm);

        // Refuse native fullscreen. It puts the window in a space of its own
        // and inserts backdrop windows between it and its children: measured
        // z-order in that state was parent at 4, video at 2 — the video ends up
        // in front and hides the entire control overlay, and no child ordering
        // fixes it. `set_simple_fullscreen` fills the screen without a space,
        // and the green button falls back to zoom, which composites correctly.
        if let Some(parent) = parent_window(app) {
            parent.setCollectionBehavior(NSWindowCollectionBehavior::FullScreenNone);
        }
    });
}

// ── Public API ───────────────────────────────────────────────

/// Start watching for mpv's window and embed it as soon as it exists.
/// Returns immediately; the polling runs on a background thread.
pub fn attach(app: &AppHandle) {
    let app = app.clone();
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    log::info!("watching for the mpv surface (generation {generation})");
    std::thread::spawn(move || {
        for _ in 0..ATTACH_ATTEMPTS {
            if GENERATION.load(Ordering::SeqCst) != generation {
                log::info!("attach {generation} superseded, giving up the watch");
                return;
            }
            let attached = with_main_blocking(&app, Duration::from_secs(2), |app, mtm| {
                let Some(surface) = find_surface(mtm) else {
                    return false;
                };
                let Some(parent) = parent_window(app) else {
                    log::warn!("mpv surface found but the main window is not reachable");
                    return false;
                };
                adopt(&parent, &surface);
                // mpv has stamped its own logo onto the dock by now.
                apply_app_icon(mtm);
                // `mpv_start` runs on every stream switch, not just the first
                // one — including one that lands mid-fullscreen when a series
                // auto-advances to its next episode. `set_simple_fullscreen`
                // repairs tracking areas and first responder after the AppKit
                // operations known to disturb them (see its own comments), but
                // creating and adopting a brand new mpv window is itself such
                // an operation, and this path runs it unconditionally on every
                // switch with neither repair applied. Without this, the second
                // episode of a session started in fullscreen is the one where
                // the pointer and keyboard shortcuts stop reaching the webview.
                restore_mouse_tracking(&parent);
                focus_webview(&parent);
                true
            });
            if attached == Some(true) {
                ATTACHED.store(true, Ordering::SeqCst);
                watch_key_window(&app, generation);
                return;
            }
            std::thread::sleep(ATTACH_POLL_INTERVAL);
        }
        log::warn!(
            "mpv surface never appeared within {:?}; video stays in its own window",
            ATTACH_POLL_INTERVAL * ATTACH_ATTEMPTS
        );
    });
}

/// Keep the embedded video aligned with the main window, and keep it parented.
/// Call on resize, move, and fullscreen transitions.
pub fn sync(app: &AppHandle) {
    if !ATTACHED.load(Ordering::SeqCst) {
        return;
    }
    with_main(app, |app, mtm| {
        let (Some(surface), Some(parent)) = (find_surface(mtm), parent_window(app)) else {
            return;
        };

        let fullscreen = parent.styleMask().contains(NSWindowStyleMask::FullScreen);
        let toggled = WAS_FULLSCREEN.swap(fullscreen, Ordering::SeqCst) != fullscreen;

        // Restate the ordering across a fullscreen transition. Being a child is
        // not enough — the child can end up drawn *in front* of its parent while
        // the relationship itself survives, which hides the whole control
        // overlay. Detaching and re-adding is the only documented way to
        // restate it, so it is confined to actual transitions: doing it on
        // every event would flicker through a live window drag.
        if toggled || !is_child_of(&parent, &surface) {
            parent.removeChildWindow(&surface);
            unsafe { parent.addChildWindow_ordered(&surface, NSWindowOrderingMode::Below) };
            log::info!("restated child ordering (fullscreen now {fullscreen})");
        }

        place_surface(&surface, video_frame(&parent));
    });
}

/// Re-run `sync` once the window has settled.
///
/// The fullscreen transition is animated, and AppKit may drop the child window
/// relationship at the *end* of it — after the last resize event we see. One
/// delayed re-check catches that. At most one is ever pending, so the hundreds
/// of resize events from a live window drag cost nothing.
pub fn sync_after_settle(app: &AppHandle) {
    if !ATTACHED.load(Ordering::SeqCst) || RESYNC_PENDING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(SETTLE_DELAY);
        RESYNC_PENDING.store(false, Ordering::SeqCst);
        sync(&app);
    });
}

/// Release mpv's window from the view hierarchy. Must run to completion
/// before `mpv_terminate_destroy`, because `addChildWindow:` makes the parent
/// retain the child — without this the window would outlive mpv.
pub fn detach(app: &AppHandle) {
    GENERATION.fetch_add(1, Ordering::SeqCst);
    if !ATTACHED.swap(false, Ordering::SeqCst) {
        return;
    }
    with_main_blocking(app, Duration::from_millis(500), |app, mtm| {
        if let (Some(surface), Some(parent)) = (find_surface(mtm), parent_window(app)) {
            parent.removeChildWindow(&surface);
            surface.orderOut(None);
            // The window is opaque again once the player closes.
            parent.setHasShadow(true);
            parent.invalidateShadow();
        }
        apply_app_icon(mtm);
        true
    });
}
