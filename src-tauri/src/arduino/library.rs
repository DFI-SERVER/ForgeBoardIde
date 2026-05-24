use super::cli;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// An arduino-cli library — a registry entry or an installed library.
///
/// `arduino-cli` reports library metadata under two different shapes:
///   * `lib search`  nests metadata under each entry's `latest` object, with
///     the entry name at the top level.
///   * `lib list`    wraps each item as `{ "library": { ..flat metadata.. } }`.
///
/// Both are normalised into this one struct. `installed_version` is set only
/// for installed libraries; `latest_version` is set only when the registry
/// (search) or `lib list --updatable` reports a newer release exists.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Library {
    pub name: String,
    pub author: Option<String>,
    /// One-line description (arduino-cli `sentence`).
    pub sentence: Option<String>,
    /// Longer description (arduino-cli `paragraph`).
    pub paragraph: Option<String>,
    pub website: Option<String>,
    pub category: Option<String>,
    /// Version currently installed locally — `None` for registry-only results.
    pub installed_version: Option<String>,
    /// Newest version available — set from the registry, or from the
    /// `release` sibling of a `lib list --updatable` entry.
    pub latest_version: Option<String>,
    /// True when a newer version than `installed_version` is available.
    pub update_available: bool,
}

/// Pull the common metadata fields out of an arduino-cli metadata object
/// (the `latest` object from search, or the inner `library` object from list).
fn metadata(v: &Value) -> (Option<String>, Option<String>, Option<String>, Option<String>, Option<String>) {
    let s = |k: &str| v.get(k).and_then(Value::as_str).map(String::from);
    (s("author"), s("sentence"), s("paragraph"), s("website"), s("category"))
}

/// Parse one `lib search` entry: `{ name, latest: { ..metadata.. }, .. }`.
fn parse_search_entry(v: &Value) -> Option<Library> {
    let name = v.get("name").and_then(Value::as_str)?.to_string();
    if name.is_empty() {
        return None;
    }
    let latest = v.get("latest").unwrap_or(v);
    let (author, sentence, paragraph, website, category) = metadata(latest);
    let latest_version = latest.get("version").and_then(Value::as_str).map(String::from);
    Some(Library {
        name,
        author,
        sentence,
        paragraph,
        website,
        category,
        installed_version: None,
        latest_version,
        update_available: false,
    })
}

/// Parse one `lib list` item: `{ library: { ..flat metadata + version.. }, release?: { version } }`.
/// `release` is only present with `--updatable` and carries the newer version.
fn parse_installed_item(v: &Value) -> Option<Library> {
    let lib = v.get("library")?;
    let name = lib.get("name").and_then(Value::as_str)?.to_string();
    if name.is_empty() {
        return None;
    }
    let (author, sentence, paragraph, website, category) = metadata(lib);
    let installed_version = lib.get("version").and_then(Value::as_str).map(String::from);
    let latest_version = v
        .get("release")
        .and_then(|r| r.get("version"))
        .and_then(Value::as_str)
        .map(String::from);
    let update_available = match (&installed_version, &latest_version) {
        (Some(i), Some(l)) => i != l,
        _ => false,
    };
    Some(Library {
        name,
        author,
        sentence,
        paragraph,
        website,
        category,
        installed_version,
        latest_version,
        update_available,
    })
}

/// Parse the `{ "libraries": [ ... ] }` payload of a `lib search` run into
/// `Library` values. When `cap` is `Some(n)` only the first `n` entries are
/// kept; `None` keeps every entry (used for the full-registry listing).
fn parse_search_payload(out: &str, cap: Option<usize>) -> Result<Vec<Library>, String> {
    let v: Value = serde_json::from_str(out).map_err(|e| e.to_string())?;
    let mut libs = Vec::new();
    if let Some(arr) = v.get("libraries").and_then(Value::as_array) {
        let take = cap.unwrap_or(arr.len());
        for entry in arr.iter().take(take) {
            if let Some(lib) = parse_search_entry(entry) {
                libs.push(lib);
            }
        }
    }
    Ok(libs)
}

/// Search the Arduino library registry (`arduino-cli lib search`).
/// Results are capped so a broad query cannot flood the UI.
pub async fn search(app: &tauri::AppHandle, query: &str) -> Result<Vec<Library>, String> {
    let out = cli::run_capture(app, &["lib", "search", query, "--format", "json"]).await?;
    parse_search_payload(&out, Some(80))
}

/// Fetch the **entire** Arduino library registry — `arduino-cli lib search`
/// with no query term returns the whole index (~9000+ entries). Unlike
/// [`search`] there is no result cap: the frontend caches this once and does
/// all subsequent filtering in memory, so the full set is needed up front.
pub async fn list_all(app: &tauri::AppHandle) -> Result<Vec<Library>, String> {
    let out = cli::run_capture(app, &["lib", "search", "--format", "json"]).await?;
    parse_search_payload(&out, None)
}

