use super::cli;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Ordering;

/// An arduino-cli platform / core (e.g. `esp32:esp32`).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Core {
    pub id: String,
    pub name: String,
    /// The version of interest: installed version for `core list`, latest
    /// for `core search`. Kept for backwards compatibility with the UI.
    pub version: Option<String>,
    pub maintainer: Option<String>,
    pub installed: bool,
    /// Version installed locally, if any.
    pub installed_version: Option<String>,
    /// Newest version the index knows about.
    pub latest_version: Option<String>,
    /// Every version the index offers, newest first — drives the version
    /// picker (install an older release, e.g. esp32 3.0.7 for esptool 4).
    pub versions: Vec<String>,
    /// Vendor page from the index, for "More info".
    pub website: Option<String>,
    /// True when `latest_version` is newer than `installed_version`.
    pub update_available: bool,
}

/// Compare dotted versions numerically segment by segment, so `3.3.12` sorts
/// after `3.3.9`; non-numeric tails fall back to string order. Good enough
/// for platform versions, which are plain `x.y.z` in practice.
pub fn cmp_versions(a: &str, b: &str) -> Ordering {
    let seg = |s: &str| -> Vec<(u64, String)> {
        s.split(|c| c == '.' || c == '-' || c == '+')
            .map(|p| (p.parse::<u64>().unwrap_or(u64::MAX), p.to_string()))
            .collect()
    };
    let (sa, sb) = (seg(a), seg(b));
    for i in 0..sa.len().max(sb.len()) {
        match (sa.get(i), sb.get(i)) {
            (Some(x), Some(y)) => {
                let o = if x.0 != u64::MAX && y.0 != u64::MAX { x.0.cmp(&y.0) } else { x.1.cmp(&y.1) };
                if o != Ordering::Equal {
                    return o;
                }
            }
            (Some(_), None) => return Ordering::Greater,
            (None, Some(_)) => return Ordering::Less,
            (None, None) => break,
        }
    }
    Ordering::Equal
}

/// Extract a `Core` from one `platforms[]` entry. `version_key` is the platform
/// field holding the version of interest (`installed_version` / `latest_version`).
/// arduino-cli keys `releases` by version string, so the display name lives at
/// `releases.<version>.name` — fall back to the id when that is missing.
fn parse_core(p: &Value, version_key: &str) -> Option<Core> {
    let id = p.get("id").and_then(Value::as_str)?.to_string();
    if id.is_empty() {
        return None;
    }
    let s = |k: &str| p.get(k).and_then(Value::as_str).map(String::from);
    let version = s(version_key);
    let installed_version = s("installed_version");
    let latest_version = s("latest_version");
    let maintainer = s("maintainer");
    let website = s("website");
    let mut versions: Vec<String> = p
        .get("releases")
        .and_then(Value::as_object)
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default();
    versions.sort_by(|a, b| cmp_versions(b, a));
    let name_for = |v: &str| {
        p.pointer(&format!("/releases/{v}/name"))
            .and_then(Value::as_str)
            .map(String::from)
    };
    let name = version
        .as_deref()
        .and_then(name_for)
        .or_else(|| versions.first().and_then(|v| name_for(v)))
        .unwrap_or_else(|| id.clone());
    let installed = installed_version.is_some();
    let update_available = match (&installed_version, &latest_version) {
        (Some(i), Some(l)) => cmp_versions(l, i) == Ordering::Greater,
        _ => false,
    };
    Some(Core {
        id,
        name,
        version,
        maintainer,
        installed,
        installed_version,
        latest_version,
        versions,
        website,
        update_available,
    })
}

fn parse_platforms(out: &str, version_key: &str) -> Result<Vec<Core>, String> {
    let v: Value = serde_json::from_str(out).map_err(|e| e.to_string())?;
    let mut cores = Vec::new();
    if let Some(arr) = v.get("platforms").and_then(Value::as_array) {
        for p in arr {
            if let Some(c) = parse_core(p, version_key) {
                cores.push(c);
            }
        }
    }
    Ok(cores)
}

/// `--additional-urls a,b,c` for the vendor board-manager indexes the user
/// configured (plus the curated one for the core being acted on). Passed
/// per invocation, never persisted into the shared arduino-cli.yaml that
/// Arduino IDE also reads.
fn urls_arg(urls: &[String]) -> Option<String> {
    let joined: Vec<&str> = urls.iter().map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    if joined.is_empty() {
        None
    } else {
        Some(joined.join(","))
    }
}

