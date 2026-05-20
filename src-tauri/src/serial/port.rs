use serde::Serialize;
use tauri::Emitter;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;
use tokio_serial::SerialPortBuilderExt;

/// One received line, with a millisecond timestamp.
#[derive(Serialize, Clone)]
pub struct SerialLine {
    pub ts: u64,
    pub text: String,
}

/// A live serial connection. A single task owns the port; the frontend
/// sends outgoing bytes through `tx`.
pub struct SerialHandle {
    pub tx: mpsc::Sender<Vec<u8>>,
    pub task: tokio::task::JoinHandle<()>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Open `port_name` at `baud` and spawn the read/write loop. Incoming lines stream
/// out as `serial-line`; `serial-disconnected` / `serial-error` fire on end-of-stream
/// and I/O failure.
pub async fn open(
    app: tauri::AppHandle,
    port_name: &str,
    baud: u32,
) -> Result<SerialHandle, String> {
    let mut port = tokio_serial::new(port_name, baud)
        .open_native_async()
        .map_err(|e| format!("open {port_name}: {e}"))?;

    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(32);
    let port_label = port_name.to_string();

    let task = tokio::spawn(async move {
        let mut buf = vec![0u8; 4096];
        let mut line = String::new();
        loop {
            tokio::select! {
                read = port.read(&mut buf) => match read {
                    Ok(0) => {
                        let _ = app.emit("serial-disconnected", &port_label);
                        break;
                    }
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]);
                        for ch in chunk.chars() {
                            if ch == '\n' {
                                let entry = SerialLine {
                                    ts: now_ms(),
                                    text: line.trim_end_matches('\r').to_string(),
                                };
                                let _ = app.emit("serial-line", &entry);
                                line.clear();
                            } else {
                                line.push(ch);
                            }
                        }
                    }
                    Err(e) => {
                        let _ = app.emit("serial-error", e.to_string());
                        break;
                    }
                },
                Some(bytes) = rx.recv() => {
                    if let Err(e) = port.write_all(&bytes).await {
                        let _ = app.emit("serial-error", format!("write: {e}"));
                    }
                }
            }
        }
    });

    Ok(SerialHandle { tx, task })
}

/// Abort the connection's task and wait for it to release the port.
pub async fn close(handle: SerialHandle) {
    handle.task.abort();
    let _ = handle.task.await;
}
