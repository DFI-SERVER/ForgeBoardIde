//! Reproducible-build profile parsing for `sketch.yaml`.
//!
//! Per the arduino-cli sketch.yaml spec, a sketch may contain a `sketch.yaml`
//! in its root that pins platforms, libraries, and an FQBN under named
//! profiles. When such a file is present we expose the profile list to the
//! frontend so the user can pick one — selected profiles are then forwarded
//! to arduino-cli as `--profile <name>` on compile and upload, replacing the
//! global FQBN. See:
//!   https://docs.arduino.cc/arduino-cli/sketch-project-file/
//!
//! We only need the subset of the schema that drives the UI: profile names,
//! their FQBN, and optional notes. Anything else in the file (platforms,
//! libraries, indexes) is preserved by arduino-cli itself — we do not
//! re-parse it.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

/// One profile entry, surfaced to the UI.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct ProfileInfo {
    pub name: String,
    pub fqbn: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

/// The full parsed sketch.yaml view consumed by the frontend.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct SketchProfiles {
    pub profiles: Vec<ProfileInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_profile: Option<String>,
}

/// Raw shape of `sketch.yaml`, just enough to extract profile names/FQBN/notes.
///
/// `profiles` is a YAML map of `<name>: { fqbn, notes, ... }`. We keep it as a
/// `BTreeMap` so a re-parse of the same file always returns profiles in a
/// stable order — the frontend relies on order for the dropdown.
#[derive(Deserialize, Debug)]
struct RawDoc {
    #[serde(default)]
    profiles: BTreeMap<String, RawProfile>,
    #[serde(default)]
    default_profile: Option<String>,
}

#[derive(Deserialize, Debug)]
struct RawProfile {
    #[serde(default)]
    fqbn: Option<String>,
    #[serde(default)]
    notes: Option<String>,
}

/// Read profiles from a sketch folder.
///
/// `sketch_path` may be either the sketch directory itself or a file inside
/// the sketch — the function resolves the directory and looks for
/// `sketch.yaml` at its root.
///
/// Returns:
/// - `Ok(None)` when no `sketch.yaml` exists.
/// - `Ok(Some(_))` with parsed profiles when one exists, even if it has zero
///   profile entries (the empty list still tells the UI "yaml exists").
/// - `Err(_)` only on read or YAML parse failure — the UI surfaces this as
///   a soft warning, not a fatal error.
pub fn read_profiles(sketch_path: &Path) -> Result<Option<SketchProfiles>, String> {
    let dir = if sketch_path.is_dir() {
        sketch_path.to_path_buf()
    } else {
        match sketch_path.parent() {
            Some(p) => p.to_path_buf(),
            None => return Ok(None),
        }
    };
    let yaml = dir.join("sketch.yaml");
    if !yaml.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&yaml).map_err(|e| e.to_string())?;
    parse_profiles_text(&text).map(Some)
}

/// Parse the contents of a `sketch.yaml` into the UI view.
///
/// Exposed so unit tests can exercise the parser without touching disk.
pub fn parse_profiles_text(text: &str) -> Result<SketchProfiles, String> {
    let raw: RawDoc = serde_yaml::from_str(text).map_err(|e| e.to_string())?;
    let profiles = raw
        .profiles
        .into_iter()
        .filter_map(|(name, p)| {
            // A profile without an FQBN cannot be used to build — drop it
            // rather than presenting a broken option to the user.
            p.fqbn.map(|fqbn| ProfileInfo {
                name,
                fqbn,
                notes: p.notes,
            })
        })
        .collect();
    Ok(SketchProfiles {
        profiles,
        default_profile: raw.default_profile,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_single_profile() {
        let yaml = r#"
profiles:
  nanorp:
    notes: ESP32-S3 dev profile
    fqbn: arduino:mbed_nano:nanorp2040connect
default_profile: nanorp
"#;
        let parsed = parse_profiles_text(yaml).unwrap();
        assert_eq!(parsed.profiles.len(), 1);
        assert_eq!(parsed.profiles[0].name, "nanorp");
        assert_eq!(
            parsed.profiles[0].fqbn,
            "arduino:mbed_nano:nanorp2040connect"
        );
        assert_eq!(
            parsed.profiles[0].notes.as_deref(),
            Some("ESP32-S3 dev profile")
        );
        assert_eq!(parsed.default_profile.as_deref(), Some("nanorp"));
    }

    #[test]
    fn parses_multiple_profiles_sorted() {
        // Iterator order over BTreeMap is alphabetical — relied on by the UI.
        let yaml = r#"
profiles:
  release:
    fqbn: esp32:esp32:esp32
  nanorp:
    fqbn: arduino:mbed_nano:nanorp2040connect
"#;
        let parsed = parse_profiles_text(yaml).unwrap();
        let names: Vec<_> = parsed.profiles.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, vec!["nanorp", "release"]);
        assert!(parsed.default_profile.is_none());
    }

    #[test]
    fn drops_profile_without_fqbn() {
        let yaml = r#"
profiles:
  broken:
    notes: missing fqbn
  ok:
    fqbn: esp32:esp32:esp32
"#;
        let parsed = parse_profiles_text(yaml).unwrap();
        assert_eq!(parsed.profiles.len(), 1);
        assert_eq!(parsed.profiles[0].name, "ok");
    }

    #[test]
    fn empty_profiles_section_is_ok() {
        let yaml = "profiles:\n";
        let parsed = parse_profiles_text(yaml).unwrap();
        assert!(parsed.profiles.is_empty());
        assert!(parsed.default_profile.is_none());
    }

    #[test]
    fn ignores_unknown_keys() {
        // platforms / libraries / indexes are part of the real spec but the UI
        // does not need them. The parser must not fail when they are present.
        let yaml = r#"
profiles:
  nanorp:
    fqbn: arduino:mbed_nano:nanorp2040connect
    platforms:
      - platform: "arduino:mbed_nano (2.1.0)"
        platform_index_url: https://example.com/idx.json
    libraries:
      - ArduinoIoTCloud (1.0.2)
default_profile: nanorp
"#;
        let parsed = parse_profiles_text(yaml).unwrap();
        assert_eq!(parsed.profiles.len(), 1);
        assert_eq!(parsed.profiles[0].name, "nanorp");
    }

    #[test]
    fn malformed_yaml_returns_err() {
        // Tabs are not valid YAML indentation — must surface as a parse error.
        let yaml = "profiles:\n\tbad: { fqbn: x }";
        assert!(parse_profiles_text(yaml).is_err());
    }

    #[test]
    fn read_profiles_returns_none_when_no_yaml() {
        let tmp = std::env::temp_dir().join(format!(
            "forgeboard-profiles-test-none-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&tmp).unwrap();
        let res = read_profiles(&tmp).unwrap();
        assert!(res.is_none());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn read_profiles_finds_sibling_yaml_from_file_path() {
        let tmp = std::env::temp_dir().join(format!(
            "forgeboard-profiles-test-file-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&tmp).unwrap();
        let yaml = tmp.join("sketch.yaml");
        std::fs::write(
            &yaml,
            "profiles:\n  dev:\n    fqbn: esp32:esp32:esp32\n",
        )
        .unwrap();
        // Pass a file path inside the sketch dir — function must resolve to dir.
        let ino = tmp.join("sketch.ino");
        std::fs::write(&ino, "void setup(){}").unwrap();
        let res = read_profiles(&ino).unwrap().unwrap();
        assert_eq!(res.profiles.len(), 1);
        assert_eq!(res.profiles[0].name, "dev");
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
