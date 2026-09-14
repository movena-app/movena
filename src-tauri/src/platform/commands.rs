//! Window operations kept separate from the media/source command surface.
//!
//! Fullscreen is intentionally implemented here instead of in the frontend:
//! macOS uses a simple content resize so the child libmpv window remains below
//! the webview controls; Windows uses direct Win32 placement/shell management
//! so frameless windows cover the taskbar without resizing jumps or edge gaps;
//! other platforms fall back to Tauri's native fullscreen.

/// Put the player into fullscreen and report the state actually applied.
#[tauri::command(async)]
pub fn player_set_fullscreen(app: tauri::AppHandle, on: bool) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(super::macos::set_simple_fullscreen(&app, on))
    }
    #[cfg(target_os = "windows")]
    {
        super::windows::set_fullscreen(&app, on)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        use tauri::Manager;

        let window = app
            .get_webview_window("main")
            .ok_or("Failed to get main window")?;
        window
            .set_fullscreen(on)
            .map_err(|error| error.to_string())?;
        Ok(on)
    }
}

/// Hide or show the mouse pointer while the player chrome is hidden.
#[tauri::command(async)]
pub fn player_set_cursor_hidden(app: tauri::AppHandle, hidden: bool) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        super::macos::set_cursor_hidden(&app, hidden);
        Ok(true)
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Nothing native here; the caller falls back to CSS.
        let _ = (app, hidden);
        Ok(false)
    }
}
