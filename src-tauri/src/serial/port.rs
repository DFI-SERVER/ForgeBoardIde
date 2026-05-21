use serde::Serialize;
use serialport::SerialPort;
use std::io::{ErrorKind, Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::Emitter;

/// One received line, with a millisecond timestamp.
#[derive(Serialize, Clone)]
pub struct SerialLine {
    pub ts: u64,
    pub text: String,
}

/// A live serial connection. A dedicated OS thread owns the port; the
/// frontend sends outgoing bytes through `tx`, and `stop` ends the thread.
pub struct SerialHandle {
    pub tx: Sender<Vec<u8>>,
    stop: Arc<AtomicBool>,
    thread: JoinHandle<()>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// How long a read blocks before returning, so the loop can also service
/// pending writes and notice a stop request.
const READ_TIMEOUT: Duration = Duration::from_millis(50);

/// Open `port_name` at `baud` and spawn the read/write loop. Incoming lines
/// stream out as `serial-line`; `serial-disconnected` / `serial-error` fire
/// when the port ends or errors.
///
/// Uses the blocking `serialport` API rather than `tokio-serial`'s
/// `open_native_async`: the async open validates the port's stop-bits
/// setting, which fails for ESP32 native-USB (USB-Serial/JTAG) ports that
/// report an unsupported value — "Invalid stop bits setting encountered"
/// (mio-serial issue #41). The blocking open skips that check.
pub fn open(app: tauri::AppHandle, port_name: &str, baud: u32) -> Result<SerialHandle, String> {
    let port = serialport::new(port_name, baud)
        .timeout(READ_TIMEOUT)
        .open()
        .map_err(|e| format!("open {port_name}: {e}"))?;

    let (tx, rx) = mpsc::channel::<Vec<u8>>();
    let stop = Arc::new(AtomicBool::new(false));
    let port_label = port_name.to_string();

    let thread = std::thread::spawn({
        let stop = Arc::clone(&stop);
        move || io_loop(app, port, port_label, rx, stop)
    });

    Ok(SerialHandle { tx, stop, thread })
}

/// Read/write loop, owned by a dedicated thread. A short read timeout keeps
/// the loop responsive to outgoing bytes and to a stop request.
fn io_loop(
    app: tauri::AppHandle,
    mut port: Box<dyn SerialPort>,
    port_label: String,
    rx: Receiver<Vec<u8>>,
    stop: Arc<AtomicBool>,
) {
    let mut buf = [0u8; 4096];
    let mut line = String::new();

    while !stop.load(Ordering::Relaxed) {
        match port.read(&mut buf) {
            Ok(0) => {}
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
            // A read timeout just means no data arrived — keep looping.
            Err(e) if e.kind() == ErrorKind::TimedOut => {}
            // Any other error means the port is gone (board unplugged).
            Err(e) => {
                let _ = app.emit("serial-error", e.to_string());
                let _ = app.emit("serial-disconnected", &port_label);
                return;
            }
        }

        while let Ok(bytes) = rx.try_recv() {
            if let Err(e) = port.write_all(&bytes) {
                let _ = app.emit("serial-error", format!("write: {e}"));
            }
        }
    }
}

/// Stop the connection's thread and wait for it to release the port.
pub async fn close(handle: SerialHandle) {
    let SerialHandle { tx: _, stop, thread } = handle;
    stop.store(true, Ordering::Relaxed);
    let _ = tokio::task::spawn_blocking(move || thread.join()).await;
}
