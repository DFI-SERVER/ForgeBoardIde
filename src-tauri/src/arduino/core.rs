use super::cli;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// An arduino-cli platform / core (e.g. `esp32:esp32`).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Core {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub maintainer: Option<String>,
    pub installed: bool,
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
    let version = p.get(version_key).and_then(Value::as_str).map(String::from);
    let maintainer = p.get("maintainer").and_then(Value::as_str).map(String::from);
    let name = version
        .as_deref()
        .and_then(|v| p.pointer(&format!("/releases/{v}/name")))
        .and_then(Value::as_str)
        .map(String::from)
        .unwrap_or_else(|| id.clone());
    let installed = p.get("installed_version").and_then(Value::as_str).is_some();
    Some(Core { id, name, version, maintainer, installed })
}

/// Cores installed locally (`arduino-cli core list`).
pub async fn list_installed(app: &tauri::AppHandle) -> Result<Vec<Core>, String> {
    let out = cli::run_capture(app, &["core", "list", "--format", "json"]).await?;
    let v: Value = serde_json::from_str(&out).map_err(|e| e.to_string())?;
    let mut cores = Vec::new();
    if let Some(arr) = v.get("platforms").and_then(Value::as_array) {
        for p in arr {
            if let Some(c) = parse_core(p, "installed_version") {
                cores.push(c);
            }
        }
    }
    Ok(cores)
}

/// Cores matching a query in the index (`arduino-cli core search`).
pub async fn search(app: &tauri::AppHandle, query: &str) -> Result<Vec<Core>, String> {
    let out = cli::run_capture(app, &["core", "search", query, "--format", "json"]).await?;
    let v: Value = serde_json::from_str(&out).map_err(|e| e.to_string())?;
    let mut cores = Vec::new();
    if let Some(arr) = v.get("platforms").and_then(Value::as_array) {
        for p in arr {
            if let Some(c) = parse_core(p, "latest_version") {
                cores.push(c);
            }
        }
    }
    Ok(cores)
}

/// Install a core on demand, streaming progress to the `core-install-output` event.
/// Returns the arduino-cli exit code.
pub async fn install(app: &tauri::AppHandle, core_id: &str) -> Result<i32, String> {
    let (code, _stderr) = cli::run_streaming(
        app,
        "core-install-output",
        &["core", "install", core_id, "--no-color"],
    )
    .await?;
    Ok(code)
}

/// Refresh the package index (`arduino-cli core update-index`).
pub async fn update_index(app: &tauri::AppHandle) -> Result<(), String> {
    cli::run_capture(app, &["core", "update-index"]).await.map(|_| ())
}
