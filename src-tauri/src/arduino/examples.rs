//! Discovery of example sketches that ship inside installed Arduino libraries.
//!
//! An Arduino library may carry an `examples/` folder; each example is itself a
//! sketch folder — `examples/<Name>/<Name>.ino`. Libraries the user installs
//! land under the sketchbook `libraries/` directory (a sibling of the
//! `sketches/` folder this app creates user sketches in). Scanning that tree
//! lets library examples appear in the Examples view as soon as a library is
//! installed, with no arduino-cli round-trip.
//!
//! The curated *starter* examples are bundled with the app as frontend data
//! (see `src/lib/example-catalog.ts`); this module only handles the dynamic,
//! installed-library set.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

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

/// The sketchbook `libraries/` directory: `~/Documents/ForgeBoard/libraries`.
///
/// This mirrors `project::fs::sketches_root`, which resolves
/// `~/Documents/ForgeBoard/sketches` — the libraries folder is its sibling and
/// is where arduino-cli installs libraries when the sketchbook is set there.
fn libraries_root() -> Option<PathBuf> {
    dirs::document_dir().map(|d| d.join("ForgeBoard").join("libraries"))
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
/// libraries under the sketchbook `libraries/` directory.
///
/// Returns an empty list (never an error) when no libraries are installed or
/// the libraries directory does not exist yet — a fresh install simply has no
/// library examples, and the curated starter set is still shown by the UI.
/// Results are sorted by library, then example name, so the UI can group them.
pub fn list_library_examples() -> Vec<LibraryExample> {
    let mut out = Vec::new();
    let Some(root) = libraries_root() else {
        return out;
    };
    let Ok(libraries) = std::fs::read_dir(&root) else {
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
}
