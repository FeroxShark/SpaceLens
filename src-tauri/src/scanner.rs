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
    /// Last modification, unix seconds (0 when unknown).
    pub mtime: i64,
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
    mtime: i64,
    children: Vec<Temp>,
}

struct Ctx {
    progress: Arc<Progress>,
    seen_inodes: DashMap<(u64, u64), ()>,
    root_dev: u64,
    one_filesystem: bool,
    /// Mount points of pseudo/virtual filesystems (proc, sysfs, tmpfs…).
    /// Never descended into: they aren't disk space, and /proc/kcore even
    /// reports a bogus 128 TiB size.
    pseudo_mounts: std::collections::HashSet<PathBuf>,
}

/// Filesystem types that don't live on disk (or would double-count it).
const PSEUDO_FS: &[&str] = &[
    "proc", "sysfs", "devtmpfs", "devpts", "tmpfs", "ramfs", "cgroup", "cgroup2",
    "bpf", "debugfs", "tracefs", "securityfs", "pstore", "efivarfs", "configfs",
    "fusectl", "mqueue", "hugetlbfs", "binfmt_misc", "autofs", "overlay",
    "fuse.gvfsd-fuse", "fuse.portal", "nsfs", "rpc_pipefs",
];

/// Parse /proc/mounts content into the set of pseudo-filesystem mount points.
fn parse_pseudo_mounts(contents: &str) -> std::collections::HashSet<PathBuf> {
    let mut out = std::collections::HashSet::new();
    for line in contents.lines() {
        let mut parts = line.split_whitespace();
        let _dev = parts.next();
        let (Some(mount), Some(fstype)) = (parts.next(), parts.next()) else {
            continue;
        };
        if PSEUDO_FS.contains(&fstype) {
            // /proc/mounts escapes spaces as \040.
            out.insert(PathBuf::from(mount.replace("\\040", " ")));
        }
    }
    out
}

