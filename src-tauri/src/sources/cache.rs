use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Manager;

use super::{remote::M3uDocument, MAX_M3U_BYTES};
use crate::credentials::source::validate_source_id;

const METADATA_LIMIT: usize = 16 * 1024;
const LEGACY_SERIALIZED_LIMIT: u64 = (MAX_M3U_BYTES as u64 * 6) + METADATA_LIMIT as u64;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct M3uCacheMetadata {
    version: u8,
    base_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_name: Option<String>,
}

struct CachePaths {
    legacy: PathBuf,
    content: PathBuf,
    metadata: PathBuf,
    pending_content: PathBuf,
    pending_metadata: PathBuf,
    http: PathBuf,
}

fn cache_paths_in(directory: &Path, source_id: &str) -> CachePaths {
    CachePaths {
        legacy: directory.join(format!("{source_id}.json")),
        content: directory.join(format!("{source_id}.m3u")),
        metadata: directory.join(format!("{source_id}.meta.json")),
        pending_content: directory.join(format!("{source_id}.m3u.pending")),
        pending_metadata: directory.join(format!("{source_id}.meta.pending.json")),
        http: directory.join(format!("{source_id}.http.json")),
    }
}

fn cache_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| "Application data is unavailable".to_string())?
        .join("m3u-cache");
    std::fs::create_dir_all(&directory)
        .map_err(|_| "Could not create the playlist cache".to_string())?;
    Ok(directory)
}

fn cache_paths(app: &tauri::AppHandle, source_id: &str) -> Result<CachePaths, String> {
    validate_source_id(source_id)?;
    Ok(cache_paths_in(&cache_directory(app)?, source_id))
}

pub fn http_cache_path(app: &tauri::AppHandle, source_id: &str) -> Result<PathBuf, String> {
    Ok(cache_paths(app, source_id)?.http)
}

fn validate_document(document: &M3uDocument) -> Result<(), String> {
    if document.content.len() > MAX_M3U_BYTES {
        return Err("The playlist is larger than 64 MiB".to_string());
    }
    let metadata = M3uCacheMetadata {
        version: 2,
        base_url: document.base_url.clone(),
        file_name: document.file_name.clone(),
    };
    let metadata_bytes = serde_json::to_vec(&metadata)
        .map_err(|_| "Could not encode the playlist cache".to_string())?;
    if metadata_bytes.len() > METADATA_LIMIT {
        return Err("The playlist cache metadata is too large".to_string());
    }
    Ok(())
}

fn remove_if_exists(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Could not update the playlist cache".to_string()),
    }
}

fn write_synced(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(path)
        .map_err(|_| "Could not store the playlist cache".to_string())?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "Could not store the playlist cache".to_string())
}

fn store_at(paths: &CachePaths, document: &M3uDocument) -> Result<(), String> {
    validate_document(document)?;
    let metadata = M3uCacheMetadata {
        version: 2,
        base_url: document.base_url.clone(),
        file_name: document.file_name.clone(),
    };
    let metadata_bytes = serde_json::to_vec(&metadata)
        .map_err(|_| "Could not encode the playlist cache".to_string())?;
    remove_if_exists(&paths.pending_content)?;
    remove_if_exists(&paths.pending_metadata)?;
    if let Err(error) = write_synced(&paths.pending_content, document.content.as_bytes())
        .and_then(|_| write_synced(&paths.pending_metadata, &metadata_bytes))
    {
        let _ = remove_if_exists(&paths.pending_content);
        let _ = remove_if_exists(&paths.pending_metadata);
        return Err(error);
    }
    remove_if_exists(&paths.content)?;
    remove_if_exists(&paths.metadata)?;
    std::fs::rename(&paths.pending_content, &paths.content)
        .map_err(|_| "Could not store the playlist cache".to_string())?;
    std::fs::rename(&paths.pending_metadata, &paths.metadata)
        .map_err(|_| "Could not store the playlist cache".to_string())
}

fn load_split(paths: &CachePaths) -> Result<Option<M3uDocument>, String> {
    let content_exists = paths.content.exists();
    let metadata_exists = paths.metadata.exists();
    if !content_exists && !metadata_exists {
        return Ok(None);
    }
    if !content_exists || !metadata_exists {
        return Err("The playlist cache is invalid".to_string());
    }
    if std::fs::metadata(&paths.content)
        .map(|metadata| metadata.len())
        .unwrap_or(u64::MAX)
        > MAX_M3U_BYTES as u64
        || std::fs::metadata(&paths.metadata)
            .map(|metadata| metadata.len())
            .unwrap_or(u64::MAX)
            > METADATA_LIMIT as u64
    {
        return Err("The playlist cache is invalid".to_string());
    }
    let content = std::fs::read_to_string(&paths.content)
        .map_err(|_| "The playlist cache is invalid".to_string())?;
    let metadata: M3uCacheMetadata = serde_json::from_reader(
        File::open(&paths.metadata).map_err(|_| "Could not read the playlist cache".to_string())?,
    )
    .map_err(|_| "The playlist cache is invalid".to_string())?;
    if metadata.version != 2 {
        return Err("The playlist cache is invalid".to_string());
    }
    let document = M3uDocument {
        content,
        base_url: metadata.base_url,
        file_name: metadata.file_name,
    };
    validate_document(&document).map_err(|_| "The playlist cache is invalid".to_string())?;
    Ok(Some(document))
}

