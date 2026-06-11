// Enumerate mounted disks/partitions with usage figures via sysinfo.

use serde::Serialize;
use sysinfo::Disks;

#[derive(Serialize)]
pub struct DiskDto {
    pub name: String,
    pub mount_point: String,
    pub file_system: String,
    pub total: u64,
    pub available: u64,
    pub used: u64,
    pub is_removable: bool,
}

/// List real, non-pseudo filesystems. Filters out tmpfs/overlay and similar
/// virtual mounts so the overview only shows disks worth scanning.
pub fn list_disks() -> Vec<DiskDto> {
    let disks = Disks::new_with_refreshed_list();
    let mut out: Vec<DiskDto> = disks
        .iter()
        .filter(|d| {
            let fs = d.file_system().to_string_lossy().to_lowercase();
            let mount = d.mount_point().to_string_lossy();
            // Skip pseudo / virtual filesystems and noisy system mounts.
            let pseudo = matches!(
                fs.as_str(),
                "tmpfs" | "devtmpfs" | "overlay" | "squashfs" | "proc" | "sysfs"
                    | "cgroup" | "cgroup2" | "ramfs" | "autofs" | "mqueue" | "debugfs"
                    | "tracefs" | "configfs" | "fusectl" | "securityfs" | "pstore"
                    | "bpf" | "efivarfs" | "hugetlbfs"
            );
            let noisy = mount.starts_with("/proc")
                || mount.starts_with("/sys")
                || mount.starts_with("/dev")
                || mount.starts_with("/run")
                || mount.starts_with("/tmp/.mount_") // AppImage FUSE mounts
                || fs.starts_with("fuse");
            d.total_space() > 0 && !pseudo && !noisy
        })
        .map(|d| {
            let total = d.total_space();
            let available = d.available_space();
            DiskDto {
                name: d.name().to_string_lossy().into_owned(),
                mount_point: d.mount_point().to_string_lossy().into_owned(),
                file_system: d.file_system().to_string_lossy().into_owned(),
                total,
                available,
                used: total.saturating_sub(available),
                is_removable: d.is_removable(),
            }
        })
        .collect();

    // Collapse multiple mounts of the same device (e.g. btrfs subvolumes,
    // which all report identical usage) into a single card, preferring the
    // shortest mount point — the filesystem root. Users can still target a
    // specific subfolder via "Choose a folder".
    out.sort_by(|a, b| {
        a.name
            .cmp(&b.name)
            .then(a.mount_point.len().cmp(&b.mount_point.len()))
    });
    out.dedup_by(|a, b| !a.name.is_empty() && a.name == b.name);
    out.sort_by(|a, b| b.total.cmp(&a.total));
    out
}
