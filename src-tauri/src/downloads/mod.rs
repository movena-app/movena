use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};

use crate::sources::remote::{
    remote_headers, safe_media_file_name, same_origin_redirect_policy, validate_remote_url,
};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DownloadMediaOptions {
    #[serde(default)]
    id: Option<String>,
    url: String,
    file_name: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    directory: Option<String>,
}

#[derive(Clone)]
struct DownloadControl {
    paused: Arc<AtomicBool>,
    cancelled: Arc<AtomicBool>,
}

#[derive(Clone, Default)]
pub(crate) struct DownloadManager {
    jobs: Arc<Mutex<HashMap<String, DownloadControl>>>,
    reserved_targets: Arc<Mutex<HashSet<PathBuf>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadStatusEvent {
    id: String,
    state: String,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn emit_download_event(app: &tauri::AppHandle, event: DownloadStatusEvent) {
    let _ = app.emit("download-event", event);
}

fn download_target(
    app: &tauri::AppHandle,
    manager: &DownloadManager,
    directory: Option<&str>,
    file_name: &str,
) -> Result<PathBuf, String> {
    let downloads = match directory.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => PathBuf::from(value),
        None => app
            .path()
            .download_dir()
            .map_err(|error| error.to_string())?,
    };
    std::fs::create_dir_all(&downloads).map_err(|error| error.to_string())?;
    let base_name = safe_media_file_name(file_name);
    let mut target = downloads.join(&base_name);
    let extension = target
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    let stem = target
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Movena download")
        .to_string();
    let mut reserved_targets = manager
        .reserved_targets
        .lock()
        .map_err(|_| "The download manager is unavailable".to_string())?;
    let mut collision = 2;
    while target.exists() || reserved_targets.contains(&target) {
        target = downloads.join(format!("{stem} ({collision}){extension}"));
        collision += 1;
    }
    reserved_targets.insert(target.clone());
    Ok(target)
}

fn valid_download_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 120
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
}

async fn run_media_download(
    app: tauri::AppHandle,
    manager: DownloadManager,
    control: DownloadControl,
    options: DownloadMediaOptions,
    id: String,
) {
    let mut partial_for_cleanup = None;
    let mut reserved_target = None;
    let mut downloaded_for_event = 0_u64;
    let mut total_for_event = None;
    let result = async {
        let url = validate_remote_url(&options.url)?;
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(300))
            .redirect(same_origin_redirect_policy())
            .build()
            .map_err(|error| format!("Could not initialize downloader: {error}"))?;
        let response = client
            .get(url)
            .headers(remote_headers(options.headers)?)
            .send()
            .await
            .map_err(|_| "Could not download the media resource".to_string())?;
        if !response.status().is_success() {
            return Err(format!("The media URL answered {}", response.status().as_u16()));
        }
        const MAX_MEDIA_BYTES: u64 = 50 * 1024 * 1024 * 1024;
        if response.content_length().is_some_and(|length| length > MAX_MEDIA_BYTES) {
            return Err("The media resource is larger than Movena's 50 GiB safety limit".to_string());
        }
        let target = download_target(
            &app,
            &manager,
            options.directory.as_deref(),
            &options.file_name,
        )?;
        reserved_target = Some(target.clone());
        let partial = target.with_file_name(format!(".{id}.movena-part"));
        partial_for_cleanup = Some(partial.clone());
        let mut file = std::fs::File::create(&partial).map_err(|error| error.to_string())?;
        let total_bytes = response.content_length();
        total_for_event = total_bytes;
        let mut downloaded_bytes = 0_u64;
        let mut last_emit = Instant::now() - Duration::from_secs(1);
        emit_download_event(&app, DownloadStatusEvent { id: id.clone(), state: "downloading".to_string(), downloaded_bytes, total_bytes, path: None, error: None });
        let mut response = response;
        loop {
            if control.cancelled.load(Ordering::Acquire) {
                let _ = std::fs::remove_file(&partial);
                emit_download_event(&app, DownloadStatusEvent { id: id.clone(), state: "cancelled".to_string(), downloaded_bytes, total_bytes, path: None, error: None });
                return Ok::<(), String>(());
            }
            while control.paused.load(Ordering::Acquire) {
                emit_download_event(&app, DownloadStatusEvent { id: id.clone(), state: "paused".to_string(), downloaded_bytes, total_bytes, path: None, error: None });
                if control.cancelled.load(Ordering::Acquire) {
                    let _ = std::fs::remove_file(&partial);
                    emit_download_event(&app, DownloadStatusEvent { id: id.clone(), state: "cancelled".to_string(), downloaded_bytes, total_bytes, path: None, error: None });
                    return Ok::<(), String>(());
                }
                tokio::time::sleep(Duration::from_millis(150)).await;
            }
            let chunk = tokio::select! {
                _ = tokio::time::sleep(Duration::from_millis(100)) => continue,
                result = response.chunk() => result.map_err(|_| "The media download was interrupted".to_string())?,
            };
            let Some(chunk) = chunk else { break };
            if downloaded_bytes.saturating_add(chunk.len() as u64) > MAX_MEDIA_BYTES {
                return Err("The media resource exceeded Movena's 50 GiB safety limit".to_string());
            }
            file.write_all(&chunk).map_err(|error| error.to_string())?;
            downloaded_bytes = downloaded_bytes.saturating_add(chunk.len() as u64);
            downloaded_for_event = downloaded_bytes;
            if last_emit.elapsed() >= Duration::from_millis(250) {
                emit_download_event(&app, DownloadStatusEvent { id: id.clone(), state: "downloading".to_string(), downloaded_bytes, total_bytes, path: None, error: None });
                last_emit = Instant::now();
            }
        }
        if control.cancelled.load(Ordering::Acquire) {
            let _ = std::fs::remove_file(&partial);
            emit_download_event(&app, DownloadStatusEvent { id: id.clone(), state: "cancelled".to_string(), downloaded_bytes, total_bytes, path: None, error: None });
            return Ok::<(), String>(());
        }
        file.flush().map_err(|error| error.to_string())?;
        std::fs::rename(&partial, &target).map_err(|error| error.to_string())?;
        partial_for_cleanup = None;
        emit_download_event(&app, DownloadStatusEvent { id: id.clone(), state: "completed".to_string(), downloaded_bytes: total_bytes.unwrap_or(downloaded_bytes), total_bytes: total_bytes.or(Some(downloaded_bytes)), path: Some(target.to_string_lossy().into_owned()), error: None });
        Ok::<(), String>(())
    }.await;

    if let Err(error) = result {
        if let Some(partial) = partial_for_cleanup.as_ref() {
            let _ = std::fs::remove_file(partial);
        }
        emit_download_event(
            &app,
            DownloadStatusEvent {
                id: id.clone(),
                state: "failed".to_string(),
                downloaded_bytes: downloaded_for_event,
                total_bytes: total_for_event,
                path: None,
                error: Some(error),
            },
        );
    }
    if let Some(target) = reserved_target.as_ref() {
        if let Ok(mut reserved_targets) = manager.reserved_targets.lock() {
            reserved_targets.remove(target);
        }
    }
    if let Ok(mut jobs) = manager.jobs.lock() {
        jobs.remove(&id);
    }
}

