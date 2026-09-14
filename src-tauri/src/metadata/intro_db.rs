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

/// Fetch intro/recap/outro timestamps for one episode. Returns `null` for
/// invalid input, a non-2xx response (typically "no data for this episode"),
/// or any transport failure — the frontend treats a cache miss and a fetch
/// failure identically, so there is nothing a caller could do differently
/// with a distinct error here.
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
    let response = match client
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => return Ok(serde_json::Value::Null),
    };

    if !response.status().is_success() {
        return Ok(serde_json::Value::Null);
    }

    Ok(response
        .json::<serde_json::Value>()
        .await
        .unwrap_or(serde_json::Value::Null))
}

#[cfg(test)]
mod tests {
    use super::is_valid_imdb_id;

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
