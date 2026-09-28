use objc2_app_kit::NSWindow;
use objc2_web_kit::WKWebView;
use tauri::{utils::config::WindowEffectsConfig, window::Effect, WebviewWindow};
use window_vibrancy::{
    apply_liquid_glass, clear_liquid_glass, LiquidGlassOptions, NSGlassEffectViewStyle,
};

pub fn configure_glass_content(
    host: &WebviewWindow,
    effects: WindowEffectsConfig,
) -> tauri::Result<()> {
    let window = host.clone();
    // with_webview 保证在主线程访问原生视图；不持有逃逸的 ObjC 裸指针。
    host.with_webview(move |platform| {
        // SAFETY: 指针来自当前仍存活的 Tauri 窗口，仅在此主线程回调内借用。
        let native_window = unsafe { &*platform.ns_window().cast::<NSWindow>() };
        native_window.setOpaque(false);

        let result = (|| -> Result<(), window_vibrancy::Error> {
            let style = effects.effects.iter().find_map(|effect| match effect {
                Effect::LiquidGlassRegular => Some(NSGlassEffectViewStyle::Regular),
                Effect::LiquidGlassClear => Some(NSGlassEffectViewStyle::Clear),
                _ => None,
            });
            let Some(style) = style else { return Ok(()) };

            // 替换配置创建的玻璃，避免叠加两层。旧系统没有玻璃，保留 Tauri
            // 已创建的 sidebar / hudWindow 回退，不尝试移动 WebView。
            if !clear_liquid_glass(&window)? {
                return Ok(());
            }
            // SAFETY: Tauri 的 inner() 在 macOS 返回 WKWebView，生命周期覆盖回调。
            let webview = unsafe { &*platform.inner().cast::<WKWebView>() };
            let mut options = LiquidGlassOptions::new(style)
                .interactive(effects.interactive)
                .content_view(webview);
            if let Some(radius) = effects.radius {
                options = options.radius(radius);
            }
            if let Some(color) = effects.color {
                options = options.tint_color(color.into());
            }
            // 官方 content_view 路径负责重新挂载和裁切内容，无需裁切窗口根层。
            apply_liquid_glass(&window, options)
        })();
        if let Err(error) = result {
            eprintln!(
                "无法配置 {} 的 Liquid Glass 内容层级：{error}",
                window.label()
            );
        }
        native_window.invalidateShadow();
    })
}