#[tauri::command(async)]
pub(crate) async fn download_media_start(
    app: tauri::AppHandle,
    state: State<'_, DownloadManager>,
    mut options: DownloadMediaOptions,
) -> Result<(), String> {
    let id = options
        .id
        .take()
        .ok_or_else(|| "A download id is required".to_string())?;
    if !valid_download_id(&id) {
        return Err("The download id is invalid".to_string());
    }
    let control = DownloadControl {
        paused: Arc::new(AtomicBool::new(false)),
        cancelled: Arc::new(AtomicBool::new(false)),
    };
    {
        let mut jobs = state
            .jobs
            .lock()
            .map_err(|_| "The download manager is unavailable".to_string())?;
        if jobs.contains_key(&id) {
            return Err("This download is already active".to_string());
        }
        jobs.insert(id.clone(), control.clone());
    }
    let manager = state.inner().clone();
    let cleanup_id = id.clone();
    tauri::async_runtime::spawn(async move {
        run_media_download(
            app,
            manager,
            control,
            DownloadMediaOptions {
                id: Some(cleanup_id),
                ..options
            },
            id,
        )
        .await;
    });
    Ok(())
}

fn download_control(
    state: &State<'_, DownloadManager>,
    id: &str,
) -> Result<DownloadControl, String> {
    state
        .jobs
        .lock()
        .map_err(|_| "The download manager is unavailable".to_string())?
        .get(id)
        .cloned()
        .ok_or_else(|| "The download is no longer active".to_string())
}

#[tauri::command(async)]
pub(crate) async fn download_media_pause(
    app: tauri::AppHandle,
    state: State<'_, DownloadManager>,
    id: String,
) -> Result<(), String> {
    download_control(&state, &id)?
        .paused
        .store(true, Ordering::Release);
    emit_download_event(
        &app,
        DownloadStatusEvent {
            id,
            state: "paused".to_string(),
            downloaded_bytes: 0,
            total_bytes: None,
            path: None,
            error: None,
        },
    );
    Ok(())
}

#[tauri::command(async)]
pub(crate) async fn download_media_resume(
    app: tauri::AppHandle,
    state: State<'_, DownloadManager>,
    id: String,
) -> Result<(), String> {
    download_control(&state, &id)?
        .paused
        .store(false, Ordering::Release);
    emit_download_event(
        &app,
        DownloadStatusEvent {
            id,
            state: "downloading".to_string(),
            downloaded_bytes: 0,
            total_bytes: None,
            path: None,
            error: None,
        },
    );
    Ok(())
}

