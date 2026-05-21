mod project;
mod arduino;
mod serial;
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(serial::commands::SerialState(std::sync::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::ping::ping,
            project::commands::project_sketches_root,
            project::commands::project_open,
            project::commands::project_create,
            project::commands::project_read_file,
            project::commands::project_save_file,
            project::commands::project_list_recent,
            project::commands::project_delete_path,
            project::commands::project_rename_path,
            project::commands::project_create_file,
            project::commands::project_create_folder,
            arduino::commands::arduino_list_boards,
            arduino::commands::arduino_detect_ports,
            arduino::commands::arduino_compile,
            arduino::commands::arduino_upload,
            serial::commands::serial_open,
            serial::commands::serial_close,
            serial::commands::serial_write,
            serial::commands::serial_is_open,
            arduino::commands::arduino_list_cores,
            arduino::commands::arduino_search_cores,
            arduino::commands::arduino_install_core,
            arduino::commands::arduino_update_index,
            arduino::commands::arduino_identify_board,
            arduino::commands::arduino_lib_search,
            arduino::commands::arduino_lib_list_installed,
            arduino::commands::arduino_lib_install,
            arduino::commands::arduino_lib_uninstall,
            arduino::commands::arduino_lib_install_zip,
            arduino::commands::arduino_list_library_examples,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
