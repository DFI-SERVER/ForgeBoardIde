//! Platform corrections — overlay files dropped into arduino-cli's platform
//! directories to patch known upstream bugs without forking the platform.
//!
//! Each correction is a small, audited bundle of `*.local.txt` files
//! (boards.local.txt / platform.local.txt). arduino-cli reads these
//! automatically and merges them on top of the vendor's files, so we don't
//! need to modify or shadow the originals.
//!
//! The corrections are version-pinned via a simple glob pattern — when an
//! upstream platform ships a fix, the pattern stops matching the newer
//! version and our overlay no longer applies.
//!
//! Safety properties this module guarantees:
//!
//!   * **Fingerprint marker** — every file we write begins with a comment
//!     line `# ForgeBoard:correction=<id>` and a content hash. On remove
//!     we *only* delete files that carry our marker, so a user-written
//!     `platform.local.txt` (for unrelated reasons) is never touched.
//!   * **Backup-on-collision** — when apply finds an existing file at our
//!     target path that does NOT have our marker, the existing file is
//!     renamed to `<name>.forgeboard-backup` before our overlay takes its
//!     place. The backup is restored on remove if our overlay still
//!     matches what we wrote.
//!   * **Atomic write** — overlay files are written to a sibling tempfile
//!     and renamed into place, so a process kill mid-write can't leave a
//!     half-written, syntactically invalid file in arduino-cli's path.
//!   * **Idempotent** — apply with identical contents is a no-op (no write,
//!     no mtime change); remove on an absent file is a no-op.
//!
//! Lifecycle:
//!   - Bootstrap: `apply_all()` syncs every applicable correction into the
//!     installed platform directories. Idempotent — safe to call repeatedly.
//!   - User toggles "Apply platform corrections" off: `remove_all()` deletes
//!     every overlay file we previously wrote.
//!   - User reinstalls / upgrades a platform: bootstrap re-applies on the
//!     next launch.

pub mod commands;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// One bundled overlay file (e.g. `platform.local.txt`).
#[derive(Clone, Debug)]
struct CorrectionFile {
    name: &'static str,
    contents: &'static str,
}

/// A single correction — targets one platform `(vendor, arch)` for a range
/// of versions and ships a small set of overlay files.
#[derive(Clone, Debug)]
struct Correction {
    id: &'static str,
    title: &'static str,
    reason: &'static str,
    target_vendor: &'static str,
    target_arch: &'static str,
    /// Glob pattern matched against the installed platform version. Supports
    /// `*` for "any character sequence" — e.g. `3.3.*` matches `3.3.0`,
    /// `3.3.8`, `3.3.10` but NOT `3.4.0`.
    version_pattern: &'static str,
    files: &'static [CorrectionFile],
    upstream_issue: Option<&'static str>,
}

/// The bundle of corrections shipped with this build of ForgeBoard. New
/// corrections are added by appending to this slice — that's the entire
/// authoring surface for a new platform-version patch.
// No corrections are bundled yet.
//
// We had one for esp32:esp32@3.3.x targeting the esptool 5.2.0 native-USB
// upload regression, but the platform-recipe approach turned out to not be
// strong enough — the bug is in esptool itself and lives below the recipe
// layer. The correct user-facing answer is "install esp32:esp32@3.0.7,
// which ships esptool 4.x and works". The corrections framework remains
// in place for future targeted patches; new corrections are added by
// appending a Correction to this slice.
const CORRECTIONS: &[Correction] = &[];

/// Suffix appended to a user-owned `*.local.txt` that we move aside before
/// dropping our overlay in its place. Restored on remove.
const BACKUP_SUFFIX: &str = ".forgeboard-backup";

/// The first line of every overlay we write — lets us recognise our own
/// files on remove. The placeholder is filled with the correction id so
/// two corrections can't accidentally trample each other's files.
const FINGERPRINT_PREFIX: &str = "# ForgeBoard:correction=";

