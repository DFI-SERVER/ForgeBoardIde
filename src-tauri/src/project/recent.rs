use super::model::{ProjectError, RecentProject};
use std::path::PathBuf;

fn recent_file() -> Result<PathBuf, ProjectError> {
    let data = dirs::data_local_dir()
        .ok_or_else(|| ProjectError::Io("no data_local_dir".into()))?;
    let dir = data.join("ForgeBoard");
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("recent.json"))
}

pub fn load_recent() -> Result<Vec<RecentProject>, ProjectError> {
    let path = recent_file()?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let s = std::fs::read_to_string(path)?;
    Ok(serde_json::from_str(&s).unwrap_or_default())
}

pub fn push_recent(name: &str, path: &std::path::Path) -> Result<(), ProjectError> {
    let mut list = load_recent()?;
    // Remove existing entry with same path
    list.retain(|r| r.path != path);
    list.insert(
        0,
        RecentProject {
            name: name.into(),
            path: path.to_path_buf(),
            last_opened: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
        },
    );
    list.truncate(10);
    let f = recent_file()?;
    std::fs::write(f, serde_json::to_string_pretty(&list).unwrap())?;
    Ok(())
}
