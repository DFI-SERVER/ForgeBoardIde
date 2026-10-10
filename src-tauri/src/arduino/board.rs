use super::cli;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A board offered by an installed platform.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Board {
    pub fqbn: String,
    pub name: String,
    pub platform: String,
}

/// A board / port detected on the machine right now.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DetectedBoard {
    pub port: String,
    pub fqbn: Option<String>,
    pub name: Option<String>,
    /// USB vendor / product id as 4 hex digits, when known.
    #[serde(default)]
    pub vid: Option<String>,
    #[serde(default)]
    pub pid: Option<String>,
    /// USB serial number — stable across replugs and resets, so the IDE can
    /// remember a board's identity without probing it again.
    #[serde(default)]
    pub serial_number: Option<String>,
}

/// On macOS every USB serial device appears twice, as `/dev/cu.*` (call-out,
/// the one to use) and `/dev/tty.*` (dial-in, blocks on open). Keep the
/// `cu.` names when any exist; elsewhere keep everything.
pub fn prefer_callout_ports(mut names: Vec<DetectedBoard>) -> Vec<DetectedBoard> {
    let has_cu = names.iter().any(|p| p.port.starts_with("/dev/cu."));
    if has_cu {
        names.retain(|p| !p.port.starts_with("/dev/tty."));
    }
    names.sort_by(|a, b| a.port.cmp(&b.port));
    names
}

/// Enumerate USB serial ports natively (milliseconds, no child process) —
/// the fast path the board watcher polls every second. Only USB devices
/// are returned, which drops Bluetooth and other phantom ports the same way
/// `parse_detected_ports` does. Names and FQBNs are filled in later by
/// `detect::identify`, once, when the board is first connected.
pub fn enumerate_usb_serial_ports() -> Result<Vec<DetectedBoard>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for p in ports {
        if let serialport::SerialPortType::UsbPort(info) = p.port_type {
            out.push(DetectedBoard {
                port: p.port_name,
                fqbn: None,
                name: info.product.clone(),
                vid: Some(format!("{:04X}", info.vid)),
                pid: Some(format!("{:04X}", info.pid)),
                serial_number: info.serial_number.clone(),
            });
        }
    }
    Ok(prefer_callout_ports(out))
}

