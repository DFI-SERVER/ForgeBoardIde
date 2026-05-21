use super::model::{ProjectError, Sketch, SketchFile};
use std::path::{Path, PathBuf};

/// Default sketches directory: ~/Documents/ForgeBoard/sketches
pub fn sketches_root() -> Result<PathBuf, ProjectError> {
    let docs = dirs::document_dir()
        .ok_or_else(|| ProjectError::Io("no Documents folder".into()))?;
    Ok(docs.join("ForgeBoard").join("sketches"))
}

/// Ensure the sketches root exists; create if missing.
pub fn ensure_sketches_root() -> Result<PathBuf, ProjectError> {
    let root = sketches_root()?;
    std::fs::create_dir_all(&root)?;
    Ok(root)
}

/// Read a sketch folder into a Sketch struct.
pub fn read_sketch(path: &Path) -> Result<Sketch, ProjectError> {
    if !path.is_dir() {
        return Err(ProjectError::NotFound(path.to_string_lossy().into_owned()));
    }
    let folder_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| ProjectError::Invalid(path.to_string_lossy().into_owned()))?
        .to_string();
    let main_ino = format!("{}.ino", folder_name);

    let mut files = Vec::new();
    let mut found_main = false;
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let ft = entry.file_type()?;
        if !ft.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        // skip hidden / dot files
        if name.starts_with('.') {
            continue;
        }
        let is_main = name == main_ino;
        if is_main {
            found_main = true;
        }
        files.push(SketchFile {
            name: name.clone(),
            path: entry.path(),
            is_main,
        });
    }

    if !found_main {
        return Err(ProjectError::Invalid(format!("expected {}", main_ino)));
    }

    // Sort: main .ino first, then alpha
    files.sort_by(|a, b| b.is_main.cmp(&a.is_main).then(a.name.cmp(&b.name)));

    Ok(Sketch {
        name: folder_name,
        path: path.to_path_buf(),
        files,
    })
}

/// Create a new empty sketch folder with a blank .ino. `location` is the
/// parent directory to create it in; `None` uses the default sketches root.
pub fn create_sketch(name: &str, location: Option<&Path>) -> Result<Sketch, ProjectError> {
    let root = match location {
        Some(dir) => dir.to_path_buf(),
        None => ensure_sketches_root()?,
    };
    std::fs::create_dir_all(&root)?;
    let folder = root.join(name);
    if folder.exists() {
        return Err(ProjectError::AlreadyExists(name.into()));
    }
    std::fs::create_dir_all(&folder)?;
    let ino = folder.join(format!("{}.ino", name));
    std::fs::write(&ino, DEFAULT_INO_CONTENTS)?;
    read_sketch(&folder)
}

/// Read a file's contents as a UTF-8 string.
pub fn read_file(path: &Path) -> Result<String, ProjectError> {
    Ok(std::fs::read_to_string(path)?)
}

/* ------------------------------------------------------------ guards --- */

/// True if `target`, once canonicalised, lives at or below `root`.
///
/// Both paths are canonicalised so symlinks and `..` segments are resolved
/// before the comparison — this is what stops a crafted path from escaping
/// the sketch folder. `root` must exist; `target` is canonicalised via its
/// nearest existing ancestor when it does not yet exist (e.g. a file about
/// to be created), so creation inside the sketch still passes the check.
fn is_within(root: &Path, target: &Path) -> bool {
    let Ok(root) = root.canonicalize() else {
        return false;
    };
    let resolved = match target.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            // Target does not exist yet: canonicalise the nearest ancestor
            // that does, then re-attach the remaining (non-existent) tail.
            let parent = match target.parent() {
                Some(p) => p,
                None => return false,
            };
            let Ok(parent) = parent.canonicalize() else {
                return false;
            };
            match target.file_name() {
                Some(name) => parent.join(name),
                None => return false,
            }
        }
    };
    resolved.starts_with(&root)
}

/// Resolve the sketch folder a path belongs to, and confirm the path really
/// resides inside it. Returns the validated absolute path on success.
///
/// `path` is treated as the target the caller wants to act on; it must sit
/// strictly *inside* a sketch folder (never be the sketch folder itself, and
/// never escape it). Used to gate every destructive/mutating fs command.
fn validate_inside_sketch(path: &Path) -> Result<PathBuf, ProjectError> {
    let display = || path.to_string_lossy().into_owned();
    if !path.exists() {
        return Err(ProjectError::NotFound(display()));
    }
    // The sketch folder is the path's parent (files/folders live one level
    // under the sketch root). Confirm that parent is itself a valid sketch.
    let parent = path
        .parent()
        .ok_or_else(|| ProjectError::Invalid(display()))?;
    // read_sketch validates "this folder has a main .ino" — i.e. it is a
    // sketch — and errors otherwise.
    read_sketch(parent)?;
    if !is_within(parent, path) {
        return Err(ProjectError::Invalid(display()));
    }
    Ok(path.to_path_buf())
}