/// Libraries installed locally (`arduino-cli lib list`).
///
/// Runs `lib list` for the full set, then `lib list --updatable` (which
/// returns only libraries with a newer release) and merges the newer
/// version + update flag back onto the matching entries.
pub async fn list_installed(app: &tauri::AppHandle) -> Result<Vec<Library>, String> {
    let out = cli::run_capture(app, &["lib", "list", "--format", "json"]).await?;
    let v: Value = serde_json::from_str(&out).map_err(|e| e.to_string())?;
    let mut libs: Vec<Library> = Vec::new();
    if let Some(arr) = v.get("installed_libraries").and_then(Value::as_array) {
        for item in arr {
            if let Some(lib) = parse_installed_item(item) {
                libs.push(lib);
            }
        }
    }

    // Merge in updatable info. A failure here (e.g. offline) is non-fatal:
    // the installed list is still useful without update badges.
    if let Ok(upd_out) = cli::run_capture(app, &["lib", "list", "--updatable", "--format", "json"]).await {
        if let Ok(uv) = serde_json::from_str::<Value>(&upd_out) {
            let mut latest: HashMap<String, String> = HashMap::new();
            if let Some(arr) = uv.get("installed_libraries").and_then(Value::as_array) {
                for item in arr {
                    if let Some(parsed) = parse_installed_item(item) {
                        if let Some(lv) = parsed.latest_version {
                            latest.insert(parsed.name, lv);
                        }
                    }
                }
            }
            for lib in &mut libs {
                if let Some(lv) = latest.get(&lib.name) {
                    let differs = lib.installed_version.as_deref() != Some(lv.as_str());
                    lib.latest_version = Some(lv.clone());
                    lib.update_available = differs;
                }
            }
        }
    }

    Ok(libs)
}

/// Install (or upgrade, when `name` carries an `@version`) a registry library,
/// streaming progress to the `lib-install-output` event. Returns the exit code.
pub async fn install(app: &tauri::AppHandle, name: &str) -> Result<i32, String> {
    let (code, _stderr) = cli::run_streaming(
        app,
        "lib-install-output",
        &["lib", "install", name, "--no-color"],
    )
    .await?;
    Ok(code)
}

/// Uninstall an installed library by name, streaming progress to the
/// `lib-install-output` event. Returns the exit code.
pub async fn uninstall(app: &tauri::AppHandle, name: &str) -> Result<i32, String> {
    let (code, _stderr) = cli::run_streaming(
        app,
        "lib-install-output",
        &["lib", "uninstall", name, "--no-color"],
    )
    .await?;
    Ok(code)
}

/// Install a library from a local `.zip` archive (`lib install --zip-path`),
/// streaming progress to the `lib-install-output` event. Returns the exit code.
pub async fn install_zip(app: &tauri::AppHandle, zip_path: &str) -> Result<i32, String> {
    let (code, _stderr) = cli::run_streaming(
        app,
        "lib-install-output",
        &["lib", "install", "--zip-path", zip_path, "--no-color"],
    )
    .await?;
    Ok(code)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A trimmed-down `lib search` payload: two entries shaped like the real
    /// arduino-cli output (top-level `name`, metadata nested under `latest`).
    const SEARCH_JSON: &str = r#"{
        "libraries": [
            {
                "name": "Adafruit NeoPixel",
                "latest": {
                    "author": "Adafruit",
                    "version": "1.12.0",
                    "sentence": "Arduino library for controlling NeoPixels.",
                    "paragraph": "RGB and RGBW addressable LEDs.",
                    "website": "https://github.com/adafruit/Adafruit_NeoPixel",
                    "category": "Display"
                }
            },
            {
                "name": "Servo",
                "latest": { "author": "Arduino", "version": "1.2.1", "sentence": "Control servo motors." }
            }
        ]
    }"#;

    #[test]
    fn parses_a_search_payload_with_no_cap() {
        let libs = parse_search_payload(SEARCH_JSON, None).unwrap();
        assert_eq!(libs.len(), 2);
        assert_eq!(libs[0].name, "Adafruit NeoPixel");
        assert_eq!(libs[0].author.as_deref(), Some("Adafruit"));
        assert_eq!(libs[0].latest_version.as_deref(), Some("1.12.0"));
        assert_eq!(
            libs[0].sentence.as_deref(),
            Some("Arduino library for controlling NeoPixels.")
        );
        // Registry-only entries are never marked installed.
        assert!(libs[0].installed_version.is_none());
        assert!(!libs[0].update_available);
        assert_eq!(libs[1].name, "Servo");
    }

    #[test]
    fn cap_limits_the_number_of_entries_kept() {
        let libs = parse_search_payload(SEARCH_JSON, Some(1)).unwrap();
        assert_eq!(libs.len(), 1);
        assert_eq!(libs[0].name, "Adafruit NeoPixel");
    }

    #[test]
    fn cap_larger_than_the_payload_keeps_everything() {
        let libs = parse_search_payload(SEARCH_JSON, Some(999)).unwrap();
        assert_eq!(libs.len(), 2);
    }

    #[test]
    fn missing_libraries_array_yields_an_empty_list() {
        assert!(parse_search_payload("{}", None).unwrap().is_empty());
    }

    #[test]
    fn entries_without_a_name_are_skipped() {
        let json = r#"{ "libraries": [ { "latest": {} }, { "name": "" }, { "name": "Keep" } ] }"#;
        let libs = parse_search_payload(json, None).unwrap();
        assert_eq!(libs.len(), 1);
        assert_eq!(libs[0].name, "Keep");
    }

    #[test]
    fn invalid_json_is_an_error() {
        assert!(parse_search_payload("not json", None).is_err());
    }
}
