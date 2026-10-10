use super::cli;
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::process::Command;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// The board identified on a serial port.
#[derive(Serialize)]
pub struct BoardId {
    pub fqbn: String,
    pub name: String,
    pub source: String, // "usb" or "chip-probe"
}

/// Map an esptool chip name to an arduino-cli FQBN + a friendly board name.
fn chip_to_board(chip: &str) -> Option<(&'static str, &'static str)> {
    let m = match chip {
        "ESP32" => ("esp32:esp32:esp32", "ESP32 Dev Module"),
        "ESP32-S2" => ("esp32:esp32:esp32s2", "ESP32-S2 Dev Module"),
        "ESP32-S3" => ("esp32:esp32:esp32s3", "ESP32-S3 Dev Module"),
        "ESP32-C2" => ("esp32:esp32:esp32c2", "ESP32-C2 Dev Module"),
        "ESP32-C3" => ("esp32:esp32:esp32c3", "ESP32-C3 Dev Module"),
        "ESP32-C6" => ("esp32:esp32:esp32c6", "ESP32-C6 Dev Module"),
        "ESP32-H2" => ("esp32:esp32:esp32h2", "ESP32-H2 Dev Module"),
        "ESP32-P4" => ("esp32:esp32:esp32p4", "ESP32-P4 Dev Module"),
        _ => return None,
    };
    Some(m)
}

/// Locate the esptool binary inside the installed ESP32 core, under the
/// arduino-cli data directory (see `cli::data_dir` — `Arduino15` on Windows
/// and macOS, `.arduino15` on Linux). The tool is `esptool.exe` on Windows
/// and a bare `esptool` elsewhere.
fn find_esptool(data_dir: &Path) -> Option<PathBuf> {
    let base = data_dir
        .join("packages")
        .join("esp32")
        .join("tools")
        .join("esptool_py");
    let name = if cfg!(windows) { "esptool.exe" } else { "esptool" };
    for entry in std::fs::read_dir(&base).ok()?.flatten() {
        let exe = entry.path().join(name);
        if exe.is_file() {
            return Some(exe);
        }
    }
    None
}

/// Probe the chip on `port` with esptool — exact for any ESP32-family chip.
///
/// Argument names are the underscored form (`flash_id`, `usb_reset`) used by
/// esptool 4.x — which is what arduino-esp32 3.0.7 (our supported platform)
/// ships. esptool 5.x switched to the hyphenated form (`flash-id`,
/// `usb-reset`); a 5.x build of esptool would reject the names below. We
/// pin to 3.0.7 because the 3.3.x + esptool-5 combo has an unfixed
/// native-USB upload bug; if that ever flips, this needs to flip too.
///
/// `--before usb_reset` is required to drive an ESP32-S2/S3/C3/C6/H2 with
/// native USB-CDC into download mode. The default `default_reset` toggles
/// DTR/RTS, which only works on chips with an external UART bridge — on a
/// native-USB chip it does nothing and the probe immediately fails with
/// "Failed to connect", leaving the IDE unable to identify the board.
async fn probe_chip(esptool: &PathBuf, port: &str) -> Option<BoardId> {
    let mut cmd = Command::new(esptool);
    cmd.args([
        "--before", "usb_reset",
        "--after", "hard_reset",
        "--port", port,
        "flash_id",
    ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    // Cap the probe — a chip running custom firmware that ignores the
    // USB-CDC reset request will otherwise let esptool retry forever and
    // freeze the connection watcher (which serialises ticks on `ticking`).
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(8),
        cmd.output(),
    )
    .await
    .ok()?
    .ok()?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    // esptool prints e.g. "Detecting chip type... ESP32-S3"
    const MARKER: &str = "Detecting chip type...";
    for line in text.lines() {
        if let Some(idx) = line.find(MARKER) {
            let chip = line[idx + MARKER.len()..]
                .split_whitespace()
                .next()
                .unwrap_or("");
            if let Some((fqbn, name)) = chip_to_board(chip) {
                return Some(BoardId {
                    fqbn: fqbn.to_string(),
                    name: name.to_string(),
                    source: "chip-probe".to_string(),
                });
            }
        }
    }
    None
}

/// Identify the board on `port`: first via arduino-cli's USB-descriptor match
/// (genuine Arduinos and similar), then by probing the silicon with esptool
/// (exact for every ESP32 variant).
pub async fn identify(app: &tauri::AppHandle, port: &str) -> Result<BoardId, String> {
    if let Ok(out) = cli::run_capture(app, &["board", "list", "--format", "json"]).await {
        if let Ok(v) = serde_json::from_str::<Value>(&out) {
            if let Some(ports) = v.get("detected_ports").and_then(Value::as_array) {
                for p in ports {
                    let addr = p
                        .pointer("/port/address")
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    if addr != port {
                        continue;
                    }
                    let fqbn = p.pointer("/matching_boards/0/fqbn").and_then(Value::as_str);
                    let name = p.pointer("/matching_boards/0/name").and_then(Value::as_str);
                    if let (Some(fqbn), Some(name)) = (fqbn, name) {
                        // Skip the generic "ESP32 Family Device" catch-all —
                        // the esptool probe below gives the exact chip.
                        if fqbn != "esp32:esp32:esp32_family" {
                            return Ok(BoardId {
                                fqbn: fqbn.to_string(),
                                name: name.to_string(),
                                source: "usb".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    if let Ok(data_dir) = cli::data_dir(app).await {
        if let Some(esptool) = find_esptool(&data_dir) {
            if let Some(id) = probe_chip(&esptool, port).await {
                return Ok(id);
            }
        }
    }

    Err(format!(
        "Couldn't identify the board on {port} — select it manually."
    ))
}
