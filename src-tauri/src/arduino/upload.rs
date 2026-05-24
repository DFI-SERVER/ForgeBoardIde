use super::cli;
use super::fqbn::normalize_fqbn;
use std::path::Path;

/// Result of an arduino-cli compile-and-upload run.
#[derive(serde::Serialize)]
pub struct UploadResult {
    pub success: bool,
    pub exit_code: i32,
    pub stderr: String,
}

/// Compile and flash a sketch to a connected board, streaming progress to `upload-output`.
///
/// Uses `compile --upload` so a click of "Upload" always builds fresh before flashing,
/// matching the Arduino IDE — a plain `upload` would fail when there is no prior build.
///
/// `verbose` adds `-v`, surfacing the full compiler and uploader logs.
///
/// `profile`, if `Some`, switches the build to a `sketch.yaml` profile
/// (`--profile <name>`). The profile owns the FQBN in that mode, so the
/// `--fqbn` flag is omitted; `--port` is still required because the profile
/// does not pin a target port.
pub async fn upload_sketch(
    app: &tauri::AppHandle,
    sketch_path: &Path,
    fqbn: &str,
    port: &str,
    verbose: bool,
    profile: Option<&str>,
) -> Result<UploadResult, String> {
    let sketch = sketch_path.to_string_lossy().into_owned();
    let fqbn = normalize_fqbn(fqbn);
    let mut args: Vec<&str> = vec!["compile", "--upload", "--port", port, "--no-color"];
    if let Some(p) = profile {
        args.push("--profile");
        args.push(p);
    } else {
        args.push("--fqbn");
        args.push(fqbn.as_str());
    }
    if verbose {
        args.push("-v");
    }
    args.push(sketch.as_str());
    let (code, stderr) = cli::run_streaming(app, "upload-output", &args).await?;
    Ok(UploadResult {
        success: code == 0,
        exit_code: code,
        stderr,
    })
}
