// Parallel filesystem scanner: builds an in-memory arena tree with recursive
// directory sizes, deduplicating hardlinks and (optionally) staying on one
// filesystem. Emits live progress and supports cancellation.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use dashmap::DashMap;
use rayon::prelude::*;
use serde::Serialize;

#[cfg(unix)]
use std::os::unix::fs::MetadataExt;

/// One node in the scan arena. `children` is only populated for directories.
/// Paths are reconstructed on demand by walking `parent` links to keep memory
/// low when scanning millions of files.
pub struct Node {
    pub name: String,
    pub parent: Option<usize>,
    pub size: u64,
    pub is_dir: bool,
    pub denied: bool,
    pub children: Vec<usize>,
}

/// A finished scan, held in app state for the session.
pub struct ScanResult {
    pub root_path: PathBuf,
    pub nodes: Vec<Node>,
}

impl ScanResult {
    /// Absolute path of a node by walking parent links up to the root.
    pub fn path_of(&self, id: usize) -> PathBuf {
        let mut names: Vec<&str> = Vec::new();
        let mut cur = id;
        while let Some(p) = self.nodes[cur].parent {
            names.push(&self.nodes[cur].name);
            cur = p;
        }
        let mut path = self.root_path.clone();
        for name in names.iter().rev() {
            path.push(name);
        }
        path
    }
}

/// Shared, lock-light state read by the progress emitter thread.
pub struct Progress {
    pub files: AtomicU64,
    pub bytes: AtomicU64,
    pub cancel: AtomicBool,
    pub current: Mutex<String>,
}

impl Progress {
    pub fn new() -> Self {
        Progress {
            files: AtomicU64::new(0),
            bytes: AtomicU64::new(0),
            cancel: AtomicBool::new(false),
            current: Mutex::new(String::new()),
        }
    }
}

/// Temporary nested node produced by the recursive walk before flattening
/// into the arena.
struct Temp {
    name: String,
    size: u64,
    is_dir: bool,
    denied: bool,
    children: Vec<Temp>,
}

struct Ctx {
    progress: Arc<Progress>,
    seen_inodes: DashMap<(u64, u64), ()>,
    root_dev: u64,
    one_filesystem: bool,
}

/// Scan `root`, returning the arena tree. Honors cancellation; a cancelled scan
/// still returns a (partial) tree.
pub fn scan(root: &Path, progress: Arc<Progress>, one_filesystem: bool) -> ScanResult {
    let root_meta = std::fs::symlink_metadata(root);
    #[cfg(unix)]
    let root_dev = root_meta.as_ref().map(|m| m.dev()).unwrap_or(0);
    #[cfg(not(unix))]
    let root_dev = 0;

    let ctx = Ctx {
        progress: progress.clone(),
        seen_inodes: DashMap::new(),
        root_dev,
        one_filesystem,
    };

    let root_name = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| root.to_string_lossy().into_owned());

    let temp = match root_meta {
        Ok(m) if m.is_dir() => walk_dir(root, &ctx, root_name),
        Ok(m) => {
            let size = file_size(&m);
            Temp { name: root_name, size, is_dir: false, denied: false, children: Vec::new() }
        }
        Err(_) => Temp {
            name: root_name,
            size: 0,
            is_dir: true,
            denied: true,
            children: Vec::new(),
        },
    };

    let mut nodes = Vec::new();
    flatten(temp, None, &mut nodes);
    ScanResult { root_path: root.to_path_buf(), nodes }
}

/// Logical file size. On Unix, hardlinked files (nlink > 1) are counted once.
#[cfg(unix)]
fn file_size(m: &std::fs::Metadata) -> u64 {
    m.len()
}
#[cfg(not(unix))]
fn file_size(m: &std::fs::Metadata) -> u64 {
    m.len()
}

