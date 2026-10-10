use super::{archive, fs, model::*, profiles, recent};
use std::path::PathBuf;

#[tauri::command]
pub fn project_sketches_root() -> Result<PathBuf, ProjectError> {
    fs::ensure_sketches_root()
}

#[tauri::command]
pub fn project_open(path: PathBuf) -> Result<Sketch, ProjectError> {
    let s = fs::read_sketch(&path)?;
    let _ = recent::push_recent(&s.name, &s.path);
    Ok(s)
}

#[tauri::command]
pub fn project_create(name: String, location: Option<PathBuf>) -> Result<Sketch, ProjectError> {
    let s = fs::create_sketch(&name, location.as_deref())?;
    let _ = recent::push_recent(&s.name, &s.path);
    Ok(s)
}

#[tauri::command]
pub fn project_read_file(path: PathBuf) -> Result<String, ProjectError> {
    fs::read_file(&path)
}

#[tauri::command]
pub fn project_save_file(path: PathBuf, contents: String) -> Result<(), ProjectError> {
    fs::write_file(&path, &contents)
}

#[tauri::command]
pub fn project_list_recent() -> Result<Vec<RecentProject>, ProjectError> {
    recent::load_recent()
}

/// Move a file or folder to the OS recycle bin. The path must resolve inside
/// a sketch folder; it is recoverable from the recycle bin afterwards.
#[tauri::command]
pub fn project_delete_path(path: PathBuf) -> Result<(), ProjectError> {
    fs::delete_path(&path)
}

/// Rename a file or folder within its own directory. Returns the new path.
#[tauri::command]
pub fn project_rename_path(path: PathBuf, new_name: String) -> Result<PathBuf, ProjectError> {
    fs::rename_path(&path, &new_name)
}

/// Create a new empty file `name` inside sketch directory `dir`.
#[tauri::command]
pub fn project_create_file(dir: PathBuf, name: String) -> Result<PathBuf, ProjectError> {
    fs::create_file(&dir, &name)
}

/// Create a new folder `name` inside sketch directory `dir`.
#[tauri::command]
pub fn project_create_folder(dir: PathBuf, name: String) -> Result<PathBuf, ProjectError> {
    fs::create_folder(&dir, &name)
}

/// Where sketches are stored: the user's choice (if any) and the effective root.
#[tauri::command]
pub fn project_sketchbook_get() -> Result<fs::SketchbookInfo, ProjectError> {
    fs::sketchbook_info()
}

/// Set the sketchbook folder, or restore the default with `null`. Returns the
/// new effective root.
#[tauri::command]
pub fn project_sketchbook_set(path: Option<PathBuf>) -> Result<PathBuf, ProjectError> {
    fs::set_sketchbook(path.as_deref())
}

/// Archive a sketch folder into a `.zip` at `dest`.
#[tauri::command]
pub fn project_archive_sketch(
    sketch_dir: PathBuf,
    dest: PathBuf,
) -> Result<(), ProjectError> {
    archive::archive_sketch(&sketch_dir, &dest)
}

/// Read reproducible-build profiles from a sketch's `sketch.yaml`.
///
/// Returns `None` when the file is absent — the UI hides the profile pill in
/// that case. The argument may be either a sketch directory or a file inside
/// it; the parser locates `sketch.yaml` at the sketch root.
#[tauri::command]
pub fn project_read_profiles(
    sketch_path: PathBuf,
) -> Result<Option<profiles::SketchProfiles>, String> {
    profiles::read_profiles(&sketch_path)
}