/// Confirm `dir` is a sketch folder (or a folder inside one) we may create
/// new entries in. Returns the validated absolute directory path.
fn validate_create_dir(dir: &Path) -> Result<PathBuf, ProjectError> {
    let display = || dir.to_string_lossy().into_owned();
    if !dir.is_dir() {
        return Err(ProjectError::NotFound(display()));
    }
    // `dir` is a valid target if it is itself a sketch folder, or if it is a
    // sub-folder living inside one.
    if read_sketch(dir).is_ok() {
        return Ok(dir.to_path_buf());
    }
    let parent = dir
        .parent()
        .ok_or_else(|| ProjectError::Invalid(display()))?;
    read_sketch(parent)?;
    if !is_within(parent, dir) {
        return Err(ProjectError::Invalid(display()));
    }
    Ok(dir.to_path_buf())
}

/// Reject a user-supplied file/folder name that is empty, a relative
/// component (`.`/`..`), or contains a path separator. Returned name is
/// trimmed and safe to join onto a directory.
fn sanitize_name(name: &str) -> Result<String, ProjectError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(ProjectError::Invalid("name is empty".into()));
    }
    if trimmed == "." || trimmed == ".." {
        return Err(ProjectError::Invalid(format!("invalid name: {trimmed}")));
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err(ProjectError::Invalid(format!(
            "name must not contain a path separator: {trimmed}"
        )));
    }
    Ok(trimmed.to_string())
}

/* -------------------------------------------------------- mutations --- */

/// Move a file or folder to the OS recycle bin. Recoverable by design — the
/// entry is never permanently erased. `path` must resolve inside a sketch.
pub fn delete_path(path: &Path) -> Result<(), ProjectError> {
    let validated = validate_inside_sketch(path)?;
    trash::delete(&validated)
        .map_err(|e| ProjectError::Io(format!("could not move to recycle bin: {e}")))?;
    Ok(())
}

/// Rename a file or folder within its own directory. `new_name` may not
/// contain a path separator, and may not collide with an existing entry.
/// Returns the new absolute path.
pub fn rename_path(path: &Path, new_name: &str) -> Result<PathBuf, ProjectError> {
    let validated = validate_inside_sketch(path)?;
    let name = sanitize_name(new_name)?;
    let parent = validated
        .parent()
        .ok_or_else(|| ProjectError::Invalid(validated.to_string_lossy().into_owned()))?;
    let dest = parent.join(&name);
    // No-op renames (same name) are allowed; a different name that collides
    // with an existing entry is rejected.
    if dest != validated && dest.exists() {
        return Err(ProjectError::AlreadyExists(name));
    }
    std::fs::rename(&validated, &dest)?;
    Ok(dest)
}

/// Create a new empty file named `name` inside `dir`. Errors if it exists.
/// Returns the new file's absolute path.
pub fn create_file(dir: &Path, name: &str) -> Result<PathBuf, ProjectError> {
    let validated = validate_create_dir(dir)?;
    let safe = sanitize_name(name)?;
    let dest = validated.join(&safe);
    if dest.exists() {
        return Err(ProjectError::AlreadyExists(safe));
    }
    std::fs::write(&dest, "")?;
    Ok(dest)
}

/// Create a new folder named `name` inside `dir`. Errors if it exists.
/// Returns the new folder's absolute path.
pub fn create_folder(dir: &Path, name: &str) -> Result<PathBuf, ProjectError> {
    let validated = validate_create_dir(dir)?;
    let safe = sanitize_name(name)?;
    let dest = validated.join(&safe);
    if dest.exists() {
        return Err(ProjectError::AlreadyExists(safe));
    }
    std::fs::create_dir(&dest)?;
    Ok(dest)
}

/// Write a file's contents.
pub fn write_file(path: &Path, contents: &str) -> Result<(), ProjectError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, contents)?;
    Ok(())
}

