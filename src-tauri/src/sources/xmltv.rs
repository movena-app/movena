use std::collections::BTreeMap;
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::{FixedOffset, Local, NaiveDate, TimeZone};
use quick_xml::events::Event;
use quick_xml::{Reader, XmlVersion};
use serde::{Deserialize, Serialize};
use tauri::Manager;

use super::remote::{
    apply_conditional_headers, remote_cache_key, remote_headers, same_origin_redirect_policy,
    unix_time_ms, validate_remote_url, HttpValidators, M3uFetchOptions,
};
use super::{MAX_XMLTV_BYTES, XMLTV_CACHE_FRESH_MS};

const XMLTV_METADATA_LIMIT: usize = 32 * 1024;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XmltvChannelDto {
    id: String,
    names: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XmltvProgrammeDto {
    title: String,
    description: String,
    start: i64,
    end: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XmltvProgrammeGroupDto {
    channel_id: String,
    programmes: Vec<XmltvProgrammeDto>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XmltvGuidePayload {
    channels: Vec<XmltvChannelDto>,
    programme_groups: Vec<XmltvProgrammeGroupDto>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct XmltvHttpMetadata {
    fetched_at_ms: u64,
    #[serde(flatten)]
    validators: HttpValidators,
}

struct CachedGuide {
    metadata: XmltvHttpMetadata,
    guide: XmltvGuidePayload,
}

struct PendingProgramme {
    channel_id: String,
    start: i64,
    end: i64,
    title: String,
    description: String,
}

enum TextTarget {
    ChannelName,
    ProgrammeTitle,
    ProgrammeDescription,
}

struct BoundedReader<R> {
    inner: R,
    read: usize,
    maximum: usize,
}

impl<R> BoundedReader<R> {
    fn new(inner: R, maximum: usize) -> Self {
        Self {
            inner,
            read: 0,
            maximum,
        }
    }
}

impl<R: Read> Read for BoundedReader<R> {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        if self.read >= self.maximum {
            let mut extra = [0_u8; 1];
            return match self.inner.read(&mut extra)? {
                0 => Ok(0),
                _ => Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "XMLTV guide exceeds the decompressed size limit",
                )),
            };
        }
        let available = (self.maximum - self.read).min(buffer.len());
        let count = self.inner.read(&mut buffer[..available])?;
        self.read += count;
        Ok(count)
    }
}

fn parse_xmltv_time(value: &str) -> Option<i64> {
    let value = value.trim();
    let digit_count = value.bytes().take_while(u8::is_ascii_digit).count();
    if digit_count != 12 && digit_count != 14 {
        return None;
    }
    let date = &value[..digit_count];
    let parse = |range: std::ops::Range<usize>| date.get(range)?.parse::<u32>().ok();
    let year = date.get(0..4)?.parse::<i32>().ok()?;
    let month = parse(4..6)?;
    let day = parse(6..8)?;
    let hour = parse(8..10)?;
    let minute = parse(10..12)?;
    let second = if digit_count == 14 { parse(12..14)? } else { 0 };
    let naive = NaiveDate::from_ymd_opt(year, month, day)?.and_hms_opt(hour, minute, second)?;
    let offset = value[digit_count..].trim();
    if offset.is_empty() {
        return Local
            .from_local_datetime(&naive)
            .earliest()
            .map(|value| value.timestamp_millis());
    }
    if offset.len() != 5 || !matches!(offset.as_bytes()[0], b'+' | b'-') {
        return None;
    }
    let hours = offset.get(1..3)?.parse::<i32>().ok()?;
    let minutes = offset.get(3..5)?.parse::<i32>().ok()?;
    if hours > 23 || minutes > 59 {
        return None;
    }
    let sign = if offset.starts_with('-') { -1 } else { 1 };
    let offset = FixedOffset::east_opt(sign * (hours * 3600 + minutes * 60))?;
    offset
        .from_local_datetime(&naive)
        .single()
        .map(|value| value.timestamp_millis())
}

fn attribute_value(
    event: &quick_xml::events::BytesStart<'_>,
    name: &str,
) -> Result<Option<String>, String> {
    for attribute in event.attributes() {
        let attribute = attribute.map_err(|_| "This guide is not valid XML.".to_string())?;
        if attribute.key.local_name().as_ref() == name {
            return attribute
                .normalized_value(XmlVersion::Implicit1_0)
                .map(|value| Some(value.into_owned()))
                .map_err(|_| "This guide is not valid XML.".to_string());
        }
    }
    Ok(None)
}

fn append_text(
    target: &TextTarget,
    value: &str,
    channel_names: &mut [String],
    programme: &mut Option<PendingProgramme>,
) {
    match target {
        TextTarget::ChannelName => {
            if let Some(name) = channel_names.last_mut() {
                name.push_str(value);
            }
        }
        TextTarget::ProgrammeTitle => {
            if let Some(programme) = programme.as_mut() {
                programme.title.push_str(value);
            }
        }
        TextTarget::ProgrammeDescription => {
            if let Some(programme) = programme.as_mut() {
                programme.description.push_str(value);
            }
        }
    }
}

fn parse_xmltv_reader<R: std::io::BufRead>(input: R) -> Result<XmltvGuidePayload, String> {
    let mut reader = Reader::from_reader(input);
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut channels = Vec::new();
    let mut current_channel_id: Option<String> = None;
    let mut channel_names = Vec::new();
    let mut programme: Option<PendingProgramme> = None;
    let mut groups: BTreeMap<String, Vec<XmltvProgrammeDto>> = BTreeMap::new();
    let mut text_target: Option<TextTarget> = None;
    let mut saw_tv = false;

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) => match event.local_name().as_ref() {
                "tv" => saw_tv = true,
                "channel" => {
                    current_channel_id = attribute_value(&event, "id")?;
                    channel_names.clear();
                }
                "display-name" if current_channel_id.is_some() => {
                    channel_names.push(String::new());
                    text_target = Some(TextTarget::ChannelName);
                }
                "programme" => {
                    let channel_id = attribute_value(&event, "channel")?;
                    let start = attribute_value(&event, "start")?
                        .as_deref()
                        .and_then(parse_xmltv_time);
                    let end = attribute_value(&event, "stop")?
                        .as_deref()
                        .and_then(parse_xmltv_time);
                    programme = match (channel_id, start, end) {
                        (Some(channel_id), Some(start), Some(end)) if end > start => {
                            Some(PendingProgramme {
                                channel_id,
                                start,
                                end,
                                title: String::new(),
                                description: String::new(),
                            })
                        }
                        _ => None,
                    };
                }
                "title" if programme.is_some() => text_target = Some(TextTarget::ProgrammeTitle),
                "desc" if programme.is_some() => {
                    text_target = Some(TextTarget::ProgrammeDescription)
                }
                _ => {}
            },
            Ok(Event::Text(text)) => {
                if let Some(target) = text_target.as_ref() {
                    let value = text.xml10_content();
                    append_text(target, &value, &mut channel_names, &mut programme);
                }
            }
            Ok(Event::GeneralRef(reference)) => {
                if let Some(target) = text_target.as_ref() {
                    let value = if let Some(character) = reference
                        .resolve_char_ref()
                        .map_err(|_| "This guide is not valid XML.".to_string())?
                    {
                        character.to_string()
                    } else {
                        match reference.as_ref() {
                            "amp" => "&".to_string(),
                            "lt" => "<".to_string(),
                            "gt" => ">".to_string(),
                            "apos" => "'".to_string(),
                            "quot" => "\"".to_string(),
                            _ => return Err("This guide is not valid XML.".to_string()),
                        }
                    };
                    append_text(target, &value, &mut channel_names, &mut programme);
                }
            }
            Ok(Event::CData(text)) => {
                if let Some(target) = text_target.as_ref() {
                    let value = text.as_ref();
                    append_text(target, value, &mut channel_names, &mut programme);
                }
            }
            Ok(Event::End(event)) => match event.local_name().as_ref() {
                "display-name" | "title" | "desc" => text_target = None,
                "channel" => {
                    if let Some(id) = current_channel_id.take() {
                        let names = channel_names
                            .drain(..)
                            .map(|name| name.trim().to_string())
                            .filter(|name| !name.is_empty())
                            .collect();
                        channels.push(XmltvChannelDto { id, names });
                    }
                }
                "programme" => {
                    if let Some(programme) = programme.take() {
                        groups
                            .entry(programme.channel_id)
                            .or_default()
                            .push(XmltvProgrammeDto {
                                title: if programme.title.trim().is_empty() {
                                    "No title".to_string()
                                } else {
                                    programme.title.trim().to_string()
                                },
                                description: programme.description.trim().to_string(),
                                start: programme.start,
                                end: programme.end,
                            });
                    }
                }
                _ => {}
            },
            Ok(Event::DocType(_)) => {
                return Err("XMLTV document types are not supported.".to_string())
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) if error.to_string().contains("decompressed size limit") => {
                return Err("The XMLTV guide is too large".to_string());
            }
            Err(_) => return Err("This guide is not valid XML.".to_string()),
        }
        buffer.clear();
    }

    if !saw_tv {
        return Err("This guide is not valid XML.".to_string());
    }
    let programme_groups = groups
        .into_iter()
        .map(|(channel_id, mut programmes)| {
            programmes.sort_by_key(|programme| programme.start);
            XmltvProgrammeGroupDto {
                channel_id,
                programmes,
            }
        })
        .collect();
    Ok(XmltvGuidePayload {
        channels,
        programme_groups,
    })
}

