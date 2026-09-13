//! Dedicated window and fullscreen management for Windows.
//!
//! Movena uses a frameless, transparent window (`decorations: false`, `transparent: true`).
//! On Windows, Desktop Window Manager (DWM) and the Windows Shell (Explorer) require
//! explicit style management to achieve seamless, gapless fullscreen:
//! 1. The Windows Shell is notified via `ITaskbarList2::MarkFullscreenWindow` so the
//!    taskbar lowers its Z-order beneath the active fullscreen window.
//! 2. Window resizing frames (`WS_THICKFRAME`), captions, borders, and maximize styles
//!    are stripped so DWM does not introduce invisible frame insets or gaps.
//! 3. Transitions enter/exit fullscreen directly in a single atomic `SetWindowPos` /
//!    `SetWindowPlacement` call, eliminating multi-step resizing or intermediate visual jump.

use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use windows_sys::core::{BOOL, GUID};
use windows_sys::Win32::Foundation::{GetLastError, SetLastError, HWND};
use windows_sys::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows_sys::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
    COINIT_APARTMENTTHREADED,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetWindowLongW, GetWindowPlacement, SetWindowLongW, SetWindowPlacement, SetWindowPos,
    GWL_EXSTYLE, GWL_STYLE, HWND_TOP, SWP_FRAMECHANGED, SWP_NOCOPYBITS, SWP_NOMOVE, SWP_NOSIZE,
    SWP_NOZORDER, SW_SHOWMAXIMIZED, SW_SHOWNORMAL, WINDOWPLACEMENT, WS_BORDER, WS_CAPTION,
    WS_EX_CLIENTEDGE, WS_EX_STATICEDGE, WS_EX_WINDOWEDGE, WS_MAXIMIZE, WS_POPUP, WS_THICKFRAME,
    WS_VISIBLE,
};

// CLSID_TaskbarList = 56FDF344-FD6D-11d0-958A-006097C9A090
const CLSID_TASKBAR_LIST: GUID = GUID {
    data1: 0x56fdf344,
    data2: 0xfd6d,
    data3: 0x11d0,
    data4: [0x95, 0x8a, 0x00, 0x60, 0x97, 0xc9, 0xa0, 0x90],
};

// IID_ITaskbarList2 = 602D4995-B13A-429b-A66E-1935E44F4317
const IID_ITASKBAR_LIST2: GUID = GUID {
    data1: 0x602d4995,
    data2: 0xb13a,
    data3: 0x429b,
    data4: [0xa6, 0x6e, 0x19, 0x35, 0xe4, 0x4f, 0x43, 0x17],
};

#[repr(C)]
struct ITaskbarList2Vtbl {
    pub query_interface: unsafe extern "system" fn(
        *mut std::ffi::c_void,
        *const GUID,
        *mut *mut std::ffi::c_void,
    ) -> windows_sys::core::HRESULT,
    pub add_ref: unsafe extern "system" fn(*mut std::ffi::c_void) -> u32,
    pub release: unsafe extern "system" fn(*mut std::ffi::c_void) -> u32,
    pub hr_init: unsafe extern "system" fn(*mut std::ffi::c_void) -> windows_sys::core::HRESULT,
    pub add_tab:
        unsafe extern "system" fn(*mut std::ffi::c_void, HWND) -> windows_sys::core::HRESULT,
    pub delete_tab:
        unsafe extern "system" fn(*mut std::ffi::c_void, HWND) -> windows_sys::core::HRESULT,
    pub activate_tab:
        unsafe extern "system" fn(*mut std::ffi::c_void, HWND) -> windows_sys::core::HRESULT,
    pub set_active_alt:
        unsafe extern "system" fn(*mut std::ffi::c_void, HWND) -> windows_sys::core::HRESULT,
    pub mark_fullscreen_window:
        unsafe extern "system" fn(*mut std::ffi::c_void, HWND, BOOL) -> windows_sys::core::HRESULT,
}

#[repr(C)]
struct ITaskbarList2 {
    pub lp_vtbl: *const ITaskbarList2Vtbl,
}

/// RAII wrapper around the Windows TaskbarList COM interface.
struct TaskbarList {
    ptr: *mut std::ffi::c_void,
    co_initialized: bool,
}

