// The video surface itself: an `NSOpenGLContext` that libmpv renders into
// through its render API. (Included into the parent module, so these are
// ordinary comments rather than `//!` module docs.)
//
// mpv registers no OpenGL GPU context for macOS. `video/out/gpu/context.c`
// offers exactly two there, `macvk` and `displayvk`, and both go through
// Vulkan-via-MoltenVK; every OpenGL `ra_ctx` in that table is gated behind
// Windows, X11, Wayland or Android. MoltenVK in turn refuses hardware whose
// Metal feature set it does not support — a 2015 Intel HD 6000 answers
// `VK_ERROR_INCOMPATIBLE_DRIVER` at `vkCreateInstance`, before a window or a
// surface is ever involved — so on those Macs both contexts fail, mpv reports
// "Failed initializing any suitable GPU context!" and configures no video
// output at all while audio keeps playing.
//
// mpv's own OpenGL path, cocoa-cb, cannot be borrowed for this: `initCocoaCb`
// in `osdep/mac/app_hub.swift` returns early unless `NSApp` is mpv's own
// `Application` subclass, which only the standalone mpv binary installs. No
// build flag reaches it from inside a host application.
//
// What is left is to stop asking mpv for a context and hand it one instead:
// `--vo=libmpv` plus `mpv_render_context_create`. Vulkan never enters the
// picture, so this renders on anything with desktop OpenGL — including the
// GPUs MoltenVK turns down.
//
// Apple deprecated all of OpenGL in favour of Metal, so every NSOpenGL* item
// below carries a deprecation warning. Metal is not an option here: it would
// mean MoltenVK again, which is the thing that does not work. The warnings are
// silenced per item rather than papered over crate-wide.

use std::ffi::c_void;
use std::os::raw::{c_char, c_int};
use std::ptr::{self, NonNull};
use std::sync::atomic::{AtomicI32, AtomicUsize};
use std::sync::{Arc, Condvar};

use libmpv_sys::{
    mpv_handle, mpv_opengl_fbo, mpv_opengl_init_params, mpv_render_context,
    mpv_render_context_create, mpv_render_context_free, mpv_render_context_render,
    mpv_render_context_set_update_callback, mpv_render_context_update, mpv_render_param,
    mpv_render_param_type_MPV_RENDER_PARAM_API_TYPE,
    mpv_render_param_type_MPV_RENDER_PARAM_FLIP_Y,
    mpv_render_param_type_MPV_RENDER_PARAM_INVALID,
    mpv_render_param_type_MPV_RENDER_PARAM_OPENGL_FBO,
    mpv_render_param_type_MPV_RENDER_PARAM_OPENGL_INIT_PARAMS,
    mpv_render_update_flag_MPV_RENDER_UPDATE_FRAME, MPV_RENDER_API_TYPE_OPENGL,
};
use objc2::{msg_send, MainThreadOnly};
#[allow(deprecated)]
use objc2_app_kit::{
    NSBackingStoreType, NSOpenGLContext, NSOpenGLPFAAccelerated, NSOpenGLPFAAllowOfflineRenderers,
    NSOpenGLPFAAlphaSize, NSOpenGLPFAColorSize, NSOpenGLPFADoubleBuffer, NSOpenGLPFAOpenGLProfile,
    NSOpenGLPixelFormat, NSOpenGLPixelFormatAttribute, NSOpenGLProfileVersion3_2Core,
    NSOpenGLProfileVersionLegacy,
};
use objc2_foundation::NSString;

// Apple's rule for drawing on a thread other than the one calling
// `-[NSOpenGLContext update]`: both sides take this lock, so a resize cannot
// land in the middle of a frame. The CGL context object is fetched by message
// send rather than through the typed accessor, which keeps CGL's opaque
// pointer typedefs out of this file entirely.
#[link(name = "OpenGL", kind = "framework")]
extern "C" {
    fn CGLLockContext(ctx: *mut c_void) -> i32;
    fn CGLUnlockContext(ctx: *mut c_void) -> i32;
}

extern "C" {
    fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
}

/// Every GL symbol libmpv asks for is already in this process — AppKit links
/// the OpenGL framework, and so does this file — so the default search order
/// resolves them without opening the framework bundle by hand.
const RTLD_DEFAULT: *mut c_void = -2isize as *mut c_void;