const DEFAULT_INO_CONTENTS: &str =
    "void setup() {\n  // initialize once\n}\n\nvoid loop() {\n  // repeat forever\n}\n";

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmpdir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("fb-ide-test-{}", rand::random::<u32>()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn read_sketch_finds_main_and_helpers() {
        let dir = tmpdir();
        let sketch_dir = dir.join("blink");
        fs::create_dir(&sketch_dir).unwrap();
        fs::write(sketch_dir.join("blink.ino"), "void setup() {}").unwrap();
        fs::write(sketch_dir.join("pins.h"), "#define LED 2").unwrap();

        let s = read_sketch(&sketch_dir).unwrap();
        assert_eq!(s.name, "blink");
        assert_eq!(s.files.len(), 2);
        assert!(s.files[0].is_main);
        assert_eq!(s.files[0].name, "blink.ino");
        assert_eq!(s.files[1].name, "pins.h");

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_sketch_rejects_folder_without_main_ino() {
        let dir = tmpdir();
        let sketch_dir = dir.join("foo");
        fs::create_dir(&sketch_dir).unwrap();
        fs::write(sketch_dir.join("bar.h"), "").unwrap();

        let result = read_sketch(&sketch_dir);
        assert!(matches!(result, Err(ProjectError::Invalid(_))));

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn create_sketch_at_explicit_location() {
        let dir = tmpdir();
        let s = create_sketch("blink", Some(dir.as_path())).unwrap();
        assert_eq!(s.name, "blink");
        assert_eq!(s.path, dir.join("blink"));
        assert!(s.files.iter().any(|f| f.name == "blink.ino" && f.is_main));
        assert!(dir.join("blink").join("blink.ino").is_file());
        fs::remove_dir_all(&dir).unwrap();
    }

    /// Build a minimal valid sketch folder under a fresh tmpdir and return
    /// `(tmpdir, sketch_dir)`.
    fn sketch_fixture() -> (PathBuf, PathBuf) {
        let dir = tmpdir();
        let sketch = dir.join("blink");
        fs::create_dir(&sketch).unwrap();
        fs::write(sketch.join("blink.ino"), "void setup() {}").unwrap();
        (dir, sketch)
    }

    #[test]
    fn sanitize_name_rejects_separators_and_dots() {
        assert!(sanitize_name("good.h").is_ok());
        assert_eq!(sanitize_name("  spaced.h  ").unwrap(), "spaced.h");
        assert!(sanitize_name("").is_err());
        assert!(sanitize_name("   ").is_err());
        assert!(sanitize_name(".").is_err());
        assert!(sanitize_name("..").is_err());
        assert!(sanitize_name("a/b").is_err());
        assert!(sanitize_name("a\\b").is_err());
    }

    #[test]
    fn create_file_makes_an_empty_file_in_the_sketch() {
        let (dir, sketch) = sketch_fixture();
        let made = create_file(&sketch, "helper.h").unwrap();
        assert_eq!(made, sketch.join("helper.h"));
        assert!(made.is_file());
        assert_eq!(fs::read_to_string(&made).unwrap(), "");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn create_file_rejects_a_collision() {
        let (dir, sketch) = sketch_fixture();
        create_file(&sketch, "dup.h").unwrap();
        let again = create_file(&sketch, "dup.h");
        assert!(matches!(again, Err(ProjectError::AlreadyExists(_))));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn create_file_rejects_a_path_separator_in_the_name() {
        let (dir, sketch) = sketch_fixture();
        let bad = create_file(&sketch, "../escape.h");
        assert!(matches!(bad, Err(ProjectError::Invalid(_))));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn create_folder_makes_a_directory() {
        let (dir, sketch) = sketch_fixture();
        let made = create_folder(&sketch, "data").unwrap();
        assert!(made.is_dir());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn create_in_a_non_sketch_folder_is_rejected() {
        let dir = tmpdir();
        // `dir` itself is not a sketch (no main .ino) and has no sketch parent.
        let bad = create_file(&dir, "loose.txt");
        assert!(matches!(
            bad,
            Err(ProjectError::Invalid(_)) | Err(ProjectError::NotFound(_))
        ));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn rename_path_moves_within_the_directory() {
        let (dir, sketch) = sketch_fixture();
        let original = create_file(&sketch, "old.h").unwrap();
        let renamed = rename_path(&original, "new.h").unwrap();
        assert_eq!(renamed, sketch.join("new.h"));
        assert!(renamed.is_file());
        assert!(!original.exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn rename_path_rejects_a_collision() {
        let (dir, sketch) = sketch_fixture();
        let a = create_file(&sketch, "a.h").unwrap();
        create_file(&sketch, "b.h").unwrap();
        let clash = rename_path(&a, "b.h");
        assert!(matches!(clash, Err(ProjectError::AlreadyExists(_))));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn rename_path_rejects_a_separator_in_the_new_name() {
        let (dir, sketch) = sketch_fixture();
        let a = create_file(&sketch, "a.h").unwrap();
        let bad = rename_path(&a, "sub/a.h");
        assert!(matches!(bad, Err(ProjectError::Invalid(_))));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn rename_path_allows_a_same_name_no_op() {
        let (dir, sketch) = sketch_fixture();
        let a = create_file(&sketch, "keep.h").unwrap();
        let same = rename_path(&a, "keep.h").unwrap();
        assert_eq!(same, a);
        assert!(same.is_file());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn mutations_on_a_missing_path_report_not_found() {
        let (dir, sketch) = sketch_fixture();
        let ghost = sketch.join("ghost.h");
        assert!(matches!(
            rename_path(&ghost, "x.h"),
            Err(ProjectError::NotFound(_))
        ));
        assert!(matches!(
            delete_path(&ghost),
            Err(ProjectError::NotFound(_))
        ));
        fs::remove_dir_all(&dir).unwrap();
    }
}
