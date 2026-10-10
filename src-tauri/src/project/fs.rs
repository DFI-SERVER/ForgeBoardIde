use super::config;
use super::model::{ProjectError, Sketch, SketchFile};
use std::path::{Path, PathBuf};

/* ---------------------------------------------------- sketchbook root --- */

/// Prove we can actually create and write a file inside `dir`.
///
/// `create_dir_all` can succeed on a directory that then rejects writes — a
/// read-only mount, or a redirected location that is offline — so the
/// sketchbook resolver write-probes for real rather than trusting existence.
fn is_writable(dir: &Path) -> bool {
    let probe = dir.join(format!(".forgeboard-write-test-{}", std::process::id()));
    if std::fs::write(&probe, b"ok").is_err() {
        return false;
    }
    let _ = std::fs::remove_file(&probe);
    true
}

/// Make `dir` exist and confirm it is writable; returns it on success.
fn prepare_dir(dir: &Path) -> Option<PathBuf> {
    std::fs::create_dir_all(dir).ok()?;
    is_writable(dir).then(|| dir.to_path_buf())
}

/// The automatic sketchbook locations, most-preferred first.
///
/// Documents is the natural home — visible, where users look for their
/// sketches. But it can be redirected to an offline OneDrive or a
/// disconnected network drive, where folder creation fails; the home folder
/// and finally the always-writable per-user app-data folder are fallbacks so
/// the IDE keeps working regardless.
fn default_candidates() -> Vec<PathBuf> {
    [dirs::document_dir(), dirs::home_dir(), dirs::data_local_dir()]
        .into_iter()
        .flatten()
        .map(|base| base.join("ForgeBoard").join("sketches"))
        .collect()
}

/// Resolve the sketchbook folder — create it, and guarantee the result is a
/// directory we can actually write into.
///
/// A user-set override is honoured first; if it is set but currently unusable
/// (an unplugged drive, say) the resolver falls through to the automatic
/// candidates rather than failing outright.
pub fn ensure_sketches_root() -> Result<PathBuf, ProjectError> {
    if let Some(custom) = config::sketchbook_override() {
        if let Some(ready) = prepare_dir(&custom) {
            return Ok(ready);
        }
    }
    for candidate in default_candidates() {
        if let Some(ready) = prepare_dir(&candidate) {
            return Ok(ready);
        }
    }
    Err(ProjectError::Io(
        "could not find a writable folder for the sketchbook".into(),
    ))
}

/// Where sketches are stored — the user's choice (if any) and the folder
/// actually in effect. Drives the Settings UI.
#[derive(serde::Serialize)]
pub struct SketchbookInfo {
    /// The user's explicit choice, or `None` when using the automatic default.
    pub custom: Option<PathBuf>,
    /// The folder new sketches actually go into right now.
    pub effective: PathBuf,
}

/// The current sketchbook configuration plus the effective root.
pub fn sketchbook_info() -> Result<SketchbookInfo, ProjectError> {
    Ok(SketchbookInfo {
        custom: config::sketchbook_override(),
        effective: ensure_sketches_root()?,
    })
}

