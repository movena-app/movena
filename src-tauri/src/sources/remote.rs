use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use super::{cache, MAX_M3U_BYTES};
use crate::credentials::source::validate_source_id;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct M3uFetchOptions {
    pub(crate) url: String,
    #[serde(default)]
    pub(crate) headers: HashMap<String, String>,
    #[serde(default)]
    pub(crate) cache_key: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct M3uProbeOptions {
    pub(crate) url: String,
    #[serde(default)]
    pub(crate) headers: HashMap<String, String>,
    #[serde(default = "default_probe_timeout_ms")]
    timeout_ms: u64,
}

fn default_probe_timeout_ms() -> u64 {
    6_000
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct M3uProbeResult {
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    http_status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_message: Option<String>,
    latency_ms: u64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct M3uDocument {
    pub(crate) content: String,
    pub(crate) base_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) file_name: Option<String>,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HttpValidators {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) etag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) last_modified: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct M3uHttpCache {
    #[serde(default)]
    request_key: String,
    #[serde(flatten)]
    pub(crate) validators: HttpValidators,
}

pub(crate) struct RemoteDownload {
    pub(crate) bytes: Vec<u8>,
    pub(crate) base_url: String,
    pub(crate) validators: HttpValidators,
}

pub(crate) enum RemoteDownloadResult {
    Modified(RemoteDownload),
    NotModified,
}

pub(crate) fn decode_m3u(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(value) => value.to_string(),
        Err(_) => {
            let (decoded, _, _) = encoding_rs::WINDOWS_1252.decode(bytes);
            decoded.into_owned()
        }
    }
}

pub(crate) fn validate_remote_url(value: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(value).map_err(|_| "The playlist URL is invalid".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Remote playlists must use HTTP or HTTPS".to_string());
    }
    Ok(parsed)
}

pub(crate) fn same_origin_redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= 8 {
            return attempt.error("too many redirects");
        }
        let Some(previous) = attempt.previous().last() else {
            return attempt.follow();
        };
        let same_origin = previous.scheme() == attempt.url().scheme()
            && previous.host_str() == attempt.url().host_str()
            && previous.port_or_known_default() == attempt.url().port_or_known_default();
        if same_origin {
            attempt.follow()
        } else {
            attempt.stop()
        }
    })
}

pub(crate) fn remote_headers(
    values: HashMap<String, String>,
) -> Result<reqwest::header::HeaderMap, String> {
    if values.len() > 16 {
        return Err("Too many request headers".to_string());
    }
    let mut headers = reqwest::header::HeaderMap::new();
    for (name, value) in values {
        let name = reqwest::header::HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| "A request header name is invalid".to_string())?;
        let value = reqwest::header::HeaderValue::from_str(&value)
            .map_err(|_| "A request header value is invalid".to_string())?;
        headers.insert(name, value);
    }
    if !headers.contains_key(reqwest::header::USER_AGENT) {
        headers.insert(
            reqwest::header::USER_AGENT,
            reqwest::header::HeaderValue::from_static("Movena/0.1"),
        );
    }
    Ok(headers)
}

pub(crate) fn apply_conditional_headers(
    headers: &mut reqwest::header::HeaderMap,
    validators: Option<&HttpValidators>,
    resource: &str,
) -> Result<(), String> {
    let Some(validators) = validators else {
        return Ok(());
    };
    if let Some(etag) = &validators.etag {
        if !headers.contains_key(reqwest::header::IF_NONE_MATCH) {
            let value = reqwest::header::HeaderValue::from_str(etag)
                .map_err(|_| format!("The cached {resource} ETag is invalid"))?;
            headers.insert(reqwest::header::IF_NONE_MATCH, value);
        }
    }
    if let Some(last_modified) = &validators.last_modified {
        if !headers.contains_key(reqwest::header::IF_MODIFIED_SINCE) {
            let value = reqwest::header::HeaderValue::from_str(last_modified)
                .map_err(|_| format!("The cached {resource} modification date is invalid"))?;
            headers.insert(reqwest::header::IF_MODIFIED_SINCE, value);
        }
    }
    Ok(())
}

