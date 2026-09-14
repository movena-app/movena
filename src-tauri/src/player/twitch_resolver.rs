use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use url::Url;

const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);
const GRACEFUL_STOP_TIMEOUT: Duration = Duration::from_millis(1500);
const RESOLVER_LOG_PREFIX: &str = "MOVENA|";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ResolverStatusData {
    provider: &'static str,
    phase: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    expected_duration_seconds: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<&'static str>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ResolverEventPayload {
    #[serde(rename = "type")]
    event_type: &'static str,
    data: ResolverStatusData,
    #[serde(skip_serializing_if = "Option::is_none")]
    session_id: Option<String>,
}

fn emit_status(
    app: &AppHandle,
    session_id: &Option<String>,
    phase: &'static str,
    expected_duration_seconds: Option<u64>,
    code: Option<&'static str>,
) {
    let _ = app.emit(
        "mpv-event",
        ResolverEventPayload {
            event_type: "resolver-status",
            data: ResolverStatusData {
                provider: "twitch",
                phase,
                expected_duration_seconds,
                code,
            },
            session_id: session_id.clone(),
        },
    );
}

fn valid_channel_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 25
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}

fn reserved_twitch_path(value: &str) -> bool {
    matches!(
        value.to_ascii_lowercase().as_str(),
        "collections"
            | "creatorcamp"
            | "directory"
            | "downloads"
            | "inventory"
            | "jobs"
            | "login"
            | "p"
            | "products"
            | "search"
            | "settings"
            | "signup"
            | "store"
            | "subscriptions"
            | "team"
            | "turbo"
            | "videos"
            | "wallet"
    )
}

pub(crate) fn is_twitch_live_url(value: &str) -> bool {
    let Ok(url) = Url::parse(value) else {
        return false;
    };
    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }

    let Some(host) = url.host_str().map(str::to_ascii_lowercase) else {
        return false;
    };
    if host == "player.twitch.tv" {
        let channel = url
            .query_pairs()
            .find_map(|(key, value)| (key == "channel").then_some(value));
        let has_video = url.query_pairs().any(|(key, _)| key == "video");
        return !has_video
            && channel
                .as_deref()
                .is_some_and(|value| valid_channel_name(value) && !reserved_twitch_path(value));
    }

    if !matches!(
        host.as_str(),
        "twitch.tv" | "www.twitch.tv" | "m.twitch.tv" | "go.twitch.tv"
    ) {
        return false;
    }

    let segments = url
        .path_segments()
        .map(|segments| {
            segments
                .filter(|segment| !segment.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    segments.len() == 1 && valid_channel_name(segments[0]) && !reserved_twitch_path(segments[0])
}

#[cfg(windows)]
fn resolver_executable_name() -> &'static str {
    "twitch-resolver.exe"
}

#[cfg(not(windows))]
fn resolver_executable_name() -> &'static str {
    "twitch-resolver"
}

use super::options::first_existing_file;

fn bundled_resolver_path(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(
            resource_dir
                .join("twitch-resolver")
                .join(resolver_executable_name()),
        );
    }
    if let Ok(executable) = std::env::current_exe() {
        if let Some(executable_dir) = executable.parent() {
            candidates.push(
                executable_dir
                    .join("twitch-resolver")
                    .join(resolver_executable_name()),
            );
        }
    }
    first_existing_file(candidates)
}

fn parse_log_message(line: &str) -> Option<&str> {
    let remainder = line.trim().strip_prefix(RESOLVER_LOG_PREFIX)?;
    let mut fields = remainder.splitn(3, '|');
    fields.next()?;
    fields.next()?;
    fields.next().map(str::trim)
}

fn parse_startup_diagnostic(line: &str) -> Option<&str> {
    if let Some(message) = parse_log_message(line) {
        return Some(message);
    }

    // Streamlink's CLI writes this terminal error outside its configured log
    // formatter. Recognize only the fixed prefix and discard the URL suffix.
    let line = line.trim();
    if line
        .to_ascii_lowercase()
        .starts_with("error: no playable streams found on this url:")
    {
        return Some("No playable streams found on this URL");
    }

    None
}

fn parse_loopback_url(line: &str) -> Option<String> {
    let message = parse_log_message(line)?;
    let url = Url::parse(message).ok()?;
    if url.scheme() != "http"
        || url.host_str() != Some("127.0.0.1")
        || url.port().is_none()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return None;
    }
    Some(url.to_string())
}

