//! Discovery of example sketches that ship inside installed Arduino libraries.
//!
//! An Arduino library may carry an `examples/` folder; each example is itself a
//! sketch folder — `examples/<Name>/<Name>.ino`. Libraries the user installs
//! land under arduino-cli's configured `directories.user/libraries`. Scanning
//! that tree lets library examples appear in the Examples view as soon as a
//! library is installed, with no arduino-cli round-trip per scan.
//!
//! The curated *starter* examples are bundled with the app as frontend data
//! (see `src/lib/example-catalog.ts`); this module only handles the dynamic,
//! installed-library set.

use super::cli;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::OnceLock;

/// One example sketch found inside an installed library.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct LibraryExample {
    /// The example's folder name, e.g. `Blink`.
    pub name: String,
    /// The library the example belongs to, e.g. `Adafruit NeoPixel`.
    pub library: String,
    /// Absolute path to the example's main `.ino` file.
    pub ino_path: PathBuf,
    /// Absolute path to the example's folder (the sketch folder to copy).
    pub folder_path: PathBuf,
}

/// Fallback libraries root used when arduino-cli can't tell us where its user
/// directory is — `~/Documents/ForgeBoard/libraries`, where the project's own
/// sketchbook lives. This kept being the default before FIX 10; it stays as
/// the safety net so a missing arduino-cli doesn't break example discovery.
fn fallback_libraries_root() -> Option<PathBuf> {
    dirs::document_dir().map(|d| d.join("ForgeBoard").join("libraries"))
}

/// Parse arduino-cli's `config dump --format json` payload and extract the
/// effective `directories.user` path. Returns `None` when the field is
/// missing or not a string. Pulled out so the JSON shape can be unit-tested
/// without spinning up a real arduino-cli process.
pub(crate) fn parse_arduino_user_dir(config_json: &str) -> Option<PathBuf> {
    let v: Value = serde_json::from_str(config_json).ok()?;
    // The config payload uses dotted-string keys at the top level (Arduino's
    // viper-style YAML→JSON dump): `"directories.user": "..."`. Some builds
    // also nest it as a real object (`{"directories": {"user": "..."}}`).
    // Accept both shapes so a future arduino-cli release that switches one
    // way or the other still works.
    if let Some(s) = v.get("directories.user").and_then(Value::as_str) {
        return Some(PathBuf::from(s));
    }
    if let Some(s) = v
        .get("directories")
        .and_then(|d| d.get("user"))
        .and_then(Value::as_str)
    {
        return Some(PathBuf::from(s));
    }
    None
}

/// Cached `directories.user/libraries` for the session — once arduino-cli has
/// told us where it installs libraries, we don't re-run `config dump` on every
/// example scan.
static LIBRARIES_ROOT_CACHE: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

fn cache_cell() -> &'static Mutex<Option<PathBuf>> {
    LIBRARIES_ROOT_CACHE.get_or_init(|| Mutex::new(None))
}

/// Ask arduino-cli for its effective `directories.user`, append `libraries`,
/// and cache the result for the rest of the session. On any error — arduino-cli
/// missing, JSON shape unexpected — fall back to the hardcoded
/// `~/Documents/ForgeBoard/libraries` so example discovery still produces
/// something useful in a test scenario.
pub async fn libraries_root(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(guard) = cache_cell().lock() {
        if let Some(cached) = guard.as_ref() {
            return Some(cached.clone());
        }
    }
    let resolved = match cli::run_capture(app, &["config", "dump", "--format", "json"]).await {
        Ok(json) => parse_arduino_user_dir(&json)
            .map(|p| p.join("libraries"))
            .or_else(fallback_libraries_root),
        Err(_) => fallback_libraries_root(),
    };
    if let Some(path) = &resolved {
        if let Ok(mut guard) = cache_cell().lock() {
            *guard = Some(path.clone());
        }
    }
    resolved
}

/// Test-only reset hook — clears the cached libraries root so a test that
/// exercises the path resolution can run repeatedly without leaking state.
#[cfg(test)]
fn reset_libraries_root_cache() {
    if let Ok(mut guard) = cache_cell().lock() {
        *guard = None;
    }
}

