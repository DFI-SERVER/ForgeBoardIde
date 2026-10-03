//! Tauri commands for the platform-corrections subsystem.
//!
//! Three operations the frontend can invoke:
//!   * `corrections_list`  — read-only snapshot for the Settings + About UIs.
//!   * `corrections_apply` — sync bundled overlay files into installed platforms.
//!     Called automatically on app start when "Apply platform corrections" is on.
//!   * `corrections_remove` — delete overlay files, restoring vendor defaults.
//!     Called when the user toggles "Apply platform corrections" off.

use super::{apply_all, list_all, remove_all, CorrectionInfo};

#[tauri::command]
pub async fn corrections_list(
    app: tauri::AppHandle,
) -> Result<Vec<CorrectionInfo>, String> {
    list_all(&app).await
}

#[tauri::command]
pub async fn corrections_apply(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    apply_all(&app).await
}

#[tauri::command]
pub async fn corrections_remove(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    remove_all(&app).await
}
