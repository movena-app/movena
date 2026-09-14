use std::collections::HashMap;
use std::ffi::{c_void, CStr, CString};
use std::os::raw::{c_char, c_double, c_int};
use std::path::{Path, PathBuf};
use std::ptr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use libmpv_sys::*;
#[cfg(not(target_os = "macos"))]
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(test)]
use self::diagnostics::{build_diagnostic_sample, DIAGNOSTIC_PROPERTIES};
use self::diagnostics::{collect_diagnostic_sample, node_to_json, sanitize_mpv_log_text};
#[cfg(target_os = "windows")]
use self::options::bundled_ytdlp_path;
#[cfg(test)]
use self::options::first_existing_file;
#[cfg(any(target_os = "windows", test))]
use self::options::ytdlp_script_option;
use self::options::{build_http_options, MpvHttpOptions};
use self::property::{validate_mpv_property, MpvPropertyUpdate};

#[cfg(target_os = "macos")]
use crate::platform::macos as macos_embed;
#[cfg(target_os = "windows")]
use crate::platform::windows as windows_fullscreen;

#[derive(Default)]
pub struct NativePlayerManager {
    handle: Mutex<Option<usize>>,
    session_id: Mutex<Option<String>>,
    twitch_resolver: Mutex<Option<twitch_resolver::TwitchResolverProcess>>,
    alive: Arc<AtomicBool>,
    thread_handle: Mutex<Option<thread::JoinHandle<()>>>,
    /// Held for the whole of start/stop. Those commands run on Tauri's thread
    /// pool, so without it a stop issued for the outgoing stream can land
    /// after the incoming stream's start and kill the fresh instance.
    lifecycle: Mutex<()>,
}

unsafe impl Send for NativePlayerManager {}
unsafe impl Sync for NativePlayerManager {}

#[derive(Serialize, Clone)]
struct MpvEventPayload {
    #[serde(rename = "type")]
    event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    session_id: Option<String>,
}

unsafe fn set_mpv_option(mpv: *mut mpv_handle, key: &str, value: &str) -> Result<(), String> {
    let c_key = CString::new(key).map_err(|e| e.to_string())?;
    let c_value = CString::new(value).map_err(|e| e.to_string())?;
    let res = mpv_set_option_string(mpv, c_key.as_ptr(), c_value.as_ptr());
    if res < 0 {
        // Option values may contain media URLs, request headers, local paths,
        // or credentials. Keep them out of errors surfaced to diagnostics/UI.
        Err(format!("Failed to set mpv option '{key}' (error {res})"))
    } else {
        Ok(())
    }
}

unsafe fn mpv_cmd(mpv: *mut mpv_handle, args: &[&str]) -> Result<(), String> {
    let c_args: Vec<CString> = args
        .iter()
        .map(|argument| CString::new(*argument).map_err(|error| error.to_string()))
        .collect::<Result<_, _>>()?;
    let mut c_ptrs: Vec<*const c_char> = c_args.iter().map(|s| s.as_ptr()).collect();
    c_ptrs.push(ptr::null());
    let res = libmpv_sys::mpv_command(mpv, c_ptrs.as_mut_ptr());
    if res < 0 {
        // Never include command arguments here: loadfile arguments contain the
        // provider username and password in the direct stream URL.
        Err(format!(
            "mpv command '{}' failed with error {}",
            args.first().copied().unwrap_or("unknown"),
            res
        ))
    } else {
        Ok(())
    }
}

unsafe fn set_mpv_string_property(
    mpv: *mut mpv_handle,
    property: &str,
    value: &str,
) -> Result<(), String> {
    let c_property = CString::new(property).map_err(|error| error.to_string())?;
    let c_value = CString::new(value).map_err(|error| error.to_string())?;
    let result = mpv_set_property_string(mpv, c_property.as_ptr(), c_value.as_ptr());
    if result < 0 {
        Err(format!(
            "Failed to set mpv property '{property}' (error {result})"
        ))
    } else {
        Ok(())
    }
}

unsafe fn get_mpv_i64_property(mpv: *mut mpv_handle, property: &str) -> Option<i64> {
    let c_property = CString::new(property).ok()?;
    let mut value = 0_i64;
    let result = libmpv_sys::mpv_get_property(
        mpv,
        c_property.as_ptr(),
        mpv_format_MPV_FORMAT_INT64,
        (&mut value as *mut i64).cast::<c_void>(),
    );
    (result >= 0).then_some(value)
}

// ── Internal helper to stop mpv safely ───────────────────────

fn stop_internal(app: &AppHandle, state: &NativePlayerManager) {
    // Hand mpv's window back before tearing mpv down — the parent window
    // retains it while it is a child, so it would otherwise outlive mpv.
    #[cfg(target_os = "macos")]
    macos_embed::detach(app);
    #[cfg(not(target_os = "macos"))]
    let _ = app;

    state.alive.store(false, Ordering::SeqCst);
    *state.session_id.lock().unwrap_or_else(|e| e.into_inner()) = None;

    // Issue stop command and wake up mpv_wait_event so background thread unblocks immediately
    let mut handle_opt = state.handle.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(mpv_usize) = *handle_opt {
        unsafe {
            let _ = mpv_cmd(mpv_usize as *mut mpv_handle, &["stop"]);
            mpv_wakeup(mpv_usize as *mut mpv_handle);
        }
    }

    // Join background thread to guarantee it finished
    let mut thread_opt = state
        .thread_handle
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if let Some(th) = thread_opt.take() {
        let _ = th.join();
    }

    // Safely terminate mpv handle
    if let Some(mpv_usize) = handle_opt.take() {
        unsafe {
            mpv_terminate_destroy(mpv_usize as *mut mpv_handle);
        }
    }
    drop(handle_opt);

    // Disconnecting mpv closes Streamlink's only loopback HTTP client. Give
    // the non-continuous resolver a moment to exit on its own, then its guard
    // terminates the contained process group so no helper survives a stream
    // replacement or application shutdown.
    if let Some(mut resolver) = state
        .twitch_resolver
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .take()
    {
        resolver.stop();
    }
}