/// Point the sketchbook at `dir`, or restore the automatic default with
/// `None`. A chosen folder must be writable; the new effective root is
/// returned so the caller can show it.
pub fn set_sketchbook(dir: Option<&Path>) -> Result<PathBuf, ProjectError> {
    if let Some(d) = dir {
        if prepare_dir(d).is_none() {
            return Err(ProjectError::Io(format!(
                "that folder can't be used for sketches: {}",
                d.to_string_lossy()
            )));
        }
    }
    config::set_sketchbook_override(dir)?;
    ensure_sketches_root()
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

/// Read a file's contents as a UTF-8 string. The path must live inside a
/// sketch folder — the webview must not be able to read arbitrary files.
pub fn read_file(path: &Path) -> Result<String, ProjectError> {
    let validated = validate_file_in_sketch(path)?;
    Ok(std::fs::read_to_string(validated)?)
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

/// How many ancestors of a file the sketch-membership walk inspects. Sketch
/// files live at the sketch root or in shallow sub-folders (`data/`, `src/`);
/// the fixed bound keeps the walk cheap and refuses deeply foreign paths.
const MAX_SKETCH_DEPTH: usize = 4;

/// Confirm `path` is a file inside a sketch folder (a directory containing a
/// matching main `.ino`), walking up at most MAX_SKETCH_DEPTH ancestors to
/// find that folder. Gates the read/save IPC commands so the webview cannot
/// touch files outside sketches; `..` segments and symlinks are resolved by
/// `is_within` before the containment check.
fn validate_file_in_sketch(path: &Path) -> Result<PathBuf, ProjectError> {
    let mut ancestor = path.parent();
    for _ in 0..MAX_SKETCH_DEPTH {
        let Some(dir) = ancestor else { break };
        if read_sketch(dir).is_ok() {
            if is_within(dir, path) {
                return Ok(path.to_path_buf());
            }
            break;
        }
        ancestor = dir.parent();
    }
    Err(ProjectError::Invalid(path.to_string_lossy().into_owned()))
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

/// Write a file's contents. The path must live inside a sketch folder — the
/// webview must not be able to write arbitrary files on disk.
pub fn write_file(path: &Path, contents: &str) -> Result<(), ProjectError> {
    let validated = validate_file_in_sketch(path)?;
    if let Some(parent) = validated.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(validated, contents)?;
    Ok(())
}

const DEFAULT_INO_CONTENTS: &str = "\
// put your setup code here, to run once:
void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
}

// put your main code here, to run repeatedly:
void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
";

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmpdir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("fb-ide-test-{}", rand::random::<u32>()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    /* --- sketchbook root resolution ---------------------------------- */

    #[test]
    fn is_writable_true_for_a_real_directory() {
        let dir = tmpdir();
        assert!(is_writable(&dir));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn prepare_dir_creates_missing_parents() {
        let dir = tmpdir();
        let nested = dir.join("a").join("b").join("sketches");
        let ready = prepare_dir(&nested).expect("a nested dir should prepare");
        assert_eq!(ready, nested);
        assert!(nested.is_dir());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn prepare_dir_rejects_a_path_blocked_by_a_file() {
        let dir = tmpdir();
        // A file sits where a directory component is expected.
        let blocker = dir.join("blocker");
        fs::write(&blocker, "i am a file").unwrap();
        assert!(prepare_dir(&blocker.join("sketches")).is_none());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn default_candidates_is_never_empty() {
        assert!(!default_candidates().is_empty());
    }

    #[test]
    fn ensure_sketches_root_yields_a_writable_directory() {
        let root = ensure_sketches_root().expect("a sketchbook root must resolve");
        assert!(root.is_dir());
        assert!(is_writable(&root));
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
    fn read_and_write_inside_a_sketch_are_allowed() {
        let (dir, sketch) = sketch_fixture();
        let target = sketch.join("notes.h");
        write_file(&target, "#define N 1").unwrap();
        assert_eq!(read_file(&target).unwrap(), "#define N 1");
        // One level down too (data/ sub-folder).
        let sub = create_folder(&sketch, "data").unwrap();
        let nested = sub.join("conf.txt");
        write_file(&nested, "x").unwrap();
        assert_eq!(read_file(&nested).unwrap(), "x");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_and_write_outside_any_sketch_are_rejected() {
        let dir = tmpdir();
        let loose = dir.join("loose.txt");
        fs::write(&loose, "secret").unwrap();
        assert!(matches!(read_file(&loose), Err(ProjectError::Invalid(_))));
        assert!(matches!(
            write_file(&dir.join("new.txt"), "x"),
            Err(ProjectError::Invalid(_))
        ));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn traversal_out_of_a_sketch_is_rejected() {
        let (dir, sketch) = sketch_fixture();
        let outside = dir.join("outside.txt");
        fs::write(&outside, "secret").unwrap();
        let sneaky = sketch.join("..").join("outside.txt");
        assert!(matches!(read_file(&sneaky), Err(ProjectError::Invalid(_))));
        assert!(matches!(
            write_file(&sneaky, "overwrite"),
            Err(ProjectError::Invalid(_))
        ));
        assert_eq!(fs::read_to_string(&outside).unwrap(), "secret");
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
