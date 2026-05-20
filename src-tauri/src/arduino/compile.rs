use super::cli;
use std::path::Path;

/// Result of an arduino-cli compile run.
#[derive(serde::Serialize)]
pub struct CompileResult {
    pub success: bool,
    pub exit_code: i32,
    pub stderr: String,
}

/// Compile a sketch for the given board, streaming progress to the `compile-output` event.
pub async fn compile_sketch(
    app: &tauri::AppHandle,
    sketch_path: &Path,
    fqbn: &str,
) -> Result<CompileResult, String> {
    let sketch = sketch_path.to_string_lossy().into_owned();
    let (code, stderr) = cli::run_streaming(
        app,
        "compile-output",
        &["compile", "--fqbn", fqbn, "--no-color", sketch.as_str()],
    )
    .await?;
    Ok(CompileResult {
        success: code == 0,
        exit_code: code,
        stderr,
    })
}