fn parse_ad_break_duration(line: &str) -> Option<Option<u64>> {
    let message = parse_log_message(line)?;
    if message.contains("Waiting for pre-roll ads to finish") {
        return Some(None);
    }
    let duration = message
        .strip_prefix("Detected advertisement break of ")?
        .split_whitespace()
        .next()?
        .parse::<u64>()
        .ok()?;
    Some(Some(duration.clamp(1, 180)))
}

fn classify_failure(lines: &[String]) -> &'static str {
    let summary = lines.join("\n").to_ascii_lowercase();
    if summary.contains("not currently live")
        || summary.contains("channel is offline")
        || summary.contains("no playable streams")
    {
        "channel-offline"
    } else if summary.contains("no streams found") {
        "no-streams"
    } else if summary.contains("client-integrity")
        || summary.contains("client integrity")
        || summary.contains("chromium")
    {
        "client-integrity-unavailable"
    } else {
        "resolver-exited"
    }
}

fn retain_startup_diagnostic(
    line: &str,
    diagnostics: &mut Vec<String>,
    malformed_loopback_response: &mut bool,
) {
    let Some(message) = parse_startup_diagnostic(line) else {
        return;
    };
    if message.starts_with("http://") || message.starts_with("https://") {
        *malformed_loopback_response = true;
    }
    diagnostics.push(redact_resolver_diagnostic(message));
    if diagnostics.len() > 16 {
        diagnostics.remove(0);
    }
}

fn startup_failure_code(
    diagnostics: &[String],
    malformed_loopback_response: bool,
    resolver_exited: bool,
) -> &'static str {
    if malformed_loopback_response {
        return "malformed-loopback-response";
    }

    let classified = classify_failure(diagnostics);
    if classified != "resolver-exited" {
        classified
    } else if resolver_exited {
        "resolver-exited"
    } else {
        "resolver-startup-timeout"
    }
}

fn redact_resolver_diagnostic(message: &str) -> String {
    message
        .split_whitespace()
        .map(|field| {
            let lowercase = field.to_ascii_lowercase();
            if lowercase.starts_with("http://") || lowercase.starts_with("https://") {
                "[URL omitted]".to_string()
            } else if let Some((name, _)) = field.split_once('=') {
                if matches!(
                    name.to_ascii_lowercase().as_str(),
                    "token" | "sig" | "signature" | "oauth" | "client-integrity"
                ) {
                    format!("{name}=[redacted]")
                } else {
                    field.to_string()
                }
            } else if lowercase.starts_with("oauth:") {
                "oauth:[redacted]".to_string()
            } else {
                field.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn spawn_pipe_reader<R: std::io::Read + Send + 'static>(
    pipe: R,
    sender: mpsc::Sender<String>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        for line in BufReader::new(pipe).lines() {
            let Ok(line) = line else {
                break;
            };
            if sender.send(line).is_err() {
                break;
            }
        }
    })
}

#[cfg(windows)]
struct ResolverJob {
    handle: windows_sys::Win32::Foundation::HANDLE,
}

#[cfg(windows)]
unsafe impl Send for ResolverJob {}

#[cfg(windows)]
impl ResolverJob {
    fn assign(child: &Child) -> Result<Self, String> {
        use std::mem::{size_of, zeroed};
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, JobObjectExtendedLimitInformation, SetInformationJobObject,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };

        unsafe {
            let handle = windows_sys::Win32::System::JobObjects::CreateJobObjectW(
                std::ptr::null(),
                std::ptr::null(),
            );
            if handle.is_null() {
                return Err("Failed to create the Twitch resolver process group".to_string());
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                (&info as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            ) == 0
                || AssignProcessToJobObject(handle, child.as_raw_handle() as _) == 0
            {
                CloseHandle(handle);
                return Err("Failed to contain the Twitch resolver process".to_string());
            }
            Ok(Self { handle })
        }
    }
}

#[cfg(windows)]
impl Drop for ResolverJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.handle);
        }
    }
}

pub(crate) struct TwitchResolverProcess {
    child: Arc<Mutex<Child>>,
    stopping: Arc<AtomicBool>,
    reader_threads: Vec<JoinHandle<()>>,
    monitor_thread: Option<JoinHandle<()>>,
    #[cfg(windows)]
    job: Option<ResolverJob>,
    #[cfg(unix)]
    process_group_id: i32,
}

