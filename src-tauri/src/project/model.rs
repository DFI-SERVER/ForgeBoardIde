use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SketchFile {
    pub name: String,        // e.g. "led-chase.ino"
    pub path: PathBuf,
    pub is_main: bool,       // true if matches folder name + .ino
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Sketch {
    pub name: String,        // folder name
    pub path: PathBuf,       // absolute path to folder
    pub files: Vec<SketchFile>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RecentProject {
    pub name: String,
    pub path: PathBuf,
    pub last_opened: u64,    // unix timestamp (secs)
}

#[derive(thiserror::Error, Debug, Serialize)]
#[serde(tag = "type", content = "message")]
pub enum ProjectError {
    #[error("Sketch folder not found: {0}")]
    NotFound(String),
    #[error("Invalid sketch folder (missing main .ino): {0}")]
    Invalid(String),
    #[error("I/O error: {0}")]
    Io(String),
    #[error("Already exists: {0}")]
    AlreadyExists(String),
}

impl From<std::io::Error> for ProjectError {
    fn from(e: std::io::Error) -> Self {
        ProjectError::Io(e.to_string())
    }
}
