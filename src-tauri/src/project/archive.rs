//! Archive Sketch — zip a sketch folder into a single `.zip` file.
//!
//! Entry paths keep the sketch's own folder name, so unzipping the archive
//! yields a ready-to-open sketch folder rather than a pile of loose files.

use super::model::ProjectError;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;

/// Zip the sketch folder `sketch_dir` into the file `dest`.
pub fn archive_sketch(sketch_dir: &Path, dest: &Path) -> Result<(), ProjectError> {
    if !sketch_dir.is_dir() {
        return Err(ProjectError::NotFound(
            sketch_dir.to_string_lossy().into_owned(),
        ));
    }
    // Entries are stored relative to the sketch folder's parent, so every
    // path inside the archive begins with the sketch folder's own name.
    let base = sketch_dir.parent().unwrap_or(sketch_dir);

    let mut entries = Vec::new();
    collect_files(sketch_dir, &mut entries)?;

    let file = std::fs::File::create(dest)?;
    let mut zip = zip::ZipWriter::new(file);
    // Stored (no compression) keeps the build free of a codec dependency;
    // sketch files are tiny text, so the size difference is immaterial.
    let options =
        SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);

    for path in entries {
        let rel = path
            .strip_prefix(base)
            .map_err(|e| ProjectError::Io(e.to_string()))?;
        // Zip entry names use forward slashes on every platform.
        let name = rel.to_string_lossy().replace('\\', "/");
        zip.start_file(name, options)
            .map_err(|e| ProjectError::Io(e.to_string()))?;
        let mut contents = Vec::new();
        std::fs::File::open(&path)?.read_to_end(&mut contents)?;
        zip.write_all(&contents)?;
    }
    zip.finish().map_err(|e| ProjectError::Io(e.to_string()))?;
    Ok(())
}

/// Collect every file under `dir`, recursively, skipping dot-entries.
fn collect_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), ProjectError> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            collect_files(&path, out)?;
        } else if file_type.is_file() {
            out.push(path);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmpdir() -> PathBuf {
        let d = std::env::temp_dir()
            .join(format!("fb-archive-test-{}", rand::random::<u32>()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn archives_a_sketch_folder_under_its_own_name() {
        let root = tmpdir();
        let sketch = root.join("Blink");
        fs::create_dir_all(&sketch).unwrap();
        fs::write(sketch.join("Blink.ino"), "void setup() {}").unwrap();
        fs::write(sketch.join("notes.h"), "// notes").unwrap();

        let dest = root.join("Blink.zip");
        archive_sketch(&sketch, &dest).unwrap();
        assert!(dest.is_file());

        let mut zip = zip::ZipArchive::new(fs::File::open(&dest).unwrap()).unwrap();
        let mut names: Vec<String> = (0..zip.len())
            .map(|i| zip.by_index(i).unwrap().name().to_string())
            .collect();
        names.sort();
        assert_eq!(names, ["Blink/Blink.ino", "Blink/notes.h"]);

        let mut body = String::new();
        zip.by_name("Blink/Blink.ino")
            .unwrap()
            .read_to_string(&mut body)
            .unwrap();
        assert_eq!(body, "void setup() {}");

        drop(zip);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn archiving_a_missing_folder_reports_not_found() {
        let root = tmpdir();
        let result = archive_sketch(&root.join("ghost"), &root.join("x.zip"));
        assert!(matches!(result, Err(ProjectError::NotFound(_))));
        fs::remove_dir_all(&root).unwrap();
    }
}