impl TwitchResolverProcess {
    pub(crate) fn stop(&mut self) {
        self.stopping.store(true, Ordering::SeqCst);
        let deadline = Instant::now() + GRACEFUL_STOP_TIMEOUT;
        loop {
            let exited = self
                .child
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .try_wait()
                .ok()
                .flatten()
                .is_some();
            if exited || Instant::now() >= deadline {
                break;
            }
            thread::sleep(Duration::from_millis(50));
        }

        let still_running = self
            .child
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .try_wait()
            .ok()
            .flatten()
            .is_none();
        if still_running {
            #[cfg(windows)]
            {
                self.job.take();
            }
            #[cfg(unix)]
            unsafe {
                libc::kill(-self.process_group_id, libc::SIGKILL);
            }
            let _ = self
                .child
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .kill();
        }
        let _ = self
            .child
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .wait();

        for reader in self.reader_threads.drain(..) {
            let _ = reader.join();
        }
        if let Some(monitor) = self.monitor_thread.take() {
            if monitor.thread().id() != thread::current().id() {
                let _ = monitor.join();
            }
        }
    }
}

impl Drop for TwitchResolverProcess {
    fn drop(&mut self) {
        self.stop();
    }
}

fn configure_process(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
}

pub(crate) fn start(
    app: &AppHandle,
    url: &str,
    session_id: Option<String>,
) -> Result<(String, TwitchResolverProcess), String> {
    emit_status(app, &session_id, "starting", None, None);

    let Some(executable) = bundled_resolver_path(app) else {
        emit_status(
            app,
            &session_id,
            "failed",
            None,
            Some("resolver-unavailable"),
        );
        return Err("The bundled Twitch resolver is unavailable.".to_string());
    };
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|_| "The Twitch resolver cache path is unavailable.".to_string())?
        .join("twitch-resolver");
    std::fs::create_dir_all(&cache_dir)
        .map_err(|_| "The Twitch resolver cache could not be created.".to_string())?;

    let mut command = Command::new(executable);
    command
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    command.env("APPDATA", &cache_dir);
    #[cfg(not(windows))]
    command.env("XDG_CACHE_HOME", &cache_dir);
    configure_process(&mut command);

    let mut child = command.spawn().map_err(|_| {
        emit_status(
            app,
            &session_id,
            "failed",
            None,
            Some("resolver-unavailable"),
        );
        "The bundled Twitch resolver could not be started.".to_string()
    })?;
    #[cfg(windows)]
    let job = match ResolverJob::assign(&child) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    #[cfg(unix)]
    let process_group_id = child.id() as i32;

    let Some(stdout) = child.stdout.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("The Twitch resolver output pipe is unavailable.".to_string());
    };
    let Some(stderr) = child.stderr.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("The Twitch resolver error pipe is unavailable.".to_string());
    };
    let child = Arc::new(Mutex::new(child));
    let stopping = Arc::new(AtomicBool::new(false));
    let (sender, receiver) = mpsc::channel();
    let reader_threads = vec![
        spawn_pipe_reader(stdout, sender.clone()),
        spawn_pipe_reader(stderr, sender),
    ];

    let deadline = Instant::now() + STARTUP_TIMEOUT;
    let mut startup_diagnostics = Vec::new();
    let mut malformed_loopback_response = false;
    let mut resolver_ended = false;
    let playback_url = loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break None;
        }
        match receiver.recv_timeout(remaining.min(Duration::from_millis(250))) {
            Ok(line) => {
                if let Some(url) = parse_loopback_url(&line) {
                    break Some(url);
                }
                retain_startup_diagnostic(
                    &line,
                    &mut startup_diagnostics,
                    &mut malformed_loopback_response,
                );
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if child
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .try_wait()
                    .ok()
                    .flatten()
                    .is_some()
                {
                    resolver_ended = true;
                    break None;
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break None,
        }
    };

    let Some(playback_url) = playback_url else {
        let resolver_exited = resolver_ended
            || child
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .try_wait()
                .ok()
                .flatten()
                .is_some();
        stopping.store(true, Ordering::SeqCst);
        if !resolver_exited {
            let _ = child
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .kill();
        }
        let _ = child
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .wait();
        for reader in reader_threads {
            let _ = reader.join();
        }
        while let Ok(line) = receiver.try_recv() {
            retain_startup_diagnostic(
                &line,
                &mut startup_diagnostics,
                &mut malformed_loopback_response,
            );
        }
        let failure_code = startup_failure_code(
            &startup_diagnostics,
            malformed_loopback_response,
            resolver_exited,
        );
        emit_status(app, &session_id, "failed", None, Some(failure_code));
        return Err(match failure_code {
            "channel-offline" => "This Twitch channel is not currently live.",
            "no-streams" => "Twitch did not provide a playable live stream.",
            "client-integrity-unavailable" => {
                "Twitch client-integrity verification is unavailable."
            }
            "malformed-loopback-response" => {
                "The Twitch resolver returned an invalid local playback address."
            }
            "resolver-startup-timeout" => "The Twitch resolver did not become ready in time.",
            _ => "The Twitch stream resolver stopped unexpectedly.",
        }
        .to_string());
    };

    emit_status(app, &session_id, "ready", None, None);
    let monitor_app = app.clone();
    let monitor_session_id = session_id.clone();
    let monitor_child = child.clone();
    let monitor_stopping = stopping.clone();
    let monitor_thread = thread::spawn(move || {
        let mut recent_errors = Vec::new();
        loop {
            match receiver.recv_timeout(Duration::from_millis(250)) {
                Ok(line) => {
                    if let Some(duration) = parse_ad_break_duration(&line) {
                        emit_status(
                            &monitor_app,
                            &monitor_session_id,
                            "ad-break",
                            duration,
                            None,
                        );
                    }
                    if let Some(message) = parse_log_message(&line) {
                        let lowercase = message.to_ascii_lowercase();
                        if lowercase.contains("error")
                            || lowercase.contains("failed")
                            || lowercase.contains("no playable streams")
                            || lowercase.contains("not currently live")
                            || lowercase.contains("chromium")
                        {
                            recent_errors.push(redact_resolver_diagnostic(message));
                            if recent_errors.len() > 8 {
                                recent_errors.remove(0);
                            }
                        }
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }

            let exited = monitor_child
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .try_wait()
                .ok()
                .flatten()
                .is_some();
            if exited {
                if !monitor_stopping.load(Ordering::SeqCst) {
                    emit_status(
                        &monitor_app,
                        &monitor_session_id,
                        "failed",
                        None,
                        Some(classify_failure(&recent_errors)),
                    );
                }
                break;
            }
        }
    });

    Ok((
        playback_url,
        TwitchResolverProcess {
            child,
            stopping,
            reader_threads,
            monitor_thread: Some(monitor_thread),
            #[cfg(windows)]
            job: Some(job),
            #[cfg(unix)]
            process_group_id,
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::{
        classify_failure, configure_process, first_existing_file, is_twitch_live_url,
        parse_ad_break_duration, parse_loopback_url, parse_startup_diagnostic,
        redact_resolver_diagnostic, startup_failure_code, TwitchResolverProcess,
    };
    use std::process::{Command, Stdio};
    use std::sync::atomic::AtomicBool;
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    #[test]
    fn classifies_supported_twitch_live_pages_only() {
        for value in [
            "https://www.twitch.tv/gleggmire",
            "https://twitch.tv/gleggmire/",
            "http://m.twitch.tv/some_channel?referrer=raid",
            "https://player.twitch.tv/?channel=gleggmire&parent=example.com",
        ] {
            assert!(
                is_twitch_live_url(value),
                "expected Twitch live URL: {value}"
            );
        }

        for value in [
            "",
            "not a url",
            "ftp://twitch.tv/gleggmire",
            "https://clips.twitch.tv/ClipId",
            "https://www.twitch.tv/videos/1234",
            "https://www.twitch.tv/gleggmire/clip/ClipId",
            "https://player.twitch.tv/?video=v1234",
            "https://usher.ttvnw.net/api/channel/hls/gleggmire.m3u8",
            "https://www.twitch.tv/directory",
            "https://www.twitch.tv/videos",
            "https://www.twitch.tv/settings",
            "https://example.com/gleggmire",
        ] {
            assert!(
                !is_twitch_live_url(value),
                "unexpected Twitch live URL: {value}"
            );
        }
    }

    #[test]
    fn accepts_only_the_announced_loopback_server_url() {
        assert_eq!(
            parse_loopback_url("MOVENA|streamlink.cli.main|info| http://127.0.0.1:54681/"),
            Some("http://127.0.0.1:54681/".to_string())
        );
        for value in [
            "http://127.0.0.1:54681/",
            "MOVENA|streamlink.cli.main|info| https://127.0.0.1:54681/",
            "MOVENA|streamlink.cli.main|info| http://localhost:54681/",
            "MOVENA|streamlink.cli.main|info| http://127.0.0.1/",
            "MOVENA|streamlink.cli.main|info| http://127.0.0.1:54681/path",
            "MOVENA|streamlink.cli.main|info| https://usher.ttvnw.net/token.m3u8",
        ] {
            assert_eq!(
                parse_loopback_url(value),
                None,
                "accepted unsafe URL: {value}"
            );
        }
    }

    #[test]
    fn parses_pinned_ad_break_messages_with_a_safe_bound() {
        assert_eq!(
            parse_ad_break_duration(
                "MOVENA|streamlink.plugins.twitch|info|Waiting for pre-roll ads to finish, be patient"
            ),
            Some(None)
        );
        assert_eq!(
            parse_ad_break_duration(
                "MOVENA|streamlink.plugins.twitch|info|Detected advertisement break of 30 seconds"
            ),
            Some(Some(30))
        );
        assert_eq!(
            parse_ad_break_duration(
                "MOVENA|streamlink.plugins.twitch|info|Detected advertisement break of 999 seconds"
            ),
            Some(Some(180))
        );
        assert_eq!(parse_ad_break_duration("untrusted output"), None);
    }

    #[test]
    fn recognizes_streamlinks_unformatted_offline_error_without_retaining_its_url() {
        assert_eq!(
            parse_startup_diagnostic(
                "error: No playable streams found on this URL: https://www.twitch.tv/gleggmire"
            ),
            Some("No playable streams found on this URL")
        );
        assert_eq!(
            parse_startup_diagnostic("error: arbitrary untrusted output token=secret"),
            None
        );
    }

    #[test]
    fn maps_resolver_failures_without_exposing_log_text() {
        assert_eq!(
            classify_failure(&["The channel is not currently live".to_string()]),
            "channel-offline"
        );
        assert_eq!(
            classify_failure(&["No playable streams found on this URL".to_string()]),
            "channel-offline"
        );
        assert_eq!(
            classify_failure(&["Chromium was not found for client-integrity".to_string()]),
            "client-integrity-unavailable"
        );
        assert_eq!(
            classify_failure(&["token=secret".to_string()]),
            "resolver-exited"
        );
    }

    #[test]
    fn chooses_specific_startup_errors_before_exit_or_timeout_fallbacks() {
        let offline = ["No playable streams found on this URL".to_string()];
        assert_eq!(
            startup_failure_code(&offline, false, false),
            "channel-offline"
        );
        assert_eq!(
            startup_failure_code(&[], true, false),
            "malformed-loopback-response"
        );
        assert_eq!(startup_failure_code(&[], false, true), "resolver-exited");
        assert_eq!(
            startup_failure_code(&[], false, false),
            "resolver-startup-timeout"
        );
    }

    #[test]
    fn redacts_urls_and_token_values_from_retained_diagnostics() {
        let diagnostic = redact_resolver_diagnostic(
            "request https://usher.ttvnw.net/api/channel.m3u8?sig=secret token=hunter2 oauth:abcd client-integrity=value",
        );
        assert_eq!(
            diagnostic,
            "request [URL omitted] token=[redacted] oauth:[redacted] client-integrity=[redacted]"
        );
    }

    #[test]
    fn selects_only_an_existing_resolver_candidate() {
        let base = std::env::temp_dir().join(format!(
            "movena-twitch-resolver-test-{}",
            std::process::id()
        ));
        let missing = base.join("missing");
        let present = base.join("twitch-resolver");
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(&present, b"resolver").unwrap();
        assert_eq!(
            first_existing_file([missing, present.clone()]),
            Some(present.clone())
        );
        std::fs::remove_file(present).unwrap();
        std::fs::remove_dir(base).unwrap();
    }

    #[test]
    fn stops_a_resolver_process_within_the_bounded_timeout() {
        #[cfg(windows)]
        let mut command = {
            let mut value = Command::new("cmd");
            value.args(["/C", "ping -n 30 127.0.0.1 >NUL"]);
            value
        };
        #[cfg(unix)]
        let mut command = {
            let mut value = Command::new("sh");
            value.args(["-c", "sleep 30"]);
            value
        };
        command.stdout(Stdio::null()).stderr(Stdio::null());
        configure_process(&mut command);
        let child = command.spawn().unwrap();
        #[cfg(windows)]
        let job = super::ResolverJob::assign(&child).unwrap();
        #[cfg(unix)]
        let process_group_id = child.id() as i32;
        let child = Arc::new(Mutex::new(child));
        let mut process = TwitchResolverProcess {
            child: child.clone(),
            stopping: Arc::new(AtomicBool::new(false)),
            reader_threads: Vec::new(),
            monitor_thread: None,
            #[cfg(windows)]
            job: Some(job),
            #[cfg(unix)]
            process_group_id,
        };

        let started = Instant::now();
        process.stop();

        assert!(started.elapsed() < Duration::from_secs(4));
        assert!(child.lock().unwrap().try_wait().unwrap().is_some());
    }
}