fn walk_dir(dir: &Path, ctx: &Ctx, name: String) -> Temp {
    if ctx.progress.cancel.load(Ordering::Relaxed) {
        return Temp { name, size: 0, is_dir: true, denied: false, children: Vec::new() };
    }

    if let Ok(mut cur) = ctx.progress.current.lock() {
        *cur = dir.to_string_lossy().into_owned();
    }

    let read = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => {
            return Temp { name, size: 0, is_dir: true, denied: true, children: Vec::new() };
        }
    };

    // Collect entries first so we can parallelize subdirectory recursion.
    let entries: Vec<PathBuf> = read.filter_map(|e| e.ok().map(|e| e.path())).collect();

    let children: Vec<Temp> = entries
        .par_iter()
        .filter_map(|path| process_entry(path, ctx))
        .collect();

    let size = children.iter().map(|c| c.size).sum();
    Temp { name, size, is_dir: true, denied: false, children }
}

fn process_entry(path: &Path, ctx: &Ctx) -> Option<Temp> {
    if ctx.progress.cancel.load(Ordering::Relaxed) {
        return None;
    }
    let meta = std::fs::symlink_metadata(path).ok()?;

    // Skip symlinks entirely (avoid loops and double counting).
    if meta.file_type().is_symlink() {
        return None;
    }

    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();

    if meta.is_dir() {
        #[cfg(unix)]
        if ctx.one_filesystem && meta.dev() != ctx.root_dev {
            // Different filesystem (mountpoint) -> don't descend.
            return Some(Temp { name, size: 0, is_dir: true, denied: false, children: Vec::new() });
        }
        Some(walk_dir(path, ctx, name))
    } else {
        // Hardlink dedup: count multiply-linked inodes only once.
        #[cfg(unix)]
        {
            if meta.nlink() > 1 {
                let key = (meta.dev(), meta.ino());
                if ctx.seen_inodes.insert(key, ()).is_some() {
                    return None;
                }
            }
        }
        let size = file_size(&meta);
        ctx.progress.files.fetch_add(1, Ordering::Relaxed);
        ctx.progress.bytes.fetch_add(size, Ordering::Relaxed);
        Some(Temp { name, size, is_dir: false, denied: false, children: Vec::new() })
    }
}

/// Flatten the nested temp tree into the arena, assigning ids and parent links.
fn flatten(temp: Temp, parent: Option<usize>, nodes: &mut Vec<Node>) {
    let id = nodes.len();
    nodes.push(Node {
        name: temp.name,
        parent,
        size: temp.size,
        is_dir: temp.is_dir,
        denied: temp.denied,
        children: Vec::new(),
    });
    // Sort children by size desc so downstream views get a stable order.
    let mut kids = temp.children;
    kids.sort_unstable_by(|a, b| b.size.cmp(&a.size));
    let mut child_ids = Vec::with_capacity(kids.len());
    for kid in kids {
        let child_id = nodes.len();
        flatten(kid, Some(id), nodes);
        child_ids.push(child_id);
    }
    nodes[id].children = child_ids;
}

// ---- DTOs served to the frontend ----

#[derive(Serialize, Clone)]
pub struct TreeDto {
    pub id: usize,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub denied: bool,
    pub children: Vec<TreeDto>,
    /// True when this synthetic node aggregates many small siblings.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub is_other: bool,
}

#[derive(Serialize)]
pub struct ChildDto {
    pub id: usize,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub denied: bool,
}

#[derive(Serialize)]
pub struct TopFileDto {
    pub path: String,
    pub size: u64,
}

impl ScanResult {
    /// Build a pruned nested tree from `node_id`: descend up to `max_depth`
    /// levels and fold children smaller than `min_fraction` of their parent
    /// into a single "(other)" node.
    pub fn tree_dto(&self, node_id: usize, max_depth: u32, min_fraction: f64) -> Option<TreeDto> {
        if node_id >= self.nodes.len() {
            return None;
        }
        Some(self.build_dto(node_id, max_depth, min_fraction))
    }