pub(crate) async fn download_remote(
    options: M3uFetchOptions,
    max_bytes: usize,
    resource: &str,
    validators: Option<&HttpValidators>,
) -> Result<RemoteDownloadResult, String> {
    let url = validate_remote_url(&options.url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .redirect(same_origin_redirect_policy())
        .build()
        .map_err(|_| format!("Could not initialize the {resource} downloader"))?;
    let mut headers = remote_headers(options.headers)?;
    apply_conditional_headers(&mut headers, validators, resource)?;
    let mut response = client
        .get(url)
        .headers(headers)
        .send()
        .await
        .map_err(|_| format!("Could not download the {resource}"))?;
    if response.status() == reqwest::StatusCode::NOT_MODIFIED {
        return Ok(RemoteDownloadResult::NotModified);
    }
    if !response.status().is_success() {
        return Err(format!(
            "The {resource} URL answered {}",
            response.status().as_u16()
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err(format!("The {resource} is too large"));
    }
    let base_url = response.url().to_string();
    let validators = HttpValidators {
        etag: response
            .headers()
            .get(reqwest::header::ETAG)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned),
        last_modified: response
            .headers()
            .get(reqwest::header::LAST_MODIFIED)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned),
    };
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| format!("The {resource} download was interrupted"))?
    {
        if bytes.len() + chunk.len() > max_bytes {
            return Err(format!("The {resource} is too large"));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(RemoteDownloadResult::Modified(RemoteDownload {
        bytes,
        base_url,
        validators,
    }))
}

pub(crate) fn safe_media_file_name(value: &str) -> String {
    let cleaned = value
        .chars()
        .map(|character| {
            if character.is_control()
                || ['<', '>', ':', '"', '/', '\\', '|', '?', '*'].contains(&character)
            {
                '_'
            } else {
                character
            }
        })
        .collect::<String>()
        .trim_matches([' ', '.'])
        .chars()
        .take(180)
        .collect::<String>();
    if cleaned.is_empty() {
        "Movena download".to_string()
    } else {
        cleaned
    }
}

#[tauri::command]
pub(crate) async fn m3u_fetch(
    app: tauri::AppHandle,
    options: M3uFetchOptions,
) -> Result<M3uDocument, String> {
    let cache_key = options.cache_key.clone();
    let request_key = remote_cache_key(&options);
    let cached = if let Some(source_id) = cache_key.as_deref() {
        validate_source_id(source_id)?;
        load_m3u_http_cache(&app, source_id).unwrap_or(None)
    } else {
        None
    }
    .filter(|cache| cache.request_key == request_key);
    let response = download_remote(
        options,
        MAX_M3U_BYTES,
        "playlist",
        cached.as_ref().map(|cache| &cache.validators),
    )
    .await?;
    match response {
        RemoteDownloadResult::NotModified => {
            let source_id = cache_key
                .as_deref()
                .ok_or_else(|| "The playlist cache is unavailable".to_string())?;
            cache::load(&app, source_id)?
                .ok_or_else(|| "The playlist cache is unavailable".to_string())
        }
        RemoteDownloadResult::Modified(download) => {
            let document = M3uDocument {
                content: decode_m3u(&download.bytes),
                base_url: download.base_url,
                file_name: None,
            };
            if let Some(source_id) = cache_key.as_deref() {
                let cache = M3uHttpCache {
                    request_key,
                    validators: download.validators,
                };
                let _ = store_m3u_http_cache(&app, source_id, &cache);
            }
            Ok(document)
        }
    }
}

#[tauri::command]
pub(crate) async fn m3u_probe_stream(options: M3uProbeOptions) -> Result<M3uProbeResult, String> {
    let url = validate_remote_url(&options.url)?;
    let timeout_ms = options.timeout_ms.clamp(1_000, 30_000);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .redirect(same_origin_redirect_policy())
        .build()
        .map_err(|error| format!("Could not initialize the stream probe: {error}"))?;
    let mut headers = remote_headers(options.headers)?;
    headers.insert(
        reqwest::header::RANGE,
        reqwest::header::HeaderValue::from_static("bytes=0-1023"),
    );
    let started = Instant::now();
    let response = client.get(url).headers(headers).send().await;
    let latency_ms = started.elapsed().as_millis().min(u64::MAX as u128) as u64;

    match response {
        Ok(response) => {
            let code = response.status().as_u16();
            let status = if response.status().is_success() || response.status().is_redirection() {
                "online"
            } else if code == 401 || code == 403 {
                "unauthorized"
            } else {
                "offline"
            };
            Ok(M3uProbeResult {
                status: status.to_string(),
                http_status: Some(code),
                error_message: if status == "online" {
                    None
                } else {
                    Some(format!("Stream probe returned HTTP {}.", response.status()))
                },
                latency_ms,
            })
        }
        Err(error) => Ok(M3uProbeResult {
            status: if error.is_timeout() {
                "timeout"
            } else {
                "offline"
            }
            .to_string(),
            http_status: None,
            error_message: Some(error.to_string()),
            latency_ms,
        }),
    }
}

fn read_m3u_path(path: &Path) -> Result<M3uDocument, String> {
    let metadata =
        std::fs::metadata(path).map_err(|_| "The playlist file is unavailable".to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_M3U_BYTES as u64 {
        return Err("The playlist must be a file no larger than 64 MiB".to_string());
    }
    let bytes = std::fs::read(path).map_err(|_| "Could not read the playlist file".to_string())?;
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let base_url = url::Url::from_directory_path(parent)
        .map_err(|_| "Could not resolve the playlist directory".to_string())?
        .to_string();
    Ok(M3uDocument {
        content: decode_m3u(&bytes),
        base_url,
        file_name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned()),
    })
}

#[tauri::command(async)]
pub(crate) fn m3u_read_file(path: String) -> Result<M3uDocument, String> {
    read_m3u_path(Path::new(&path))
}

fn m3u_http_cache_path(app: &tauri::AppHandle, source_id: &str) -> Result<PathBuf, String> {
    cache::http_cache_path(app, source_id)
}

fn load_m3u_http_cache(
    app: &tauri::AppHandle,
    source_id: &str,
) -> Result<Option<M3uHttpCache>, String> {
    let path = m3u_http_cache_path(app, source_id)?;
    if !path.exists() {
        return Ok(None);
    }
    let bytes =
        std::fs::read(path).map_err(|_| "Could not read the playlist HTTP cache".to_string())?;
    if bytes.len() > 32 * 1024 {
        return Err("The playlist HTTP cache is invalid".to_string());
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| "The playlist HTTP cache is invalid".to_string())
}

fn store_m3u_http_cache(
    app: &tauri::AppHandle,
    source_id: &str,
    cache: &M3uHttpCache,
) -> Result<(), String> {
    let bytes = serde_json::to_vec(cache)
        .map_err(|_| "Could not encode the playlist HTTP cache".to_string())?;
    std::fs::write(m3u_http_cache_path(app, source_id)?, bytes)
        .map_err(|_| "Could not store the playlist HTTP cache".to_string())
}

pub(crate) fn remote_cache_key(options: &M3uFetchOptions) -> String {
    let mut identity = options.url.clone();
    let mut headers: Vec<_> = options.headers.iter().collect();
    headers.sort_by(|left, right| {
        left.0
            .to_ascii_lowercase()
            .cmp(&right.0.to_ascii_lowercase())
    });
    for (name, value) in headers {
        identity.push('\n');
        identity.push_str(&name.to_ascii_lowercase());
        identity.push(':');
        identity.push_str(value);
    }
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in identity.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

pub(crate) fn unix_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}