/// Find the example's main `.ino` inside `example_dir`.
///
/// An Arduino example folder normally contains `<FolderName>/<FolderName>.ino`,
/// but the `.ino` is sometimes named differently from its folder. Prefer the
/// matching-name file; otherwise fall back to the first `.ino` in the folder
/// so a slightly non-standard example still opens.
fn find_example_ino(example_dir: &Path) -> Option<PathBuf> {
    let folder_name = example_dir.file_name()?.to_str()?;
    let preferred = example_dir.join(format!("{folder_name}.ino"));
    if preferred.is_file() {
        return Some(preferred);
    }
    let mut first_ino: Option<PathBuf> = None;
    for entry in std::fs::read_dir(example_dir).ok()?.flatten() {
        let path = entry.path();
        let is_ino = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("ino"))
            .unwrap_or(false);
        if is_ino && path.is_file() {
            first_ino.get_or_insert(path);
        }
    }
    first_ino
}

/// Collect every example sketch directly inside a library's `examples/` folder.
///
/// Only the immediate children of `examples/` are treated as example sketches.
/// Some libraries nest examples in category sub-folders; those are also
/// descended one level so grouped examples are not missed, while deep trees are
/// not walked exhaustively.
fn scan_library_examples(library_name: &str, examples_dir: &Path, out: &mut Vec<LibraryExample>) {
    let Ok(entries) = std::fs::read_dir(examples_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if let Some(ino) = find_example_ino(&path) {
            let name = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("Example")
                .to_string();
            out.push(LibraryExample {
                name,
                library: library_name.to_string(),
                ino_path: ino,
                folder_path: path,
            });
            continue;
        }
        // No `.ino` directly here — treat this as a category folder and look
        // one level deeper for grouped examples.
        if let Ok(nested) = std::fs::read_dir(&path) {
            for sub in nested.flatten() {
                let sub_path = sub.path();
                if !sub_path.is_dir() {
                    continue;
                }
                if let Some(ino) = find_example_ino(&sub_path) {
                    let name = sub_path
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Example")
                        .to_string();
                    out.push(LibraryExample {
                        name,
                        library: library_name.to_string(),
                        ino_path: ino,
                        folder_path: sub_path,
                    });
                }
            }
        }
    }
}

