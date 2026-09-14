use std::path::PathBuf;

use crate::sources::MAX_M3U_BYTES;
const MAX_SETTINGS_CONFIG_BYTES: u64 = 1024 * 1024;

fn validate_settings_path(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if path
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err("Settings file path must not contain '..' segments".to_string());
    }
    match path.extension().and_then(|extension| extension.to_str()) {
        Some(extension) if extension.eq_ignore_ascii_case("json") => Ok(path),
        _ => Err("Settings files must have a .json extension".to_string()),
    }
}

#[tauri::command(async)]
pub(crate) fn settings_config_read(path: String) -> Result<String, String> {
    let path = validate_settings_path(&path)?;
    let metadata = std::fs::metadata(&path)
        .map_err(|_| "Could not open the selected settings file".to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_SETTINGS_CONFIG_BYTES {
        return Err("The selected settings file is too large or is not a regular file".to_string());
    }
    std::fs::read_to_string(path)
        .map_err(|_| "The selected settings file is not valid UTF-8 text".to_string())
}

#[tauri::command(async)]
pub(crate) fn settings_config_write(path: String, content: String) -> Result<(), String> {
    if content.len() as u64 > MAX_SETTINGS_CONFIG_BYTES {
        return Err("The settings backup is too large to save".to_string());
    }
    let path = validate_settings_path(&path)?;
    if path.file_name().is_none() {
        return Err("Choose a file name for the settings backup".to_string());
    }
    std::fs::write(path, content).map_err(|_| "Could not write the settings backup".to_string())
}

fn validate_m3u_write_path(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if path
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err("Playlist file path must not contain '..' segments".to_string());
    }
    match path.extension().and_then(|extension| extension.to_str()) {
        Some(extension)
            if extension.eq_ignore_ascii_case("m3u")
                || extension.eq_ignore_ascii_case("m3u8")
                || extension.eq_ignore_ascii_case("txt") =>
        {
            Ok(path)
        }
        _ => Err("Playlist files must have a .m3u, .m3u8, or .txt extension".to_string()),
    }
}

#[tauri::command(async)]
pub(crate) fn m3u_write_file(path: String, content: String) -> Result<(), String> {
    if content.len() > MAX_M3U_BYTES {
        return Err("The playlist is too large to save".to_string());
    }
    let path = validate_m3u_write_path(&path)?;
    if path.file_name().is_none() {
        return Err("Choose a file name for the playlist".to_string());
    }
    std::fs::write(path, content).map_err(|_| "Could not write the playlist file".to_string())
}

#[cfg(test)]
mod tests {
    use super::{validate_m3u_write_path, validate_settings_path};

    #[test]
    fn validates_settings_config_paths() {
        assert!(validate_settings_path("backup.json").is_ok());
        assert!(validate_settings_path("C:/Users/test/backup.json").is_ok());
        assert!(validate_settings_path("../../../etc/passwd").is_err());
        assert!(validate_settings_path("backup.txt").is_err());
    }

    #[test]
    fn validates_m3u_write_paths() {
        assert!(validate_m3u_write_path("playlist.m3u").is_ok());
        assert!(validate_m3u_write_path("playlist.m3u8").is_ok());
        assert!(validate_m3u_write_path("playlist.txt").is_ok());
        assert!(validate_m3u_write_path("../../../etc/cron.d").is_err());
        assert!(validate_m3u_write_path("playlist.exe").is_err());
    }
}
