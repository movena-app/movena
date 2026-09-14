pub(crate) mod files;

use std::path::Path;
use tauri::{Manager, State};

fn remove_cached_app_data(app_data: &Path, app_cache: &Path) -> Result<(), String> {
    for path in [
        app_data.join("m3u-cache"),
        app_data.join("xmltv-cache"),
        app_cache.join("twitch-resolver"),
    ] {
        match std::fs::remove_dir_all(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("Could not remove cached application data".to_string()),
        }
    }
    Ok(())
}

#[tauri::command(async)]
pub(crate) fn app_data_clear(
    app: tauri::AppHandle,
    player: State<'_, crate::player::NativePlayerManager>,
    source_ids: Vec<String>,
) -> Result<(), String> {
    player.stop(&app)?;

    for source_id in source_ids {
        match crate::credentials::source::source_secret_entry(&source_id)?.delete_credential() {
            Ok(()) | Err(keyring::v1::Error::NoEntry) => {}
            Err(error) => return Err(format!("Failed to delete source credential: {error}")),
        }
    }
    crate::credentials::xtream::credential_delete()?;

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|_| "Application data is unavailable".to_string())?;
    let app_cache = app
        .path()
        .app_cache_dir()
        .map_err(|_| "Application cache is unavailable".to_string())?;
    remove_cached_app_data(&app_data, &app_cache)
}

#[cfg(test)]
mod tests {
    use super::remove_cached_app_data;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn removes_playlist_guide_and_twitch_resolver_caches() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "movena-app-data-clear-{}-{unique}",
            std::process::id()
        ));
        let app_data = root.join("data");
        let app_cache = root.join("cache");
        for path in [
            app_data.join("m3u-cache"),
            app_data.join("xmltv-cache"),
            app_cache.join("twitch-resolver"),
        ] {
            std::fs::create_dir_all(&path).unwrap();
            std::fs::write(path.join("private-cache"), b"private").unwrap();
        }

        remove_cached_app_data(&app_data, &app_cache).unwrap();

        assert!(!app_data.join("m3u-cache").exists());
        assert!(!app_data.join("xmltv-cache").exists());
        assert!(!app_cache.join("twitch-resolver").exists());
        let _ = std::fs::remove_dir_all(root);
    }
}
