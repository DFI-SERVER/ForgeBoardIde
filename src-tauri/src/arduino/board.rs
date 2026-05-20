use super::cli;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A board offered by an installed platform.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Board {
    pub fqbn: String,
    pub name: String,
    pub platform: String,
}

/// A board / port detected on the machine right now.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DetectedBoard {
    pub port: String,
    pub fqbn: Option<String>,
    pub name: Option<String>,
}

/// List boards from installed platforms (`arduino-cli board listall`).
/// Parsed defensively — arduino-cli's JSON shape varies between versions.
pub async fn list_installed_boards(app: &tauri::AppHandle) -> Result<Vec<Board>, String> {
    let out = cli::run_capture(app, &["board", "listall", "--format", "json"]).await?;
    let v: Value = serde_json::from_str(&out).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    if let Some(boards) = v.get("boards").and_then(Value::as_array) {
        for b in boards {
            let fqbn = b.get("fqbn").and_then(Value::as_str).unwrap_or("").to_string();
            if fqbn.is_empty() {
                continue;
            }
            let name = b.get("name").and_then(Value::as_str).unwrap_or("").to_string();
            let platform = b
                .pointer("/platform/id")
                .or_else(|| b.pointer("/platform/metadata/id"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            result.push(Board { fqbn, name, platform });
        }
    }
    Ok(result)
}

/// Detect boards / ports connected right now (`arduino-cli board list`).
pub async fn detect_boards(app: &tauri::AppHandle) -> Result<Vec<DetectedBoard>, String> {
    let out = cli::run_capture(app, &["board", "list", "--format", "json"]).await?;
    let v: Value = serde_json::from_str(&out).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    if let Some(ports) = v.get("detected_ports").and_then(Value::as_array) {
        for p in ports {
            let port = p
                .pointer("/port/address")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if port.is_empty() {
                continue;
            }
            let fqbn = p
                .pointer("/matching_boards/0/fqbn")
                .and_then(Value::as_str)
                .map(String::from);
            let name = p
                .pointer("/matching_boards/0/name")
                .and_then(Value::as_str)
                .map(String::from);
            result.push(DetectedBoard { port, fqbn, name });
        }
    }
    Ok(result)
}
