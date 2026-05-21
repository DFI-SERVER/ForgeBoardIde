use super::cli;
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
pub async fn upload_sketch(
    app: &tauri::AppHandle,
    sketch_path: &Path,
    fqbn: &str,
    port: &str,
    verbose: bool,
) -> Result<UploadResult, String> {
    let sketch = sketch_path.to_string_lossy().into_owned();
    let mut args: Vec<&str> = vec![
        "compile", "--fqbn", fqbn, "--upload", "--port", port, "--no-color",
    ];
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