impl NativePlayerManager {
    pub(crate) fn stop(&self, app: &AppHandle) -> Result<(), String> {
        let _lifecycle = self.lifecycle.lock().map_err(|error| error.to_string())?;
        stop_internal(app, self);
        Ok(())
    }
}

// ── IPC Commands ──────────────────────────────────────────────
//
// Every command below is `(async)` so Tauri runs it on the thread pool instead
// of the main thread. This is load-bearing, not cosmetic: `mpv_terminate_destroy`
// blocks until mpv's core thread has shut down, and that thread tears the video
// output down through `DispatchQueue.main.sync` (mpv's mac_common.swift). Called
// from the main thread the two would wait on each other and freeze the app.

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MpvStartOptions {
    #[serde(default)]
    session_id: Option<String>,
    url: String,
    hwdec: String,
    hdr: bool,
    tone_mapping: Option<String>,
    cache_secs: u32,
    demuxer_max_bytes: String,
    initial_volume: f64,
    initial_speed: f64,
    subtitles_visible: bool,
    #[serde(default)]
    initial_audio_delay_ms: Option<f64>,
    #[serde(default)]
    subtitle_font_size: Option<f64>,
    #[serde(default)]
    subtitle_font_family: Option<String>,
    #[serde(default)]
    subtitle_opacity: Option<f64>,
    #[serde(default)]
    subtitle_border_size: Option<f64>,
    #[serde(default)]
    subtitle_shadow_offset: Option<f64>,
    start_position: Option<f64>,
    #[serde(default)]
    http_headers: HashMap<String, String>,
}

/// RAII guard that destroys the mpv handle if not explicitly defused.
/// Prevents handle leaks when `mpv_start` returns early after `mpv_create`.
struct MpvGuard {
    ptr: *mut mpv_handle,
    defused: bool,
}

impl MpvGuard {
    fn new(ptr: *mut mpv_handle) -> Self {
        Self {
            ptr,
            defused: false,
        }
    }

    /// Take ownership of the pointer, preventing automatic destruction.
    fn defuse(&mut self) -> *mut mpv_handle {
        self.defused = true;
        self.ptr
    }
}

impl Drop for MpvGuard {
    fn drop(&mut self) {
        if !self.defused && !self.ptr.is_null() {
            unsafe {
                mpv_terminate_destroy(self.ptr);
            }
        }
    }
}

