use super::cli;
use super::fqbn::normalize_fqbn;
use std::path::Path;

/// Result of an arduino-cli compile run.
#[derive(serde::Serialize)]
pub struct CompileResult {
    pub success: bool,
    pub exit_code: i32,
    pub stderr: String,
}

/// Compile a sketch for the given board, streaming progress to the `compile-output` event.
///
/// When `verbose` is set, arduino-cli is run with `-v` so the full compiler
/// command lines and per-file progress reach the Output panel.
///
/// `profile`, if `Some`, switches the compile to a `sketch.yaml` profile
/// (`--profile <name>`). The profile owns the FQBN in that mode, so the
/// `--fqbn` flag is omitted to avoid arduino-cli's "can't combine" rejection.
pub async fn compile_sketch(
    app: &tauri::AppHandle,
    target: &str,
    sketch_path: &Path,
    fqbn: &str,
    verbose: bool,
    profile: Option<&str>,
) -> Result<CompileResult, String> {
    let sketch = sketch_path.to_string_lossy().into_owned();
    let fqbn = normalize_fqbn(fqbn);
    let mut args: Vec<&str> = vec!["compile", "--no-color"];
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
    let (code, stderr) = cli::run_streaming(app, target, "compile-output", &args).await?;
    Ok(CompileResult {
        success: code == 0,
        exit_code: code,
        stderr,
    })
}
