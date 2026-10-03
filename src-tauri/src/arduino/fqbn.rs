//! Board-FQBN normalisation — fills in board options that need a
//! non-default value for the IDE to behave correctly.

/// Normalize a board FQBN before it is handed to `arduino-cli`.
///
/// The IDE selects boards as bare FQBNs (e.g. `esp32:esp32:esp32s3`), which
/// leaves every board option at its default. For the ESP32-S3 the default of
/// `CDCOnBoot` is *Disabled* — that routes `Serial` to UART0 instead of the
/// native USB port, so the Serial Monitor on a USB-connected board shows
/// nothing. This appends `CDCOnBoot=cdc` to a generic ESP32-S3 FQBN so a
/// freshly flashed sketch prints over USB out of the box.
///
/// An FQBN that already specifies `CDCOnBoot`, and any non-ESP32-S3 board,
/// is returned unchanged.
///
/// Note: an earlier session briefly removed this normalisation while
/// chasing a "won't upload to one specific board" bug. The actual cause
/// turned out to be arduino-cli 1.5.0 (which we replaced with 1.4.1 in
/// `src-tauri/binaries/` and pinned in `scripts/download-arduino-cli.ps1`).
/// CDCOnBoot=cdc itself is not implicated.
pub fn normalize_fqbn(fqbn: &str) -> String {
    // An FQBN is `vendor:arch:board` with an optional 4th `:`-separated
    // field of comma-separated `option=value` pairs.
    let mut parts = fqbn.splitn(4, ':');
    let vendor = parts.next().unwrap_or("");
    let arch = parts.next().unwrap_or("");
    let board = parts.next().unwrap_or("");
    let options = parts.next().unwrap_or("");

    if !(vendor == "esp32" && arch == "esp32" && board == "esp32s3") {
        return fqbn.to_string();
    }
    if options.contains("CDCOnBoot=") {
        return fqbn.to_string(); // the caller already chose — respect it
    }
    if options.is_empty() {
        "esp32:esp32:esp32s3:CDCOnBoot=cdc".to_string()
    } else {
        format!("esp32:esp32:esp32s3:{options},CDCOnBoot=cdc")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_cdc_on_boot_to_a_bare_esp32s3_fqbn() {
        assert_eq!(
            normalize_fqbn("esp32:esp32:esp32s3"),
            "esp32:esp32:esp32s3:CDCOnBoot=cdc",
        );
    }

    #[test]
    fn respects_an_explicit_cdc_on_boot_choice() {
        let enabled = "esp32:esp32:esp32s3:CDCOnBoot=cdc";
        assert_eq!(normalize_fqbn(enabled), enabled);
        let disabled = "esp32:esp32:esp32s3:CDCOnBoot=default";
        assert_eq!(normalize_fqbn(disabled), disabled);
    }

    #[test]
    fn preserves_other_board_options_when_adding_cdc_on_boot() {
        assert_eq!(
            normalize_fqbn("esp32:esp32:esp32s3:FlashSize=4M"),
            "esp32:esp32:esp32s3:FlashSize=4M,CDCOnBoot=cdc",
        );
    }

    #[test]
    fn leaves_the_classic_esp32_untouched() {
        // The classic ESP32 has no USB peripheral and so no CDCOnBoot menu;
        // adding the option would make the FQBN invalid.
        assert_eq!(normalize_fqbn("esp32:esp32:esp32"), "esp32:esp32:esp32");
    }

    #[test]
    fn leaves_other_boards_untouched() {
        assert_eq!(normalize_fqbn("esp32:esp32:esp32c3"), "esp32:esp32:esp32c3");
        assert_eq!(normalize_fqbn("arduino:avr:uno"), "arduino:avr:uno");
    }
}
