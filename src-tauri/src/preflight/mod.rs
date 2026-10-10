//! Setup check ("preflight") — what this machine needs before ForgeBoard can
//! build and flash, checked up front instead of discovered from a failed
//! compile.
//!
//! Every item is a [`Check`] with a status and, when something is wrong, a
//! [`Fix`]: either something the app can run itself (`auto`), the exact
//! command for this OS to copy into a terminal (`command`), a jump to the
//! Boards view (`install-core`), or a vendor page (`url`). The frontend only
//! renders; all platform knowledge lives here.
//!
//! What is checked, and why (all of these bit real users in Oct 2026):
//! - Rosetta 2 on Apple Silicon: arduino-cli's `ctags` and a few core tools
//!   are Intel-only; without Rosetta every compile dies with "bad CPU type".
//! - Internet to downloads.arduino.cc and github.com: first launch and core
//!   installs need both; a blocked one is otherwise a silent empty list.
//! - Free disk: the esp32 core needs ~3 GB unpacked.
//! - Arduino tools (serial-discovery): no port is listed without it.
//! - A board core: nothing compiles until one is installed.
//! - Windows: USB-serial devices Windows could not find a driver for.
//! - Linux: membership of the serial-port group; the brltty conflict.
//! - macOS 15+: the per-accessory USB permission (information only).

pub mod commands;

use serde::Serialize;
use std::process::Stdio;
use tokio::process::Command;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Ok,
    Warn,
    Fail,
    Info,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Fix {
    /// `auto` | `command` | `install-core` | `url`
    pub kind: &'static str,
    pub label: String,
    pub command: Option<String>,
    pub url: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub id: &'static str,
    pub title: String,
    pub status: Status,
    pub detail: String,
    pub fix: Option<Fix>,
}

const MIN_FREE_BYTES: u64 = 3 * 1024 * 1024 * 1024;

/// Run every check that applies to this OS, in display order.
pub async fn run_all(app: &tauri::AppHandle) -> Vec<Check> {
    let mut out = Vec::new();
    if let Some(c) = check_rosetta().await {
        out.push(c);
    }
    out.push(check_internet().await);
    out.push(check_disk().await);
    out.push(check_arduino_tools(app).await);
    out.push(check_board_core(app).await);
    if let Some(c) = check_windows_drivers().await {
        out.push(c);
    }
    if let Some(c) = check_linux_serial_group().await {
        out.push(c);
    }
    if let Some(c) = check_linux_brltty().await {
        out.push(c);
    }
    if let Some(c) = check_macos_usb_permission().await {
        out.push(c);
    }
    out
}

async fn run(cmd: &str, args: &[&str]) -> Option<(bool, String)> {
    let mut c = Command::new(cmd);
    c.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        c.creation_flags(CREATE_NO_WINDOW);
    }
    let o = tokio::time::timeout(std::time::Duration::from_secs(20), c.output())
        .await
        .ok()?
        .ok()?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&o.stdout),
        String::from_utf8_lossy(&o.stderr)
    );
    Some((o.status.success(), text))
}

// ── Rosetta ──────────────────────────────────────────────────────────────

pub const ROSETTA_INSTALL_COMMAND: &str = "softwareupdate --install-rosetta --agree-to-license";

async fn check_rosetta() -> Option<Check> {
    if !(cfg!(target_os = "macos") && cfg!(target_arch = "aarch64")) {
        return None;
    }
    // `arch -x86_64 true` can only succeed when Rosetta is installed.
    let present = matches!(run("/usr/bin/arch", &["-x86_64", "/usr/bin/true"]).await, Some((true, _)));
    Some(if present {
        Check {
            id: "rosetta",
            title: "Rosetta 2".into(),
            status: Status::Ok,
            detail: "Installed. Arduino's Intel-only build tools can run on this Mac.".into(),
            fix: None,
        }
    } else {
        Check {
            id: "rosetta",
            title: "Rosetta 2".into(),
            status: Status::Fail,
            detail: "Not installed. Arduino's build tools include Intel-only programs (ctags, mkspiffs); \
                     without Rosetta every compile fails with \"bad CPU type\". One-time install from Apple, about a minute."
                .into(),
            fix: Some(Fix {
                kind: "auto",
                label: "Install Rosetta".into(),
                command: Some(ROSETTA_INSTALL_COMMAND.into()),
                url: None,
            }),
        }
    })
}