/// List example sketches found in the `examples/` folders of installed
/// libraries under the given `libraries_root`.
///
/// Returns an empty list (never an error) when no libraries are installed or
/// the libraries directory does not exist yet — a fresh install simply has no
/// library examples, and the curated starter set is still shown by the UI.
/// Results are sorted by library, then example name, so the UI can group them.
///
/// The caller (the Tauri command) resolves `libraries_root` from arduino-cli's
/// `directories.user/libraries`; tests can pass any path they want.
pub fn list_library_examples_in(root: &Path) -> Vec<LibraryExample> {
    let mut out = Vec::new();
    let Ok(libraries) = std::fs::read_dir(root) else {
        return out;
    };
    for lib_entry in libraries.flatten() {
        let lib_path = lib_entry.path();
        if !lib_path.is_dir() {
            continue;
        }
        let library_name = match lib_path.file_name().and_then(|s| s.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        // An Arduino library's examples live under `examples/`; some libraries
        // capitalise it as `Examples`. Accept either.
        for dir_name in ["examples", "Examples"] {
            let examples_dir = lib_path.join(dir_name);
            if examples_dir.is_dir() {
                scan_library_examples(&library_name, &examples_dir, &mut out);
                break;
            }
        }
    }
    out.sort_by(|a, b| {
        a.library
            .to_lowercase()
            .cmp(&b.library.to_lowercase())
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmpdir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("fb-ide-ex-{}", rand::random::<u32>()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    /// Build a fake library with a standard `examples/<Name>/<Name>.ino` layout.
    fn make_library(root: &Path, lib: &str, examples: &[&str]) {
        let ex_dir = root.join(lib).join("examples");
        for ex in examples {
            let dir = ex_dir.join(ex);
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join(format!("{ex}.ino")), "void setup(){}\nvoid loop(){}").unwrap();
        }
    }

    #[test]
    fn find_example_ino_prefers_matching_name() {
        let dir = tmpdir();
        let ex = dir.join("Blink");
        fs::create_dir_all(&ex).unwrap();
        fs::write(ex.join("Blink.ino"), "x").unwrap();
        fs::write(ex.join("helper.ino"), "y").unwrap();
        assert_eq!(find_example_ino(&ex), Some(ex.join("Blink.ino")));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn find_example_ino_falls_back_to_any_ino() {
        let dir = tmpdir();
        let ex = dir.join("Odd");
        fs::create_dir_all(&ex).unwrap();
        fs::write(ex.join("sketch.ino"), "x").unwrap();
        assert_eq!(find_example_ino(&ex), Some(ex.join("sketch.ino")));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn find_example_ino_returns_none_without_an_ino() {
        let dir = tmpdir();
        let ex = dir.join("Empty");
        fs::create_dir_all(&ex).unwrap();
        fs::write(ex.join("readme.txt"), "x").unwrap();
        assert_eq!(find_example_ino(&ex), None);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn scan_collects_standard_examples_sorted() {
        let dir = tmpdir();
        let ex_dir = dir.join("examples");
        for ex in ["Strandtest", "Buttoncycler"] {
            let d = ex_dir.join(ex);
            fs::create_dir_all(&d).unwrap();
            fs::write(d.join(format!("{ex}.ino")), "void setup(){}").unwrap();
        }
        let mut out = Vec::new();
        scan_library_examples("Adafruit NeoPixel", &ex_dir, &mut out);
        assert_eq!(out.len(), 2);
        assert!(out.iter().all(|e| e.library == "Adafruit NeoPixel"));
        let names: Vec<&str> = out.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"Strandtest"));
        assert!(names.contains(&"Buttoncycler"));
        for e in &out {
            assert!(e.ino_path.is_file());
            assert!(e.folder_path.is_dir());
        }
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn scan_descends_one_level_into_category_folders() {
        let dir = tmpdir();
        let ex_dir = dir.join("examples");
        // A category folder with no .ino of its own, holding two examples.
        let category = ex_dir.join("Basics");
        for ex in ["Hello", "World"] {
            let d = category.join(ex);
            fs::create_dir_all(&d).unwrap();
            fs::write(d.join(format!("{ex}.ino")), "void setup(){}").unwrap();
        }
        let mut out = Vec::new();
        scan_library_examples("SomeLib", &ex_dir, &mut out);
        let names: Vec<&str> = out.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(out.len(), 2);
        assert!(names.contains(&"Hello"));
        assert!(names.contains(&"World"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn scan_ignores_a_missing_examples_dir() {
        let mut out = Vec::new();
        scan_library_examples("Ghost", Path::new("/no/such/path/xyz"), &mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn make_library_layout_is_discoverable() {
        // Exercises the standard library layout the scanner expects end to end
        // (without touching the user's real Documents folder).
        let dir = tmpdir();
        make_library(&dir, "TestLib", &["DemoA", "DemoB"]);
        let mut out = Vec::new();
        scan_library_examples("TestLib", &dir.join("TestLib").join("examples"), &mut out);
        assert_eq!(out.len(), 2);
        fs::remove_dir_all(&dir).unwrap();
    }

    /* ---------- libraries_root JSON parsing (FIX 10) ---------------------- */

    #[test]
    fn parse_arduino_user_dir_reads_dotted_key_shape() {
        // arduino-cli's config dump uses dotted-string keys at the top level:
        //   { "directories.user": "...", "directories.data": "...", ... }
        let json = r#"{
            "board_manager": { "additional_urls": [] },
            "directories.data": "/home/u/.arduino15",
            "directories.downloads": "/home/u/.arduino15/staging",
            "directories.user": "/home/u/Arduino"
        }"#;
        let got = parse_arduino_user_dir(json);
        assert_eq!(got, Some(PathBuf::from("/home/u/Arduino")));
    }

    #[test]
    fn parse_arduino_user_dir_also_reads_nested_object_shape() {
        // Some arduino-cli builds nest the field as a real object.
        let json = r#"{
            "directories": { "user": "/home/u/Arduino", "data": "/tmp" }
        }"#;
        let got = parse_arduino_user_dir(json);
        assert_eq!(got, Some(PathBuf::from("/home/u/Arduino")));
    }

    #[test]
    fn parse_arduino_user_dir_returns_none_when_missing() {
        // Both shapes absent — caller should fall back to the hardcoded path.
        let json = r#"{ "board_manager": { "additional_urls": [] } }"#;
        assert_eq!(parse_arduino_user_dir(json), None);
    }

    #[test]
    fn parse_arduino_user_dir_returns_none_when_value_is_not_a_string() {
        let json = r#"{ "directories.user": 42 }"#;
        assert_eq!(parse_arduino_user_dir(json), None);
    }

    #[test]
    fn parse_arduino_user_dir_returns_none_on_invalid_json() {
        assert_eq!(parse_arduino_user_dir("not json"), None);
        // Suppress unused-import warnings on the test-only reset hook by
        // touching it at least once from the tests module.
        reset_libraries_root_cache();
    }
}