#[tauri::command(async)]
pub fn mpv_start(
    app: AppHandle,
    state: State<'_, NativePlayerManager>,
    options: MpvStartOptions,
) -> Result<(), String> {
    let MpvStartOptions {
        session_id,
        url,
        hwdec,
        hdr,
        tone_mapping,
        cache_secs,
        demuxer_max_bytes,
        initial_volume,
        initial_speed,
        subtitles_visible,
        initial_audio_delay_ms,
        subtitle_font_size,
        subtitle_font_family,
        subtitle_opacity,
        subtitle_border_size,
        subtitle_shadow_offset,
        start_position,
        http_headers,
    } = options;
    let session_id =
        session_id.filter(|value| !value.is_empty() && value.len() <= 128 && value.is_ascii());
    let is_twitch_live = twitch_resolver::is_twitch_live_url(&url);
    let http_options = if is_twitch_live {
        MpvHttpOptions::default()
    } else {
        build_http_options(http_headers)?
    };
    let _lifecycle = state.lifecycle.lock().map_err(|e| e.to_string())?;

    // Stop any existing instance first
    stop_internal(&app, &state);

    let mut twitch_resolver = None;
    let playback_url = if is_twitch_live {
        let (playback_url, resolver) = twitch_resolver::start(&app, &url, session_id.clone())?;
        twitch_resolver = Some(resolver);
        playback_url
    } else {
        url
    };

    unsafe {
        let mpv = mpv_create();
        if mpv.is_null() {
            return Err("Failed to create mpv context".to_string());
        }
        let mut guard = MpvGuard::new(mpv);

        // Embedding: everywhere except macOS mpv reparents its output into the
        // handle we pass as `wid`. mpv's macOS backend ignores `wid` and always
        // opens its own NSWindow, so there we tag that window and adopt it into
        // the view hierarchy afterwards (see macos_embed).
        #[cfg(not(target_os = "macos"))]
        {
            let window = app
                .get_webview_window("main")
                .ok_or("Failed to get main window")?;
            let wh = window.window_handle().map_err(|e| e.to_string())?;
            let wid = match wh.as_raw() {
                RawWindowHandle::Win32(h) => h.hwnd.get() as i64,
                RawWindowHandle::Xlib(h) => h.window as i64,
                RawWindowHandle::Xcb(h) => h.window.get() as i64,
                RawWindowHandle::Wayland(_) => return Err("Wayland playback requires an XWayland-compatible session with the current embedded MPV backend".to_string()),
                _ => return Err("Unsupported OS window handle".to_string()),
            };
            set_mpv_option(mpv, "wid", &wid.to_string())?;
            // Here `wid` is the main application window itself, not a
            // container mpv merely draws into. Without this, mpv is free to
            // resize that window to the video's native resolution on every
            // load — invisible normally, but every episode switch tears mpv
            // down and rebuilds it (see stop_internal above), and doing that
            // while native fullscreen was active shrank the window out of
            // fullscreen and left the webview's layout sized for a viewport
            // that no longer existed. We own this window's geometry; mpv
            // must never resize or aspect-lock it.
            set_mpv_option(mpv, "auto-window-resize", "no")?;
            set_mpv_option(mpv, "keepaspect-window", "no")?;
        }

        #[cfg(target_os = "macos")]
        {
            set_mpv_option(mpv, "title", macos_embed::SURFACE_TITLE)?;
            set_mpv_option(mpv, "border", "no")?;
            set_mpv_option(mpv, "focus-on", "never")?;
            // We own the geometry; mpv must not resize or aspect-lock its
            // window behind our back once we have positioned it.
            set_mpv_option(mpv, "auto-window-resize", "no")?;
            set_mpv_option(mpv, "keepaspect-window", "no")?;
            set_mpv_option(mpv, "window-dragging", "no")?;
            set_mpv_option(mpv, "input-default-bindings", "no")?;
            set_mpv_option(mpv, "input-cursor", "no")?;
            // mpv runs its own pointer auto-hide timer. Its window is never key
            // so it should never fire, but the app owns the pointer here and a
            // second thing hiding it is exactly how it became unrecoverable.
            set_mpv_option(mpv, "cursor-autohide", "no")?;
            // Make mpv's window transparent to the mouse. This has to be the
            // option rather than `setIgnoresMouseEvents` from our side: mpv
            // assigns that property from this option itself (window.swift and
            // common.swift), so anything we set externally gets overwritten.
            // Without it, clicking the video makes mpv's window key — it
            // overrides canBecomeKey to true — and macOS then delivers
            // mouse-moved events there instead of to the webview, so the
            // controls and the pointer never come back.
            set_mpv_option(mpv, "input-cursor-passthrough", "yes")?;

            // Without this mpv sizes its window to the video, so a 4K stream
            // would flash a 3840x2160 window for the frame or two before we
            // adopt it. Start it at the size it is about to be given.
            if let Some(window) = app.get_webview_window("main") {
                if let (Ok(size), Ok(scale)) = (window.inner_size(), window.scale_factor()) {
                    let logical = size.to_logical::<u32>(scale);
                    if logical.width > 0 && logical.height > 0 {
                        let geometry = format!("{}x{}", logical.width, logical.height);
                        set_mpv_option(mpv, "geometry", &geometry)?;
                    }
                }
            }
        }

        set_mpv_option(mpv, "vo", "gpu-next")?;
        set_mpv_option(mpv, "hwdec", &hwdec)?;
        set_mpv_option(mpv, "force-window", "no")?;
        set_mpv_option(mpv, "keep-open", "yes")?;
        set_mpv_option(mpv, "idle", "yes")?;
        set_mpv_option(mpv, "volume", &initial_volume.clamp(0.0, 100.0).to_string())?;
        set_mpv_option(mpv, "speed", &initial_speed.clamp(0.5, 2.0).to_string())?;
        set_mpv_option(
            mpv,
            "sub-visibility",
            if subtitles_visible { "yes" } else { "no" },
        )?;
        if let Some(delay) = initial_audio_delay_ms {
            set_mpv_option(
                mpv,
                "audio-delay",
                &(delay.clamp(-5000.0, 5000.0) / 1000.0).to_string(),
            )?;
        }
        if let Some(size) = subtitle_font_size {
            set_mpv_option(mpv, "sub-font-size", &size.clamp(12.0, 96.0).to_string())?;
        }
        if let Some(font) = subtitle_font_family.filter(|value| !value.trim().is_empty()) {
            let safe_font = font.chars().take(80).collect::<String>();
            set_mpv_option(mpv, "sub-font", &safe_font)?;
        }
        if let Some(opacity) = subtitle_opacity {
            set_mpv_option(
                mpv,
                "sub-color",
                &format!("#FFFFFF{:02X}", (opacity.clamp(0.0, 100.0) * 2.55) as u8),
            )?;
        }
        if let Some(border) = subtitle_border_size {
            set_mpv_option(mpv, "sub-border-size", &border.clamp(0.0, 12.0).to_string())?;
        }
        if let Some(shadow) = subtitle_shadow_offset {
            set_mpv_option(
                mpv,
                "sub-shadow-offset",
                &shadow.clamp(0.0, 12.0).to_string(),
            )?;
        }
        set_mpv_option(mpv, "cache", "yes")?;
        set_mpv_option(mpv, "cache-secs", &cache_secs.to_string())?;
        // mpv otherwise waits for its default one full second of packets after
        // a demuxer underrun. Switching an embedded subtitle track can briefly
        // enter that recovery path even when the A/V cache is healthy, which
        // looks like an artificial one-second pause. Keep recovery enabled but
        // resume as soon as a small packet runway is available.
        set_mpv_option(mpv, "cache-pause-wait", "0.1")?;
        // Keep the display awake for the lifetime of native playback. mpv
        // owns this platform-specific integration, so it remains accurate
        // during buffering and teardown without a frontend timer.
        set_mpv_option(mpv, "stop-screensaver", "yes")?;
        set_mpv_option(mpv, "demuxer-max-bytes", &demuxer_max_bytes)?;
        // IPTV providers frequently expose streams that FFmpeg can decode but
        // marks as non-standard. This is the libavformat strictness override;
        // keep the exact option spelling because unknown AVOptions are silent.
        set_mpv_option(mpv, "demuxer-lavf-o", "strict=-2")?;
        if let Some(user_agent) = http_options.user_agent.as_deref() {
            set_mpv_option(mpv, "user-agent", user_agent)?;
        }
        if let Some(referrer) = http_options.referrer.as_deref() {
            set_mpv_option(mpv, "referrer", referrer)?;
        }
        if let Some(header_fields) = http_options.header_fields.as_deref() {
            set_mpv_option(mpv, "http-header-fields", header_fields)?;
        }

        // A web page URL is not media by itself. mpv's built-in ytdl hook
        // delegates supported sites (including YouTube channel /live URLs) to
        // yt-dlp. Point it at Movena's bundled resolver instead of depending
        // on a machine-wide installation or the user's PATH.
        #[cfg(target_os = "windows")]
        if !is_twitch_live {
            if let Some(ytdlp_path) = bundled_ytdlp_path(&app) {
                let script_option = ytdlp_script_option(&ytdlp_path)?;
                set_mpv_option(mpv, "script-opts", &script_option)?;
            }
        }
        // Every URL that reaches loadfile here is already a direct, playable
        // stream — Xtream/M3U entries as-is, Twitch already resolved above.
        // None of it ever needs yt-dlp's site extraction. Without a bundled
        // resolver to point it at (Windows-only, see above), leaving ytdl_hook
        // enabled means it runs against whatever "yt-dlp"/"youtube-dl" happens
        // to be on the user's PATH — on a machine that has one installed for
        // unrelated reasons, the hook can decide a plain VOD URL needs
        // resolving and block the whole demuxer thread on that subprocess's
        // own (unauthenticated, header-less) probe of the provider, which the
        // provider can simply hang rather than reject — indistinguishable
        // from playback never starting. Disable the hook outright here rather
        // than depend on an uncontrolled binary being absent, wrong, or slow.
        #[cfg(not(target_os = "windows"))]
        set_mpv_option(mpv, "ytdl", "no")?;

        if let Some(start_pos) = start_position {
            if start_pos > 0.0 {
                set_mpv_option(mpv, "start", &start_pos.to_string())?;
            }
        }

        if hdr {
            set_mpv_option(mpv, "target-colorspace-hint", "yes")?;
            set_mpv_option(mpv, "hdr-compute-peak", "auto")?;
            set_mpv_option(mpv, "target-peak", "auto")?;
            set_mpv_option(mpv, "target-prim", "auto")?;
            set_mpv_option(mpv, "target-trc", "auto")?;
        }

        let tm = tone_mapping.as_deref().unwrap_or("auto");
        set_mpv_option(mpv, "tone-mapping", tm)?;
        // `clip` is mpv's explicitly low-quality path. gpu-next's automatic
        // selection chooses a perceptual mapping when the GPU supports it.
        set_mpv_option(mpv, "gamut-mapping-mode", "auto")?;

        if mpv_initialize(mpv) < 0 {
            return Err("Failed to initialize mpv".to_string());
        }

        let log_level = CString::new("info").map_err(|e| e.to_string())?;
        mpv_request_log_messages(mpv, log_level.as_ptr());

        mpv_cmd(mpv, &["loadfile", &playback_url])?;

        // mpv builds its NSWindow lazily, once the first video frame is
        // configured — start watching for it now.
        #[cfg(target_os = "macos")]
        macos_embed::attach(&app);

        let observe_props = [
            ("time-pos", mpv_format_MPV_FORMAT_DOUBLE),
            ("duration", mpv_format_MPV_FORMAT_DOUBLE),
            ("pause", mpv_format_MPV_FORMAT_FLAG),
            ("volume", mpv_format_MPV_FORMAT_DOUBLE),
            ("speed", mpv_format_MPV_FORMAT_DOUBLE),
            // The webview remains opaque until mpv confirms a video output.
            // This prevents the transparent desktop window flashing through
            // during startup and GPU output reconfiguration.
            ("vo-configured", mpv_format_MPV_FORMAT_FLAG),
            // Becomes true again if a network stream runs out of buffered data.
            // The frontend uses the event instead of guessing from time updates.
            ("paused-for-cache", mpv_format_MPV_FORMAT_FLAG),
            // Seek transitions are observed immediately so the frontend can
            // measure recovery latency without polling or guessing from time.
            ("seeking", mpv_format_MPV_FORMAT_FLAG),
            // "Off" uses visibility rather than deselecting the subtitle
            // track. Keeping the track decoded avoids a playback stall when
            // subtitles are turned back on mid-stream.
            ("sub-visibility", mpv_format_MPV_FORMAT_FLAG),
            ("track-list", mpv_format_MPV_FORMAT_NODE),
            ("eof-reached", mpv_format_MPV_FORMAT_FLAG),
            // Chapters, when the source embeds them, are how "Skip Intro" and
            // the outro's "Next Episode" prompt find their timestamps —
            // otherwise there is no scene metadata to work from at all.
            ("chapter-list", mpv_format_MPV_FORMAT_NODE),
            ("stream-record", mpv_format_MPV_FORMAT_STRING),
        ];

        for (prop, format) in observe_props {
            let c_prop = CString::new(prop).unwrap();
            mpv_observe_property(mpv, 0, c_prop.as_ptr(), format);
        }

        let mpv = guard.defuse();
        *state.handle.lock().unwrap_or_else(|e| e.into_inner()) = Some(mpv as usize);
        *state.session_id.lock().unwrap_or_else(|e| e.into_inner()) = session_id.clone();
        *state
            .twitch_resolver
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = twitch_resolver.take();
        state.alive.store(true, Ordering::SeqCst);
        let alive_flag = state.alive.clone();
        let mpv_ptr = mpv as usize;
        let event_session_id = session_id.clone();

        // Every episode switch tears mpv down and rebuilds it from here
        // (see stop_internal above), re-embedding into the same window. If
        // that happens while native fullscreen is active, put the fullscreen
        // placement back immediately in case mpv's embed step just disturbed
        // it; `vo-configured` below covers the same thing again once mpv
        // actually establishes a video output, in case the disturbance
        // happens later than this.
        #[cfg(target_os = "windows")]
        if let Err(error) = windows_fullscreen::reassert_fullscreen(&app) {
            log::warn!("Failed to reassert fullscreen after mpv_start: {error}");
        }

        let th = thread::spawn(move || {
            let mpv_handle = mpv_ptr as *mut mpv_handle;
            let mut last_diagnostic_sample = Instant::now();
            let mut last_time_pos_emit = Instant::now();
            while alive_flag.load(Ordering::SeqCst) {
                let event = mpv_wait_event(mpv_handle, 0.5);
                if !event.is_null() {
                    match (*event).event_id {
                        libmpv_sys::mpv_event_id_MPV_EVENT_PROPERTY_CHANGE => {
                            let prop = (*event).data as *const mpv_event_property;
                            if !prop.is_null() && !(*prop).name.is_null() {
                                let name =
                                    CStr::from_ptr((*prop).name).to_string_lossy().into_owned();
                                // Throttle high-frequency time-pos updates to ~5 Hz
                                if name == "time-pos" {
                                    if last_time_pos_emit.elapsed() < Duration::from_millis(200) {
                                        continue;
                                    }
                                    last_time_pos_emit = Instant::now();
                                }
                                if name == "stream-record" {
                                    let active = if (*prop).data.is_null() {
                                        false
                                    } else {
                                        let raw = (*prop).data as *const *const c_char;
                                        !(*raw).is_null()
                                            && !CStr::from_ptr(*raw).to_string_lossy().is_empty()
                                    };
                                    let _ = app.emit(
                                        "mpv-event",
                                        MpvEventPayload {
                                            event_type: "property-change".to_string(),
                                            name: Some("recording".to_string()),
                                            data: Some(Value::Bool(active)),
                                            session_id: event_session_id.clone(),
                                        },
                                    );
                                    continue;
                                }
                                let data = match (*prop).format {
                                    libmpv_sys::mpv_format_MPV_FORMAT_DOUBLE => {
                                        if (*prop).data.is_null() {
                                            Value::Null
                                        } else {
                                            let v = *((*prop).data as *const c_double);
                                            serde_json::Number::from_f64(v)
                                                .map(Value::Number)
                                                .unwrap_or(Value::Null)
                                        }
                                    }
                                    libmpv_sys::mpv_format_MPV_FORMAT_FLAG => {
                                        if (*prop).data.is_null() {
                                            Value::Null
                                        } else {
                                            let v = *((*prop).data as *const c_int);
                                            Value::Bool(v != 0)
                                        }
                                    }
                                    libmpv_sys::mpv_format_MPV_FORMAT_NODE => {
                                        if (*prop).data.is_null() {
                                            Value::Null
                                        } else {
                                            node_to_json((*prop).data as *const mpv_node)
                                        }
                                    }
                                    libmpv_sys::mpv_format_MPV_FORMAT_STRING => {
                                        if (*prop).data.is_null() {
                                            Value::Null
                                        } else {
                                            let raw = (*prop).data as *const *const c_char;
                                            if (*raw).is_null() {
                                                Value::Null
                                            } else {
                                                Value::String(
                                                    CStr::from_ptr(*raw)
                                                        .to_string_lossy()
                                                        .into_owned(),
                                                )
                                            }
                                        }
                                    }
                                    _ => Value::Null,
                                };
                                #[cfg(target_os = "windows")]
                                if name == "vo-configured" && data == Value::Bool(true) {
                                    // mpv just finished (re-)establishing its
                                    // embedded video output — the delayed
                                    // counterpart to the reassert right after
                                    // mpv_start above, for whichever point
                                    // mpv's embed step actually disturbs the
                                    // window at.
                                    if let Err(error) =
                                        windows_fullscreen::reassert_fullscreen(&app)
                                    {
                                        log::warn!(
                                            "Failed to reassert fullscreen after vo-configured: {error}"
                                        );
                                    }
                                }
                                let _ = app.emit(
                                    "mpv-event",
                                    MpvEventPayload {
                                        event_type: "property-change".to_string(),
                                        name: Some(name),
                                        data: Some(data),
                                        session_id: event_session_id.clone(),
                                    },
                                );
                            }
                        }
                        libmpv_sys::mpv_event_id_MPV_EVENT_END_FILE => {
                            let end_file = (*event).data as *const mpv_event_end_file;
                            let data = if end_file.is_null() {
                                None
                            } else {
                                let reason = (*end_file).reason as mpv_end_file_reason;
                                let reason_name = if reason
                                    == mpv_end_file_reason_MPV_END_FILE_REASON_EOF
                                {
                                    "eof"
                                } else if reason == mpv_end_file_reason_MPV_END_FILE_REASON_STOP {
                                    "stop"
                                } else if reason == mpv_end_file_reason_MPV_END_FILE_REASON_QUIT {
                                    "quit"
                                } else if reason == mpv_end_file_reason_MPV_END_FILE_REASON_ERROR {
                                    "error"
                                } else if reason == mpv_end_file_reason_MPV_END_FILE_REASON_REDIRECT
                                {
                                    "redirect"
                                } else {
                                    "unknown"
                                };
                                let error_code = (*end_file).error;
                                let error_message = if error_code < 0 {
                                    let raw = mpv_error_string(error_code);
                                    (!raw.is_null())
                                        .then(|| CStr::from_ptr(raw).to_string_lossy().into_owned())
                                } else {
                                    None
                                };
                                if reason == mpv_end_file_reason_MPV_END_FILE_REASON_ERROR {
                                    log::warn!(
                                        "mpv end-file error {error_code}: {}",
                                        error_message.as_deref().unwrap_or("(no message)")
                                    );
                                }
                                Some(serde_json::json!({
                                    "reason": reason_name,
                                    "errorCode": error_code,
                                    "errorMessage": error_message,
                                }))
                            };
                            let _ = app.emit(
                                "mpv-event",
                                MpvEventPayload {
                                    event_type: "end-file".to_string(),
                                    name: None,
                                    data,
                                    session_id: event_session_id.clone(),
                                },
                            );
                        }
                        libmpv_sys::mpv_event_id_MPV_EVENT_LOG_MESSAGE => {
                            let log = (*event).data as *const mpv_event_log_message;
                            if !log.is_null() {
                                let prefix = if (*log).prefix.is_null() {
                                    ""
                                } else {
                                    CStr::from_ptr((*log).prefix).to_str().unwrap_or("")
                                };
                                let level = if (*log).level.is_null() {
                                    ""
                                } else {
                                    CStr::from_ptr((*log).level).to_str().unwrap_or("")
                                };
                                let text = if (*log).text.is_null() {
                                    ""
                                } else {
                                    CStr::from_ptr((*log).text).to_str().unwrap_or("")
                                };

                                if matches!(level, "fatal" | "error" | "warn") {
                                    log::warn!(
                                        "mpv [{level}][{prefix}] {}",
                                        sanitize_mpv_log_text(text)
                                    );
                                }

                                let _ = app.emit(
                                    "mpv-event",
                                    MpvEventPayload {
                                        event_type: "log-message".to_string(),
                                        name: None,
                                        data: Some(serde_json::json!({
                                            "prefix": prefix,
                                            "level": level,
                                            "text": sanitize_mpv_log_text(text),
                                        })),
                                        session_id: event_session_id.clone(),
                                    },
                                );
                            }
                        }
                        libmpv_sys::mpv_event_id_MPV_EVENT_SHUTDOWN => {
                            break;
                        }
                        _ => {}
                    }
                }

                if last_diagnostic_sample.elapsed() >= Duration::from_secs(1) {
                    let data = collect_diagnostic_sample(mpv_handle);
                    let _ = app.emit(
                        "mpv-event",
                        MpvEventPayload {
                            event_type: "property-change".to_string(),
                            name: Some("diagnostic-sample".to_string()),
                            data: Some(data),
                            session_id: event_session_id.clone(),
                        },
                    );
                    last_diagnostic_sample = Instant::now();
                }
            }
        });

        *state
            .thread_handle
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = Some(th);

        Ok(())
    }
}