// ── Internet ─────────────────────────────────────────────────────────────

async fn reachable(url: &str) -> bool {
    // curl ships with macOS, Linux and Windows 10 1803+. HEAD with a short
    // timeout; any HTTP answer counts, we only care that the host is reachable.
    matches!(run("curl", &["-sS", "-I", "-m", "8", "-o", "/dev/null", url]).await, Some((true, _)))
        || matches!(run("curl", &["-sS", "-I", "-m", "8", "-o", "NUL", url]).await, Some((true, _)))
}

pub fn summarize_reachability(arduino: bool, github: bool) -> (Status, String) {
    match (arduino, github) {
        (true, true) => (Status::Ok, "downloads.arduino.cc and github.com are reachable.".into()),
        (false, false) => (
            Status::Fail,
            "No internet, or both downloads.arduino.cc and github.com are blocked. First launch and board-core \
             installs need them. Connect, or allow these hosts on the firewall."
                .into(),
        ),
        (true, false) => (
            Status::Warn,
            "downloads.arduino.cc is reachable but github.com is not. The ESP32 core and most vendor cores are \
             hosted on GitHub, so installs will fail until it is allowed."
                .into(),
        ),
        (false, true) => (
            Status::Warn,
            "github.com is reachable but downloads.arduino.cc is not. Arduino's index and tools cannot be \
             fetched until it is allowed."
                .into(),
        ),
    }
}

async fn check_internet() -> Check {
    let (a, g) = tokio::join!(
        reachable("https://downloads.arduino.cc/"),
        reachable("https://github.com/")
    );
    let (status, detail) = summarize_reachability(a, g);
    Check { id: "internet", title: "Internet access".into(), status, detail, fix: None }
}

// ── Disk ─────────────────────────────────────────────────────────────────

/// Parse the "available" column of `df -k <path>` (POSIX output, last line).
pub fn parse_df_avail_bytes(out: &str) -> Option<u64> {
    let line = out.lines().filter(|l| !l.trim().is_empty()).last()?;
    let cols: Vec<&str> = line.split_whitespace().collect();
    // Filesystem 1K-blocks Used Available Capacity Mounted — take the 4th.
    let kb: u64 = cols.get(3)?.parse().ok()?;
    Some(kb * 1024)
}

fn human_gb(bytes: u64) -> String {
    format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
}

async fn free_bytes_for_data_dir() -> Option<u64> {
    let dir = dirs::data_local_dir()?;
    let dir = dir.to_string_lossy().to_string();
    if cfg!(windows) {
        let script = format!(
            "(Get-PSDrive -Name ((Get-Item -LiteralPath '{}').PSDrive.Name)).Free",
            dir.replace('\'', "''")
        );
        let (_, out) = run("powershell", &["-NoProfile", "-Command", &script]).await?;
        out.trim().parse().ok()
    } else {
        let (_, out) = run("df", &["-k", &dir]).await?;
        parse_df_avail_bytes(&out)
    }
}

async fn check_disk() -> Check {
    match free_bytes_for_data_dir().await {
        Some(free) if free >= MIN_FREE_BYTES => Check {
            id: "disk",
            title: "Free disk space".into(),
            status: Status::Ok,
            detail: format!("{} free. A board core needs about 3 GB.", human_gb(free)),
            fix: None,
        },
        Some(free) => Check {
            id: "disk",
            title: "Free disk space".into(),
            status: Status::Fail,
            detail: format!(
                "Only {} free. Installing a board core needs about 3 GB. Free at least {} more.",
                human_gb(free),
                human_gb(MIN_FREE_BYTES - free)
            ),
            fix: None,
        },
        None => Check {
            id: "disk",
            title: "Free disk space".into(),
            status: Status::Info,
            detail: "Could not measure free space. A board core needs about 3 GB.".into(),
            fix: None,
        },
    }
}

// ── Arduino tools + board core ───────────────────────────────────────────

