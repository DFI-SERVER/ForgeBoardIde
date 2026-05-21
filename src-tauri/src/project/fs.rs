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
}
