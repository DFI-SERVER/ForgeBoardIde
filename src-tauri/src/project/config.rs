//! App-level configuration the Rust side owns and must read without a
//! round-trip to the frontend — currently just the sketchbook location.
//!
//! Persisted as JSON beside `recent.json` in the per-user app-data folder
//! (`%LOCALAPPDATA%\ForgeBoard\` on Windows). That folder is the most
//! reliably writable location an installed app has — unlike Documents, which
//! can be redirected to an offline OneDrive or a disconnected network share.
//! Parsing is defensive: a missing or corrupt file falls back to defaults
//! rather than failing.

use super::model::ProjectError;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// The persisted config object. Every field is optional so an older or
/// hand-edited file still deserialises.
#[derive(Serialize, Deserialize, Default)]
struct Config {
    /// The user's chosen sketchbook folder. `None` — use the automatic default.
    #[serde(default)]
    sketchbook: Option<PathBuf>,
}

/// Path to `config.json`, creating the containing folder if needed.
fn config_file() -> Result<PathBuf, ProjectError> {
    let data = dirs::data_local_dir()
        .ok_or_else(|| ProjectError::Io("no app-data folder".into()))?;
    let dir = data.join("ForgeBoard");
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("config.json"))
}

/// Read the config, or a default if it is missing, unreadable or corrupt.
fn load() -> Config {
    let Ok(path) = config_file() else {
        return Config::default();
    };
    match std::fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => Config::default(),
    }
}

/// Write the config back to disk.
fn save(cfg: &Config) -> Result<(), ProjectError> {
    let path = config_file()?;
    let json =
        serde_json::to_string_pretty(cfg).map_err(|e| ProjectError::Io(e.to_string()))?;
    std::fs::write(path, json)?;
    Ok(())
}

/// The user's explicit sketchbook choice, if they have set one.
pub fn sketchbook_override() -> Option<PathBuf> {
    load().sketchbook
}

/// Set (or, with `None`, clear) the user's sketchbook choice.
pub fn set_sketchbook_override(path: Option<&Path>) -> Result<(), ProjectError> {
    let mut cfg = load();
    cfg.sketchbook = path.map(|p| p.to_path_buf());
    save(&cfg)
}
