//! On-disk copies of Xtream catalogue lists (`get_live_streams`,
//! `get_vod_streams`, `get_series`), so a start shows the catalogue from disk
//! while the provider is asked for a fresh one.
//!
//! The content is the provider's own JSON list, untouched. It holds no account
//! password: the frontend builds stream URLs from the vault's credentials when
//! it maps the list, not before. Each copy records the account scope it was
//! fetched under and is ignored for any other.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::credentials::source::validate_source_id;

const CATALOG_KINDS: [&str; 3] = ["live", "vod", "series"];
const MAX_CATALOG_BYTES: usize = 128 * 1024 * 1024;
const METADATA_LIMIT: u64 = 4 * 1024;
const METADATA_VERSION: u8 = 1;
/// Older copies are more likely to show titles the provider has since removed
/// than to save a meaningful wait; they are dropped instead of shown.
const MAX_AGE: Duration = Duration::from_secs(7 * 24 * 60 * 60);

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CatalogCacheMetadata {
    version: u8,
    scope: String,
    saved_at: u64,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogCacheEntry {
    content: String,
    /// Milliseconds since the Unix epoch.
    saved_at: u64,
}

struct CatalogCachePaths {
    content: PathBuf,
    metadata: PathBuf,
    pending_content: PathBuf,
    pending_metadata: PathBuf,
}

fn validate_kind(kind: &str) -> Result<(), String> {
    if CATALOG_KINDS.contains(&kind) {
        Ok(())
    } else {
        Err("Invalid catalog kind".to_string())
    }
}

/// Scopes are the frontend's opaque, non-secret account fingerprints.
fn validate_scope(scope: &str) -> Result<(), String> {
    if scope.is_empty()
        || scope.len() > 96
        || !scope.chars().all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
        })
    {
        return Err("Invalid catalog cache scope".to_string());
    }
    Ok(())
}

fn paths_in(directory: &Path, source_id: &str, kind: &str) -> CatalogCachePaths {
    let stem = format!("{source_id}.{kind}");
    CatalogCachePaths {
        content: directory.join(format!("{stem}.json")),
        metadata: directory.join(format!("{stem}.meta.json")),
        pending_content: directory.join(format!("{stem}.json.pending")),
        pending_metadata: directory.join(format!("{stem}.meta.pending.json")),
    }
}

fn cache_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| "Application data is unavailable".to_string())?
        .join("catalog-cache");
    std::fs::create_dir_all(&directory)
        .map_err(|_| "Could not create the catalog cache".to_string())?;
    Ok(directory)
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

fn remove_if_exists(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Could not update the catalog cache".to_string()),
    }
}

fn write_synced(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(path)
        .map_err(|_| "Could not store the catalog cache".to_string())?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "Could not store the catalog cache".to_string())
}

fn remove_entry(paths: &CatalogCachePaths) -> Result<(), String> {
    for path in [
        &paths.content,
        &paths.metadata,
        &paths.pending_content,
        &paths.pending_metadata,
    ] {
        remove_if_exists(path)?;
    }
    Ok(())
}

fn check_size(bytes: usize) -> Result<(), String> {
    if bytes > MAX_CATALOG_BYTES {
        return Err("The catalog is larger than 128 MiB".to_string());
    }
    Ok(())
}

fn store_at(
    paths: &CatalogCachePaths,
    scope: &str,
    content: &str,
    saved_at: u64,
) -> Result<(), String> {
    validate_scope(scope)?;
    check_size(content.len())?;
    // Only a provider list is worth keeping; anything else would just fail
    // to load next time.
    serde_json::from_str::<Vec<serde::de::IgnoredAny>>(content)
        .map_err(|_| "The catalog is not a JSON list".to_string())?;
    let metadata = serde_json::to_vec(&CatalogCacheMetadata {
        version: METADATA_VERSION,
        scope: scope.to_string(),
        saved_at,
    })
    .map_err(|_| "Could not encode the catalog cache".to_string())?;

    remove_if_exists(&paths.pending_content)?;
    remove_if_exists(&paths.pending_metadata)?;
    if let Err(error) = write_synced(&paths.pending_content, content.as_bytes())
        .and_then(|_| write_synced(&paths.pending_metadata, &metadata))
    {
        let _ = remove_if_exists(&paths.pending_content);
        let _ = remove_if_exists(&paths.pending_metadata);
        return Err(error);
    }
    remove_if_exists(&paths.content)?;
    remove_if_exists(&paths.metadata)?;
    std::fs::rename(&paths.pending_content, &paths.content)
        .map_err(|_| "Could not store the catalog cache".to_string())?;
    std::fs::rename(&paths.pending_metadata, &paths.metadata)
        .map_err(|_| "Could not store the catalog cache".to_string())
}

/// `Ok(None)` when there is no copy for this account, or it is too old to
/// show; `Err` when the files on disk are damaged.
fn load_at(
    paths: &CatalogCachePaths,
    scope: &str,
    now: u64,
) -> Result<Option<CatalogCacheEntry>, String> {
    validate_scope(scope)?;
    let content_exists = paths.content.exists();
    let metadata_exists = paths.metadata.exists();
    if !content_exists && !metadata_exists {
        return Ok(None);
    }
    let invalid = || "The catalog cache is invalid".to_string();
    if !content_exists || !metadata_exists {
        return Err(invalid());
    }
    let metadata_len = std::fs::metadata(&paths.metadata)
        .map(|metadata| metadata.len())
        .map_err(|_| invalid())?;
    let content_len = std::fs::metadata(&paths.content)
        .map(|metadata| metadata.len())
        .map_err(|_| invalid())?;
    if metadata_len > METADATA_LIMIT || content_len > MAX_CATALOG_BYTES as u64 {
        return Err(invalid());
    }
    let metadata: CatalogCacheMetadata =
        serde_json::from_slice(&std::fs::read(&paths.metadata).map_err(|_| invalid())?)
            .map_err(|_| invalid())?;
    if metadata.version != METADATA_VERSION {
        return Err(invalid());
    }
    if metadata.scope != scope {
        return Ok(None);
    }
    if metadata.saved_at > now || now - metadata.saved_at > MAX_AGE.as_millis() as u64 {
        remove_entry(paths)?;
        return Ok(None);
    }
    let content = std::fs::read_to_string(&paths.content).map_err(|_| invalid())?;
    Ok(Some(CatalogCacheEntry {
        content,
        saved_at: metadata.saved_at,
    }))
}

