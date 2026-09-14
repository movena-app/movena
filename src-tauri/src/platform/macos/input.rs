/// Give keyboard focus to the webview itself.
///
/// A style mask change resets the first responder, and tao's own helper points
/// it back at the *content view*. That is enough for tao's own key handling, but
/// not for ours: the WKWebView is a subview, and unless it holds first responder
/// status the DOM sees no key events at all — the player's shortcuts went dead
/// in screen-filling mode until a click on the picture happened to make the
/// webview first responder again.
fn focus_webview(parent: &NSWindow) {
    let Some(content) = parent.contentView() else {
        return;
    };
    match find_webview(&content) {
        Some(webview) => parent.makeFirstResponder(Some(&webview)),
        None => {
            // Worth hearing about: without the webview holding focus the
            // player's keyboard shortcuts stop reaching the DOM entirely.
            log::warn!("webview not found in the view tree; keyboard shortcuts may not respond");
            parent.makeFirstResponder(Some(&content))
        }
    };
}

/// Depth-first search for the WKWebView.
///
/// Asks the runtime whether a view *is a kind of* `WKWebView` rather than
/// matching its class name. wry subclasses it as `WryWebView` and wraps it in a
/// `WryWebViewParent`, so a name comparison found neither — measured: "webview
/// NOT FOUND, first responder is now WryWebViewParent", the container rather
/// than the view that feeds the DOM.
fn find_webview(view: &NSView) -> Option<Retained<NSView>> {
    let Some(webkit) = AnyClass::get(c"WKWebView") else {
        return None;
    };
    if view.isKindOfClass(webkit) {
        return unsafe { Retained::retain(view as *const NSView as *mut NSView) };
    }
    let subviews = view.subviews();
    for i in 0..subviews.count() {
        if let Some(found) = find_webview(&subviews.objectAtIndex(i)) {
            return Some(found);
        }
    }
    None
}

/// Rebuild mouse tracking after a style mask change.
///
/// Swapping the style mask makes AppKit replace the window's frame view, which
/// drops the tracking areas hanging off it. The webview then stops seeing
/// mouse-move events — and since the player hides the pointer whenever its
/// controls are hidden, and only a mouse-move brings both back, the cursor
/// stays invisible across the whole screen with no way to recover it.
fn restore_mouse_tracking(parent: &NSWindow) {
    parent.setAcceptsMouseMovedEvents(true);
    if let Some(view) = parent.contentView() {
        refresh_tracking_areas(&view);
    }
}

/// Add or remove style mask bits, then put the content view back in charge of
/// events.
///
/// Changing the style mask makes AppKit rebuild the window's frame view and
/// drops the first responder on the floor. tao's own helper carries the note
/// "If we don't do this, key handling will break. Therefore, never call
/// `setStyleMask` directly!" — mouse-move delivery goes the same way, which is
/// how the pointer ended up hidden with no way to bring it back.
fn toggle_style_mask(parent: &NSWindow, mask: NSWindowStyleMask, on: bool) {
    let current = parent.styleMask();
    parent.setStyleMask(if on { current | mask } else { current & !mask });
    focus_webview(parent);
}

/// `updateTrackingAreas` does not recurse, and the tracking area that matters
/// belongs to the webview deep in the hierarchy, not to the content view.
fn refresh_tracking_areas(view: &NSView) {
    view.updateTrackingAreas();
    let subviews = view.subviews();
    for i in 0..subviews.count() {
        refresh_tracking_areas(&subviews.objectAtIndex(i));
    }
}

