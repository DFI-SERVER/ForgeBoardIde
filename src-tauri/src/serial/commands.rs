use super::port::{self, SerialHandle};
use std::sync::Mutex;
use tauri::State;

/// The IDE holds at most one serial connection at a time.
pub struct SerialState(pub Mutex<Option<SerialHandle>>);

#[tauri::command]
pub async fn serial_open(
    app: tauri::AppHandle,
    state: State<'_, SerialState>,
    port: String,
    baud: u32,
) -> Result<(), String> {
    // Drop any existing connection first so the port is free to reopen.
    let existing = state.0.lock().unwrap().take();
    if let Some(handle) = existing {
        port::close(handle).await;
    }
    let handle = port::open(app, &port, baud).await?;
    *state.0.lock().unwrap() = Some(handle);
    Ok(())
}

#[tauri::command]
pub async fn serial_close(state: State<'_, SerialState>) -> Result<(), String> {
    let existing = state.0.lock().unwrap().take();
    if let Some(handle) = existing {
        port::close(handle).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn serial_write(state: State<'_, SerialState>, bytes: Vec<u8>) -> Result<(), String> {
    let tx = {
        let guard = state.0.lock().unwrap();
        guard.as_ref().map(|h| h.tx.clone())
    };
    match tx {
        Some(tx) => tx.send(bytes).await.map_err(|e| e.to_string()),
        None => Err("no serial port open".into()),
    }
}

#[tauri::command]
pub fn serial_is_open(state: State<'_, SerialState>) -> bool {
    state.0.lock().unwrap().is_some()
}