fn entry_paths(
    app: &tauri::AppHandle,
    source_id: &str,
    kind: &str,
) -> Result<CatalogCachePaths, String> {
    validate_source_id(source_id)?;
    validate_kind(kind)?;
    Ok(paths_in(&cache_directory(app)?, source_id, kind))
}

#[tauri::command(async)]
pub fn catalog_cache_store(
    app: tauri::AppHandle,
    source_id: String,
    kind: String,
    scope: String,
    content: String,
) -> Result<(), String> {
    store_at(
        &entry_paths(&app, &source_id, &kind)?,
        &scope,
        &content,
        now_millis(),
    )
}

#[tauri::command(async)]
pub fn catalog_cache_load(
    app: tauri::AppHandle,
    source_id: String,
    kind: String,
    scope: String,
) -> Result<Option<CatalogCacheEntry>, String> {
    load_at(&entry_paths(&app, &source_id, &kind)?, &scope, now_millis())
}

#[tauri::command(async)]
pub fn catalog_cache_delete(app: tauri::AppHandle, source_id: String) -> Result<(), String> {
    validate_source_id(&source_id)?;
    let directory = cache_directory(&app)?;
    for kind in CATALOG_KINDS {
        remove_entry(&paths_in(&directory, &source_id, kind))
            .map_err(|_| "Could not remove the catalog cache".to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCOPE: &str = "sources-1a2b3c";
    const NOW: u64 = 1_790_000_000_000;

    fn test_directory(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "movena-catalog-cache-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn round_trips_a_provider_list_for_the_same_account() {
        let directory = test_directory("roundtrip");
        let paths = paths_in(&directory, "xtream-one", "vod");
        let content = r#"[{"stream_id":1,"name":"Quoted \"Title\"","rating":"7.4"}]"#;

        store_at(&paths, SCOPE, content, NOW - 1_000).unwrap();

        assert_eq!(
            load_at(&paths, SCOPE, NOW).unwrap(),
            Some(CatalogCacheEntry {
                content: content.to_string(),
                saved_at: NOW - 1_000,
            })
        );
        assert!(!paths.pending_content.exists());
        assert!(!paths.pending_metadata.exists());
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn ignores_another_accounts_copy_and_drops_expired_ones() {
        let directory = test_directory("scope");
        let paths = paths_in(&directory, "xtream-one", "live");
        store_at(&paths, SCOPE, "[]", NOW - 1_000).unwrap();

        assert_eq!(load_at(&paths, "sources-other", NOW).unwrap(), None);
        assert!(paths.content.exists());

        let a_week_later = NOW - 1_000 + MAX_AGE.as_millis() as u64 + 1;
        assert_eq!(load_at(&paths, SCOPE, a_week_later).unwrap(), None);
        assert!(!paths.content.exists());
        assert!(!paths.metadata.exists());
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn reports_missing_copies_as_none_and_damaged_ones_as_errors() {
        let directory = test_directory("damaged");
        let paths = paths_in(&directory, "xtream-one", "series");
        assert_eq!(load_at(&paths, SCOPE, NOW).unwrap(), None);

        std::fs::write(&paths.content, "[]").unwrap();
        assert!(load_at(&paths, SCOPE, NOW).is_err());
        std::fs::write(&paths.metadata, "not-json").unwrap();
        assert!(load_at(&paths, SCOPE, NOW).is_err());
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn rejects_content_that_is_not_a_list_and_invalid_scopes_or_kinds() {
        let directory = test_directory("invalid");
        let paths = paths_in(&directory, "xtream-one", "vod");

        assert!(store_at(&paths, SCOPE, r#"{"user_info":{}}"#, NOW).is_err());
        assert!(store_at(&paths, SCOPE, "[1,", NOW).is_err());
        assert!(store_at(&paths, "Sources/../x", "[]", NOW).is_err());
        assert!(store_at(&paths, "", "[]", NOW).is_err());
        assert!(!paths.content.exists());
        assert!(validate_kind("vod").is_ok());
        assert!(validate_kind("movies").is_err());
        assert!(validate_kind("../vod").is_err());
        let _ = std::fs::remove_dir_all(directory);
    }

    #[test]
    fn accepts_the_size_limit_and_rejects_one_byte_more() {
        assert!(check_size(MAX_CATALOG_BYTES).is_ok());
        assert!(check_size(MAX_CATALOG_BYTES + 1).is_err());
        assert!(check_size(0).is_ok());
    }

    #[test]
    fn deleting_one_kind_leaves_nothing_behind() {
        let directory = test_directory("delete");
        let paths = paths_in(&directory, "xtream-one", "vod");
        store_at(&paths, SCOPE, "[]", NOW).unwrap();
        std::fs::write(&paths.pending_content, "[").unwrap();

        remove_entry(&paths).unwrap();

        for path in [
            &paths.content,
            &paths.metadata,
            &paths.pending_content,
            &paths.pending_metadata,
        ] {
            assert!(!path.exists());
        }
        let _ = std::fs::remove_dir_all(directory);
    }
}