async fn check_arduino_tools(app: &tauri::AppHandle) -> Check {
    let present = match crate::arduino::cli::data_dir(app).await {
        Ok(d) => crate::arduino::setup::discovery_tool_dir(&d).is_dir(),
        Err(_) => false,
    };
    if present {
        Check {
            id: "tools",
            title: "Arduino tools".into(),
            status: Status::Ok,
            detail: "Board index and port-discovery tool are installed.".into(),
            fix: None,
        }
    } else {
        Check {
            id: "tools",
            title: "Arduino tools".into(),
            status: Status::Warn,
            detail: "The port-discovery tool is not installed yet. ForgeBoard downloads it automatically the first \
                     time it starts with internet access; until then no board can be listed."
                .into(),
            fix: None,
        }
    }
}

async fn check_board_core(app: &tauri::AppHandle) -> Check {
    let installed: Vec<String> = match crate::arduino::core::list_installed(app, &[]).await {
        Ok(cores) => cores.into_iter().filter(|c| c.installed).map(|c| c.id).collect(),
        Err(_) => Vec::new(),
    };
    if installed.is_empty() {
        Check {
            id: "core",
            title: "Board core".into(),
            status: Status::Warn,
            detail: "No board core is installed, so nothing can be compiled yet. Install ESP32 from the Boards \
                     view (about 1.3 GB, one time)."
                .into(),
            fix: Some(Fix {
                kind: "install-core",
                label: "Open Boards".into(),
                command: None,
                url: None,
            }),
        }
    } else {
        Check {
            id: "core",
            title: "Board core".into(),
            status: Status::Ok,
            detail: format!("Installed: {}.", installed.join(", ")),
            fix: None,
        }
    }
}

// ── Windows drivers ──────────────────────────────────────────────────────

/// Vendor driver page for a USB-serial device Windows has no driver for,
/// keyed on the name Windows shows for it.
pub fn driver_fix_for(device_name: &str) -> Fix {
    let n = device_name.to_ascii_lowercase();
    let (label, url) = if n.contains("ch340") || n.contains("ch341") || n.contains("ch34") || n.contains("ch9102") {
        ("Get the CH340 / CH9102 driver (WCH)", "https://www.wch-ic.com/downloads/CH341SER_EXE.html")
    } else if n.contains("cp210") || n.contains("silicon labs") {
        ("Get the CP210x driver (Silicon Labs)", "https://www.silabs.com/developer-tools/usb-to-uart-bridge-vcp-drivers")
    } else if n.contains("ftdi") || n.contains("ft232") {
        ("Get the FTDI driver", "https://ftdichip.com/drivers/vcp-drivers/")
    } else {
        ("Search Windows Update for a driver", "https://support.microsoft.com/windows/update-drivers-manually-in-windows-ec62f46c-ff14-c91d-eead-d7126dc1f7b6")
    };
    Fix { kind: "url", label: label.into(), command: None, url: Some(url.into()) }
}

/// Parse PowerShell output of problem devices: one FriendlyName per line.
pub fn parse_problem_devices(out: &str) -> Vec<String> {
    out.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect()
}

async fn check_windows_drivers() -> Option<Check> {
    if !cfg!(windows) {
        return None;
    }
    // Present USB / COM devices whose status is not OK → Windows has no
    // working driver (Device Manager shows them with a yellow mark).
    let script = "Get-PnpDevice -PresentOnly | Where-Object { $_.Status -ne 'OK' -and ($_.Class -eq 'Ports' -or $_.Class -eq 'USB' -or $_.Class -eq $null) } | Select-Object -ExpandProperty FriendlyName";
    let (_, out) = run("powershell", &["-NoProfile", "-Command", script]).await?;
    let bad = parse_problem_devices(&out);
    Some(if bad.is_empty() {
        Check {
            id: "drivers",
            title: "USB serial drivers".into(),
            status: Status::Ok,
            detail: "No USB device is missing a driver.".into(),
            fix: None,
        }
    } else {
        let first = bad[0].clone();
        Check {
            id: "drivers",
            title: "USB serial drivers".into(),
            status: Status::Warn,
            detail: format!(
                "Windows has no working driver for: {}. The board will not appear until the driver is installed.",
                bad.join(", ")
            ),
            fix: Some(driver_fix_for(&first)),
        }
    })
}

// ── Linux ────────────────────────────────────────────────────────────────

pub fn in_serial_group(groups_output: &str) -> bool {
    groups_output
        .split_whitespace()
        .any(|g| g == "dialout" || g == "uucp" || g == "tty")
}