fn parse_xmltv_path(path: &Path) -> Result<XmltvGuidePayload, String> {
    let mut file =
        File::open(path).map_err(|_| "The XMLTV guide cache is unavailable".to_string())?;
    let mut magic = [0_u8; 2];
    let count = file
        .read(&mut magic)
        .map_err(|_| "The XMLTV guide cache is unavailable".to_string())?;
    file.seek(SeekFrom::Start(0))
        .map_err(|_| "The XMLTV guide cache is unavailable".to_string())?;
    if count == 2 && magic == [0x1f, 0x8b] {
        let decoder = flate2::read::GzDecoder::new(file);
        parse_xmltv_reader(BufReader::new(BoundedReader::new(decoder, MAX_XMLTV_BYTES)))
    } else {
        parse_xmltv_reader(BufReader::new(BoundedReader::new(file, MAX_XMLTV_BYTES)))
    }
}

fn cache_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| "Application data is unavailable".to_string())?
        .join("xmltv-cache");
    std::fs::create_dir_all(&directory)
        .map_err(|_| "Could not create the XMLTV guide cache".to_string())?;
    Ok(directory)
}

fn validate_cache_key(cache_key: &str) -> Result<(), String> {
    if cache_key.len() == 16 && cache_key.chars().all(|value| value.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("Invalid remote cache key".to_string())
    }
}