/// List boards from installed platforms (`arduino-cli board listall`).
/// Parsed defensively — arduino-cli's JSON shape varies between versions.
pub async fn list_installed_boards(app: &tauri::AppHandle) -> Result<Vec<Board>, String> {
    let out = cli::run_capture(app, &["board", "listall", "--format", "json"]).await?;
    let v: Value = serde_json::from_str(&out).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    if let Some(boards) = v.get("boards").and_then(Value::as_array) {
        for b in boards {
            let fqbn = b.get("fqbn").and_then(Value::as_str).unwrap_or("").to_string();
            if fqbn.is_empty() {
                continue;
            }
            let name = b.get("name").and_then(Value::as_str).unwrap_or("").to_string();
            let platform = b
                .pointer("/platform/id")
                .or_else(|| b.pointer("/platform/metadata/id"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            result.push(Board { fqbn, name, platform });
        }
    }
    Ok(result)
}

/// Detect boards / ports connected right now (`arduino-cli board list`),
/// filtered to genuine USB boards — see [`parse_detected_ports`].
pub async fn detect_boards(app: &tauri::AppHandle) -> Result<Vec<DetectedBoard>, String> {
    // Fast path: native USB enumeration. Falls back to arduino-cli's
    // `board list` (a child process, ~0.5–1 s) only if the native call fails.
    if let Ok(Ok(ports)) = tokio::task::spawn_blocking(enumerate_usb_serial_ports).await {
        return Ok(ports);
    }
    let out = cli::run_capture(app, &["board", "list", "--format", "json"]).await?;
    parse_detected_ports(&out)
}

/// Parse the `detected_ports` array of an `arduino-cli board list` payload
/// into [`DetectedBoard`]s, **keeping only genuine boards**.
///
/// arduino-cli reports every serial port the OS exposes — including phantom
/// COM ports with no hardware behind them (Bluetooth virtual ports, legacy
/// serial bridges). Those enumerate with an empty `properties` object and no
/// USB vendor ID, whereas a real USB-attached board always carries a `vid`.
/// A port is therefore kept only when `port.properties.vid` is present and
/// non-empty.
fn parse_detected_ports(out: &str) -> Result<Vec<DetectedBoard>, String> {
    let v: Value = serde_json::from_str(out).map_err(|e| e.to_string())?;
    if let Some(fatal) = fatal_scan_warning(&v) {
        return Err(fatal);
    }
    let mut result = Vec::new();
    if let Some(ports) = v.get("detected_ports").and_then(Value::as_array) {
        for p in ports {
            let port = p
                .pointer("/port/address")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if port.is_empty() {
                continue;
            }
            // A genuine board enumerates over USB and carries a vendor ID;
            // phantom OS serial ports (Bluetooth, legacy bridges) report an
            // empty `properties` with no `vid`, so they are dropped here.
            let has_usb_vid = p
                .pointer("/port/properties/vid")
                .and_then(Value::as_str)
                .map(|vid| !vid.is_empty())
                .unwrap_or(false);
            if !has_usb_vid {
                continue;
            }
            let fqbn = p
                .pointer("/matching_boards/0/fqbn")
                .and_then(Value::as_str)
                .map(String::from);
            let name = p
                .pointer("/matching_boards/0/name")
                .and_then(Value::as_str)
                .map(String::from);
            let prop = |k: &str| p.pointer(&format!("/port/properties/{k}")).and_then(Value::as_str).map(|s| s.trim_start_matches("0x").to_uppercase());
            result.push(DetectedBoard {
                port,
                fqbn,
                name,
                vid: prop("vid"),
                pid: prop("pid"),
                serial_number: p.pointer("/port/properties/serialNumber").and_then(Value::as_str).map(String::from),
            });
        }
    }
    Ok(result)
}

/// `board list` exits 0 even when it could not scan at all — it just returns
/// an empty `detected_ports` and explains itself in a `warnings` array. The
/// one case that makes every scan meaningless is a missing
/// `builtin:serial-discovery` tool: arduino-cli downloads it on first use, so
/// a fresh install with no internet never gets it and would otherwise look
/// like "no board plugged in" forever. Surface that as an error instead.
fn fatal_scan_warning(v: &Value) -> Option<String> {
    let warnings = v.get("warnings").and_then(Value::as_array)?;
    let missing_discovery = warnings
        .iter()
        .filter_map(Value::as_str)
        .any(|w| w.contains("serial-discovery not found"));
    if !missing_discovery {
        return None;
    }
    let offline = warnings
        .iter()
        .filter_map(Value::as_str)
        .any(|w| w.contains("Error downloading index"));
    Some(if offline {
        "serial-discovery tool missing: arduino-cli could not download it (no internet connection)"
            .to_string()
    } else {
        "serial-discovery tool missing: arduino-cli has not downloaded it yet".to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_discovery_tool_is_an_error_not_an_empty_list() {
        // Verbatim shape of a fresh, offline install (macOS, 2026-10-08).
        let json = r#"{
            "detected_ports": [],
            "warnings": [
                "Error initializing instance: Error downloading index 'https://downloads.arduino.cc/libraries/library_index.tar.bz2': Download failed: dial tcp: connection refused",
                "Error initializing instance: Error loading hardware platform: discovery builtin:serial-discovery not found"
            ]
        }"#;
        let err = parse_detected_ports(json).unwrap_err();
        assert!(err.contains("serial-discovery"), "{err}");
        assert!(err.contains("no internet"), "{err}");
    }

    #[test]
    fn harmless_warnings_do_not_block_detection() {
        let json = r#"{
            "detected_ports": [
                { "port": { "address": "COM9",
                            "properties": { "vid": "0x1A86", "pid": "0x7523" } } }
            ],
            "warnings": [ "Error initializing instance: Loading index file: reading library_index.json: no such file" ]
        }"#;
        assert_eq!(parse_detected_ports(json).unwrap().len(), 1);
    }

    /// A `board list` payload shaped exactly like real arduino-cli output on
    /// Windows: two phantom serial ports (empty `properties`, no USB vid) and
    /// one genuine USB board — an ESP32-S3, Espressif vid `0x303A`.
    const BOARD_LIST_JSON: &str = r#"{
        "detected_ports": [
            { "port": { "address": "COM5", "protocol": "serial",
                        "protocol_label": "Serial Port", "properties": {} } },
            { "port": { "address": "COM6", "protocol": "serial",
                        "protocol_label": "Serial Port", "properties": {} } },
            {
                "matching_boards": [
                    { "name": "ESP32 Family Device",
                      "fqbn": "esp32:esp32:esp32_family" }
                ],
                "port": {
                    "address": "COM4",
                    "protocol": "serial",
                    "protocol_label": "Serial Port (USB)",
                    "properties": { "pid": "0x1001", "vid": "0x303A" }
                }
            }
        ]
    }"#;

    #[test]
    fn keeps_only_usb_ports_dropping_phantom_serial_ports() {
        let boards = parse_detected_ports(BOARD_LIST_JSON).unwrap();
        assert_eq!(
            boards.len(),
            1,
            "the two empty-`properties` phantom ports must be dropped",
        );
        assert_eq!(boards[0].port, "COM4");
        assert_eq!(boards[0].fqbn.as_deref(), Some("esp32:esp32:esp32_family"));
        assert_eq!(boards[0].name.as_deref(), Some("ESP32 Family Device"));
    }

    #[test]
    fn keeps_a_usb_port_that_has_no_matching_board() {
        // A real USB board arduino-cli does not recognise: a vid is present
        // but matching_boards is absent. It must still be listed (the UI
        // shows it as "Unknown board") so the user can select it manually.
        let json = r#"{
            "detected_ports": [
                { "port": { "address": "COM9",
                            "properties": { "vid": "0x1A86", "pid": "0x7523" } } }
            ]
        }"#;
        let boards = parse_detected_ports(json).unwrap();
        assert_eq!(boards.len(), 1);
        assert_eq!(boards[0].port, "COM9");
        assert!(boards[0].fqbn.is_none());
        assert!(boards[0].name.is_none());
    }

    #[test]
    fn treats_an_empty_vid_string_as_no_vid() {
        let json = r#"{
            "detected_ports": [
                { "port": { "address": "COM3", "properties": { "vid": "" } } }
            ]
        }"#;
        assert!(parse_detected_ports(json).unwrap().is_empty());
    }

    #[test]
    fn drops_a_port_with_no_properties_object() {
        let json = r#"{ "detected_ports": [ { "port": { "address": "COM1" } } ] }"#;
        assert!(parse_detected_ports(json).unwrap().is_empty());
    }

    #[test]
    fn skips_a_port_with_an_empty_address() {
        let json = r#"{
            "detected_ports": [
                { "port": { "address": "", "properties": { "vid": "0x303A" } } }
            ]
        }"#;
        assert!(parse_detected_ports(json).unwrap().is_empty());
    }

    #[test]
    fn a_missing_detected_ports_array_yields_an_empty_list() {
        assert!(parse_detected_ports("{}").unwrap().is_empty());
    }

    #[test]
    fn invalid_json_is_an_error() {
        assert!(parse_detected_ports("not json").is_err());
    }
}