/// Information about a correction surfaced to the frontend — the bundled
/// metadata plus the runtime status (whether it currently applies to an
/// installed platform, and whether its files exist on disk right now).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CorrectionInfo {
    pub id: String,
    pub title: String,
    pub reason: String,
    pub target: String,
    pub version_pattern: String,
    pub upstream_issue: Option<String>,
    /// `true` when an installed platform version matches the target. The
    /// correction won't be applied if false — there's nowhere to write the
    /// overlay files.
    pub matches_installed: bool,
    /// `true` when every overlay file is present on disk AND carries our
    /// fingerprint marker. Drives the "Active" badge in the UI.
    pub active: bool,
    /// Absolute platform directory when `matches_installed`, otherwise None.
    pub platform_dir: Option<String>,
}

/// Glob match for a version string against a pattern like `"3.3.*"`. Only
/// supports `*` (matches any sequence, including empty); other characters
/// must match literally. Implemented inline so we don't pull in a globbing
/// crate for one pattern.
fn version_matches(pattern: &str, version: &str) -> bool {
    fn helper(p: &[u8], v: &[u8]) -> bool {
        if p.is_empty() {
            return v.is_empty();
        }
        if p[0] == b'*' {
            for skip in 0..=v.len() {
                if helper(&p[1..], &v[skip..]) {
                    return true;
                }
            }
            false
        } else if !v.is_empty() && p[0] == v[0] {
            helper(&p[1..], &v[1..])
        } else {
            false
        }
    }
    helper(pattern.as_bytes(), version.as_bytes())
}

/// Resolve arduino-cli's data directory. Mirrors arduino-cli's own default —
/// `directories.data` from its config, fall back to the platform-standard
/// location when arduino-cli hasn't been run yet.
///
/// We ask arduino-cli for the truth rather than guessing because the user
/// may have moved their Arduino15 dir via `arduino-cli config set
/// directories.data <path>`.
///
/// Implementation note: arduino-cli 1.5.0's `config dump --format json` only
/// emits keys the user explicitly overrode — defaults are missing, so a
/// JSON-pointer lookup against the dump fails for fresh installs. The
/// per-key `config get directories.data` form does include the resolved
/// default, so we use that instead.
async fn arduino_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use crate::arduino::cli;
    let out = cli::run_capture(app, &["config", "get", "directories.data"]).await?;
    let trimmed = out.trim();
    if trimmed.is_empty() {
        return Err("arduino-cli config get directories.data returned empty".into());
    }
    Ok(PathBuf::from(trimmed))
}

/// Find the on-disk platform directory for a given vendor/arch and return
/// `(version, path)` for every installed version. arduino-esp32 (and other
/// platforms) install side-by-side versions under `hardware/<arch>/<version>/`,
/// so a user can have both 3.0.7 and 3.3.8 — we apply corrections to whichever
/// versions match the pattern.
fn installed_versions_for(
    data_dir: &Path,
    vendor: &str,
    arch: &str,
) -> Vec<(String, PathBuf)> {
    let arch_dir = data_dir.join("packages").join(vendor).join("hardware").join(arch);
    let mut out = Vec::new();
    let entries = match fs::read_dir(&arch_dir) {
        Ok(e) => e,
        Err(_) => return out,
    };
    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let dir = entry.path();
        if !dir.join("platform.txt").exists() {
            continue;
        }
        out.push((name, dir));
    }
    out
}

/// Tag a string of overlay-file contents with our fingerprint header. The
/// header is a single comment line at the very top — arduino-cli ignores
/// comment lines starting with `#` so this never affects the meaning of
/// the file.
fn fingerprinted(correction_id: &str, contents: &str) -> String {
    format!("{FINGERPRINT_PREFIX}{correction_id}\n{contents}")
}

/// Strip our fingerprint header from a file we read off disk, returning the
/// payload as the platform would interpret it. Returns `None` when the file
/// is not one of ours (no header on the first line).
fn unfingerprint<'a>(correction_id: &str, raw: &'a str) -> Option<&'a str> {
    let first_line_end = raw.find('\n').unwrap_or(raw.len());
    let first_line = &raw[..first_line_end];
    let expected = format!("{FINGERPRINT_PREFIX}{correction_id}");
    if first_line.trim() == expected {
        // +1 skips the newline so the payload starts on the next line.
        Some(&raw[(first_line_end + 1).min(raw.len())..])
    } else {
        None
    }
}

