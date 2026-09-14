use std::collections::HashMap;
use std::path::PathBuf;

#[cfg(any(target_os = "windows", test))]
use std::path::Path;

#[cfg(target_os = "windows")]
use tauri::{AppHandle, Manager};

#[derive(Default, Debug, PartialEq)]
pub(crate) struct MpvHttpOptions {
    pub(crate) user_agent: Option<String>,
    pub(crate) referrer: Option<String>,
    pub(crate) header_fields: Option<String>,
}

pub(crate) fn build_http_options(
    headers: HashMap<String, String>,
) -> Result<MpvHttpOptions, String> {
    if headers.len() > 16 {
        return Err("Too many media request headers".to_string());
    }
    let mut entries = headers.into_iter().collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        left.0
            .to_ascii_lowercase()
            .cmp(&right.0.to_ascii_lowercase())
    });
    let mut result = MpvHttpOptions::default();
    let mut fields = Vec::new();

    for (name, value) in entries {
        if name.is_empty()
            || name.len() > 128
            || !name
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '-')
            || value.is_empty()
            || value.len() > 4096
            || value
                .chars()
                .any(|character| character == '\r' || character == '\n')
        {
            return Err("A media request header is invalid".to_string());
        }
        match name.to_ascii_lowercase().as_str() {
            "user-agent" => result.user_agent = Some(value),
            "referer" | "referrer" => result.referrer = Some(value),
            _ => fields.push(format!("{name}: {value}")),
        }
    }
    if !fields.is_empty() {
        result.header_fields = Some(fields.join(","));
    }
    Ok(result)
}

pub(crate) fn first_existing_file(
    candidates: impl IntoIterator<Item = PathBuf>,
) -> Option<PathBuf> {
    candidates.into_iter().find(|candidate| candidate.is_file())
}

#[cfg(target_os = "windows")]
pub(crate) fn bundled_ytdlp_path(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("yt-dlp.exe"));
    }
    if let Ok(executable) = std::env::current_exe() {
        if let Some(executable_dir) = executable.parent() {
            candidates.push(executable_dir.join("yt-dlp.exe"));
        }
    }
    first_existing_file(candidates)
}

#[cfg(any(target_os = "windows", test))]
pub(crate) fn ytdlp_script_option(path: &Path) -> Result<String, String> {
    let path = path
        .to_str()
        .filter(|value| !value.is_empty())
        .ok_or("The bundled YouTube resolver path is invalid")?;
    #[cfg(target_os = "windows")]
    let path = path
        .strip_prefix(r"\\?\")
        .unwrap_or(path)
        .replace('\\', "/");
    #[cfg(not(target_os = "windows"))]
    let path = path.to_string();

    Ok(format!("ytdl_hook-ytdl_path=%{}%{path}", path.len()))
}
