mod disks;
mod fs_ops;
mod scanner;
mod system_info;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use scanner::{ChildDto, DupGroup, Progress, ScanResult, TopFileDto, TreeDto};

/// Session state: the most recent scan plus the live progress handle so an
/// in-flight scan can be cancelled.
#[derive(Default)]
struct AppState {
    scan: Mutex<Option<Arc<ScanResult>>>,
    progress: Mutex<Option<Arc<Progress>>>,
}

#[derive(Clone, Serialize)]
struct ProgressPayload {
    files: u64,
    bytes: u64,
    current: String,
}

#[derive(Clone, Serialize)]
struct CompletePayload {
    root: TreeDto,
    root_id: usize,
    total_size: u64,
    file_count: u64,
    cancelled: bool,
}

#[tauri::command]
fn list_disks() -> Vec<disks::DiskDto> {
    disks::list_disks()
}

#[tauri::command]
fn home_dir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
}

#[tauri::command]
fn get_system_info() -> system_info::SystemInfoDto {
    system_info::system_info()
}

/// Kick off a scan on a background thread. Progress is streamed via the
/// `scan-progress` event; the finished tree arrives via `scan-complete`.
#[tauri::command]
fn start_scan(app: AppHandle, state: State<AppState>, path: String, one_filesystem: bool) {
    let progress = Arc::new(Progress::new());
    *state.progress.lock().unwrap() = Some(progress.clone());

    let app_for_thread = app.clone();
    std::thread::spawn(move || {
        let done = Arc::new(AtomicBool::new(false));

        // Progress emitter: poll atomics ~10x/sec until the scan finishes.
        let emit_progress = progress.clone();
        let emit_done = done.clone();
        let emit_app = app_for_thread.clone();
        let emitter = std::thread::spawn(move || {
            while !emit_done.load(Ordering::Relaxed) {
                let current = emit_progress
                    .current
                    .lock()
                    .map(|c| c.clone())
                    .unwrap_or_default();
                let _ = emit_app.emit(
                    "scan-progress",
                    ProgressPayload {
                        files: emit_progress.files.load(Ordering::Relaxed),
                        bytes: emit_progress.bytes.load(Ordering::Relaxed),
                        current,
                    },
                );
                std::thread::sleep(Duration::from_millis(100));
            }
        });

        let result = scanner::scan(&PathBuf::from(&path), progress.clone(), one_filesystem);
        done.store(true, Ordering::Relaxed);
        let _ = emitter.join();

        let cancelled = progress.cancel.load(Ordering::Relaxed);
        let result = Arc::new(result);

        // Initial tree view: 3 levels deep, fold children under 0.1% of parent.
        let root = result.tree_dto(0, 3, 0.001);
        let total_size = result.nodes.first().map(|n| n.size).unwrap_or(0);
        let file_count = progress.files.load(Ordering::Relaxed);

        let app_state = app_for_thread.state::<AppState>();
        *app_state.scan.lock().unwrap() = Some(result);

        if let Some(root) = root {
            let _ = app_for_thread.emit(
                "scan-complete",
                CompletePayload { root, root_id: 0, total_size, file_count, cancelled },
            );
        }
    });
}

#[tauri::command]
fn cancel_scan(state: State<AppState>) {
    if let Some(p) = state.progress.lock().unwrap().as_ref() {
        p.cancel.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
fn get_tree(
    state: State<AppState>,
    node_id: usize,
    max_depth: u32,
    min_fraction: f64,
) -> Option<TreeDto> {
    let guard = state.scan.lock().unwrap();
    guard.as_ref().and_then(|s| s.tree_dto(node_id, max_depth, min_fraction))
}

#[tauri::command]
fn get_children(state: State<AppState>, node_id: usize) -> Vec<ChildDto> {
    let guard = state.scan.lock().unwrap();
    guard.as_ref().map(|s| s.children_dto(node_id)).unwrap_or_default()
}

#[tauri::command]
fn get_top_files(state: State<AppState>, n: usize) -> Vec<TopFileDto> {
    let guard = state.scan.lock().unwrap();
    guard.as_ref().map(|s| s.top_files(n)).unwrap_or_default()
}

#[tauri::command]
fn get_cleanup_suggestions() -> Vec<fs_ops::CleanupItem> {
    fs_ops::cleanup_suggestions()
}

/// Find duplicate files in the current scan. Hashing can take a while, so it
/// runs on a blocking worker thread instead of the IPC handler.
#[tauri::command]
async fn get_duplicates(
    state: State<'_, AppState>,
    min_size: u64,
) -> Result<Vec<DupGroup>, String> {
    let scan = state.scan.lock().unwrap().clone();
    let Some(scan) = scan else {
        return Ok(Vec::new());
    };
    tauri::async_runtime::spawn_blocking(move || scan.duplicate_groups(min_size, 100))
        .await
        .map_err(|e| e.to_string())
}

/// Delete paths. `mode` is "trash" (default, recoverable) or "permanent".
/// Returns a list of human-readable errors (empty on full success).
#[tauri::command]
fn delete_paths(paths: Vec<String>, mode: String) -> Vec<String> {
    if mode == "permanent" {
        fs_ops::delete_permanent(&paths)
    } else {
        fs_ops::delete_to_trash(&paths)
    }
}

#[tauri::command]
fn open_in_file_manager(path: String) -> Result<(), String> {
    fs_ops::open_in_file_manager(&path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            list_disks,
            home_dir,
            get_system_info,
            start_scan,
            cancel_scan,
            get_tree,
            get_children,
            get_top_files,
            get_cleanup_suggestions,
            get_duplicates,
            delete_paths,
            open_in_file_manager,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
