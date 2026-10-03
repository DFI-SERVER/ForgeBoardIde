mod project;
mod arduino;
mod serial;
mod commands;
mod corrections;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Manager;
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(serial::commands::SerialState(std::sync::Mutex::new(
            std::collections::HashMap::new(),
        )))
        .on_window_event(|window, event| {
            // A window that closes while its serial monitor is connected must
            // release the COM port, or it stays exclusively held (Windows)
            // until the whole app exits. Detached stop: no blocking in the
            // event handler; the io thread exits within one read timeout.
            if matches!(event, tauri::WindowEvent::Destroyed) {
                let state = window.state::<serial::commands::SerialState>();
                let handle = state.0.lock().unwrap().remove(window.label());
                if let Some(handle) = handle {
                    serial::port::stop_detached(handle);
                }
            }
        })
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
            project::commands::project_sketchbook_get,
            project::commands::project_sketchbook_set,
            project::commands::project_archive_sketch,
            project::commands::project_read_profiles,
            arduino::commands::arduino_list_boards,
            arduino::commands::arduino_detect_ports,
            arduino::commands::arduino_compile,
            arduino::commands::arduino_upload,
            arduino::commands::arduino_burn_bootloader,
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
            arduino::commands::arduino_lib_list_all,
            arduino::commands::arduino_lib_list_installed,
            arduino::commands::arduino_lib_install,
            arduino::commands::arduino_lib_uninstall,
            arduino::commands::arduino_lib_install_zip,
            arduino::commands::arduino_list_library_examples,
            corrections::commands::corrections_list,
            corrections::commands::corrections_apply,
            corrections::commands::corrections_remove,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