// ── Board options (`board details`) ─────────────────────────────────────

/// One selectable value of a board option.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct BoardOptionValue {
    pub value: String,
    pub label: String,
    /// The platform's default for this option.
    pub selected: bool,
}

/// One board option as the platform's boards.txt menu declares it — e.g.
/// `CDCOnBoot` "USB CDC On Boot" with values Disabled / Enabled. The chosen
/// value is appended to the FQBN as `:CDCOnBoot=cdc`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct BoardOption {
    pub option: String,
    pub label: String,
    pub values: Vec<BoardOptionValue>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Programmer {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct BoardDetails {
    pub fqbn: String,
    pub name: String,
    pub options: Vec<BoardOption>,
    pub programmers: Vec<Programmer>,
}

/// Parse `board details -b <fqbn> --format json`.
pub fn parse_board_details(out: &str) -> Result<BoardDetails, String> {
    let v: Value = serde_json::from_str(out).map_err(|e| e.to_string())?;
    let s = |x: &Value, k: &str| x.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    let mut options = Vec::new();
    if let Some(arr) = v.get("config_options").and_then(Value::as_array) {
        for o in arr {
            let option = s(o, "option");
            if option.is_empty() {
                continue;
            }
            let label = {
                let l = s(o, "option_label");
                if l.is_empty() { option.clone() } else { l }
            };
            let values = o
                .get("values")
                .and_then(Value::as_array)
                .map(|vs| {
                    vs.iter()
                        .filter_map(|x| {
                            let value = s(x, "value");
                            if value.is_empty() {
                                return None;
                            }
                            let label = {
                                let l = s(x, "value_label");
                                if l.is_empty() { value.clone() } else { l }
                            };
                            let selected = x.get("selected").and_then(Value::as_bool).unwrap_or(false);
                            Some(BoardOptionValue { value, label, selected })
                        })
                        .collect()
                })
                .unwrap_or_default();
            options.push(BoardOption { option, label, values });
        }
    }
    let programmers = v
        .get("programmers")
        .and_then(Value::as_array)
        .map(|ps| {
            ps.iter()
                .filter_map(|p| {
                    let id = s(p, "id");
                    if id.is_empty() {
                        return None;
                    }
                    let name = {
                        let n = s(p, "name");
                        if n.is_empty() { id.clone() } else { n }
                    };
                    Some(Programmer { id, name })
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(BoardDetails { fqbn: s(&v, "fqbn"), name: s(&v, "name"), options, programmers })
}

/// The options and programmers a board offers (`arduino-cli board details`).
/// `fqbn` should be the bare board id; options already in it are reflected
/// as `selected`.
pub async fn details(app: &tauri::AppHandle, fqbn: &str) -> Result<BoardDetails, String> {
    let out = cli::run_capture(app, &["board", "details", "-b", fqbn, "--format", "json"]).await?;
    parse_board_details(&out)
}

#[cfg(test)]
mod details_tests {
    use super::*;

    #[test]
    fn board_details_options_and_programmers_are_parsed() {
        // Trimmed from `board details -b esp32:esp32:esp32s3` (esp32 3.3.x).
        let json = r#"{
            "fqbn": "esp32:esp32:esp32s3", "name": "ESP32S3 Dev Module",
            "config_options": [
                { "option": "CDCOnBoot", "option_label": "USB CDC On Boot", "values": [
                    { "value": "default", "value_label": "Disabled", "selected": true },
                    { "value": "cdc", "value_label": "Enabled" } ] },
                { "option": "UploadSpeed", "values": [ { "value": "921600", "value_label": "921600", "selected": true } ] }
            ],
            "programmers": [ { "id": "esptool", "name": "Esptool" } ]
        }"#;
        let d = parse_board_details(json).unwrap();
        assert_eq!(d.name, "ESP32S3 Dev Module");
        assert_eq!(d.options.len(), 2);
        assert_eq!(d.options[0].label, "USB CDC On Boot");
        assert_eq!(d.options[0].values[1], BoardOptionValue { value: "cdc".into(), label: "Enabled".into(), selected: false });
        assert_eq!(d.options[1].label, "UploadSpeed", "label falls back to the option id");
        assert_eq!(d.programmers, vec![Programmer { id: "esptool".into(), name: "Esptool".into() }]);
    }
}

#[cfg(test)]
mod enumerate_tests {
    use super::*;

    fn p(port: &str) -> DetectedBoard {
        DetectedBoard { port: port.into(), fqbn: None, name: None, vid: None, pid: None, serial_number: None }
    }

    #[test]
    fn macos_keeps_callout_names_and_drops_dialin_twins() {
        let v = prefer_callout_ports(vec![p("/dev/tty.usbmodem31201"), p("/dev/cu.usbmodem31201")]);
        assert_eq!(v.iter().map(|x| x.port.as_str()).collect::<Vec<_>>(), vec!["/dev/cu.usbmodem31201"]);
    }

    #[test]
    fn other_platforms_keep_everything_sorted() {
        let v = prefer_callout_ports(vec![p("COM7"), p("COM3")]);
        assert_eq!(v.iter().map(|x| x.port.as_str()).collect::<Vec<_>>(), vec!["COM3", "COM7"]);
    }

    #[test]
    fn board_list_fills_usb_identity_fields() {
        let json = r#"{ "detected_ports": [ { "port": { "address": "COM4", "properties": { "pid": "0x1001", "vid": "0x303A", "serialNumber": "AB12" } } } ] }"#;
        let b = &parse_detected_ports(json).unwrap()[0];
        assert_eq!(b.vid.as_deref(), Some("303A"));
        assert_eq!(b.serial_number.as_deref(), Some("AB12"));
    }
}
