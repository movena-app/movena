//! IntroDB proxy — crowdsourced intro/recap/outro timestamps.
//!
//! `api.introdb.app` sends a hardcoded `Access-Control-Allow-Origin:
//! https://introdb.app` on every response, regardless of the requesting
//! origin. Browsers (including the desktop webview) enforce that header
//! client-side, so a `fetch()` from the frontend is silently blocked by CORS
//! on every call — the request never reaches IntroDB's data at all. Routing
//! the request through the Rust backend sidesteps the problem entirely:
//! `reqwest` is not a browser and does not enforce CORS.

use std::time::Duration;

const INTRODB_API: &str = "https://api.introdb.app";

/// IntroDB's IMDb id format: `tt` followed by 7-8 digits.
fn is_valid_imdb_id(value: &str) -> bool {
    match value.strip_prefix("tt") {
        Some(digits) => {
            (7..=8).contains(&digits.len()) && digits.chars().all(|c| c.is_ascii_digit())
        }
        None => false,
    }
}

/// What an IntroDB answer means for the episode asked about.
#[derive(Debug, PartialEq)]
enum IntroDbOutcome {
    /// The body holds the episode's segments.
    Data,
    /// IntroDB has nothing for this episode: a normal answer, safe to remember.
    NoData,
    /// IntroDB could not answer right now; asking again later may work.
    Failed,
}

fn classify_status(status: reqwest::StatusCode) -> IntroDbOutcome {
    if status.is_success() {
        IntroDbOutcome::Data
    } else if status == reqwest::StatusCode::TOO_MANY_REQUESTS
        || status == reqwest::StatusCode::REQUEST_TIMEOUT
    {
        // Client errors by number, but they say "not now", not "nothing here".
        IntroDbOutcome::Failed
    } else if status.is_client_error() {
        IntroDbOutcome::NoData
    } else {
        IntroDbOutcome::Failed
    }
}

/// Fetch intro/recap/outro timestamps for one episode. Returns `null` when
/// IntroDB has nothing for it (invalid input or a 4xx answer) and an error
/// when IntroDB could not be reached or failed — the frontend caches "nothing"
/// for a day, so a passing outage must not be mistaken for it.
#[tauri::command(async)]
pub async fn introdb_fetch_segments(
    imdb_id: String,
    season: u32,
    episode: u32,
) -> Result<serde_json::Value, String> {
    if !is_valid_imdb_id(&imdb_id) || season < 1 || episode < 1 {
        return Ok(serde_json::Value::Null);
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "Could not initialize the IntroDB request".to_string())?;

    let url = format!("{INTRODB_API}/segments?imdb_id={imdb_id}&season={season}&episode={episode}");
    let response = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|_| "IntroDB could not be reached".to_string())?;

    match classify_status(response.status()) {
        IntroDbOutcome::NoData => Ok(serde_json::Value::Null),
        IntroDbOutcome::Failed => Err(format!(
            "IntroDB failed to answer (HTTP {})",
            response.status().as_u16()
        )),
        IntroDbOutcome::Data => response
            .json::<serde_json::Value>()
            .await
            .map_err(|_| "IntroDB sent an unreadable answer".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::{classify_status, is_valid_imdb_id, IntroDbOutcome};
    use reqwest::StatusCode;

    #[test]
    fn tells_missing_data_from_failures_by_status() {
        assert_eq!(classify_status(StatusCode::OK), IntroDbOutcome::Data);
        assert_eq!(
            classify_status(StatusCode::NOT_FOUND),
            IntroDbOutcome::NoData
        );
        assert_eq!(
            classify_status(StatusCode::BAD_REQUEST),
            IntroDbOutcome::NoData
        );
        assert_eq!(
            classify_status(StatusCode::TOO_MANY_REQUESTS),
            IntroDbOutcome::Failed
        );
        assert_eq!(
            classify_status(StatusCode::REQUEST_TIMEOUT),
            IntroDbOutcome::Failed
        );
        assert_eq!(
            classify_status(StatusCode::INTERNAL_SERVER_ERROR),
            IntroDbOutcome::Failed
        );
        assert_eq!(
            classify_status(StatusCode::BAD_GATEWAY),
            IntroDbOutcome::Failed
        );
    }

    #[test]
    fn accepts_seven_and_eight_digit_imdb_ids() {
        assert!(is_valid_imdb_id("tt0944947"));
        assert!(is_valid_imdb_id("tt12345678"));
        assert!(is_valid_imdb_id("tt1234567"));
    }

    #[test]
    fn rejects_malformed_ids() {
        assert!(!is_valid_imdb_id(""));
        assert!(!is_valid_imdb_id("tt123"));
        assert!(!is_valid_imdb_id("tt123456789"));
        assert!(!is_valid_imdb_id("nm0944947"));
        assert!(!is_valid_imdb_id("tt09a4947"));
    }
}
