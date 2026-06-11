// Typed bridge to the Rust backend: command wrappers and scan event helpers.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface Disk {
  name: string;
  mount_point: string;
  file_system: string;
  total: number;
  available: number;
  used: number;
  is_removable: boolean;
}

export interface TreeNode {
  id: number;
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  denied: boolean;
  mtime: number;
  children: TreeNode[];
  is_other?: boolean;
  /// Frontend-only: synthetic block representing the disk's free space.
  is_free?: boolean;
  /// Frontend-only: synthetic block for disk usage the scan couldn't see
  /// (no permission, other btrfs subvolumes, other filesystems).
  is_unscanned?: boolean;
}

export interface ChildNode {
  id: number;
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  denied: boolean;
  mtime: number;
}

export interface TopFile {
  path: string;
  size: number;
}

export interface DupGroup {
  size: number;
  count: number;
  wasted: number;
  paths: string[];
}

export interface CleanupItem {
  key: string;
  path: string;
  size: number;
  safety: "safe" | "caution";
}

export interface SystemInfo {
  distro_id: string;
  distro_name: string;
  id_like: string;
  package_managers: string[];
  home: string;
}

export interface ScanProgress {
  files: number;
  bytes: number;
  current: string;
}

export interface ScanComplete {
  root: TreeNode;
  root_id: number;
  total_size: number;
  file_count: number;
  cancelled: boolean;
}

export const listDisks = () => invoke<Disk[]>("list_disks");
export const homeDir = () => invoke<string>("home_dir");
export const getSystemInfo = () => invoke<SystemInfo>("get_system_info");
export const startScan = (path: string, oneFilesystem: boolean) =>
  invoke<void>("start_scan", { path, oneFilesystem });
export const cancelScan = () => invoke<void>("cancel_scan");
export const getTree = (nodeId: number, maxDepth: number, minFraction: number) =>
  invoke<TreeNode | null>("get_tree", { nodeId, maxDepth, minFraction });
export const getChildren = (nodeId: number) =>
  invoke<ChildNode[]>("get_children", { nodeId });
export const getTopFiles = (n: number) => invoke<TopFile[]>("get_top_files", { n });
export const getCleanupSuggestions = () =>
  invoke<CleanupItem[]>("get_cleanup_suggestions");
export const getDuplicates = (minSize: number) =>
  invoke<DupGroup[]>("get_duplicates", { minSize });
export const deletePaths = (paths: string[], mode: "trash" | "permanent") =>
  invoke<string[]>("delete_paths", { paths, mode });
export const openInFileManager = (path: string) =>
  invoke<void>("open_in_file_manager", { path });

export const onScanProgress = (cb: (p: ScanProgress) => void): Promise<UnlistenFn> =>
  listen<ScanProgress>("scan-progress", (e) => cb(e.payload));
export const onScanComplete = (cb: (c: ScanComplete) => void): Promise<UnlistenFn> =>
  listen<ScanComplete>("scan-complete", (e) => cb(e.payload));