#[tauri::command(async)]
pub fn mpv_stop(app: AppHandle, state: State<'_, NativePlayerManager>) -> Result<(), String> {
    state.stop(&app)
}

#[tauri::command(async)]
pub fn mpv_play_pause(state: State<'_, NativePlayerManager>) -> Result<(), String> {
    if let Some(mpv_usize) = *state.handle.lock().unwrap_or_else(|e| e.into_inner()) {
        unsafe {
            mpv_cmd(mpv_usize as *mut mpv_handle, &["cycle", "pause"])?;
        }
        Ok(())
    } else {
        Err("MPV not running".to_string())
    }
}

#[tauri::command(async)]
pub fn mpv_seek(state: State<'_, NativePlayerManager>, position: f64) -> Result<(), String> {
    if let Some(mpv_usize) = *state.handle.lock().unwrap_or_else(|e| e.into_inner()) {
        unsafe {
            mpv_cmd(
                mpv_usize as *mut mpv_handle,
                &["seek", &position.to_string(), "absolute"],
            )?;
        }
        Ok(())
    } else {
        Err("MPV not running".to_string())
    }
}

#[tauri::command(async)]
pub fn mpv_seek_relative(
    state: State<'_, NativePlayerManager>,
    seconds: f64,
) -> Result<(), String> {
    if let Some(mpv_usize) = *state.handle.lock().unwrap_or_else(|e| e.into_inner()) {
        unsafe {
            mpv_cmd(
                mpv_usize as *mut mpv_handle,
                &["seek", &seconds.to_string()],
            )?;
        }
        Ok(())
    } else {
        Err("MPV not running".to_string())
    }
}

