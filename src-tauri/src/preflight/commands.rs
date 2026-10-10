use super::Check;
use std::process::Stdio;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::Command;

/// Run every setup check for this machine.
#[tauri::command]
pub async fn setup_check(app: tauri::AppHandle) -> Result<Vec<Check>, String> {
    Ok(super::run_all(&app).await)
}

fn forward_lines<R: AsyncRead + Unpin + Send + 'static>(app: tauri::AppHandle, label: String, reader: R) {
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app.emit_to(tauri::EventTarget::labeled(label.clone()), "setup-fix-output", line);
        }
    });
}

/// Run an `auto` fix. Output lines stream to `setup-fix-output` on the
/// calling window; the exit code is returned. Only fixes this module knows
/// are accepted — the frontend cannot ask for arbitrary commands.
#[tauri::command]
pub async fn setup_fix(app: tauri::AppHandle, window: tauri::Window, id: String) -> Result<i32, String> {
    let (program, args): (&str, Vec<&str>) = match id.as_str() {
        "rosetta" if cfg!(target_os = "macos") => (
            "softwareupdate",
            vec!["--install-rosetta", "--agree-to-license"],
        ),
        other => return Err(format!("no automatic fix for '{other}'")),
    };

    let label = window.label().to_string();
    let mut cmd = Command::new(program);
    cmd.args(&args).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("could not start {program}: {e}"))?;
    if let Some(out) = child.stdout.take() {
        forward_lines(app.clone(), label.clone(), out);
    }
    if let Some(err) = child.stderr.take() {
        forward_lines(app.clone(), label.clone(), err);
    }
    let status = child.wait().await.map_err(|e| e.to_string())?;
    Ok(status.code().unwrap_or(-1))
}