unsafe extern "C" fn get_proc_address(_ctx: *mut c_void, name: *const c_char) -> *mut c_void {
    unsafe { dlsym(RTLD_DEFAULT, name) }
}

/// Called by mpv when a frame is ready. Only ever signals — every render call
/// has to happen on the render thread, not in here.
unsafe extern "C" fn on_render_update(ctx: *mut c_void) {
    if ctx.is_null() {
        return;
    }
    // Borrowed, never reclaimed here: the `Arc` this points into is dropped
    // only after `mpv_render_context_free` has returned, and mpv guarantees no
    // callback runs after that.
    let renderer = unsafe { &*(ctx as *const Renderer) };
    renderer.request_frame();
}

/// Shared between the render thread and the main thread. Pointers are held as
/// `usize` for the same reason the player holds mpv's handle that way: the
/// AppKit and mpv objects behind them are not `Send`, and passing them across
/// threads under our own serialisation is the entire job of this type.
struct Renderer {
    /// `*mut mpv_render_context`. Zeroed before the context is freed, so a
    /// frame already in flight stops before it touches freed memory.
    context: AtomicUsize,
    /// `*mut NSOpenGLContext`, retained for as long as this renderer lives.
    gl: AtomicUsize,
    /// Drawable size in backing-store pixels, restated on every resize.
    width: AtomicI32,
    height: AtomicI32,
    stop: AtomicBool,
    /// Set by mpv's update callback and by resizes, cleared by the render thread.
    pending: Mutex<bool>,
    wake: Condvar,
}

#[allow(deprecated)]
impl Renderer {
    fn request_frame(&self) {
        {
            let mut pending = self.pending.lock().unwrap_or_else(|error| error.into_inner());
            *pending = true;
        }
        self.wake.notify_one();
    }

    fn gl_context(&self) -> Option<Retained<NSOpenGLContext>> {
        let ptr = self.gl.load(Ordering::SeqCst) as *mut NSOpenGLContext;
        if ptr.is_null() {
            return None;
        }
        unsafe { Retained::retain(ptr) }
    }

    fn draw(&self) {
        let context = self.context.load(Ordering::SeqCst) as *mut mpv_render_context;
        if context.is_null() {
            return;
        }
        let flags = unsafe { mpv_render_context_update(context) };
        if flags & u64::from(mpv_render_update_flag_MPV_RENDER_UPDATE_FRAME) == 0 {
            return;
        }

        let width = self.width.load(Ordering::SeqCst);
        let height = self.height.load(Ordering::SeqCst);
        let Some(gl) = self.gl_context() else {
            return;
        };
        if width <= 0 || height <= 0 {
            return;
        }

        let cgl: *mut c_void = unsafe { msg_send![&*gl, CGLContextObj] };
        unsafe { CGLLockContext(cgl) };
        gl.makeCurrentContext();

        // The target is the context's own double-buffered drawable, hence FBO
        // 0. mpv renders bottom-up as OpenGL does, which is upside down for a
        // window's default framebuffer, so it is asked to flip.
        let mut fbo = mpv_opengl_fbo {
            fbo: 0,
            w: width,
            h: height,
            internal_format: 0,
        };
        let mut flip: c_int = 1;
        let mut params = [
            mpv_render_param {
                type_: mpv_render_param_type_MPV_RENDER_PARAM_OPENGL_FBO,
                data: &mut fbo as *mut _ as *mut c_void,
            },
            mpv_render_param {
                type_: mpv_render_param_type_MPV_RENDER_PARAM_FLIP_Y,
                data: &mut flip as *mut _ as *mut c_void,
            },
            mpv_render_param {
                type_: mpv_render_param_type_MPV_RENDER_PARAM_INVALID,
                data: ptr::null_mut(),
            },
        ];
        unsafe { mpv_render_context_render(context, params.as_mut_ptr()) };
        gl.flushBuffer();
        unsafe { CGLUnlockContext(cgl) };
    }
}

/// Which pixel format was chosen, for the report below.
static PIXEL_FORMAT: Mutex<Option<&'static str>> = Mutex::new(None);