fn cache_paths(
    app: &tauri::AppHandle,
    cache_key: &str,
    pending: bool,
) -> Result<(PathBuf, PathBuf), String> {
    validate_cache_key(cache_key)?;
    let qualifier = if pending { ".pending" } else { "" };
    let directory = cache_directory(app)?;
    Ok((
        directory.join(format!("{cache_key}{qualifier}.xml")),
        directory.join(format!("{cache_key}{qualifier}.json")),
    ))
}

fn remove_if_exists(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Could not update the XMLTV guide cache".to_string()),
    }
}

fn load_cached_guide(
    app: &tauri::AppHandle,
    cache_key: &str,
) -> Result<Option<CachedGuide>, String> {
    let (content_path, metadata_path) = cache_paths(app, cache_key, false)?;
    if !content_path.exists() || !metadata_path.exists() {
        return Ok(None);
    }
    if std::fs::metadata(&content_path)
        .map(|value| value.len())
        .unwrap_or(u64::MAX)
        > MAX_XMLTV_BYTES as u64
        || std::fs::metadata(&metadata_path)
            .map(|value| value.len())
            .unwrap_or(u64::MAX)
            > XMLTV_METADATA_LIMIT as u64
    {
        return Err("The XMLTV guide cache is invalid".to_string());
    }
    let metadata: XmltvHttpMetadata = serde_json::from_reader(
        File::open(&metadata_path)
            .map_err(|_| "Could not read the XMLTV guide cache".to_string())?,
    )
    .map_err(|_| "The XMLTV guide cache is invalid".to_string())?;
    let guide = parse_xmltv_path(&content_path)?;
    Ok(Some(CachedGuide { metadata, guide }))
}

