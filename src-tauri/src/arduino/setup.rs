//! First-launch setup for arduino-cli.
//!
//! arduino-cli keeps its package index and its "builtin" helper tools
//! (serial-discovery, serial-monitor, …) in its data directory and downloads
//! them lazily the first time a command needs them. Two things go wrong with
//! leaving that to chance:
//!
//! 1. The serial-discovery tool is what lists ports. Until it exists every
//!    `board list` returns nothing, so a fresh install with no internet looks
//!    exactly like "no board plugged in".
//! 2. ForgeBoard runs several arduino-cli commands at startup. On an empty
//!    data directory they all try to download the same files at once and the
//!    first board scan comes back empty (reproduced 2026-10-08 on macOS).
//!
//! So the app calls [`prepare`] once, alone, before anything else, and shows
//! what it is doing.

use super::cli;
use std::path::Path;

pub(crate) fn discovery_tool_dir(data_dir: &Path) -> std::path::PathBuf {
    data_dir
        .join("packages")
        .join("builtin")
        .join("tools")
        .join("serial-discovery")
}

/// Make sure the package index and the serial-discovery tool are present,
/// downloading them if not. Returns `Ok(true)` when it had to download,
/// `Ok(false)` when everything was already there. The error message follows
/// the `serial-discovery tool missing: …` wording the frontend recognises.
pub async fn prepare(app: &tauri::AppHandle) -> Result<bool, String> {
    let data_dir = cli::data_dir(app).await?;
    if discovery_tool_dir(&data_dir).is_dir() {
        return Ok(false);
    }

    // `core update-index` fetches the package index; the following
    // `board list` makes arduino-cli install its builtin discovery tools
    // (it only does so once an index is present). Both are run to
    // completion, one after the other, so nothing races.
    let index = cli::run_capture(app, &["core", "update-index"]).await;
    let _ = cli::run_capture(app, &["board", "list", "--format", "json"]).await;

    if discovery_tool_dir(&data_dir).is_dir() {
        return Ok(true);
    }
    Err(match index {
        Err(e) if e.contains("dial tcp") || e.contains("no such host") || e.contains("Download failed") => {
            "serial-discovery tool missing: arduino-cli could not download it (no internet connection)".to_string()
        }
        Err(e) => format!("serial-discovery tool missing: {}", e.trim()),
        Ok(_) => "serial-discovery tool missing: arduino-cli could not download it (no internet connection)".to_string(),
    })
}