    fn build_dto(&self, id: usize, depth_left: u32, min_fraction: f64) -> TreeDto {
        let node = &self.nodes[id];
        let path = self.path_of(id).to_string_lossy().into_owned();
        let mut children = Vec::new();
        if node.is_dir && depth_left > 0 && !node.children.is_empty() {
            let threshold = (node.size as f64 * min_fraction) as u64;
            let mut other_size = 0u64;
            let mut other_count = 0u64;
            for &cid in &node.children {
                let csize = self.nodes[cid].size;
                if csize >= threshold && csize > 0 {
                    children.push(self.build_dto(cid, depth_left - 1, min_fraction));
                } else {
                    other_size += csize;
                    other_count += 1;
                }
            }
            if other_size > 0 {
                children.push(TreeDto {
                    id: usize::MAX,
                    name: format!("({} small items)", other_count),
                    path: String::new(),
                    size: other_size,
                    is_dir: true,
                    denied: false,
                    children: Vec::new(),
                    is_other: true,
                });
            }
        }
        TreeDto {
            id,
            name: node.name.clone(),
            path,
            size: node.size,
            is_dir: node.is_dir,
            denied: node.denied,
            children,
            is_other: false,
        }
    }

    /// Immediate children of a node, sorted by size desc (already sorted in arena).
    pub fn children_dto(&self, node_id: usize) -> Vec<ChildDto> {
        if node_id >= self.nodes.len() {
            return Vec::new();
        }
        self.nodes[node_id]
            .children
            .iter()
            .map(|&cid| {
                let n = &self.nodes[cid];
                ChildDto {
                    id: cid,
                    name: n.name.clone(),
                    path: self.path_of(cid).to_string_lossy().into_owned(),
                    size: n.size,
                    is_dir: n.is_dir,
                    denied: n.denied,
                }
            })
            .collect()
    }

    /// The `n` largest individual files across the whole scan.
    pub fn top_files(&self, n: usize) -> Vec<TopFileDto> {
        let mut files: Vec<(usize, u64)> = self
            .nodes
            .iter()
            .enumerate()
            .filter(|(_, node)| !node.is_dir && node.size > 0)
            .map(|(i, node)| (i, node.size))
            .collect();
        files.sort_unstable_by(|a, b| b.1.cmp(&a.1));
        files
            .into_iter()
            .take(n)
            .map(|(id, size)| TopFileDto {
                path: self.path_of(id).to_string_lossy().into_owned(),
                size,
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use std::sync::atomic::AtomicU32;

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn temp_root() -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let p = std::env::temp_dir().join(format!("spacelens_test_{}_{}", std::process::id(), n));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn write_file(path: &Path, bytes: usize) {
        let mut f = fs::File::create(path).unwrap();
        f.write_all(&vec![0u8; bytes]).unwrap();
    }

    #[test]
    fn computes_recursive_sizes_and_top_files() {
        let root = temp_root();
        write_file(&root.join("a.bin"), 1000);
        fs::create_dir_all(root.join("sub")).unwrap();
        write_file(&root.join("sub/b.bin"), 2000);
        write_file(&root.join("sub/c.bin"), 500);

        let result = scan(&root, Arc::new(Progress::new()), true);

        // Root size is the sum of all files (1000 + 2000 + 500).
        assert_eq!(result.nodes[0].size, 3500);

        // Largest file is b.bin, then a.bin.
        let top = result.top_files(2);
        assert_eq!(top.len(), 2);
        assert!(top[0].path.ends_with("b.bin"));
        assert_eq!(top[0].size, 2000);
        assert!(top[1].path.ends_with("a.bin"));

        // Children of the root are sorted by size desc: "sub" (2500) before "a.bin" (1000).
        let kids = result.children_dto(0);
        assert_eq!(kids[0].name, "sub");
        assert_eq!(kids[0].size, 2500);
        assert!(kids[0].is_dir);

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn cancellation_stops_scan() {
        let root = temp_root();
        write_file(&root.join("x.bin"), 100);
        let progress = Arc::new(Progress::new());
        progress.cancel.store(true, Ordering::Relaxed);
        let result = scan(&root, progress, true);
        // Cancelled before descending: root reports zero size.
        assert_eq!(result.nodes[0].size, 0);
        fs::remove_dir_all(&root).unwrap();
    }
}