impl TaskbarList {
    fn new() -> Option<Self> {
        unsafe {
            let co_init_hr = CoInitializeEx(std::ptr::null_mut(), COINIT_APARTMENTTHREADED as _);
            let co_initialized = co_init_hr >= 0;

            let mut ptr: *mut std::ffi::c_void = std::ptr::null_mut();
            let hr = CoCreateInstance(
                &CLSID_TASKBAR_LIST,
                std::ptr::null_mut(),
                CLSCTX_INPROC_SERVER,
                &IID_ITASKBAR_LIST2,
                &mut ptr,
            );

            if hr < 0 || ptr.is_null() {
                if co_initialized {
                    CoUninitialize();
                }
                return None;
            }

            let tbl = ptr as *mut ITaskbarList2;
            let vtbl = (*tbl).lp_vtbl;
            let init_hr = ((*vtbl).hr_init)(ptr);
            if init_hr < 0 {
                let _ = ((*vtbl).release)(ptr);
                if co_initialized {
                    CoUninitialize();
                }
                return None;
            }

            Some(Self {
                ptr,
                co_initialized,
            })
        }
    }

    fn mark_fullscreen(&self, hwnd: HWND, fullscreen: bool) {
        unsafe {
            let tbl = self.ptr as *mut ITaskbarList2;
            let vtbl = (*tbl).lp_vtbl;
            let _ =
                ((*vtbl).mark_fullscreen_window)(self.ptr, hwnd, if fullscreen { 1 } else { 0 });
        }
    }
}

impl Drop for TaskbarList {
    fn drop(&mut self) {
        unsafe {
            if !self.ptr.is_null() {
                let tbl = self.ptr as *mut ITaskbarList2;
                let vtbl = (*tbl).lp_vtbl;
                let _ = ((*vtbl).release)(self.ptr);
            }
            if self.co_initialized {
                CoUninitialize();
            }
        }
    }
}

#[derive(Default)]
struct SavedWindowState {
    is_fullscreen: bool,
    placement: Option<WINDOWPLACEMENT>,
    style: Option<u32>,
    ex_style: Option<u32>,
}

static WINDOW_STATE: Mutex<SavedWindowState> = Mutex::new(SavedWindowState {
    is_fullscreen: false,
    placement: None,
    style: None,
    ex_style: None,
});

unsafe fn set_window_style(hwnd: HWND, index: i32, value: u32, action: &str) -> Result<(), String> {
    SetLastError(0);
    let previous = SetWindowLongW(hwnd, index, value as i32);
    let error = GetLastError();
    if previous == 0 && error != 0 {
        Err(format!("{action} failed with Windows error {error}"))
    } else {
        Ok(())
    }
}

