use super::{fs, model::*, recent};
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
