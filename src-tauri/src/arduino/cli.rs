use std::path::PathBuf;
use std::process::Stdio;
use tauri::{Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

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

/// Run arduino-cli, streaming stdout line-by-line to a Tauri event.
/// Returns (exit_code, combined_stderr).
pub async fn run_streaming(
    app: &tauri::AppHandle,
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
    let out_handle = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_clone.emit(&event, &line);
        }
    });

    let err_handle = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        let mut buf = String::new();
        while let Ok(Some(line)) = lines.next_line().await {
            buf.push_str(&line);
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