#[tauri::command(async)]
pub fn mpv_set_volume(state: State<'_, NativePlayerManager>, volume: f64) -> Result<(), String> {
    if let Some(mpv_usize) = *state.handle.lock().unwrap_or_else(|e| e.into_inner()) {
        unsafe {
            set_mpv_string_property(mpv_usize as *mut mpv_handle, "volume", &volume.to_string())
        }
    } else {
        Err("MPV not running".to_string())
    }
}

#[tauri::command(async)]
pub fn mpv_set_speed(state: State<'_, NativePlayerManager>, speed: f64) -> Result<(), String> {
    if let Some(mpv_usize) = *state.handle.lock().unwrap_or_else(|e| e.into_inner()) {
        unsafe {
            set_mpv_string_property(mpv_usize as *mut mpv_handle, "speed", &speed.to_string())
        }
    } else {
        Err("MPV not running".to_string())
    }
}

#[tauri::command(async)]
pub fn mpv_set_audio_track(
    state: State<'_, NativePlayerManager>,
    track_id: i64,
) -> Result<(), String> {
    if let Some(mpv_usize) = *state.handle.lock().unwrap_or_else(|e| e.into_inner()) {
        unsafe {
            set_mpv_string_property(mpv_usize as *mut mpv_handle, "aid", &track_id.to_string())
        }
    } else {
        Err("MPV not running".to_string())
    }
}

