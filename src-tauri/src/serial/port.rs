use serde::Serialize;
use serialport::SerialPort;
use std::io::{ErrorKind, Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tauri::{Emitter, EventTarget};

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

/// A pending line with no `\n` yet is flushed after this long anyway, so
/// sketches that use bare `Serial.print` (no newline) still show output
/// instead of buffering forever.
const PARTIAL_FLUSH_AFTER: Duration = Duration::from_millis(300);

/// A pending line is flushed once it grows past this many bytes regardless
/// of newlines — bounds memory against binary/newline-free streams.
const MAX_PENDING_LINE_BYTES: usize = 16 * 1024;

/// Open `port_name` at `baud` and spawn the read/write loop. Incoming lines
/// stream out as `serial-line`; `serial-disconnected` / `serial-error` fire
/// when the port ends or errors. All events are emitted only to the window
/// labelled `owner` — each IDE window owns its own monitor, and a second
/// window's traffic must not bleed into this one's log.
///
/// Uses the blocking `serialport` API rather than `tokio-serial`'s
/// `open_native_async`: the async open validates the port's stop-bits
/// setting, which fails for ESP32 native-USB (USB-Serial/JTAG) ports that
/// report an unsupported value — "Invalid stop bits setting encountered"
/// (mio-serial issue #41). The blocking open skips that check.
pub fn open(
    app: tauri::AppHandle,
    owner: String,
    port_name: &str,
    baud: u32,
) -> Result<SerialHandle, String> {
    let port = serialport::new(port_name, baud)
        .timeout(READ_TIMEOUT)
        .open()
        .map_err(|e| format!("open {port_name}: {e}"))?;

    let (tx, rx) = mpsc::channel::<Vec<u8>>();
    let stop = Arc::new(AtomicBool::new(false));
    let port_label = port_name.to_string();

    let thread = std::thread::spawn({
        let stop = Arc::clone(&stop);
        move || io_loop(app, owner, port, port_label, rx, stop)
    });

    Ok(SerialHandle { tx, stop, thread })
}

/// Read/write loop, owned by a dedicated thread. A short read timeout keeps
/// the loop responsive to outgoing bytes and to a stop request.
fn io_loop(
    app: tauri::AppHandle,
    owner: String,
    mut port: Box<dyn SerialPort>,
    port_label: String,
    rx: Receiver<Vec<u8>>,
    stop: Arc<AtomicBool>,
) {
    let target = EventTarget::labeled(owner);
    let mut buf = [0u8; 4096];
    let mut line = String::new();
    // When the pending line started accumulating — drives the partial flush.
    let mut line_since: Option<Instant> = None;

    let flush_line = |line: &mut String, line_since: &mut Option<Instant>, app: &tauri::AppHandle, target: &EventTarget| {
        let entry = SerialLine {
            ts: now_ms(),
            text: line.trim_end_matches('\r').to_string(),
        };
        let _ = app.emit_to(target.clone(), "serial-line", &entry);
        line.clear();
        *line_since = None;
    };

    while !stop.load(Ordering::Relaxed) {
        match port.read(&mut buf) {
            Ok(0) => {
                // Timeout-equivalent on some drivers: no data this tick.
                if let Some(since) = line_since {
                    if !line.is_empty() && since.elapsed() >= PARTIAL_FLUSH_AFTER {
                        flush_line(&mut line, &mut line_since, &app, &target);
                    }
                }
            }
            Ok(n) => {
                let chunk = String::from_utf8_lossy(&buf[..n]);
                for ch in chunk.chars() {
                    if ch == '\n' {
                        flush_line(&mut line, &mut line_since, &app, &target);
                    } else {
                        if line.is_empty() {
                            line_since = Some(Instant::now());
                        }
                        line.push(ch);
                    }
                }
                if line.len() >= MAX_PENDING_LINE_BYTES {
                    flush_line(&mut line, &mut line_since, &app, &target);
                }
            }
            // A read timeout just means no data arrived — but a line waiting
            // on a newline that never comes should still reach the monitor.
            Err(e) if e.kind() == ErrorKind::TimedOut => {
                if let Some(since) = line_since {
                    if !line.is_empty() && since.elapsed() >= PARTIAL_FLUSH_AFTER {
                        flush_line(&mut line, &mut line_since, &app, &target);
                    }
                }
            }
            // Any other error means the port is gone (board unplugged).
            Err(e) => {
                let _ = app.emit_to(target.clone(), "serial-error", e.to_string());
                let _ = app.emit_to(target.clone(), "serial-disconnected", &port_label);
                return;
            }
        }

        while let Ok(bytes) = rx.try_recv() {
            if let Err(e) = port.write_all(&bytes) {
                let _ = app.emit_to(target.clone(), "serial-error", format!("write: {e}"));
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

/// Signal the connection's thread to stop WITHOUT waiting for it. For window
/// teardown, where blocking the event loop is not allowed — the thread
/// notices the flag within one read timeout and releases the port as it
/// exits; dropping the JoinHandle detaches it.
pub fn stop_detached(handle: SerialHandle) {
    let SerialHandle { tx: _, stop, thread } = handle;
    stop.store(true, Ordering::Relaxed);
    drop(thread);
}