/// Record something worth seeing in a bug report.
///
/// This goes out on the same event the mpv log messages use, so it lands in the
/// diagnostic report a user can export from the app. `log::info!` alone would
/// not: the logger is only registered for debug builds (see `lib.rs`), so in a
/// release build — exactly where a report matters — it goes nowhere.
fn report(app: &AppHandle, level: &str, text: String) {
    match level {
        "error" => log::error!("{text}"),
        _ => log::info!("{text}"),
    }
    let _ = app.emit(
        "mpv-event",
        serde_json::json!({
            "type": "log-message",
            "data": { "prefix": "movena/video", "level": level, "text": text },
        }),
    );
}

/// The live renderer, while a stream is playing.
static RENDERER: Mutex<Option<Arc<Renderer>>> = Mutex::new(None);

/// Join handle for the render thread.
static RENDER_THREAD: Mutex<Option<thread::JoinHandle<()>>> = Mutex::new(None);

/// The `Arc::into_raw` pointer handed to mpv as the update callback's context,
/// kept so the reference can be reclaimed once mpv can no longer invoke it.
static CALLBACK_CTX: AtomicUsize = AtomicUsize::new(0);

/// The surface window and its content view, each retained once and released in
/// [`teardown`].
static SURFACE_WINDOW: AtomicUsize = AtomicUsize::new(0);
static SURFACE_VIEW: AtomicUsize = AtomicUsize::new(0);

/// Pick a pixel format, preferring a 3.2 core profile and settling for a legacy
/// one. mpv's renderer wants GL 3.x but does not insist on it, and the machines
/// this file exists for are exactly the old ones most likely to be fussy.
#[allow(deprecated)]
fn pixel_format() -> Option<Retained<NSOpenGLPixelFormat>> {
    for profile in [NSOpenGLProfileVersion3_2Core, NSOpenGLProfileVersionLegacy] {
        let attributes: [NSOpenGLPixelFormatAttribute; 10] = [
            NSOpenGLPFAOpenGLProfile,
            profile,
            NSOpenGLPFAAccelerated,
            NSOpenGLPFADoubleBuffer,
            NSOpenGLPFAColorSize,
            24,
            NSOpenGLPFAAlphaSize,
            8,
            NSOpenGLPFAAllowOfflineRenderers,
            0,
        ];
        let format = unsafe {
            NSOpenGLPixelFormat::initWithAttributes(
                NSOpenGLPixelFormat::alloc(),
                NonNull::new_unchecked(attributes.as_ptr() as *mut NSOpenGLPixelFormatAttribute),
            )
        };
        if format.is_some() {
            let name = if profile == NSOpenGLProfileVersion3_2Core {
                "OpenGL 3.2 core"
            } else {
                "OpenGL legacy"
            };
            *PIXEL_FORMAT.lock().unwrap_or_else(|error| error.into_inner()) = Some(name);
            log::info!("video surface pixel format: {name}");
            return format;
        }
    }
    None
}

/// Build the video surface and start rendering `mpv` into it.
///
/// The window carries [`SURFACE_TITLE`] exactly as mpv's own used to, so
/// `find_surface` and everything downstream of it keeps working unchanged.
/// Failing here is not fatal on its own: mpv still has its own Vulkan outputs
/// to try and only falls back to this one if those do not start. It is recorded
/// either way, because if they then fail too, this is why nothing caught it.
pub fn start(app: &AppHandle, mpv: *mut mpv_handle) {
    VO_RESOLVED.store(false, Ordering::SeqCst);
    let mpv = mpv as usize;
    let created = with_main_blocking(app, Duration::from_secs(5), move |app, mtm| {
        match create_surface(app, mtm, mpv as *mut mpv_handle) {
            Ok(()) => true,
            Err(error) => {
                report(app, "error", format!("no OpenGL video surface: {error}"));
                false
            }
        }
    });
    if created.is_none() {
        report(
            app,
            "error",
            "no OpenGL video surface: timed out building it".to_string(),
        );
    }
}

