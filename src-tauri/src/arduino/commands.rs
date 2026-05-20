use super::board::{Board, DetectedBoard};
use super::compile::CompileResult;
use super::upload::UploadResult;
use std::path::PathBuf;

#[tauri::command]
pub async fn arduino_list_boards(app: tauri::AppHandle) -> Result<Vec<Board>, String> {
    super::board::list_installed_boards(&app).await
}

#[tauri::command]
pub async fn arduino_detect_ports(app: tauri::AppHandle) -> Result<Vec<DetectedBoard>, String> {
    super::board::detect_boards(&app).await
}

#[tauri::command]
pub async fn arduino_compile(
    app: tauri::AppHandle,
    sketch: PathBuf,
    fqbn: String,
) -> Result<CompileResult, String> {
    super::compile::compile_sketch(&app, &sketch, &fqbn).await
}

#[tauri::command]
pub async fn arduino_upload(
    app: tauri::AppHandle,
    sketch: PathBuf,
    fqbn: String,
    port: String,
) -> Result<UploadResult, String> {
    super::upload::upload_sketch(&app, &sketch, &fqbn, &port).await
}