fn pseudo_mounts() -> std::collections::HashSet<PathBuf> {
    std::fs::read_to_string("/proc/mounts")
        .map(|c| parse_pseudo_mounts(&c))
        .unwrap_or_default()
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
        pseudo_mounts: pseudo_mounts(),
    };

    let root_name = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| root.to_string_lossy().into_owned());

    let temp = match root_meta {
        Ok(m) if m.is_dir() => {
            let mtime = mtime_secs(&m);
            walk_dir(root, &ctx, root_name, mtime)
        }
        Ok(m) => {
            let size = file_size(&m);
            Temp { name: root_name, size, is_dir: false, denied: false, mtime: mtime_secs(&m), children: Vec::new() }
        }
        Err(_) => Temp {
            name: root_name,
            size: 0,
            is_dir: true,
            denied: true,
            mtime: 0,
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

fn mtime_secs(m: &std::fs::Metadata) -> i64 {
    m.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn walk_dir(dir: &Path, ctx: &Ctx, name: String, mtime: i64) -> Temp {
    if ctx.progress.cancel.load(Ordering::Relaxed) {
        return Temp { name, size: 0, is_dir: true, denied: false, mtime, children: Vec::new() };
    }

    if let Ok(mut cur) = ctx.progress.current.lock() {
        *cur = dir.to_string_lossy().into_owned();
    }

    let read = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => {
            return Temp { name, size: 0, is_dir: true, denied: true, mtime, children: Vec::new() };
        }
    };

    // Collect entries first so we can parallelize subdirectory recursion.
    let entries: Vec<PathBuf> = read.filter_map(|e| e.ok().map(|e| e.path())).collect();

    let children: Vec<Temp> = entries
        .par_iter()
        .filter_map(|path| process_entry(path, ctx))
        .collect();

    let size = children.iter().map(|c| c.size).sum();
    Temp { name, size, is_dir: true, denied: false, mtime, children }
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

    let mtime = mtime_secs(&meta);

    if meta.is_dir() {
        // Virtual filesystems are never disk space — skip them entirely.
        if ctx.pseudo_mounts.contains(path) {
            return None;
        }
        #[cfg(unix)]
        if ctx.one_filesystem && meta.dev() != ctx.root_dev {
            // Different filesystem (mountpoint) -> don't descend.
            return Some(Temp { name, size: 0, is_dir: true, denied: false, mtime, children: Vec::new() });
        }
        Some(walk_dir(path, ctx, name, mtime))
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
        Some(Temp { name, size, is_dir: false, denied: false, mtime, children: Vec::new() })
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
        mtime: temp.mtime,
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
    pub mtime: i64,
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
    pub mtime: i64,
}

#[derive(Serialize)]
pub struct TopFileDto {
    pub path: String,
    pub size: u64,
}

#[derive(Serialize)]
pub struct DupGroup {
    /// Size of each copy in bytes.
    pub size: u64,
    pub count: usize,
    /// Bytes you'd reclaim by keeping a single copy.
    pub wasted: u64,
    pub paths: Vec<String>,
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
                    mtime: 0,
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
            mtime: node.mtime,
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
                    mtime: n.mtime,
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

    /// Find groups of identical files (same size and same blake3 content
    /// hash) at least `min_size` bytes each. Cheap pre-filters first: group
    /// by size, then by a hash of the first 256 KiB, then by full hash.
    /// Returns up to `max_groups` groups, biggest reclaimable space first.
    pub fn duplicate_groups(&self, min_size: u64, max_groups: usize) -> Vec<DupGroup> {
        use std::collections::HashMap;
        use std::io::Read;

        // 1. Candidate files bucketed by size.
        let mut by_size: HashMap<u64, Vec<usize>> = HashMap::new();
        for (i, node) in self.nodes.iter().enumerate() {
            if !node.is_dir && node.size >= min_size {
                by_size.entry(node.size).or_default().push(i);
            }
        }
        let candidates: Vec<(u64, Vec<usize>)> =
            by_size.into_iter().filter(|(_, ids)| ids.len() > 1).collect();

        fn hash_file(path: &Path, limit: Option<u64>) -> Option<[u8; 32]> {
            let f = std::fs::File::open(path).ok()?;
            let mut hasher = blake3::Hasher::new();
            let mut reader: Box<dyn Read> = match limit {
                Some(l) => Box::new(f.take(l)),
                None => Box::new(f),
            };
            let mut buf = [0u8; 64 * 1024];
            loop {
                let n = reader.read(&mut buf).ok()?;
                if n == 0 {
                    break;
                }
                hasher.update(&buf[..n]);
            }
            Some(*hasher.finalize().as_bytes())
        }

        const PARTIAL: u64 = 256 * 1024;

        // 2. Within each size bucket, split by partial then full hash.
        let groups: Vec<DupGroup> = candidates
            .par_iter()
            .flat_map(|(size, ids)| {
                let mut by_partial: HashMap<[u8; 32], Vec<usize>> = HashMap::new();
                for &id in ids {
                    let path = self.path_of(id);
                    if let Some(h) = hash_file(&path, Some(PARTIAL)) {
                        by_partial.entry(h).or_default().push(id);
                    }
                }
                let mut out = Vec::new();
                for (_, ids) in by_partial.into_iter().filter(|(_, v)| v.len() > 1) {
                    // Small files are fully covered by the partial hash.
                    let mut by_full: HashMap<[u8; 32], Vec<usize>> = HashMap::new();
                    if *size <= PARTIAL {
                        by_full.insert([0u8; 32], ids);
                    } else {
                        for id in ids {
                            let path = self.path_of(id);
                            if let Some(h) = hash_file(&path, None) {
                                by_full.entry(h).or_default().push(id);
                            }
                        }
                    }
                    for (_, dup_ids) in by_full.into_iter().filter(|(_, v)| v.len() > 1) {
                        out.push(DupGroup {
                            size: *size,
                            count: dup_ids.len(),
                            wasted: size * (dup_ids.len() as u64 - 1),
                            paths: dup_ids
                                .iter()
                                .map(|&id| self.path_of(id).to_string_lossy().into_owned())
                                .collect(),
                        });
                    }
                }
                out
            })
            .collect();

        let mut groups = groups;
        groups.sort_unstable_by(|a, b| b.wasted.cmp(&a.wasted));
        groups.truncate(max_groups);
        groups
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
    fn pseudo_mounts_parsed_from_proc_mounts() {
        let sample = "\
proc /proc proc rw 0 0
sysfs /sys sysfs rw 0 0
/dev/nvme0n1p2 / btrfs rw,subvol=/@ 0 0
/dev/nvme0n1p2 /home btrfs rw,subvol=/@home 0 0
tmpfs /tmp tmpfs rw 0 0
tmpfs /run tmpfs rw 0 0
/dev/sda1 /mnt/backup-usb ext4 rw 0 0
overlay /var/lib/docker/overlay2/abc/merged overlay rw 0 0
";
        let set = parse_pseudo_mounts(sample);
        assert!(set.contains(&PathBuf::from("/proc")));
        assert!(set.contains(&PathBuf::from("/sys")));
        assert!(set.contains(&PathBuf::from("/tmp")));
        assert!(set.contains(&PathBuf::from("/run")));
        assert!(set.contains(&PathBuf::from("/var/lib/docker/overlay2/abc/merged")));
        // Real disk filesystems must NOT be excluded.
        assert!(!set.contains(&PathBuf::from("/")));
        assert!(!set.contains(&PathBuf::from("/home")));
        assert!(!set.contains(&PathBuf::from("/mnt/backup-usb")));
    }

    #[test]
    fn finds_duplicate_files() {
        let root = temp_root();
        // Two identical files, one same-size-but-different, one unique.
        let mut a = fs::File::create(root.join("a.dat")).unwrap();
        a.write_all(&[7u8; 4096]).unwrap();
        let mut b = fs::File::create(root.join("b.dat")).unwrap();
        b.write_all(&[7u8; 4096]).unwrap();
        let mut c = fs::File::create(root.join("c.dat")).unwrap();
        c.write_all(&[9u8; 4096]).unwrap();
        write_file(&root.join("d.dat"), 100);

        let result = scan(&root, Arc::new(Progress::new()), true);
        let groups = result.duplicate_groups(1, 10);

        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].count, 2);
        assert_eq!(groups[0].size, 4096);
        assert_eq!(groups[0].wasted, 4096);
        let mut names: Vec<String> = groups[0]
            .paths
            .iter()
            .map(|p| p.rsplit('/').next().unwrap().to_string())
            .collect();
        names.sort();
        assert_eq!(names, vec!["a.dat", "b.dat"]);

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
