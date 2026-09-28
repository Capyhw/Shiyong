fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "native_install",
            "native_list",
            "native_open",
            "native_uninstall",
            "open_web_app",
            "open_release_page",
            "show_manager",
            "show_launcher",
            "hide_launcher",
            "runtime_status",
        ]),
    ))
    .expect("failed to build Tauri manifest");
}