/// Cores installed locally (`arduino-cli core list`), with `update_available`
/// set from the index's `latest_version`. Vendor cores (esp32, stm32…) only
/// get a `latest_version` when their index is loaded, hence `urls`.
pub async fn list_installed(app: &tauri::AppHandle, urls: &[String]) -> Result<Vec<Core>, String> {
    let mut args: Vec<String> = vec!["core".into(), "list".into(), "--format".into(), "json".into()];
    if let Some(u) = urls_arg(urls) {
        args.push("--additional-urls".into());
        args.push(u);
    }
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let out = cli::run_capture(app, &refs).await?;
    parse_platforms(&out, "installed_version")
}

/// Cores matching a query in the index (`arduino-cli core search`). An empty
/// query lists the whole index. `urls` are extra board-manager indexes.
pub async fn search(app: &tauri::AppHandle, query: &str, urls: &[String]) -> Result<Vec<Core>, String> {
    let mut args: Vec<String> = vec!["core".into(), "search".into()];
    if !query.trim().is_empty() {
        args.push(query.trim().to_string());
    }
    args.push("--format".into());
    args.push("json".into());
    if let Some(u) = urls_arg(urls) {
        args.push("--additional-urls".into());
        args.push(u);
    }
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let out = cli::run_capture(app, &refs).await?;
    parse_platforms(&out, "latest_version")
}

/// Install (or change the version of) a core, streaming progress to the
/// `core-install-output` event. `core_id` may carry a version
/// (`esp32:esp32@3.0.7`); without one the latest is installed, which also
/// upgrades an older installation in place. Returns the arduino-cli exit code.
pub async fn install(
    app: &tauri::AppHandle,
    target: &str,
    core_id: &str,
    urls: &[String],
) -> Result<i32, String> {
    let mut args: Vec<String> = vec!["core".into(), "install".into(), core_id.into(), "--no-color".into()];
    if let Some(u) = urls_arg(urls) {
        // Vendors outside Arduino's default package index (ESP32, STM32,
        // RP2040, Teensy, Seeed…) need their board-manager URL on BOTH
        // commands: update-index fetches the vendor index so install can
        // resolve the platform, and install needs it again to trust that
        // index. Without this, installing any non-default core fails with
        // "platform not found".
        let _ = cli::run_streaming(
            app,
            target,
            "core-install-output",
            &["core", "update-index", "--additional-urls", &u, "--no-color"],
        )
        .await?;
        args.push("--additional-urls".into());
        args.push(u);
    }
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    // A core such as esp32 is ~1.3 GB in a handful of very large archives.
    // arduino-cli does not resume a file whose connection dropped — it fails
    // the whole install — but it keeps every archive that completed in its
    // staging dir, so simply running the install again picks up where it
    // left off. Do that automatically a few times before giving up, so a
    // flaky connection costs a minute, not the user's patience.
    const MAX_ATTEMPTS: usize = 4;
    let mut code = -1;
    for attempt in 1..=MAX_ATTEMPTS {
        let (c, stderr) = cli::run_streaming(app, target, "core-install-output", &refs).await?;
        code = c;
        if code == 0 {
            break;
        }
        for line in stderr.lines() {
            if line.is_empty() {
                continue;
            }
            cli::emit_line_to(app, target, "core-install-output", line.to_string());
        }
        if attempt < MAX_ATTEMPTS && looks_like_download_failure(&stderr) {
            cli::emit_line_to(
                app,
                target,
                "core-install-output",
                format!(
                    "Download interrupted — retrying ({}/{}). Finished packages are kept.",
                    attempt + 1,
                    MAX_ATTEMPTS
                ),
            );
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            continue;
        }
        break;
    }
    Ok(code)
}

/// Remove an installed core and the tools only it used
/// (`arduino-cli core uninstall`). Streams to `core-install-output`.
pub async fn uninstall(app: &tauri::AppHandle, target: &str, core_id: &str) -> Result<i32, String> {
    let (code, stderr) = cli::run_streaming(
        app,
        target,
        "core-install-output",
        &["core", "uninstall", core_id, "--no-color"],
    )
    .await?;
    if code != 0 {
        for line in stderr.lines().filter(|l| !l.is_empty()) {
            cli::emit_line_to(app, target, "core-install-output", line.to_string());
        }
    }
    Ok(code)
}