/// Watch which window holds key focus for as long as a video is embedded.
///
/// Only the key window is sent mouse-moved and key events, so if mpv's window
/// takes focus the controls stop reacting to the mouse and the keyboard
/// shortcuts go dead — while clicks still work, because a click makes the
/// window it lands on key again. Hand focus straight back, and log the
/// transition so the cause is visible rather than inferred.
fn watch_key_window(app: &AppHandle, gen: u64) {
    let app = app.clone();
    thread::spawn(move || {
        let mut last = isize::MIN;
        while ATTACHED.load(Ordering::SeqCst) && GENERATION.load(Ordering::SeqCst) == gen {
            let (tx, rx) = mpsc::channel();
            with_main(&app, move |app, mtm| {
                let key = NSApplication::sharedApplication(mtm).keyWindow();
                let key_number = key.as_ref().map_or(0, |w| w.windowNumber());
                let parent = parent_window(app);
                let surface = find_surface(mtm);

                let is_surface = surface
                    .as_ref()
                    .is_some_and(|s| s.windowNumber() == key_number);
                let label = if is_surface {
                    "mpv surface"
                } else if parent
                    .as_ref()
                    .is_some_and(|p| p.windowNumber() == key_number)
                {
                    "main window"
                } else if key_number == 0 {
                    "none"
                } else {
                    "another window"
                };

                let mut accepts_moves = None;
                if let Some(parent) = parent.as_ref() {
                    if is_surface {
                        parent.makeKeyWindow();
                        // `makeKeyWindow` alone does not touch first responder —
                        // it only matters here because whatever *did* leave the
                        // webview as first responder is the same event that let
                        // mpv's window steal key status in the first place, so
                        // by the time this branch runs it usually needs restating
                        // too. Without it, key status comes back but keyboard
                        // shortcuts (starting with `F` to leave fullscreen) stay
                        // dead until a click on the video happens to refocus it.
                        focus_webview(&parent);
                        log::info!("mpv surface took key focus; handed it back");
                    }
                    // Mouse-moved events reach a window only if it opts in.
                    // Re-assert rather than set once: something in the
                    // fullscreen path is clearing it, and while it is off the
                    // pointer stays hidden with no way to recover it.
                    accepts_moves = Some(parent.acceptsMouseMovedEvents());
                    if accepts_moves == Some(false) {
                        parent.setAcceptsMouseMovedEvents(true);
                        if let Some(view) = parent.contentView() {
                            refresh_tracking_areas(&view);
                        }
                    }
                }
                let _ = tx.send((key_number, label.to_string(), accepts_moves));
            });

            if let Ok((key_number, label, accepts_moves)) = rx.recv_timeout(Duration::from_secs(2))
            {
                if key_number != last {
                    last = key_number;
                    log::info!(
                        "key window is now the {label} (#{key_number}), \
                         acceptsMouseMovedEvents {accepts_moves:?}"
                    );
                }
                if accepts_moves == Some(false) {
                    log::info!("main window had stopped accepting mouse-moved events; re-enabled");
                }
            }
            thread::sleep(KEY_WATCH_INTERVAL);
        }
    });
}

/// Hide the pointer until the mouse next moves, and report that movement.
///
/// While the pointer is genuinely hidden — by `cursor: none` or by AppKit, it
/// makes no difference — the webview receives no further mouse-move events. The
/// act of hiding therefore silences the very signal the interface needs to know
/// when to come back, which is why clicking was the only way to restore the
/// controls. macOS does reveal the pointer again by itself on the next
/// movement; only the notification was missing.
///
/// So while hidden, the pointer's screen position is polled and a
/// `pointer-moved` event is emitted as soon as it shifts. The poll exists only
/// during that window and stops on the first movement.
pub fn set_cursor_hidden(app: &AppHandle, hidden: bool) {
    let generation = CURSOR_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;

    with_main(app, move |_app, _mtm| {
        NSCursor::setHiddenUntilMouseMoves(hidden);
    });

    if !hidden {
        return;
    }

    let app = app.clone();
    thread::spawn(move || {
        let origin = pointer_location(&app);
        loop {
            thread::sleep(POINTER_POLL_INTERVAL);
            if CURSOR_GENERATION.load(Ordering::SeqCst) != generation {
                return; // The pointer was revealed by some other route.
            }
            let now = pointer_location(&app);
            let moved = (now.0 - origin.0).abs() > 1.0 || (now.1 - origin.1).abs() > 1.0;
            if moved {
                let _ = app.emit("pointer-moved", ());
                return;
            }
        }
    });
}

/// The pointer's position in screen coordinates, read on the main thread.
fn pointer_location(app: &AppHandle) -> (f64, f64) {
    let (tx, rx) = mpsc::channel();
    with_main(app, move |_app, _mtm| {
        let point = NSEvent::mouseLocation();
        let _ = tx.send((point.x, point.y));
    });
    rx.recv_timeout(Duration::from_secs(1))
        .unwrap_or((0.0, 0.0))
}