fn store_metadata(path: &Path, metadata: &XmltvHttpMetadata) -> Result<(), String> {
    let bytes = serde_json::to_vec(metadata)
        .map_err(|_| "Could not encode the XMLTV guide cache".to_string())?;
    if bytes.len() > XMLTV_METADATA_LIMIT {
        return Err("The XMLTV guide cache is invalid".to_string());
    }
    std::fs::write(path, bytes).map_err(|_| "Could not store the XMLTV guide cache".to_string())
}

async fn download_to_path(
    options: M3uFetchOptions,
    validators: Option<&HttpValidators>,
    path: &Path,
) -> Result<Option<HttpValidators>, String> {
    let url = validate_remote_url(&options.url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .redirect(same_origin_redirect_policy())
        .build()
        .map_err(|_| "Could not initialize the XMLTV guide downloader".to_string())?;
    let mut headers = remote_headers(options.headers)?;
    apply_conditional_headers(&mut headers, validators, "XMLTV guide")?;
    let mut response = client
        .get(url)
        .headers(headers)
        .send()
        .await
        .map_err(|_| "Could not download the XMLTV guide".to_string())?;
    if response.status() == reqwest::StatusCode::NOT_MODIFIED {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(format!(
            "The XMLTV guide URL answered {}",
            response.status().as_u16()
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_XMLTV_BYTES as u64)
    {
        return Err("The XMLTV guide is too large".to_string());
    }
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
    let mut file =
        File::create(path).map_err(|_| "Could not store the XMLTV guide cache".to_string())?;
    let mut downloaded = 0_usize;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "The XMLTV guide download was interrupted".to_string())?
    {
        downloaded = downloaded
            .checked_add(chunk.len())
            .ok_or_else(|| "The XMLTV guide is too large".to_string())?;
        if downloaded > MAX_XMLTV_BYTES {
            return Err("The XMLTV guide is too large".to_string());
        }
        file.write_all(&chunk)
            .map_err(|_| "Could not store the XMLTV guide cache".to_string())?;
    }
    file.flush()
        .map_err(|_| "Could not store the XMLTV guide cache".to_string())?;
    Ok(Some(validators))
}

fn promote_pending(app: &tauri::AppHandle, cache_key: &str) -> Result<(), String> {
    let (pending_content, pending_metadata) = cache_paths(app, cache_key, true)?;
    let (content, metadata) = cache_paths(app, cache_key, false)?;
    remove_if_exists(&content)?;
    remove_if_exists(&metadata)?;
    std::fs::rename(pending_content, content)
        .map_err(|_| "Could not validate the XMLTV guide cache".to_string())?;
    std::fs::rename(pending_metadata, metadata)
        .map_err(|_| "Could not validate the XMLTV guide cache".to_string())
}

#[tauri::command]
pub async fn xmltv_fetch(
    app: tauri::AppHandle,
    options: M3uFetchOptions,
) -> Result<XmltvGuidePayload, String> {
    let cache_key = remote_cache_key(&options);
    let (pending_content, pending_metadata) = cache_paths(&app, &cache_key, true)?;
    let _ = remove_if_exists(&pending_content);
    let _ = remove_if_exists(&pending_metadata);

    let cached = match load_cached_guide(&app, &cache_key) {
        Ok(value) => value,
        Err(_) => {
            let (content, metadata) = cache_paths(&app, &cache_key, false)?;
            let _ = remove_if_exists(&content);
            let _ = remove_if_exists(&metadata);
            None
        }
    };
    let now = unix_time_ms();
    if let Some(cache) = cached.as_ref() {
        if now.saturating_sub(cache.metadata.fetched_at_ms) < XMLTV_CACHE_FRESH_MS {
            return Ok(cache.guide.clone());
        }
    }

    let result = download_to_path(
        options,
        cached.as_ref().map(|cache| &cache.metadata.validators),
        &pending_content,
    )
    .await;
    match result {
        Ok(None) => {
            let mut cache =
                cached.ok_or_else(|| "The XMLTV guide cache is unavailable".to_string())?;
            cache.metadata.fetched_at_ms = now;
            let (_, metadata_path) = cache_paths(&app, &cache_key, false)?;
            store_metadata(&metadata_path, &cache.metadata)?;
            Ok(cache.guide)
        }
        Ok(Some(validators)) => {
            let parse_path = pending_content.clone();
            let guide = tauri::async_runtime::spawn_blocking(move || parse_xmltv_path(&parse_path))
                .await
                .map_err(|error| format!("XMLTV parsing task failed: {error}"))??;
            store_metadata(
                &pending_metadata,
                &XmltvHttpMetadata {
                    fetched_at_ms: now,
                    validators,
                },
            )?;
            promote_pending(&app, &cache_key)?;
            Ok(guide)
        }
        Err(error) => {
            let _ = remove_if_exists(&pending_content);
            let _ = remove_if_exists(&pending_metadata);
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn parse(value: &str) -> Result<XmltvGuidePayload, String> {
        parse_xmltv_reader(BufReader::new(Cursor::new(value.as_bytes())))
    }

    #[test]
    fn parses_namespaces_cdata_entities_and_sorts_programmes() {
        let guide = parse(r#"<?xml version="1.0"?><tv xmlns:x="urn:test">
          <channel id="one"><display-name>News &amp; More</display-name><x:display-name><![CDATA[Backup]]></x:display-name></channel>
          <programme channel="one" start="20260808220000 +0200" stop="20260808230000 +0200"><title>Later</title></programme>
          <programme channel="one" start="20260808200000 +0200" stop="20260808210000 +0200"><title><![CDATA[Earlier]]></title><desc>A &amp; B</desc></programme>
        </tv>"#).unwrap();
        assert_eq!(guide.channels[0].names, ["News & More", "Backup"]);
        assert_eq!(guide.programme_groups[0].programmes[0].title, "Earlier");
        assert_eq!(guide.programme_groups[0].programmes[0].description, "A & B");
    }

    #[test]
    fn skips_invalid_programmes_and_rejects_doctypes() {
        let guide = parse(r#"<tv><programme channel="one" start="bad" stop="20260808230000 +0200"><title>Bad</title></programme></tv>"#).unwrap();
        assert!(guide.programme_groups.is_empty());
        assert!(parse("<!DOCTYPE tv><tv />").is_err());
        assert!(parse("<not-tv />").is_err());
    }

    #[test]
    fn parses_timestamp_offsets_and_validates_calendar_ranges() {
        assert_eq!(
            parse_xmltv_time("20260808203000 +0200"),
            Some(1_786_213_800_000)
        );
        assert!(parse_xmltv_time("20260230000000 +0000").is_none());
        assert!(parse_xmltv_time("20260808246000 +0000").is_none());
        assert!(parse_xmltv_time("20260808203000 +2460").is_none());
    }

    #[test]
    fn validates_opaque_cache_keys() {
        assert!(validate_cache_key("0123456789abcdef").is_ok());
        assert!(validate_cache_key("../../guide").is_err());
        assert!(validate_cache_key("not-hexadecimal!").is_err());
    }
}