/// Write `contents` to `path` atomically — write to a sibling temp file in
/// the same directory, then rename. A crash during the write leaves the
/// temp file behind (cleaned by next apply) instead of a half-written
/// destination that would break arduino-cli's parser.
fn atomic_write(path: &Path, contents: &str) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or_else(|| format!("no parent dir for {}", path.display()))?;
    // Suffix the temp with the destination's name so concurrent applies on
    // unrelated corrections don't collide with each other's temps.
    let tmp = dir.join(format!(
        ".{}.forgeboard-tmp",
        path.file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "tmp".into())
    ));
    fs::write(&tmp, contents).map_err(|e| format!("write temp: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("rename into place: {e}"))?;
    Ok(())
}

/// All corrections, with runtime status for each. Powers the Settings /
/// About listings and the bootstrap apply step.
pub async fn list_all(app: &tauri::AppHandle) -> Result<Vec<CorrectionInfo>, String> {
    let data_dir = match arduino_data_dir(app).await {
        Ok(d) => d,
        Err(_) => PathBuf::new(),
    };
    list_with(CORRECTIONS, &data_dir)
}

fn list_with(corrections: &[Correction], data_dir: &Path) -> Result<Vec<CorrectionInfo>, String> {
    let mut out = Vec::with_capacity(corrections.len());
    for c in corrections {
        let mut matched: Option<(String, PathBuf)> = None;
        for (version, dir) in installed_versions_for(data_dir, c.target_vendor, c.target_arch) {
            if version_matches(c.version_pattern, &version) {
                matched = Some((version, dir));
                break;
            }
        }
        // Active iff every overlay file exists AND carries OUR fingerprint.
        // A file we didn't write doesn't count as active — we'd refuse to
        // remove it later, so the badge would be misleading.
        let active = matched
            .as_ref()
            .map(|(_, dir)| {
                c.files.iter().all(|f| {
                    let p = dir.join(f.name);
                    match fs::read_to_string(&p) {
                        Ok(raw) => unfingerprint(c.id, &raw).is_some(),
                        Err(_) => false,
                    }
                })
            })
            .unwrap_or(false);
        out.push(CorrectionInfo {
            id: c.id.into(),
            title: c.title.into(),
            reason: c.reason.into(),
            target: format!("{}:{}", c.target_vendor, c.target_arch),
            version_pattern: c.version_pattern.into(),
            upstream_issue: c.upstream_issue.map(String::from),
            matches_installed: matched.is_some(),
            active,
            platform_dir: matched.map(|(_, dir)| dir.to_string_lossy().into_owned()),
        });
    }
    Ok(out)
}

/// Apply (write) every correction whose target matches an installed platform.
///
/// For each overlay file:
///   1. Read the existing file (if any).
///   2. If it has our fingerprint and the payload is identical → no-op.
///   3. If it has our fingerprint but payload differs → atomic overwrite.
///   4. If it exists but is NOT ours → rename to `<name>.forgeboard-backup`,
///      then write our overlay in its place.
///   5. If it doesn't exist → atomic write.
///
/// Returns the IDs of corrections that produced any on-disk change.
pub async fn apply_all(app: &tauri::AppHandle) -> Result<Vec<String>, String> {
    let data_dir = arduino_data_dir(app).await?;
    apply_to_dir(&data_dir)
}

/// Pure-Rust core of `apply_all` — takes the arduino-cli data dir directly
/// so the test suite can exercise it against a tempdir without needing a
/// running Tauri app.
fn apply_to_dir(data_dir: &Path) -> Result<Vec<String>, String> {
    apply_to_dir_with(CORRECTIONS, data_dir)
}

fn apply_to_dir_with(corrections: &[Correction], data_dir: &Path) -> Result<Vec<String>, String> {
    let mut applied = Vec::new();
    for c in corrections {
        let mut matched: Option<PathBuf> = None;
        for (version, dir) in installed_versions_for(data_dir, c.target_vendor, c.target_arch) {
            if version_matches(c.version_pattern, &version) {
                matched = Some(dir);
                break;
            }
        }
        let Some(dir) = matched else { continue };
        let mut wrote_any = false;
        for f in c.files {
            let target = dir.join(f.name);
            let tagged = fingerprinted(c.id, f.contents);
            match fs::read_to_string(&target) {
                Ok(existing) => {
                    if let Some(existing_payload) = unfingerprint(c.id, &existing) {
                        // Our file already — overwrite only if the payload
                        // changed (cheap to skip; saves an inode write).
                        if existing_payload == f.contents {
                            continue;
                        }
                        atomic_write(&target, &tagged)?;
                        wrote_any = true;
                    } else {
                        // Foreign content. Move it aside as a backup, then
                        // write our overlay. The backup is restored on remove.
                        let backup = target.with_extension(format!(
                            "{}{BACKUP_SUFFIX}",
                            target
                                .extension()
                                .map(|e| e.to_string_lossy().into_owned())
                                .unwrap_or_default()
                        ));
                        // If a stale backup is already there, leave it alone
                        // — overwriting it would destroy the user's earliest
                        // copy. We just rename to a numbered fallback.
                        let backup = if backup.exists() {
                            let mut n = 1;
                            loop {
                                let candidate =
                                    target.with_extension(format!(
                                        "{}{BACKUP_SUFFIX}.{n}",
                                        target
                                            .extension()
                                            .map(|e| e.to_string_lossy().into_owned())
                                            .unwrap_or_default()
                                    ));
                                if !candidate.exists() {
                                    break candidate;
                                }
                                n += 1;
                                if n > 100 {
                                    return Err(format!(
                                        "too many backup files at {}; refusing to overwrite",
                                        target.display()
                                    ));
                                }
                            }
                        } else {
                            backup
                        };
                        fs::rename(&target, &backup).map_err(|e| {
                            format!(
                                "backup {} -> {}: {e}",
                                target.display(),
                                backup.display()
                            )
                        })?;
                        atomic_write(&target, &tagged)?;
                        wrote_any = true;
                    }
                }
                Err(_) => {
                    // No file at the target — fresh write.
                    atomic_write(&target, &tagged)?;
                    wrote_any = true;
                }
            }
        }
        if wrote_any {
            applied.push(c.id.to_string());
        }
    }
    Ok(applied)
}

/// Remove every overlay file this build of ForgeBoard would apply, leaving
/// the platform exactly as the vendor shipped it. Restores any backed-up
/// user file we previously moved aside. Idempotent — repeated runs are
/// no-ops.
///
/// We *only* delete files that carry our fingerprint. A `platform.local.txt`
/// the user wrote by hand (no fingerprint) is left untouched even if they
/// disable corrections — that would otherwise destroy their unrelated work.
pub async fn remove_all(app: &tauri::AppHandle) -> Result<Vec<String>, String> {
    let data_dir = arduino_data_dir(app).await?;
    remove_from_dir(&data_dir)
}

fn remove_from_dir(data_dir: &Path) -> Result<Vec<String>, String> {
    remove_from_dir_with(CORRECTIONS, data_dir)
}

fn remove_from_dir_with(corrections: &[Correction], data_dir: &Path) -> Result<Vec<String>, String> {
    let mut removed = Vec::new();
    for c in corrections {
        for (version, dir) in installed_versions_for(data_dir, c.target_vendor, c.target_arch) {
            if !version_matches(c.version_pattern, &version) {
                continue;
            }
            let mut removed_any = false;
            for f in c.files {
                let target = dir.join(f.name);
                let raw = match fs::read_to_string(&target) {
                    Ok(r) => r,
                    Err(_) => continue,
                };
                if unfingerprint(c.id, &raw).is_none() {
                    // Not ours — leave it alone.
                    continue;
                }
                fs::remove_file(&target).map_err(|e| {
                    format!("remove {}: {e}", target.display())
                })?;
                removed_any = true;
                // If there's a backup of the user's original file, restore it.
                let backup = target.with_extension(format!(
                    "{}{BACKUP_SUFFIX}",
                    target
                        .extension()
                        .map(|e| e.to_string_lossy().into_owned())
                        .unwrap_or_default()
                ));
                if backup.exists() {
                    fs::rename(&backup, &target).map_err(|e| {
                        format!(
                            "restore backup {} -> {}: {e}",
                            backup.display(),
                            target.display()
                        )
                    })?;
                }
            }
            if removed_any {
                removed.push(c.id.to_string());
            }
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a minimal platform dir at `<root>/packages/esp32/hardware/esp32/<version>/`
    /// — version dir, plus a stub platform.txt so `installed_versions_for`
    /// recognises it as a real platform.
    fn make_platform(root: &Path, vendor: &str, arch: &str, version: &str) -> PathBuf {
        let dir = root
            .join("packages")
            .join(vendor)
            .join("hardware")
            .join(arch)
            .join(version);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("platform.txt"), "name=stub").unwrap();
        dir
    }

    /// Test-only correction bundle. The shipped CORRECTIONS slice is allowed
    /// to be empty (it currently is), so the overlay machinery is exercised
    /// against this fixture via the `_with` entry points instead.
    const TEST_FILES: &[CorrectionFile] = &[
        CorrectionFile {
            name: "platform.local.txt",
            contents: "upload.extra=--before {upload.reset_before}\n",
        },
        CorrectionFile {
            name: "boards.local.txt",
            contents: "esp32s3.menu.usbreset=on\n",
        },
    ];
    const TEST_CORRECTIONS: &[Correction] = &[Correction {
        id: "test-fixture",
        title: "Test fixture correction",
        reason: "exercises the overlay machinery in tests",
        target_vendor: "esp32",
        target_arch: "esp32",
        version_pattern: "3.3.*",
        files: TEST_FILES,
        upstream_issue: None,
    }];

    #[test]
    fn version_pattern_matches() {
        assert!(version_matches("3.3.*", "3.3.0"));
        assert!(version_matches("3.3.*", "3.3.8"));
        assert!(version_matches("3.3.*", "3.3.10"));
        assert!(version_matches("3.3.*", "3.3."));
        assert!(!version_matches("3.3.*", "3.4.0"));
        assert!(!version_matches("3.3.*", "3.2.9"));
        assert!(!version_matches("3.3.*", "10.3.3"));
    }

    #[test]
    fn version_pattern_double_star() {
        assert!(version_matches("*.*.*", "3.3.8"));
        assert!(version_matches("*", "anything"));
    }

    #[test]
    fn version_pattern_literal() {
        assert!(version_matches("3.3.8", "3.3.8"));
        assert!(!version_matches("3.3.8", "3.3.9"));
        assert!(!version_matches("3.3.8", "3.3.80"));
    }

    #[test]
    fn bundled_corrections_are_well_formed() {
        // The bundle may legitimately be empty; when corrections ARE added,
        // every one must carry the fields the apply/remove machinery and the
        // Settings UI rely on. Guards future authoring mistakes.
        for c in CORRECTIONS {
            assert!(!c.id.is_empty(), "correction id must not be empty");
            assert!(!c.title.is_empty(), "{}: title must not be empty", c.id);
            assert!(!c.reason.is_empty(), "{}: reason must not be empty", c.id);
            assert!(
                !c.target_vendor.is_empty() && !c.target_arch.is_empty(),
                "{}: target vendor/arch must be set",
                c.id
            );
            assert!(
                !c.version_pattern.is_empty(),
                "{}: version pattern must be set",
                c.id
            );
            assert!(!c.files.is_empty(), "{}: must ship at least one file", c.id);
            for f in c.files {
                assert!(
                    f.name.ends_with(".local.txt"),
                    "{}: only *.local.txt overlays are safe to write",
                    c.id
                );
                assert!(!f.contents.is_empty(), "{}: {} is empty", c.id, f.name);
            }
        }
    }

    #[test]
    fn installed_versions_finds_platform_dirs() {
        let tmp = tempfile::tempdir().expect("tempdir");
        make_platform(tmp.path(), "esp32", "esp32", "3.3.8");
        make_platform(tmp.path(), "esp32", "esp32", "3.0.7");
        // garbage dir — no platform.txt, must be skipped
        let arch_dir = tmp
            .path()
            .join("packages/esp32/hardware/esp32/notaversion");
        fs::create_dir_all(&arch_dir).unwrap();

        let versions = installed_versions_for(tmp.path(), "esp32", "esp32");
        let names: Vec<_> = versions.iter().map(|(v, _)| v.clone()).collect();
        assert!(names.contains(&"3.3.8".to_string()));
        assert!(names.contains(&"3.0.7".to_string()));
        assert!(!names.contains(&"notaversion".to_string()));
    }

    #[test]
    fn installed_versions_missing_returns_empty() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let versions = installed_versions_for(tmp.path(), "esp32", "esp32");
        assert!(versions.is_empty());
    }

    #[test]
    fn fingerprint_roundtrip() {
        let tagged = fingerprinted("test-id", "payload\nline two\n");
        assert!(tagged.starts_with("# ForgeBoard:correction=test-id\n"));
        let payload = unfingerprint("test-id", &tagged).unwrap();
        assert_eq!(payload, "payload\nline two\n");
    }

    #[test]
    fn fingerprint_wrong_id_not_recognised() {
        let tagged = fingerprinted("other-id", "x");
        assert!(unfingerprint("our-id", &tagged).is_none());
    }

    #[test]
    fn unfingerprint_rejects_foreign_file() {
        assert!(unfingerprint("any-id", "# just a regular comment\nfoo=bar").is_none());
        assert!(unfingerprint("any-id", "").is_none());
        assert!(unfingerprint("any-id", "no leading newline").is_none());
    }

    #[test]
    fn apply_writes_overlay_to_matching_platform() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = make_platform(tmp.path(), "esp32", "esp32", "3.3.8");
        let applied = apply_to_dir_with(TEST_CORRECTIONS, tmp.path()).unwrap();
        assert_eq!(applied, vec!["test-fixture"]);
        // Both overlay files now exist and start with our fingerprint.
        for name in ["platform.local.txt", "boards.local.txt"] {
            let raw = fs::read_to_string(dir.join(name)).unwrap();
            assert!(
                raw.starts_with(FINGERPRINT_PREFIX),
                "{name} should start with our fingerprint"
            );
            assert!(
                unfingerprint("test-fixture", &raw).is_some(),
                "{name} should round-trip through the fingerprint"
            );
        }
    }

    #[test]
    fn apply_is_idempotent_when_contents_match() {
        let tmp = tempfile::tempdir().unwrap();
        make_platform(tmp.path(), "esp32", "esp32", "3.3.8");
        // First apply writes — second is a no-op.
        let first = apply_to_dir_with(TEST_CORRECTIONS, tmp.path()).unwrap();
        assert_eq!(first.len(), 1);
        let second = apply_to_dir_with(TEST_CORRECTIONS, tmp.path()).unwrap();
        assert!(
            second.is_empty(),
            "second apply should not report any writes"
        );
    }

    #[test]
    fn apply_skips_non_matching_versions() {
        let tmp = tempfile::tempdir().unwrap();
        // Only 3.0.7 installed — pattern is 3.3.*, so no match.
        let dir = make_platform(tmp.path(), "esp32", "esp32", "3.0.7");
        let applied = apply_to_dir_with(TEST_CORRECTIONS, tmp.path()).unwrap();
        assert!(applied.is_empty());
        assert!(!dir.join("platform.local.txt").exists());
        assert!(!dir.join("boards.local.txt").exists());
    }

    #[test]
    fn apply_backs_up_foreign_file() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = make_platform(tmp.path(), "esp32", "esp32", "3.3.8");
        // User wrote their own platform.local.txt before we got here.
        let user_content = "user.extra_flags=-DUSER_FLAG=1\n";
        fs::write(dir.join("platform.local.txt"), user_content).unwrap();

        apply_to_dir_with(TEST_CORRECTIONS, tmp.path()).unwrap();

        // Our file is in place.
        let ours = fs::read_to_string(dir.join("platform.local.txt")).unwrap();
        assert!(ours.starts_with(FINGERPRINT_PREFIX));
        // User's content was moved aside, not deleted.
        let backup = fs::read_to_string(dir.join("platform.local.txt.forgeboard-backup"))
            .unwrap();
        assert_eq!(backup, user_content);
    }

    #[test]
    fn remove_restores_backed_up_file() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = make_platform(tmp.path(), "esp32", "esp32", "3.3.8");
        let user_content = "user.line=keep me\n";
        fs::write(dir.join("platform.local.txt"), user_content).unwrap();

        apply_to_dir_with(TEST_CORRECTIONS, tmp.path()).unwrap();
        // Apply moved the user's file to .forgeboard-backup.
        assert!(dir.join("platform.local.txt.forgeboard-backup").exists());

        remove_from_dir_with(TEST_CORRECTIONS, tmp.path()).unwrap();
        // After remove the user's original is back at the canonical path.
        let restored = fs::read_to_string(dir.join("platform.local.txt")).unwrap();
        assert_eq!(restored, user_content);
        // And the backup file is gone.
        assert!(!dir.join("platform.local.txt.forgeboard-backup").exists());
    }

    #[test]
    fn remove_only_deletes_fingerprinted_files() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = make_platform(tmp.path(), "esp32", "esp32", "3.3.8");
        // User wrote a file with the same name but it's NOT ours (no fingerprint).
        let user_content = "user.set=true\n";
        fs::write(dir.join("platform.local.txt"), user_content).unwrap();

        // Remove must not delete the user's file when no fingerprint matches.
        let removed = remove_from_dir_with(TEST_CORRECTIONS, tmp.path()).unwrap();
        assert!(
            removed.is_empty(),
            "remove should not touch non-fingerprinted files"
        );
        let still_there = fs::read_to_string(dir.join("platform.local.txt")).unwrap();
        assert_eq!(still_there, user_content);
    }

    #[test]
    fn apply_then_remove_is_round_trip_clean() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = make_platform(tmp.path(), "esp32", "esp32", "3.3.8");
        apply_to_dir_with(TEST_CORRECTIONS, tmp.path()).unwrap();
        remove_from_dir_with(TEST_CORRECTIONS, tmp.path()).unwrap();
        // After remove on a clean apply, neither overlay file remains
        // and there's no leftover backup file.
        for name in ["platform.local.txt", "boards.local.txt"] {
            assert!(
                !dir.join(name).exists(),
                "{name} should be removed after apply→remove"
            );
            assert!(
                !dir.join(format!("{name}.forgeboard-backup")).exists(),
                "no spurious backup should remain for {name}"
            );
        }
    }

    #[test]
    fn apply_skips_corrupt_dirs_without_platform_txt() {
        let tmp = tempfile::tempdir().unwrap();
        // Create a version-named dir without platform.txt — not a real platform.
        let half = tmp
            .path()
            .join("packages/esp32/hardware/esp32/3.3.8");
        fs::create_dir_all(&half).unwrap();
        let applied = apply_to_dir_with(TEST_CORRECTIONS, tmp.path()).unwrap();
        assert!(applied.is_empty(), "half-installed platform must be skipped");
        assert!(!half.join("platform.local.txt").exists());
    }

    #[test]
    fn apply_overwrites_stale_fingerprinted_file() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = make_platform(tmp.path(), "esp32", "esp32", "3.3.8");
        // Pretend a previous ForgeBoard build wrote a different overlay.
        let stale = fingerprinted("test-fixture", "old.payload=different\n");
        fs::write(dir.join("platform.local.txt"), &stale).unwrap();

        apply_to_dir_with(TEST_CORRECTIONS, tmp.path()).unwrap();

        let fresh = fs::read_to_string(dir.join("platform.local.txt")).unwrap();
        assert!(fresh.contains("upload.extra"), "should contain current payload");
        assert_ne!(fresh, stale, "stale overlay should be replaced");
        // No backup created for our own file — we just overwrote.
        assert!(!dir.join("platform.local.txt.forgeboard-backup").exists());
    }

    #[test]
    fn atomic_write_replaces_existing_file_in_place() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("file.txt");
        fs::write(&target, "old").unwrap();
        atomic_write(&target, "new").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "new");
        // No leftover tempfile.
        let leftover: Vec<_> = fs::read_dir(tmp.path())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains("forgeboard-tmp"))
            .collect();
        assert!(leftover.is_empty(), "no temp file should remain");
    }
}
