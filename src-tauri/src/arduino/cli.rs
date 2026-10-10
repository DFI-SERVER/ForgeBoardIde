use std::collections::VecDeque;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::{Emitter, EventTarget};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Cap on the retained stderr of one arduino-cli run. A verbose ESP32 build
/// can emit hundreds of thousands of lines; keep the head (config/banner
/// context) and the tail (gcc diagnostics + the size summary, which the
/// frontend parses) and drop the middle.
const STDERR_HEAD_LINES: usize = 2_000;
const STDERR_TAIL_LINES: usize = 8_000;

/// arduino-cli cancels any download that runs longer than
/// `network.connection_timeout` — default **60 s** — with "context deadline
/// exceeded". The esp32 core has single archives over 500 MB, so on anything
/// slower than ~10 MB/s the install fails every time, after a long wait.
/// This is the exact failure Arduino IDE users work around by editing
/// arduino-cli.yaml; we set it on every invocation instead (environment
/// variables override the config file, and we never touch the shared yaml
/// that Arduino IDE also reads). One hour covers a 560 MB file at 160 KB/s;
/// the install retry in `core::install` handles anything worse.
const NETWORK_TIMEOUT_ENV: &str = "ARDUINO_NETWORK_CONNECTION_TIMEOUT";
const NETWORK_TIMEOUT: &str = "3600s";

/// Resolve the bundled arduino-cli binary. It is a Tauri external binary
/// (sidecar): `tauri.conf.json` lists `binaries/arduino-cli`, and the build
/// expects `binaries/arduino-cli-<target-triple>[.exe]` for the platform it
/// is producing — `scripts/download-arduino-cli.mjs` fetches that file. The
/// bundler then places the sidecar next to the app executable, without the
/// triple suffix, on Windows, macOS (`Contents/MacOS/`) and Linux alike.
fn arduino_cli_path(_app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let exe_suffix = if cfg!(windows) { ".exe" } else { "" };
    if cfg!(debug_assertions) {
        let triple = tauri::utils::platform::target_triple().map_err(|e| e.to_string())?;
        Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!("arduino-cli-{triple}{exe_suffix}")))
    } else {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let dir = exe
            .parent()
            .ok_or_else(|| "app executable has no parent directory".to_string())?;
        Ok(dir.join(format!("arduino-cli{exe_suffix}")))
    }
}

/// The arduino-cli data directory (`directories.data`): `Arduino15` under
/// `%LOCALAPPDATA%` on Windows, `~/Library/Arduino15` on macOS, `~/.arduino15`
/// on Linux — or wherever the user moved it with
/// `arduino-cli config set directories.data <path>`. Asked of arduino-cli
/// rather than guessed, for exactly that reason.
///
/// Implementation note: arduino-cli 1.5.0's `config dump --format json` only
/// emits keys the user explicitly overrode — defaults are missing, so a
/// JSON-pointer lookup against the dump fails for fresh installs. The
/// per-key `config get directories.data` form does include the resolved
/// default, so we use that instead.
pub async fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let out = run_capture(app, &["config", "get", "directories.data"]).await?;
    let trimmed = out.trim();
    if trimmed.is_empty() {
        return Err("arduino-cli config get directories.data returned empty".into());
    }
    Ok(PathBuf::from(trimmed))
}

/// Emit one line to `event_name`, but only to the window labelled `target` —
/// two windows can build at the same time, and window A's compiler output
/// must not land in window B's Output panel.
pub fn emit_line_to(app: &tauri::AppHandle, target: &str, event_name: &str, line: String) {
    let _ = app.emit_to(EventTarget::labeled(target.to_string()), event_name, line);
}

/// Run arduino-cli, streaming stdout line-by-line to a Tauri event addressed
/// to the window labelled `target`. Returns (exit_code, combined_stderr);
/// stderr is capped to head+tail (see STDERR_*_LINES) so one pathological
/// build cannot grow the buffer without bound.
pub async fn run_streaming(
    app: &tauri::AppHandle,
    target: &str,
    event_name: &str,
    args: &[&str],
) -> Result<(i32, String), String> {
    let binary = arduino_cli_path(app)?;
    let mut cmd = Command::new(binary);
    cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
    cmd.env(NETWORK_TIMEOUT_ENV, NETWORK_TIMEOUT);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn().map_err(|e| format!("spawn arduino-cli: {e}"))?;
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let app_clone = app.clone();
    let event = event_name.to_string();
    let event_target = EventTarget::labeled(target.to_string());
    let out_handle = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_clone.emit_to(event_target.clone(), &event, &line);
        }
    });

    let err_handle = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        let mut head: Vec<String> = Vec::new();
        let mut tail: VecDeque<String> = VecDeque::new();
        let mut dropped: usize = 0;
        while let Ok(Some(line)) = lines.next_line().await {
            if head.len() < STDERR_HEAD_LINES {
                head.push(line);
            } else {
                if tail.len() == STDERR_TAIL_LINES {
                    tail.pop_front();
                    dropped += 1;
                }
                tail.push_back(line);
            }
        }
        let mut buf = String::new();
        for line in &head {
            buf.push_str(line);
            buf.push('\n');
        }
        if dropped > 0 {
            buf.push_str(&format!("[... {dropped} lines omitted ...]\n"));
        }
        for line in &tail {
            buf.push_str(line);
            buf.push('\n');
        }
        buf
    });

    let status = child.wait().await.map_err(|e| e.to_string())?;
    out_handle.await.ok();
    let errbuf = err_handle.await.unwrap_or_default();
    Ok((status.code().unwrap_or(-1), errbuf))
}

/// Run arduino-cli and capture stdout — for commands where we just want the JSON back.
pub async fn run_capture(app: &tauri::AppHandle, args: &[&str]) -> Result<String, String> {
    let binary = arduino_cli_path(app)?;
    let mut cmd = Command::new(binary);
    cmd.args(args);
    cmd.env(NETWORK_TIMEOUT_ENV, NETWORK_TIMEOUT);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let output = cmd.output().await.map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}
