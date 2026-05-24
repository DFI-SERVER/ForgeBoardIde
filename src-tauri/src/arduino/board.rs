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
            result.push(DetectedBoard { port, fqbn, name });
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

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