#[tauri::command(async)]
pub fn mpv_set_sub_track(
    state: State<'_, NativePlayerManager>,
    track_id: i64,
) -> Result<(), String> {
    if let Some(mpv_usize) = *state.handle.lock().unwrap_or_else(|e| e.into_inner()) {
        let mpv = mpv_usize as *mut mpv_handle;
        if track_id == 0 {
            // `sid=no` tears the subtitle decoder down. On network streams,
            // selecting it again can make mpv seek/catch up and briefly stall
            // playback. Visibility hides the rendered text while the current
            // track remains selected and decoded.
            unsafe { set_mpv_string_property(mpv, "sub-visibility", "no") }
        } else {
            unsafe {
                // Re-applying the already-selected `sid` can make mpv
                // reinitialize the subtitle path. When the user is merely
                // turning subtitles back on, visibility is the only property
                // that needs to change.
                if get_mpv_i64_property(mpv, "current-tracks/sub/id") != Some(track_id) {
                    set_mpv_string_property(mpv, "sid", &track_id.to_string())?;
                }
                set_mpv_string_property(mpv, "sub-visibility", "yes")
            }
        }
    } else {
        Err("MPV not running".to_string())
    }
}

#[tauri::command(async)]
pub fn mpv_set_recording(
    app: AppHandle,
    state: State<'_, NativePlayerManager>,
    path: String,
) -> Result<(), String> {
    if let Some(mpv_usize) = *state.handle.lock().unwrap_or_else(|e| e.into_inner()) {
        let resolved_path = if path.is_empty() {
            String::new()
        } else {
            let downloads = app
                .path()
                .download_dir()
                .map_err(|error| error.to_string())?;
            let output = resolve_recording_path(&path, &downloads)?;
            if let Some(parent) = output.parent() {
                std::fs::create_dir_all(parent).map_err(|error| {
                    format!(
                        "Could not create recording folder '{}': {error}",
                        parent.display()
                    )
                })?;
            }
            output.to_string_lossy().into_owned()
        };
        unsafe {
            set_mpv_string_property(
                mpv_usize as *mut mpv_handle,
                "stream-record",
                &resolved_path,
            )
        }
    } else {
        Err("MPV not running".to_string())
    }
}

