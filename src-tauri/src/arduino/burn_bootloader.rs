use super::cli;
use super::fqbn::normalize_fqbn;

/// Result of an `arduino-cli burn-bootloader` run.
#[derive(serde::Serialize)]
pub struct BurnBootloaderResult {
    pub success: bool,
    pub exit_code: i32,
    pub stderr: String,
}

/// Burn the bootloader onto a connected board, streaming progress to
/// `burn-bootloader-output`.
///
/// Wraps `arduino-cli burn-bootloader -b <fqbn> -P <programmer> [-p <port>] [-v]`.
/// Per the arduino-cli docs, burning a bootloader is a two-step erase + flash
/// operation that requires a programmer selection. `port` is optional — some
/// programmers (USB-attached ones, e.g. Atmel-ICE) don't need it.
pub async fn burn_bootloader(
    app: &tauri::AppHandle,
    target: &str,
    fqbn: &str,
    port: Option<&str>,
    programmer: &str,
    verbose: bool,
) -> Result<BurnBootloaderResult, String> {
    let fqbn = normalize_fqbn(fqbn);
    let mut args: Vec<&str> = vec![
        "burn-bootloader",
        "-b",
        fqbn.as_str(),
        "-P",
        programmer,
        "--no-color",
    ];
    if let Some(p) = port {
        if !p.is_empty() {
            args.push("-p");
            args.push(p);
        }
    }
    if verbose {
        args.push("-v");
    }
    let (code, stderr) = cli::run_streaming(app, target, "burn-bootloader-output", &args).await?;
    Ok(BurnBootloaderResult {
        success: code == 0,
        exit_code: code,
        stderr,
    })
}