/// Put the main window into or out of fullscreen mode on Windows.
pub fn set_fullscreen(app: &AppHandle, on: bool) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Failed to get main window".to_string())?;

    let handle = window.window_handle().map_err(|error| error.to_string())?;

    let hwnd = match handle.as_raw() {
        RawWindowHandle::Win32(win32_handle) => win32_handle.hwnd.get() as HWND,
        _ => return Err("Invalid window handle".to_string()),
    };

    let mut state = WINDOW_STATE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    if state.is_fullscreen == on {
        return Ok(on);
    }

    unsafe {
        if on {
            // 1. Capture exact window placement before entering fullscreen.
            //    This records the pre-fullscreen `showCmd` (which may be
            //    `SW_SHOWMAXIMIZED`) so exit restores maximized state correctly.
            let mut wp: WINDOWPLACEMENT = std::mem::zeroed();
            wp.length = std::mem::size_of::<WINDOWPLACEMENT>() as u32;
            if GetWindowPlacement(hwnd, &mut wp) == 0 {
                return Err(format!(
                    "Failed to capture window placement (Windows error {})",
                    GetLastError()
                ));
            }
            state.placement = Some(wp);

            // 2. If the window is maximized, clear the internal maximize
            //    state so DWM frame constraints don't prevent `SetWindowPos`
            //    from covering the screen edge-to-edge.
            //
            //    `SetWindowPlacement` is instant (no DWM animation), unlike
            //    `ShowWindow(SW_RESTORE)` which triggers the animated restore
            //    transition and races the subsequent fullscreen positioning.
            //
            //    Setting `rcNormalPosition` to the monitor rect prevents a
            //    visual flash to the old restored position during the brief
            //    gap before `SetWindowPos` covers the full screen.
            //
            //    The *saved* placement (step 1) still records the original
            //    `showCmd = SW_SHOWMAXIMIZED`, so the exit path re-maximizes.
            let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            let mut mi: MONITORINFO = std::mem::zeroed();
            mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
            if GetMonitorInfoW(monitor, &mut mi) == 0 {
                return Err("Failed to query monitor info".to_string());
            }
            let rc = mi.rcMonitor;

            if wp.showCmd == SW_SHOWMAXIMIZED as u32 {
                log::info!("clearing maximize state before entering fullscreen");
                let mut clear_wp = wp;
                clear_wp.showCmd = SW_SHOWNORMAL as u32;
                clear_wp.rcNormalPosition = rc;
                if SetWindowPlacement(hwnd, &clear_wp) == 0 {
                    return Err(format!(
                        "Failed to clear maximized placement (Windows error {})",
                        GetLastError()
                    ));
                }
            }

            // 3. Capture styles *after* clearing maximize so the style bits
            //    reflect the clean restored state (no stale `WS_MAXIMIZE`).
            //    The saved `WINDOWPLACEMENT` already knows how to re-maximize.
            let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
            state.style = Some(style);

            let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
            state.ex_style = Some(ex_style);

            // 4. Notify Windows Shell via TaskbarList COM interface
            if let Some(taskbar) = TaskbarList::new() {
                taskbar.mark_fullscreen(hwnd, true);
            }

            // Undecorated windows get DWM's 1px shadow border (and, on
            // Windows 11, rounded corners) — desirable in windowed mode, but
            // once the window covers the full monitor edge-to-edge that same
            // border/corner clipping sits on the screen edge and lets the
            // desktop behind it show through. Drop it only while fullscreen.
            let _ = window.set_shadow(false);

            // 5. Remove resizing frame borders (WS_THICKFRAME), captions, borders, and maximize styles
            // so DWM treats the surface as gapless full-canvas without frame margins.
            let fullscreen_style = (style
                & !(WS_THICKFRAME | WS_CAPTION | WS_BORDER | WS_MAXIMIZE))
                | WS_POPUP
                | WS_VISIBLE;
            if let Err(error) = set_window_style(
                hwnd,
                GWL_STYLE,
                fullscreen_style,
                "Applying fullscreen window style",
            ) {
                let _ = window.set_shadow(true);
                return Err(error);
            }

            let fullscreen_ex_style =
                ex_style & !(WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE | WS_EX_STATICEDGE);
            if let Err(error) = set_window_style(
                hwnd,
                GWL_EXSTYLE,
                fullscreen_ex_style,
                "Applying fullscreen extended style",
            ) {
                let _ = set_window_style(hwnd, GWL_STYLE, style, "Rolling back window style");
                let _ = window.set_shadow(true);
                return Err(error);
            }

            // 6. Position and resize to full monitor in a single atomic call
            if SetWindowPos(
                hwnd,
                HWND_TOP,
                rc.left,
                rc.top,
                rc.right - rc.left,
                rc.bottom - rc.top,
                SWP_FRAMECHANGED | SWP_NOCOPYBITS,
            ) == 0
            {
                let position_error = GetLastError();
                let _ =
                    set_window_style(hwnd, GWL_EXSTYLE, ex_style, "Rolling back extended style");
                let _ = set_window_style(hwnd, GWL_STYLE, style, "Rolling back window style");
                let _ = SetWindowPlacement(hwnd, &wp);
                if let Some(taskbar) = TaskbarList::new() {
                    taskbar.mark_fullscreen(hwnd, false);
                }
                let _ = window.set_shadow(true);
                state.placement = None;
                state.style = None;
                state.ex_style = None;
                return Err(format!(
                    "Failed to position fullscreen window (Windows error {position_error})"
                ));
            }

            state.is_fullscreen = true;
        } else {
            // 1. Notify Windows Shell that fullscreen has ended
            if let Some(taskbar) = TaskbarList::new() {
                taskbar.mark_fullscreen(hwnd, false);
            }

            // Restore the windowed-mode shadow/border dropped on entry.
            let _ = window.set_shadow(true);

            // 2. Restore original styles
            if let Some(ex_style) = state.ex_style {
                set_window_style(
                    hwnd,
                    GWL_EXSTYLE,
                    ex_style,
                    "Restoring window extended style",
                )?;
            }
            if let Some(style) = state.style {
                set_window_style(hwnd, GWL_STYLE, style, "Restoring window style")?;
            }

            // 3. Restore original window placement (maximized or normal windowed bounds)
            if let Some(wp) = state.placement.as_ref() {
                if SetWindowPlacement(hwnd, wp) == 0 {
                    return Err(format!(
                        "Failed to restore window placement (Windows error {})",
                        GetLastError()
                    ));
                }
            }

            // 4. Recalculate frame without extra repositioning
            if SetWindowPos(
                hwnd,
                std::ptr::null_mut(),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED | SWP_NOCOPYBITS,
            ) == 0
            {
                return Err(format!(
                    "Failed to refresh the restored window frame (Windows error {})",
                    GetLastError()
                ));
            }

            state.is_fullscreen = false;
            state.placement = None;
            state.style = None;
            state.ex_style = None;
        }
    }

    Ok(on)
}

