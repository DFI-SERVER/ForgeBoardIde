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
    verbose: bool,
) -> Result<CompileResult, String> {
    super::compile::compile_sketch(&app, &sketch, &fqbn, verbose).await
}

#[tauri::command]
pub async fn arduino_upload(
    app: tauri::AppHandle,
    sketch: PathBuf,
    fqbn: String,
    port: String,
    verbose: bool,
) -> Result<UploadResult, String> {
    super::upload::upload_sketch(&app, &sketch, &fqbn, &port, verbose).await
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

#[tauri::command]
pub async fn arduino_identify_board(
    app: tauri::AppHandle,
    port: String,
) -> Result<super::detect::BoardId, String> {
    super::detect::identify(&app, &port).await
}

#[tauri::command]
pub async fn arduino_lib_search(
    app: tauri::AppHandle,
    query: String,
) -> Result<Vec<super::library::Library>, String> {
    super::library::search(&app, &query).await
}

/// Fetch the entire Arduino library registry (no result cap). The frontend
/// caches this once and filters it in memory.
#[tauri::command]
pub async fn arduino_lib_list_all(
    app: tauri::AppHandle,
) -> Result<Vec<super::library::Library>, String> {
    super::library::list_all(&app).await
}

#[tauri::command]
pub async fn arduino_lib_list_installed(
    app: tauri::AppHandle,
) -> Result<Vec<super::library::Library>, String> {
    super::library::list_installed(&app).await
}

#[tauri::command]
pub async fn arduino_lib_install(app: tauri::AppHandle, name: String) -> Result<i32, String> {
    super::library::install(&app, &name).await
}

#[tauri::command]
pub async fn arduino_lib_uninstall(app: tauri::AppHandle, name: String) -> Result<i32, String> {
    super::library::uninstall(&app, &name).await
}

#[tauri::command]
pub async fn arduino_lib_install_zip(
    app: tauri::AppHandle,
    zip_path: String,
) -> Result<i32, String> {
    super::library::install_zip(&app, &zip_path).await
}

/// List example sketches found in the `examples/` folders of installed
/// libraries. Synchronous filesystem work, run on a blocking thread so the
/// scan never stalls the async runtime.
#[tauri::command]
pub async fn arduino_list_library_examples() -> Result<Vec<super::examples::LibraryExample>, String> {
    tokio::task::spawn_blocking(super::examples::list_library_examples)
        .await
        .map_err(|e| e.to_string())
}
