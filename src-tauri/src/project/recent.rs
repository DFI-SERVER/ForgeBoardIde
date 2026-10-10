use super::model::{ProjectError, RecentProject};
use std::path::PathBuf;

fn recent_file() -> Result<PathBuf, ProjectError> {
    let data = dirs::data_local_dir()
        .ok_or_else(|| ProjectError::Io("no data_local_dir".into()))?;
    let dir = data.join("ForgeBoard");
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("recent.json"))
}

/// Strip entries whose `path` no longer exists on disk. The pruned list is
/// returned by value AND written back to the recent.json so the cleanup
/// persists — without the write, every IDE start would re-prune the same
/// dead entries and the file would grow stale forever.
///
/// A write failure is logged via `eprintln!` and the unpruned-but-filtered
/// list is returned; we never want a corrupt recent.json or a read-only
/// disk to block app startup.
fn prune_missing(list: Vec<RecentProject>) -> Vec<RecentProject> {
    let filtered: Vec<RecentProject> = list
        .into_iter()
        .filter(|entry| std::path::Path::new(&entry.path).exists())
        .collect();
    if let Ok(file) = recent_file() {
        if let Ok(json) = serde_json::to_string_pretty(&filtered) {
            if let Err(err) = std::fs::write(&file, json) {
                eprintln!("forgeboard: couldn't persist pruned recent.json: {err}");
            }
        }
    }
    filtered
}

pub fn load_recent() -> Result<Vec<RecentProject>, ProjectError> {
    let path = recent_file()?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let s = std::fs::read_to_string(path)?;
    let parsed: Vec<RecentProject> = serde_json::from_str(&s).unwrap_or_default();
    Ok(prune_missing(parsed))
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Directly invoke `prune_missing` over a list containing one valid path
    /// and one fake path; assert the fake one is dropped. The IDE-wide
    /// `load_recent` flow goes through the same prune step, so testing the
    /// helper directly is more robust than rewriting the data_local_dir for
    /// an integration test.
    #[test]
    fn prune_missing_drops_nonexistent_paths() {
        let tmp = std::env::temp_dir().join(format!(
            "fb-prune-test-{}",
            rand::random::<u32>()
        ));
        fs::create_dir_all(&tmp).unwrap();
        let real = tmp.join("real");
        fs::create_dir_all(&real).unwrap();

        let list = vec![
            RecentProject {
                name: "real".into(),
                path: real.clone(),
                last_opened: 0,
            },
            RecentProject {
                name: "ghost".into(),
                path: tmp.join("does-not-exist"),
                last_opened: 0,
            },
        ];
        let pruned = prune_missing(list);
        assert_eq!(pruned.len(), 1);
        assert_eq!(pruned[0].path, real);

        fs::remove_dir_all(&tmp).unwrap();
    }
}