fn resolve_recording_path(path: &str, downloads: &Path) -> Result<PathBuf, String> {
    let candidate = Path::new(path);

    if candidate.is_absolute() || path == "~" || path.starts_with("~/") || path.starts_with("~\\") {
        return Err("Recording paths must be relative to the system Downloads folder".to_string());
    }

    // Reject path traversal attempts
    for component in candidate.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err("Recording path must not contain '..' segments".to_string());
        }
    }

    Ok(downloads.join(candidate))
}

#[cfg(test)]
mod recording_path_tests {
    use super::{
        build_diagnostic_sample, build_http_options, first_existing_file, resolve_recording_path,
        sanitize_mpv_log_text, set_mpv_option, ytdlp_script_option, MpvGuard,
        DIAGNOSTIC_PROPERTIES,
    };
    use serde_json::json;
    use std::collections::HashMap;
    use std::path::Path;

    #[test]
    fn resolves_relative_recording_paths_below_downloads() {
        let resolved = resolve_recording_path(
            "Movena Recordings/channel.ts",
            Path::new("C:/Users/test/Downloads"),
        )
        .unwrap();
        assert_eq!(
            resolved,
            Path::new("C:/Users/test/Downloads/Movena Recordings/channel.ts")
        );
    }

    #[test]
    fn rejects_tilde_recording_paths() {
        let result =
            resolve_recording_path("~/Videos/channel.ts", Path::new("C:/Users/test/Downloads"));
        assert!(result.is_err());
    }

    #[test]
    fn rejects_absolute_recording_paths() {
        let absolute = std::env::temp_dir()
            .join("Movena Recordings")
            .join("channel.ts");
        assert!(absolute.is_absolute());
        let result = resolve_recording_path(
            absolute.to_str().unwrap(),
            Path::new("C:/Users/test/Downloads"),
        );
        assert!(result.is_err());
    }

