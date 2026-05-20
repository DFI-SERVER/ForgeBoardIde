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

#[tauri::command]
pub async fn arduino_list_cores(app: tauri::AppHandle) -> Result<Vec<super::core::Core>, String> {
    super::core::list_installed(&app).await
}

#[tauri::command]
pub async fn arduino_search_cores(
    app: tauri::AppHandle,
    query: String,
) -> Result<Vec<super::core::Core>, String> {
    super::core::search(&app, &query).await
}

#[tauri::command]
pub async fn arduino_install_core(
    app: tauri::AppHandle,
    core_id: String,
) -> Result<i32, String> {
    super::core::install(&app, &core_id).await
}

#[tauri::command]
pub async fn arduino_update_index(app: tauri::AppHandle) -> Result<(), String> {
    super::core::update_index(&app).await
}
