mod native;
use native::{native_install, native_list, native_open, native_uninstall};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;

struct RuntimeStatus {
    shortcut_available: AtomicBool,
}

fn ensure_host(window: &WebviewWindow) -> Result<(), String> {
    if matches!(window.label(), "main" | "launcher") {
        Ok(())
    } else {
        Err("网页应用不能调用宿主命令".into())
    }
}
fn show(app: &AppHandle, label: &str) -> Result<(), String> {
    let window = app.get_webview_window(label).ok_or("窗口不存在")?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}
fn toggle_launcher(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("launcher") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.center();
            let _ = show(app, "launcher");
        }
    }
}
#[tauri::command]
fn show_manager(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    ensure_host(&window)?;
    if let Some(launcher) = app.get_webview_window("launcher") {
        let _ = launcher.hide();
    }
    show(&app, "main")
}
#[tauri::command]
fn show_launcher(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    ensure_host(&window)?;
    show(&app, "launcher")
}
#[tauri::command]
fn hide_launcher(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    ensure_host(&window)?;
    if let Some(launcher) = app.get_webview_window("launcher") {
        launcher.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusResponse {
    shortcut_available: bool,
    arch: String,
}
#[tauri::command]
fn runtime_status(
    window: WebviewWindow,
    state: tauri::State<RuntimeStatus>,
) -> Result<StatusResponse, String> {
    ensure_host(&window)?;
    Ok(StatusResponse {
        shortcut_available: state.shortcut_available.load(Ordering::Relaxed),
        arch: if cfg!(target_arch = "aarch64") {
            "arm64"
        } else {
            "x64"
        }
        .into(),
    })
}
fn allowed_url(url: &url::Url) -> bool {
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    (url.scheme() == "https" || (url.scheme() == "http" && local))
        && url.username().is_empty()
        && url.password().is_none()
}
#[tauri::command]
async fn open_web_app(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
    title: String,
    url: String,
) -> Result<(), String> {
    ensure_host(&window)?;
    if id.is_empty()
        || id.len() > 80
        || !id
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
    {
        return Err("应用标识无效".into());
    }
    let target: url::Url = url.parse().map_err(|_| "应用地址无效")?;
    if !allowed_url(&target) {
        return Err("应用地址不受支持".into());
    }
    let label = format!("web-{}", id);
    if app.get_webview_window(&label).is_some() {
        return show(&app, &label);
    }
    let origin = target.origin();
    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(target))
        .title(title.chars().take(100).collect::<String>())
        .inner_size(1080.0, 760.0)
        .min_inner_size(640.0, 480.0)
        .center()
        // 远程窗口没有 capabilities；导航保持在应用来源，避免进入本地宿主页面。
        .on_navigation(move |next| allowed_url(next) && next.origin() == origin)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}
fn release_url(repository: &str) -> Result<String, String> {
    let parts: Vec<&str> = repository.split('/').collect();
    if parts.len() != 2
        || parts.iter().any(|part| {
            part.is_empty()
                || *part == "."
                || *part == ".."
                || !part
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_' | b'.'))
        })
    {
        return Err("GitHub 仓库标识无效".into());
    }
    Ok(format!("https://github.com/{}/releases/latest", repository))
}
#[tauri::command]
fn open_release_page(
    app: AppHandle,
    window: WebviewWindow,
    repository: String,
) -> Result<(), String> {
    ensure_host(&window)?;
    app.opener()
        .open_url(release_url(&repository)?, None::<&str>)
        .map_err(|e| e.to_string())
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = show(app, "main");
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_launcher(app);
                    }
                })
                .build(),
        )
        .manage(RuntimeStatus {
            shortcut_available: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            native_install,
            native_list,
            native_open,
            native_uninstall,
            open_web_app,
            open_release_page,
            show_manager,
            show_launcher,
            hide_launcher,
            runtime_status
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let open = MenuItem::with_id(app, "open", "应用中心", true, None::<&str>)?;
            let launcher = MenuItem::with_id(app, "launcher", "打开主菜单", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出拾用", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&launcher, &open, &quit])?;
            TrayIconBuilder::with_id("shiyong")
                .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
                .icon_as_template(cfg!(target_os = "macos"))
                .tooltip("拾用")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        let _ = show(app, "main");
                    }
                    "launcher" => toggle_launcher(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_launcher(tray.app_handle());
                    }
                })
                .build(app)?;
            let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
            let registered = app.global_shortcut().register(shortcut).is_ok();
            app.state::<RuntimeStatus>()
                .shortcut_available
                .store(registered, Ordering::Relaxed);
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. }
                if matches!(window.label(), "main" | "launcher") =>
            {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Focused(false) if window.label() == "launcher" => {
                let _ = window.hide();
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("启动拾用失败");
}

#[cfg(test)]
mod tests {
    use super::{allowed_url, release_url};
    #[test]
    fn releases_are_confined_to_github() {
        assert_eq!(
            release_url("Capyhw/NetSplit").unwrap(),
            "https://github.com/Capyhw/NetSplit/releases/latest"
        );
        for repo in [
            "../bad",
            "owner/..",
            "owner/repo?redirect=evil",
            "https://evil.test",
            "owner/repo/path",
        ] {
            assert!(release_url(repo).is_err());
        }
    }
    #[test]
    fn remote_windows_accept_only_web_addresses() {
        for value in ["https://example.com/json", "http://localhost:7854/json"] {
            assert!(allowed_url(&value.parse().unwrap()));
        }
        for value in [
            "file:///etc/passwd",
            "http://example.com",
            "https://user:pass@example.com",
            "tauri://localhost",
        ] {
            assert!(!allowed_url(&value.parse().unwrap()));
        }
    }
}