#[allow(deprecated)]
fn create_surface(
    app: &AppHandle,
    mtm: MainThreadMarker,
    mpv: *mut mpv_handle,
) -> Result<(), String> {
    let parent = parent_window(app).ok_or("the main window is not reachable")?;
    let size = video_frame(&parent).size;
    // Built off screen and deliberately untitled. mpv may still pick one of its
    // own Vulkan outputs over this one (see the `vo` list in the player), and
    // if it does, it builds its *own* window carrying `SURFACE_TITLE`. Staying
    // nameless until `promote` keeps `find_surface` from adopting this one by
    // mistake, and staying off screen keeps it invisible in the meantime —
    // while still being a real on-screen-list window, which is what gives it
    // the drawable `setView:` needs.
    let frame = NSRect::new(NSPoint::new(-30000.0, -30000.0), size);

    let window = unsafe {
        NSWindow::initWithContentRect_styleMask_backing_defer(
            NSWindow::alloc(mtm),
            frame,
            NSWindowStyleMask::Borderless,
            NSBackingStoreType::Buffered,
            false,
        )
    };
    // Closing must not free it behind our back; `teardown` owns its lifetime.
    unsafe { window.setReleasedWhenClosed(false) };

    let view = NSView::initWithFrame(
        NSView::alloc(mtm),
        NSRect::new(NSPoint::new(0.0, 0.0), frame.size),
    );
    // Without this the drawable stays point-sized and every Retina display
    // shows the video upscaled from half resolution.
    #[allow(deprecated)]
    view.setWantsBestResolutionOpenGLSurface(true);
    window.setContentView(Some(&view));
    // Ordered in before the context is attached: `-[NSOpenGLContext setView:]`
    // wants a view that is in an on-screen window, or it comes back with an
    // invalid drawable. Being parked off screen is fine for that; it just
    // cannot be ordered out.
    window.orderFront(None);

    let format = pixel_format().ok_or("no usable OpenGL pixel format on this system")?;
    let gl =
        NSOpenGLContext::initWithFormat_shareContext(NSOpenGLContext::alloc(), &format, None)
            .ok_or("could not create an OpenGL context")?;
    gl.setView(Some(&view), mtm);
    // `mpv_render_context_create` probes the *live* context — GL version and
    // extension list — so it has to be current on this thread by the time it
    // runs, or the probe comes back empty and the call fails with
    // MPV_ERROR_UNSUPPORTED. mpv's own cocoa-cb does the same thing right
    // before its `initRender`.
    gl.makeCurrentContext();

    let renderer = Arc::new(Renderer {
        context: AtomicUsize::new(0),
        gl: AtomicUsize::new(Retained::into_raw(gl) as usize),
        width: AtomicI32::new(0),
        height: AtomicI32::new(0),
        stop: AtomicBool::new(false),
        pending: Mutex::new(false),
        wake: Condvar::new(),
    });

    let callback_ctx = Arc::into_raw(Arc::clone(&renderer));
    let mut context: *mut mpv_render_context = ptr::null_mut();
    let mut init = mpv_opengl_init_params {
        get_proc_address: Some(get_proc_address),
        get_proc_address_ctx: ptr::null_mut(),
        extra_exts: ptr::null(),
    };
    let mut params = [
        mpv_render_param {
            type_: mpv_render_param_type_MPV_RENDER_PARAM_API_TYPE,
            data: MPV_RENDER_API_TYPE_OPENGL.as_ptr() as *mut c_void,
        },
        mpv_render_param {
            type_: mpv_render_param_type_MPV_RENDER_PARAM_OPENGL_INIT_PARAMS,
            data: &mut init as *mut _ as *mut c_void,
        },
        mpv_render_param {
            type_: mpv_render_param_type_MPV_RENDER_PARAM_INVALID,
            data: ptr::null_mut(),
        },
    ];
    let status = unsafe { mpv_render_context_create(&mut context, mpv, params.as_mut_ptr()) };
    // Give the context back: it may only be current on one thread at a time,
    // and from here on that thread is the render thread.
    NSOpenGLContext::clearCurrentContext();
    if status < 0 {
        // Reclaim the reference mpv never got to keep, then let the context go.
        drop(unsafe { Arc::from_raw(callback_ctx) });
        release_gl(&renderer);
        return Err(format!("mpv_render_context_create failed ({status})"));
    }

    renderer.context.store(context as usize, Ordering::SeqCst);
    CALLBACK_CTX.store(callback_ctx as usize, Ordering::SeqCst);
    unsafe {
        mpv_render_context_set_update_callback(
            context,
            Some(on_render_update),
            callback_ctx as *mut c_void,
        );
    }

    SURFACE_VIEW.store(Retained::into_raw(view) as usize, Ordering::SeqCst);
    SURFACE_WINDOW.store(Retained::into_raw(window) as usize, Ordering::SeqCst);

    let thread_renderer = Arc::clone(&renderer);
    let handle = thread::Builder::new()
        .name("movena-video".to_string())
        .spawn(move || render_loop(thread_renderer))
        .map_err(|error| error.to_string())?;
    *RENDER_THREAD.lock().unwrap_or_else(|error| error.into_inner()) = Some(handle);
    *RENDERER.lock().unwrap_or_else(|error| error.into_inner()) = Some(renderer);

    resize();
    log::info!(
        "video surface created ({}x{})",
        frame.size.width,
        frame.size.height
    );
    Ok(())
}

