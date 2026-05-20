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
pub async fn upload_sketch(
    app: &tauri::AppHandle,
    sketch_path: &Path,
    fqbn: &str,
    port: &str,
) -> Result<UploadResult, String> {
    let sketch = sketch_path.to_string_lossy().into_owned();
    let (code, stderr) = cli::run_streaming(
        app,
        "upload-output",
        &[
            "compile",
            "--fqbn",
            fqbn,
            "--upload",
            "--port",
            port,
            "--no-color",
            sketch.as_str(),
        ],
    )
    .await?;
    Ok(UploadResult {
        success: code == 0,
        exit_code: code,
        stderr,
    })
}