/// Re-applies the fullscreen style/position without touching the saved
/// pre-fullscreen placement — a no-op unless fullscreen is currently active.
///
/// `mpv_start` (see `player/mod.rs`) fully tears down and recreates its
/// embedded window on every episode switch, not just the first stream in a
/// session. If that happens while the app is fullscreen, the window has been
/// observed to come back at a different size/style than the fullscreen
/// placement we already applied — visually indistinguishable from exiting
/// fullscreen, but our own `is_fullscreen` flag (only ever changed by an
/// explicit `set_fullscreen` call) never agreed, leaving the custom window
/// chrome that depends on it hidden over a window it can no longer control.
/// Rather than chase the exact mechanism inside libmpv's embed step, the
/// player calls this right after every `mpv_start` to unconditionally put
/// the already-known-correct fullscreen geometry back.
///
/// This runs from two different threads that can race each other: `mpv_start`
/// calls it synchronously on the command's own thread, and the mpv event
/// thread calls it again once `vo-configured` fires for the new stream —
/// which can land right as the *close* path calls `set_fullscreen(false)` on
/// yet another thread to leave fullscreen for real. Both functions touch the
/// same raw HWND with unsynchronized `SetWindowLongW`/`SetWindowPos` calls, so
/// the `WINDOW_STATE` mutex has to stay held for the *entire* operation here,
/// exactly like `set_fullscreen` already does — not just for the initial
/// flag check — otherwise the two can interleave their Win32 calls and leave
/// the window with mismatched style/geometry (e.g. sized to the fullscreen
/// monitor rect but styled with a caption/border, which reads as the whole
/// UI being blown up/"zoomed"), and `set_fullscreen(false)` can come back
/// with stale inputs and return an `Err` that leaves the frontend's
/// `isFullscreen` flag — and the custom window chrome gated on it — stuck on
/// forever.
pub fn reassert_fullscreen(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Failed to get main window".to_string())?;
    let handle = window.window_handle().map_err(|error| error.to_string())?;
    let hwnd = match handle.as_raw() {
        RawWindowHandle::Win32(win32_handle) => win32_handle.hwnd.get() as HWND,
        _ => return Err("Invalid window handle".to_string()),
    };

    let state = WINDOW_STATE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if !state.is_fullscreen {
        return Ok(());
    }
    let (Some(style), Some(ex_style)) = (state.style, state.ex_style) else {
        // Fullscreen is flagged active but we never captured what to derive
        // the fullscreen style from — nothing safe to reapply.
        return Ok(());
    };
    // Deliberately NOT dropping `state` here: it must stay locked across the
    // Win32 calls below so this can never interleave with a concurrent
    // `set_fullscreen` call from another thread. See the doc comment above.

    unsafe {
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(monitor, &mut mi) == 0 {
            return Err("Failed to query monitor info".to_string());
        }
        let rc = mi.rcMonitor;

        if let Some(taskbar) = TaskbarList::new() {
            taskbar.mark_fullscreen(hwnd, true);
        }
        let _ = window.set_shadow(false);

        // Same derivation as the entry path in `set_fullscreen`, from the
        // same saved pre-fullscreen style — never from whatever the style
        // bits currently read as, which is exactly what may have drifted.
        let fullscreen_style = (style & !(WS_THICKFRAME | WS_CAPTION | WS_BORDER | WS_MAXIMIZE))
            | WS_POPUP
            | WS_VISIBLE;
        set_window_style(
            hwnd,
            GWL_STYLE,
            fullscreen_style,
            "Reapplying fullscreen window style",
        )?;

        let fullscreen_ex_style =
            ex_style & !(WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE | WS_EX_STATICEDGE);
        set_window_style(
            hwnd,
            GWL_EXSTYLE,
            fullscreen_ex_style,
            "Reapplying fullscreen extended style",
        )?;

        if SetWindowPos(
            hwnd,
            HWND_TOP,
            rc.left,
            rc.top,
            rc.right - rc.left,
            rc.bottom - rc.top,
            SWP_FRAMECHANGED | SWP_NOCOPYBITS,
        ) == 0
        {
            return Err(format!(
                "Failed to reposition fullscreen window (Windows error {})",
                GetLastError()
            ));
        }
    }

    Ok(())
}
