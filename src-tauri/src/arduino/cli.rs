use std::collections::VecDeque;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::{Emitter, EventTarget, Manager};
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

/// Resolve the bundled arduino-cli binary — from the crate in dev builds,
/// from the app's bundled resources in release builds.
fn arduino_cli_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    const BIN: &str = "binaries/arduino-cli-x86_64-pc-windows-msvc.exe";
    if cfg!(debug_assertions) {
        Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(BIN))
    } else {
        app.path()
            .resolve(BIN, tauri::path::BaseDirectory::Resource)
            .map_err(|e| e.to_string())
    }
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
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let output = cmd.output().await.map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}
