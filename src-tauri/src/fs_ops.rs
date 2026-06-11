// Filesystem mutations and helpers: trash/permanent delete, open in file
// manager, and computing sizes of well-known cleanable locations.

use std::path::{Path, PathBuf};

use serde::Serialize;

/// Move paths to the system trash (recoverable). Returns per-path errors.
pub fn delete_to_trash(paths: &[String]) -> Vec<String> {
    let mut errors = Vec::new();
    for p in paths {
        if let Err(e) = trash::delete(p) {
            errors.push(format!("{}: {}", p, e));
        }
    }
    errors
}

/// Permanently delete paths (no recovery). Returns per-path errors.
pub fn delete_permanent(paths: &[String]) -> Vec<String> {
    let mut errors = Vec::new();
    for p in paths {
        let path = Path::new(p);
        let res = match std::fs::symlink_metadata(path) {
            Ok(m) if m.is_dir() => std::fs::remove_dir_all(path),
            Ok(_) => std::fs::remove_file(path),
            Err(e) => Err(e),
        };
        if let Err(e) = res {
            errors.push(format!("{}: {}", p, e));
        }
    }
    errors
}

/// Open the containing folder of a path in the system file manager,
/// selecting the file when the manager supports it.
pub fn open_in_file_manager(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    let target = if p.is_dir() {
        p.to_path_buf()
    } else {
        p.parent().map(|x| x.to_path_buf()).unwrap_or_else(|| p.to_path_buf())
    };
    std::process::Command::new("xdg-open")
        .arg(&target)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

// ---- Cleanup suggestions ----

#[derive(Serialize)]
pub struct CleanupItem {
    /// Stable key the frontend maps to a localized label + description.
    pub key: String,
    pub path: String,
    pub size: u64,
    /// "safe" | "caution"
    pub safety: String,
}

/// Recursively sum file sizes under `path`, ignoring errors and symlinks.
/// Used for quick estimates, not exact accounting.
fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    let mut stack = vec![path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let rd = match std::fs::read_dir(&dir) {
            Ok(rd) => rd,
            Err(_) => continue,
        };
        for entry in rd.flatten() {
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.file_type().is_symlink() {
                continue;
            }
            if meta.is_dir() {
                stack.push(entry.path());
            } else {
                total += meta.len();
            }
        }
    }
    total
}

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// Scan a fixed set of well-known cleanable locations and report those that
/// exist with a non-zero size.
pub fn cleanup_suggestions() -> Vec<CleanupItem> {
    let mut items = Vec::new();
    let h = home();

    // (key, absolute path, safety)
    let mut candidates: Vec<(&str, PathBuf, &str)> = Vec::new();

    candidates.push(("pacman_cache", PathBuf::from("/var/cache/pacman/pkg"), "caution"));
    candidates.push(("apt_cache", PathBuf::from("/var/cache/apt/archives"), "caution"));
    candidates.push(("dnf_cache", PathBuf::from("/var/cache/dnf"), "caution"));
    candidates.push(("journal_logs", PathBuf::from("/var/log/journal"), "caution"));

    if let Some(h) = &h {
        candidates.push(("user_cache", h.join(".cache"), "safe"));
        candidates.push(("thumbnails", h.join(".cache/thumbnails"), "safe"));
        candidates.push(("trash", h.join(".local/share/Trash"), "safe"));
        candidates.push(("yay_cache", h.join(".cache/yay"), "safe"));
        candidates.push(("paru_cache", h.join(".cache/paru"), "safe"));
        candidates.push(("chrome_cache", h.join(".cache/google-chrome"), "safe"));
        candidates.push(("chromium_cache", h.join(".cache/chromium"), "safe"));
        candidates.push(("brave_cache", h.join(".cache/BraveSoftware"), "safe"));
        candidates.push(("mozilla_cache", h.join(".cache/mozilla"), "safe"));
        candidates.push(("zen_cache", h.join(".cache/zen"), "safe"));
    }

    for (key, path, safety) in candidates {
        if path.exists() {
            let size = dir_size(&path);
            if size > 0 {
                items.push(CleanupItem {
                    key: key.to_string(),
                    path: path.to_string_lossy().into_owned(),
                    size,
                    safety: safety.to_string(),
                });
            }
        }
    }

    items.sort_by(|a, b| b.size.cmp(&a.size));
    items
}