fn load_legacy(paths: &CachePaths) -> Result<Option<M3uDocument>, String> {
    if !paths.legacy.exists() {
        return Ok(None);
    }
    if std::fs::metadata(&paths.legacy)
        .map(|metadata| metadata.len())
        .unwrap_or(u64::MAX)
        > LEGACY_SERIALIZED_LIMIT
    {
        return Err("The playlist cache is invalid".to_string());
    }
    let file =
        File::open(&paths.legacy).map_err(|_| "Could not read the playlist cache".to_string())?;
    let document: M3uDocument = serde_json::from_reader(file.take(LEGACY_SERIALIZED_LIMIT + 1))
        .map_err(|_| "The playlist cache is invalid".to_string())?;
    validate_document(&document).map_err(|_| "The playlist cache is invalid".to_string())?;
    store_at(paths, &document)?;
    remove_if_exists(&paths.legacy)?;
    Ok(Some(document))
}

fn load_at(paths: &CachePaths) -> Result<Option<M3uDocument>, String> {
    match load_split(paths)? {
        Some(document) => Ok(Some(document)),
        None => load_legacy(paths),
    }
}

#[tauri::command(async)]
pub fn m3u_cache_store(
    app: tauri::AppHandle,
    source_id: String,
    document: M3uDocument,
) -> Result<(), String> {
    store_at(&cache_paths(&app, &source_id)?, &document)
}

pub fn load(app: &tauri::AppHandle, source_id: &str) -> Result<Option<M3uDocument>, String> {
    load_at(&cache_paths(app, source_id)?)
}

#[tauri::command(async)]
pub fn m3u_cache_load(
    app: tauri::AppHandle,
    source_id: String,
) -> Result<Option<M3uDocument>, String> {
    load(&app, &source_id)
}

#[tauri::command(async)]
pub fn m3u_cache_delete(app: tauri::AppHandle, source_id: String) -> Result<(), String> {
    let paths = cache_paths(&app, &source_id)?;
    for path in [
        paths.legacy,
        paths.content,
        paths.metadata,
        paths.pending_content,
        paths.pending_metadata,
        paths.http,
    ] {
        remove_if_exists(&path).map_err(|_| "Could not remove the playlist cache".to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_directory(name: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("movena-m3u-cache-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    fn document(content: String) -> M3uDocument {
        M3uDocument {
            content,
            base_url: "https://playlist.test/base/".to_string(),
            file_name: Some("quoted\\playlist.m3u".to_string()),
        }
    }

    #[test]
    fn round_trips_content_independently_of_json_escaping() {
        let directory = test_directory("roundtrip");
        let paths = cache_paths_in(&directory, "source");
        let expected = document(
            "#EXTM3U\n#EXTINF:-1,\"Quoted\"\\Channel\nhttps://stream.test/one\n".to_string(),
        );
        store_at(&paths, &expected).unwrap();
        let loaded = load_at(&paths).unwrap().unwrap();
        assert_eq!(loaded.content, expected.content);
        assert_eq!(loaded.base_url, expected.base_url);
        assert_eq!(loaded.file_name, expected.file_name);
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn accepts_exact_content_limit_and_rejects_one_byte_more() {
        assert!(validate_document(&document("a".repeat(MAX_M3U_BYTES))).is_ok());
        assert!(validate_document(&document("a".repeat(MAX_M3U_BYTES + 1))).is_err());
    }

    #[test]
    fn migrates_valid_legacy_json_after_successful_split_write() {
        let directory = test_directory("legacy");
        let paths = cache_paths_in(&directory, "source");
        let expected = document("#EXTM3U\n\\\\\"quoted\"\n".to_string());
        std::fs::write(&paths.legacy, serde_json::to_vec(&expected).unwrap()).unwrap();
        let loaded = load_at(&paths).unwrap().unwrap();
        assert_eq!(loaded.content, expected.content);
        assert!(!paths.legacy.exists());
        assert!(paths.content.exists());
        assert!(paths.metadata.exists());
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn rejects_partial_or_corrupt_split_cache() {
        let directory = test_directory("corrupt");
        let paths = cache_paths_in(&directory, "source");
        std::fs::write(&paths.content, "#EXTM3U").unwrap();
        assert!(load_at(&paths).is_err());
        std::fs::write(&paths.metadata, "not-json").unwrap();
        assert!(load_at(&paths).is_err());
        let _ = std::fs::remove_dir_all(directory);
    }
}