#[allow(deprecated)]
fn render_loop(renderer: Arc<Renderer>) {
    while !renderer.stop.load(Ordering::SeqCst) {
        {
            let mut pending = renderer
                .pending
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            while !*pending && !renderer.stop.load(Ordering::SeqCst) {
                // The timeout is only a safety net against a missed wake-up;
                // frames normally arrive through the condvar.
                let (guard, _) = renderer
                    .wake
                    .wait_timeout(pending, Duration::from_millis(100))
                    .unwrap_or_else(|error| error.into_inner());
                pending = guard;
            }
            *pending = false;
        }
        if renderer.stop.load(Ordering::SeqCst) {
            break;
        }
        renderer.draw();
    }
    // Leave the context unclaimed, so `teardown` can make it current on its
    // own thread to let mpv delete its GL objects.
    NSOpenGLContext::clearCurrentContext();
}

fn view_ref() -> Option<Retained<NSView>> {
    let ptr = SURFACE_VIEW.load(Ordering::SeqCst) as *mut NSView;
    if ptr.is_null() {
        return None;
    }
    unsafe { Retained::retain(ptr) }
}

#[allow(deprecated)]
fn release_gl(renderer: &Renderer) {
    let ptr = renderer.gl.swap(0, Ordering::SeqCst) as *mut NSOpenGLContext;
    if ptr.is_null() {
        return;
    }
    if let Some(gl) = unsafe { Retained::from_raw(ptr) } {
        gl.clearDrawable();
    }
}

/// Restate the drawable size after the surface moved or resized, and ask for a
/// frame so the new size is actually painted.
///
/// `-[NSOpenGLContext update]` has to happen on the main thread; it takes the
/// same CGL lock the render thread does, so it cannot interleave with a frame.
/// Called from `place_surface`, which always runs there.
#[allow(deprecated)]
pub fn resize() {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let guard = RENDERER.lock().unwrap_or_else(|error| error.into_inner());
    let Some(renderer) = guard.as_ref() else {
        return;
    };
    let Some(view) = view_ref() else {
        return;
    };
    // The window sizes its own content view, so the view's bounds already
    // track the frame `place_surface` just set. Nothing here may touch the
    // view itself — the render thread is drawing into it.
    let backing = view.convertRectToBacking(view.bounds());
    renderer
        .width
        .store(backing.size.width as i32, Ordering::SeqCst);
    renderer
        .height
        .store(backing.size.height as i32, Ordering::SeqCst);
    if let Some(gl) = renderer.gl_context() {
        gl.update(mtm);
    }
    renderer.request_frame();
}

/// Drawable size in backing-store pixels, or zeros if there is no renderer.
fn drawable_size() -> (i32, i32) {
    let guard = RENDERER.lock().unwrap_or_else(|error| error.into_inner());
    guard.as_ref().map_or((0, 0), |renderer| {
        (
            renderer.width.load(Ordering::SeqCst),
            renderer.height.load(Ordering::SeqCst),
        )
    })
}

/// Whether the choice below has already been made for the running stream.
/// `vo-configured` fires again on every output reconfiguration, not just the
/// first one.
static VO_RESOLVED: AtomicBool = AtomicBool::new(false);