    #[test]
    fn rejects_windows_style_tilde_prefixes() {
        let result = resolve_recording_path(
            "~\\Videos\\channel.ts",
            Path::new("C:/Users/test/Downloads"),
        );
        assert!(result.is_err());
    }

    #[test]
    fn rejects_path_traversal_in_recording_paths() {
        let result =
            resolve_recording_path("../../../etc/shadow", Path::new("C:/Users/test/Downloads"));
        assert!(result.is_err());
    }

    #[test]
    fn diagnostic_samples_omit_unavailable_properties() {
        let sample = build_diagnostic_sample([
            ("hwdec-current", Some(json!("d3d11va"))),
            ("video-bitrate", None),
            ("frame-drop-count", Some(json!(2))),
        ]);

        assert_eq!(
            sample,
            json!({
                "hwdec-current": "d3d11va",
                "frame-drop-count": 2,
            })
        );
    }

    #[test]
    fn diagnostic_property_set_never_collects_media_paths() {
        assert!(DIAGNOSTIC_PROPERTIES.contains(&"demuxer-cache-duration"));
        assert!(DIAGNOSTIC_PROPERTIES.contains(&"hwdec-current"));
        assert!(!DIAGNOSTIC_PROPERTIES.contains(&"path"));
        assert!(!DIAGNOSTIC_PROPERTIES.contains(&"stream-path"));
    }

    #[test]
    fn mpv_log_messages_omit_urls_paths_and_headers() {
        for sensitive in [
            "Opening https://provider.test/live/user/password/42.ts",
            "Opening C:\\Users\\viewer\\Videos\\movie.mkv",
            "Opening /home/viewer/Videos/movie.mkv",
            "http-header-fields: Cookie: secret",
        ] {
            assert_eq!(sanitize_mpv_log_text(sensitive), "[media location omitted]");
        }
        assert_eq!(
            sanitize_mpv_log_text("Decoder initialized"),
            "Decoder initialized"
        );
    }

    #[test]
    fn maps_playlist_headers_to_safe_mpv_options() {
        let options = build_http_options(HashMap::from([
            ("User-Agent".to_string(), "Provider App".to_string()),
            ("Referer".to_string(), "https://portal.test/".to_string()),
            ("Origin".to_string(), "https://portal.test".to_string()),
        ]))
        .unwrap();

        assert_eq!(options.user_agent.as_deref(), Some("Provider App"));
        assert_eq!(options.referrer.as_deref(), Some("https://portal.test/"));
        assert_eq!(
            options.header_fields.as_deref(),
            Some("Origin: https://portal.test")
        );
    }

    #[test]
    fn rejects_header_injection_without_echoing_secrets() {
        let error = build_http_options(HashMap::from([(
            "Cookie".to_string(),
            "session=secret\r\nInjected: value".to_string(),
        )]))
        .unwrap_err();

        assert_eq!(error, "A media request header is invalid");
        assert!(!error.contains("secret"));
    }

    #[test]
    fn selects_the_first_existing_bundled_resolver() {
        let base = std::env::temp_dir().join(format!("movena-ytdlp-test-{}", std::process::id()));
        let missing = base.join("missing.exe");
        let present = base.join("yt-dlp.exe");
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(&present, b"test resolver").unwrap();

        assert_eq!(
            first_existing_file([missing, present.clone()]),
            Some(present.clone())
        );

        std::fs::remove_file(present).unwrap();
        std::fs::remove_dir(base).unwrap();
    }

    #[test]
    fn passes_the_bundled_resolver_path_to_mpv_without_shell_parsing() {
        let option =
            ytdlp_script_option(Path::new("C:/Program Files/Movena, Desktop/yt-dlp.exe")).unwrap();

        assert_eq!(
            option,
            "ytdl_hook-ytdl_path=%43%C:/Program Files/Movena, Desktop/yt-dlp.exe"
        );
        assert!(ytdlp_script_option(Path::new("")).is_err());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn normalizes_windows_extended_paths_for_the_resolver() {
        let option = ytdlp_script_option(Path::new(r"\\?\C:\Movena\yt-dlp.exe")).unwrap();

        assert_eq!(option, "ytdl_hook-ytdl_path=%20%C:/Movena/yt-dlp.exe");
    }

    #[test]
    fn libmpv_accepts_the_resolver_script_option() {
        unsafe {
            let mpv = libmpv_sys::mpv_create();
            assert!(!mpv.is_null());
            let _guard = MpvGuard::new(mpv);
            let option =
                ytdlp_script_option(Path::new("C:/Program Files/Movena, Desktop/yt-dlp.exe"))
                    .unwrap();

            assert_eq!(set_mpv_option(mpv, "script-opts", &option), Ok(()));
            let error = set_mpv_option(mpv, "script-opt", &option).unwrap_err();
            assert_eq!(error, "Failed to set mpv option 'script-opt' (error -5)");
            assert!(!error.contains("Program Files"));
        }
    }
}

#[tauri::command(async)]
pub fn mpv_set_property(
    state: State<'_, NativePlayerManager>,
    update: MpvPropertyUpdate,
) -> Result<(), String> {
    let (property, value) = validate_mpv_property(&update)?;
    if let Some(mpv_usize) = *state.handle.lock().unwrap_or_else(|e| e.into_inner()) {
        unsafe {
            mpv_cmd(mpv_usize as *mut mpv_handle, &["set", property, &value])?;
        }
    }
    Ok(())
}
mod diagnostics;
mod options;
mod property;
mod twitch_resolver;
