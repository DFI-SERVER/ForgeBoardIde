mod project;
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::ping::ping,
            project::commands::project_sketches_root,
            project::commands::project_open,
            project::commands::project_create,
            project::commands::project_read_file,
            project::commands::project_save_file,
            project::commands::project_list_recent,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