/// Whether an install failure is the kind a retry can fix: the network gave
/// out mid-transfer. Anything else (platform not found, disk full, bad
/// archive) fails the same way again and is not retried.
fn looks_like_download_failure(stderr: &str) -> bool {
    let s = stderr.to_ascii_lowercase();
    if s.contains("no space left") || s.contains("not found") {
        return false;
    }
    [
        "download failed",
        "unexpected eof",
        "connection reset",
        "timeout",
        "timed out",
        "deadline exceeded",
        "tls handshake",
        "dial tcp",
        "no such host",
        "broken pipe",
        "stream error",
        "i/o error",
    ]
    .iter()
    .any(|needle| s.contains(needle))
}

/// Refresh the package index (`arduino-cli core update-index`), including
/// the user's extra board-manager indexes.
pub async fn update_index(app: &tauri::AppHandle, urls: &[String]) -> Result<(), String> {
    let mut args: Vec<String> = vec!["core".into(), "update-index".into()];
    if let Some(u) = urls_arg(urls) {
        args.push("--additional-urls".into());
        args.push(u);
    }
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    cli::run_capture(app, &refs).await.map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_compare_numerically() {
        assert_eq!(cmp_versions("3.3.12", "3.3.9"), Ordering::Greater);
        assert_eq!(cmp_versions("3.0.7", "3.3.12"), Ordering::Less);
        assert_eq!(cmp_versions("1.0.0", "1.0.0"), Ordering::Equal);
        assert_eq!(cmp_versions("1.0.0", "1.0"), Ordering::Greater);
    }

    #[test]
    fn core_search_entry_yields_sorted_versions_and_update_flag() {
        // Shape of `core search --format json` (arduino-cli 1.4.1).
        let json = r#"{ "platforms": [ {
            "id": "esp32:esp32", "maintainer": "Espressif Systems",
            "website": "https://github.com/espressif/arduino-esp32", "indexed": true,
            "installed_version": "3.3.11", "latest_version": "3.3.12",
            "releases": {
                "3.3.9": { "name": "esp32", "version": "3.3.9" },
                "3.3.12": { "name": "esp32", "version": "3.3.12" },
                "3.0.7": { "name": "esp32", "version": "3.0.7" }
            } } ] }"#;
        let cores = parse_platforms(json, "latest_version").unwrap();
        assert_eq!(cores.len(), 1);
        let c = &cores[0];
        assert_eq!(c.versions, vec!["3.3.12", "3.3.9", "3.0.7"]);
        assert_eq!(c.installed_version.as_deref(), Some("3.3.11"));
        assert_eq!(c.latest_version.as_deref(), Some("3.3.12"));
        assert!(c.installed);
        assert!(c.update_available);
        assert_eq!(c.website.as_deref(), Some("https://github.com/espressif/arduino-esp32"));
        assert_eq!(c.name, "esp32");
    }

    #[test]
    fn up_to_date_core_has_no_update() {
        let json = r#"{ "platforms": [ { "id": "arduino:avr", "installed_version": "1.8.6",
            "latest_version": "1.8.6", "releases": { "1.8.6": { "name": "Arduino AVR Boards" } } } ] }"#;
        let c = &parse_platforms(json, "installed_version").unwrap()[0];
        assert!(!c.update_available);
        assert_eq!(c.name, "Arduino AVR Boards");
    }

    #[test]
    fn urls_are_joined_and_blank_entries_dropped() {
        assert_eq!(urls_arg(&[]), None);
        assert_eq!(urls_arg(&[" ".into()]), None);
        assert_eq!(
            urls_arg(&["https://a/x.json".into(), "".into(), " https://b/y.json ".into()]).as_deref(),
            Some("https://a/x.json,https://b/y.json")
        );
    }

    #[test]
    fn network_drops_are_retried() {
        assert!(looks_like_download_failure(
            "Error downloading esp32:esp-rv32@2601: Download failed: unexpected EOF"
        ));
        assert!(looks_like_download_failure("read tcp: connection reset by peer"));
        // arduino-cli's own wording when network.connection_timeout trips.
        assert!(looks_like_download_failure(
            "Error downloading esp32:esp-x32@2601: Get \"https://github.com/...\": context deadline exceeded"
        ));
        assert!(looks_like_download_failure("Get \"https://github.com/...\": dial tcp: i/o timeout"));
    }

    #[test]
    fn permanent_failures_are_not_retried() {
        assert!(!looks_like_download_failure("Error: Platform 'esp99:esp99' not found"));
        assert!(!looks_like_download_failure("write /tmp/x: no space left on device"));
        assert!(!looks_like_download_failure("Error: invalid archive"));
    }
}