/// Called once mpv has an active video output, with whatever `current-vo`
/// reports.
///
/// mpv is handed a VO priority list rather than a single choice, so it settles
/// this itself: its own Vulkan-backed outputs first — which keep gpu-next and
/// with it libplacebo, Dolby Vision and the better scaling — and the render
/// API here only where those cannot start. Whichever won, exactly one surface
/// gets embedded and the other is released.
pub fn adopt_video_output(app: &AppHandle, current_vo: Option<&str>) {
    if VO_RESOLVED.swap(true, Ordering::SeqCst) {
        return;
    }
    if current_vo == Some("libmpv") {
        let format = PIXEL_FORMAT
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .unwrap_or("unknown");
        let (width, height) = drawable_size();
        report(
            app,
            "info",
            format!(
                "video output: libmpv render API on {format} at {width}x{height}. \
                 mpv's own Vulkan outputs did not start on this GPU, so playback \
                 is running on the legacy renderer — no Dolby Vision, weaker scaling."
            ),
        );
        promote(app);
    } else {
        // mpv got one of its own contexts up and built its own window for it.
        // Ours never drew a frame; let it go before adopting mpv's.
        report(
            app,
            "info",
            format!(
                "video output: {} (mpv's own window, full gpu-next pipeline)",
                current_vo.unwrap_or("unknown"),
            ),
        );
        teardown(app);
    }
    attach(app);
}

/// Make the surface discoverable by `find_surface`, which is what lets the
/// adoption that follows pick it up. Its position is set there.
///
/// This only names the window; `attach` polls, so it does not matter that the
/// hop to the main thread lands a moment later.
fn promote(app: &AppHandle) {
    with_main(app, |_app, _mtm| {
        let ptr = SURFACE_WINDOW.load(Ordering::SeqCst) as *mut NSWindow;
        if ptr.is_null() {
            return;
        }
        if let Some(window) = unsafe { Retained::retain(ptr) } {
            window.setTitle(&NSString::from_str(SURFACE_TITLE));
        }
    });
}

/// Stop rendering and release everything this module owns.
///
/// Ordering is the whole point. The render thread is stopped and joined first,
/// so no frame can be in flight when `mpv_render_context_free` runs, and that
/// has to finish before the caller destroys the mpv handle the context belongs
/// to. Only then do the AppKit objects go, and those go on the main thread.
#[allow(deprecated)]
pub fn teardown(app: &AppHandle) {
    let Some(renderer) = RENDERER
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .take()
    else {
        return;
    };

    renderer.stop.store(true, Ordering::SeqCst);
    renderer.request_frame();
    if let Some(handle) = RENDER_THREAD
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .take()
    {
        let _ = handle.join();
    }

    let context = renderer.context.swap(0, Ordering::SeqCst) as *mut mpv_render_context;
    if !context.is_null() {
        // mpv deletes its own GL objects in here — timer queries, textures,
        // shaders — so the context has to be current on *this* thread, exactly
        // as it does for rendering. Without it this faults inside
        // glDeleteQueries. The render thread has exited by now, so the context
        // is free to be claimed here.
        let gl = renderer.gl_context();
        if let Some(gl) = &gl {
            gl.makeCurrentContext();
        }
        unsafe { mpv_render_context_free(context) };
        if gl.is_some() {
            NSOpenGLContext::clearCurrentContext();
        }
    }
    // Safe only now that mpv can no longer reach the callback.
    let callback_ctx = CALLBACK_CTX.swap(0, Ordering::SeqCst) as *const Renderer;
    if !callback_ctx.is_null() {
        drop(unsafe { Arc::from_raw(callback_ctx) });
    }

    with_main_blocking(app, Duration::from_secs(2), move |_app, _mtm| {
        release_gl(&renderer);
        let view = SURFACE_VIEW.swap(0, Ordering::SeqCst) as *mut NSView;
        if !view.is_null() {
            drop(unsafe { Retained::from_raw(view) });
        }
        let window = SURFACE_WINDOW.swap(0, Ordering::SeqCst) as *mut NSWindow;
        if !window.is_null() {
            if let Some(window) = unsafe { Retained::from_raw(window) } {
                window.close();
            }
        }
        true
    });
    log::info!("video surface torn down");
}
