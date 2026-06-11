// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK's DMABUF renderer crashes or shows a blank window on a number
    // of Wayland setups (notably some NVIDIA and tiling-compositor configs).
    // Disabling it is the widely recommended, harmless fix. Users can still
    // override by exporting the variable themselves.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    spacelens_lib::run()
}