#[tauri::command(async)]
pub(crate) async fn download_media_cancel(
    app: tauri::AppHandle,
    state: State<'_, DownloadManager>,
    id: String,
) -> Result<(), String> {
    download_control(&state, &id)?
        .cancelled
        .store(true, Ordering::Release);
    emit_download_event(
        &app,
        DownloadStatusEvent {
            id,
            state: "cancelled".to_string(),
            downloaded_bytes: 0,
            total_bytes: None,
            path: None,
            error: None,
        },
    );
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteDownloadOptions {
    #[serde(default)]
    directory: Option<String>,
    path: String,
}

/// Resolves `target` to a canonical path and requires it to live inside
/// `downloads_dir` (also canonicalized) before anything may delete it.
/// Pulled out of `download_media_delete` so this safety check is testable
/// without a full Tauri `AppHandle`.
fn resolve_delete_target(downloads_dir: &Path, target: &Path) -> Result<PathBuf, String> {
    let canonical_downloads_dir = downloads_dir
        .canonicalize()
        .map_err(|_| "The downloads directory could not be resolved".to_string())?;
    let canonical_target = target
        .canonicalize()
        .map_err(|_| "The file no longer exists".to_string())?;
    if !canonical_target.starts_with(&canonical_downloads_dir) {
        return Err("Refusing to delete a file outside the downloads directory".to_string());
    }
    Ok(canonical_target)
}

/// Permanently deletes a completed download's file from disk. Unlike
/// cancelling an in-flight job, this frees real space — so the target is
/// required to resolve inside the (possibly configured) downloads
/// directory before anything is removed, the same directory
/// `download_target` resolves downloads into.
#[tauri::command(async)]
pub(crate) async fn download_media_delete(
    app: tauri::AppHandle,
    options: DeleteDownloadOptions,
) -> Result<(), String> {
    let downloads_dir = match options
        .directory
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(value) => PathBuf::from(value),
        None => app
            .path()
            .download_dir()
            .map_err(|error| error.to_string())?,
    };
    let target = resolve_delete_target(&downloads_dir, &PathBuf::from(&options.path))?;
    std::fs::remove_file(&target).map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{resolve_delete_target, valid_download_id};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn accepts_opaque_download_ids_at_the_documented_boundary() {
        assert!(valid_download_id("download-1724670000_ab.cd"));
        assert!(valid_download_id(&"a".repeat(120)));
    }

    #[test]
    fn rejects_empty_oversized_or_path_like_download_ids() {
        for value in ["", "../private", "folder/name", "space id", "token?secret"] {
            assert!(!valid_download_id(value), "accepted invalid id: {value}");
        }
        assert!(!valid_download_id(&"a".repeat(121)));
    }

    /// A uniquely-named directory under the OS temp dir, removed on drop.
    /// Rust runs `#[test]`s concurrently, so each test gets its own tree.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new(label: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "movena-download-test-{}-{label}-{nanos}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn allows_deleting_a_file_inside_the_downloads_directory() {
        let downloads = TempDir::new("downloads-ok");
        let file = downloads.0.join("movie.mp4");
        fs::write(&file, b"data").unwrap();

        assert_eq!(
            resolve_delete_target(&downloads.0, &file).unwrap(),
            file.canonicalize().unwrap()
        );
    }

    #[test]
    fn refuses_to_delete_a_file_outside_the_downloads_directory() {
        let downloads = TempDir::new("downloads-scope");
        let outside = TempDir::new("outside-scope");
        let file = outside.0.join("secret.txt");
        fs::write(&file, b"data").unwrap();

        let error = resolve_delete_target(&downloads.0, &file).unwrap_err();
        assert!(error.contains("outside the downloads directory"));
    }

    #[test]
    fn refuses_a_traversal_path_that_climbs_back_out_of_the_downloads_directory() {
        let downloads = TempDir::new("downloads-traversal");
        let outside = TempDir::new("outside-traversal");
        let file = outside.0.join("secret.txt");
        fs::write(&file, b"data").unwrap();
        // Both temp dirs are siblings under the OS temp root, so climbing one
        // level out of `downloads` and back into `outside`'s own name reaches
        // the same file `../<outside-dir-name>/secret.txt` would on disk.
        let traversal_path = downloads
            .0
            .join("..")
            .join(outside.0.file_name().unwrap())
            .join("secret.txt");

        let error = resolve_delete_target(&downloads.0, &traversal_path).unwrap_err();
        assert!(error.contains("outside the downloads directory"));
    }

    #[test]
    fn reports_a_missing_file_instead_of_panicking() {
        let downloads = TempDir::new("downloads-missing");
        let missing = downloads.0.join("gone.mp4");
        assert!(resolve_delete_target(&downloads.0, &missing).is_err());
    }
}
