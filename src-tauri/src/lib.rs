mod project;
mod arduino;
mod serial;
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(serial::commands::SerialState(std::sync::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::ping::ping,
            project::commands::project_sketches_root,
            project::commands::project_open,
            project::commands::project_create,
            project::commands::project_read_file,
            project::commands::project_save_file,
            project::commands::project_list_recent,
            arduino::commands::arduino_list_boards,
            arduino::commands::arduino_detect_ports,
            arduino::commands::arduino_compile,
            arduino::commands::arduino_upload,
            serial::commands::serial_open,
            serial::commands::serial_close,
            serial::commands::serial_write,
            serial::commands::serial_is_open,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
