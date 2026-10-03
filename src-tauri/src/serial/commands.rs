use super::port::{self, SerialHandle};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

/// Live serial connections, keyed by the owning window's label. Each IDE
/// window holds at most one connection, and one window's open/close must
/// never touch another window's port — multi-window is a first-class flow
/// (every sketch window can run its own monitor).
pub struct SerialState(pub Mutex<HashMap<String, SerialHandle>>);

#[tauri::command]
pub async fn serial_open(
    app: tauri::AppHandle,
    window: tauri::Window,
    state: State<'_, SerialState>,
    port: String,
    baud: u32,
) -> Result<(), String> {
    let label = window.label().to_string();
    // Drop this window's existing connection first so its port is free to
    // reopen (baud change reconnects through here).
    let existing = state.0.lock().unwrap().remove(&label);
    if let Some(handle) = existing {
        port::close(handle).await;
    }
    let handle = port::open(app, label.clone(), &port, baud)?;
    state.0.lock().unwrap().insert(label, handle);
    Ok(())
}

#[tauri::command]
pub async fn serial_close(
    window: tauri::Window,
    state: State<'_, SerialState>,
) -> Result<(), String> {
    let existing = state.0.lock().unwrap().remove(window.label());
    if let Some(handle) = existing {
        port::close(handle).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn serial_write(
    window: tauri::Window,
    state: State<'_, SerialState>,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let tx = {
        let guard = state.0.lock().unwrap();
        guard.get(window.label()).map(|h| h.tx.clone())
    };
    match tx {
        Some(tx) => tx.send(bytes).map_err(|_| "serial port closed".to_string()),
        None => Err("no serial port open".into()),
    }
}

#[tauri::command]
pub fn serial_is_open(window: tauri::Window, state: State<'_, SerialState>) -> bool {
    state.0.lock().unwrap().contains_key(window.label())
}