async fn check_linux_serial_group() -> Option<Check> {
    if !cfg!(target_os = "linux") {
        return None;
    }
    let (_, out) = run("id", &["-nG"]).await?;
    Some(if in_serial_group(&out) {
        Check {
            id: "serial-group",
            title: "Serial port permission".into(),
            status: Status::Ok,
            detail: "Your user may open serial ports.".into(),
            fix: None,
        }
    } else {
        Check {
            id: "serial-group",
            title: "Serial port permission".into(),
            status: Status::Fail,
            detail: "Your user is not in the dialout group, so Linux refuses to open the board's port \
                     (\"Permission denied\"). Run the command, then log out and back in."
                .into(),
            fix: Some(Fix {
                kind: "command",
                label: "Add your user to dialout".into(),
                command: Some("sudo usermod -aG dialout $USER".into()),
                url: None,
            }),
        }
    })
}

async fn check_linux_brltty() -> Option<Check> {
    if !cfg!(target_os = "linux") {
        return None;
    }
    let installed = matches!(run("which", &["brltty"]).await, Some((true, _)));
    if !installed {
        return None;
    }
    Some(Check {
        id: "brltty",
        title: "brltty conflict".into(),
        status: Status::Warn,
        detail: "The brltty braille service is installed. On many distributions it grabs CH340 USB-serial \
                 adapters the moment they are plugged in, so the board's port disappears. Remove it unless you use a braille display."
            .into(),
        fix: Some(Fix {
            kind: "command",
            label: "Remove brltty".into(),
            command: Some("sudo apt remove brltty".into()),
            url: None,
        }),
    })
}

// ── macOS USB accessory permission ───────────────────────────────────────

pub fn macos_major(version: &str) -> Option<u32> {
    version.trim().split('.').next()?.parse().ok()
}

async fn check_macos_usb_permission() -> Option<Check> {
    if !cfg!(target_os = "macos") {
        return None;
    }
    let (_, v) = run("sw_vers", &["-productVersion"]).await?;
    if macos_major(&v)? < 15 {
        return None;
    }
    Some(Check {
        id: "usb-permission",
        title: "USB accessory permission".into(),
        status: Status::Info,
        detail: "macOS asks \"Allow accessory to connect?\" the first time a new USB device is plugged in. If that \
                 notification is dismissed the board stays invisible. Replug the board and allow it, or check \
                 System Settings → Privacy & Security → Allow accessories to connect."
            .into(),
        fix: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn df_available_column_is_parsed_in_bytes() {
        let out = "Filesystem   1024-blocks      Used Available Capacity  Mounted on\n\
                   /dev/disk3s5   482797652 172116948 284962808    38%   /System/Volumes/Data\n";
        assert_eq!(parse_df_avail_bytes(out), Some(284_962_808 * 1024));
        assert_eq!(parse_df_avail_bytes(""), None);
    }

    #[test]
    fn reachability_summary_grades_each_combination() {
        assert_eq!(summarize_reachability(true, true).0, Status::Ok);
        assert_eq!(summarize_reachability(false, false).0, Status::Fail);
        assert_eq!(summarize_reachability(true, false).0, Status::Warn);
        assert!(summarize_reachability(true, false).1.contains("github.com"));
    }

    #[test]
    fn driver_fix_points_at_the_right_vendor() {
        assert!(driver_fix_for("USB-SERIAL CH340").url.unwrap().contains("wch"));
        assert!(driver_fix_for("Silicon Labs CP210x USB to UART Bridge").url.unwrap().contains("silabs"));
        assert!(driver_fix_for("Unknown device").url.unwrap().contains("microsoft"));
    }

    #[test]
    fn problem_device_lines_are_trimmed_and_blank_lines_dropped() {
        assert_eq!(
            parse_problem_devices("  USB-SERIAL CH340  \n\nUnknown device\n"),
            vec!["USB-SERIAL CH340".to_string(), "Unknown device".to_string()]
        );
    }

    #[test]
    fn serial_group_membership() {
        assert!(in_serial_group("cse adm dialout plugdev"));
        assert!(in_serial_group("user uucp"));
        assert!(!in_serial_group("user adm sudo"));
    }

    #[test]
    fn macos_major_version() {
        assert_eq!(macos_major("26.6.2\n"), Some(26));
        assert_eq!(macos_major("14.7"), Some(14));
        assert_eq!(macos_major(""), None);
    }
}
