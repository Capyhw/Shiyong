//! Managed native applications. Catalog URLs never grant arbitrary execution rights.
//! Each integration pins its repository, bundle, executable and lifecycle protocol here.
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

type Result<T> = std::result::Result<T, String>;
static OPERATION: Mutex<()> = Mutex::new(());
const REPO: &str = "Capyhw/NetSplit";
const MAX_ZIP: u64 = 100 * 1024 * 1024;
const MAX_EXPANDED: u64 = 300 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    schema_version: u32,
    id: String,
    version: String,
    platform: String,
    arch: String,
    asset: String,
    sha256: String,
    bundle_id: String,
    app_bundle: String,
    executable: String,
    lifecycle_version: u32,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installed {
    id: String,
    version: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    id: String,
    stage: String,
    received: u64,
    total: u64,
}
fn progress(app: &AppHandle, stage: &str, received: u64, total: u64) {
    let payload = Progress {
        id: "net-split".into(),
        stage: stage.into(),
        received,
        total,
    };
    // Never broadcast host lifecycle data into remote web app windows.
    for label in ["main", "launcher"] {
        let _ = app.emit_to(label, "native-progress", &payload);
    }
}
fn integration(id: &str) -> Result<()> {
    if id != "net-split" {
        return Err("该独立应用尚未接入拾用安装协议".into());
    }
    if !cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        return Err("网络分流目前仅支持 Apple Silicon Mac".into());
    }
    Ok(())
}
fn validate(m: &Manifest) -> Result<()> {
    let valid_version = m.version.split('.').count() == 3
        && m.version
            .split('.')
            .all(|s| !s.is_empty() && s.len() <= 8 && s.bytes().all(|c| c.is_ascii_digit()));
    if m.schema_version != 1
        || m.lifecycle_version != 1
        || m.id != "net-split"
        || !valid_version
        || m.platform != "macos"
        || m.arch != "arm64"
        || m.bundle_id != "com.weiyuhang.netsplit"
        || m.app_bundle != "NetSplit.app"
        || m.executable != "NetSplit"
        || m.asset != format!("NetSplit-{}-macos-arm64.zip", m.version)
        || m.sha256.len() != 64
        || !m.sha256.bytes().all(|c| c.is_ascii_hexdigit())
    {
        return Err("安装清单与应用、平台或协议不匹配".into());
    }
    Ok(())
}
fn package_url(m: &Manifest) -> Result<String> {
    validate(m)?;
    Ok(format!(
        "https://github.com/{REPO}/releases/download/v{}/{}",
        m.version, m.asset
    ))
}
fn client() -> Result<Client> {
    Client::builder()
        .user_agent("Shiyong/0.1.0")
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(300))
        .https_only(true)
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let url = attempt.url();
            if attempt.previous().len() > 5
                || url.scheme() != "https"
                || !matches!(
                    url.host_str(),
                    Some(
                        "github.com"
                            | "api.github.com"
                            | "release-assets.githubusercontent.com"
                            | "objects.githubusercontent.com"
                    )
                )
            {
                attempt.error("不支持的下载重定向")
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| e.to_string())
}
fn latest(client: &Client) -> Result<(Manifest, String)> {
    // GitHub's stable Release redirect avoids unauthenticated API rate limits.
    let response = client
        .get(format!(
            "https://github.com/{REPO}/releases/latest/download/shiyong-macos-arm64.json"
        ))
        .send()
        .map_err(|e| e.to_string())?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("当前 Release 尚未提供拾用安装包，请等待 NetSplit 发布新版".into());
    }
    let response = response
        .error_for_status()
        .map_err(|e| format!("无法获取安装清单：{e}"))?;
    let mut bytes = Vec::new();
    response
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 1024 * 1024 {
        return Err("安装清单过大".into());
    }
    let manifest: Manifest =
        serde_json::from_slice(&bytes).map_err(|e| format!("安装清单无效：{e}"))?;
    let url = package_url(&manifest)?;
    Ok((manifest, url))
}
fn root(app: &AppHandle) -> Result<PathBuf> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("native-apps");
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root)
}
fn read_install(dir: &Path) -> Result<Manifest> {
    let m: Manifest =
        serde_json::from_slice(&fs::read(dir.join("receipt.json")).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    validate(&m)?;
    if !dir
        .join(&m.app_bundle)
        .join("Contents/MacOS")
        .join(&m.executable)
        .is_file()
    {
        return Err("应用文件缺失，请重新安装".into());
    }
    Ok(m)
}
fn checked_output(command: &mut Command) -> Result<String> {
    let out = command.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        let message = String::from_utf8_lossy(&out.stderr)
            .chars()
            .take(2000)
            .collect::<String>();
        return Err(if message.trim().is_empty() {
            "应用操作失败，文件已保留".into()
        } else {
            message
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().into())
}
fn executable(dir: &Path, m: &Manifest) -> PathBuf {
    dir.join(&m.app_bundle)
        .join("Contents/MacOS")
        .join(&m.executable)
}
fn lifecycle(dir: &Path, m: &Manifest, arg: &str) -> Result<()> {
    checked_output(Command::new(executable(dir, m)).arg(arg)).map(|_| ())
}
fn extract(zip_path: &Path, stage: &Path, m: &Manifest) -> Result<()> {
    let file = fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    if archive.len() > 5000 {
        return Err("安装包文件数量超限".into());
    }
    let mut expanded = 0u64;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let path = entry.enclosed_name().ok_or("安装包包含越界路径")?;
        if !path.starts_with(&m.app_bundle)
            || entry.name().contains('\\')
            || entry
                .unix_mode()
                .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("安装包包含非法路径或符号链接".into());
        }
        expanded = expanded.checked_add(entry.size()).ok_or("安装包过大")?;
        if expanded > MAX_EXPANDED {
            return Err("安装包解压大小超限".into());
        }
        let target = stage.join(&path);
        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(|e| e.to_string())?;
        } else {
            fs::create_dir_all(target.parent().ok_or("无效路径")?).map_err(|e| e.to_string())?;
            let mut out = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)
                .map_err(|e| e.to_string())?;
            let expected = entry.size();
            let written = std::io::copy(&mut (&mut entry).take(expected + 1), &mut out)
                .map_err(|e| e.to_string())?;
            if written != expected {
                return Err("安装包文件大小不一致".into());
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(
                    &target,
                    fs::Permissions::from_mode(if entry.unix_mode().unwrap_or(0) & 0o111 != 0 {
                        0o755
                    } else {
                        0o644
                    }),
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}
fn verify_bundle(stage: &Path, m: &Manifest) -> Result<()> {
    let bundle = stage.join(&m.app_bundle);
    let plist = bundle.join("Contents/Info.plist");
    for (key, expected) in [
        ("CFBundleIdentifier", &m.bundle_id),
        ("CFBundleShortVersionString", &m.version),
        ("CFBundleExecutable", &m.executable),
    ] {
        if checked_output(
            Command::new("/usr/libexec/PlistBuddy")
                .arg("-c")
                .arg(format!("Print :{key}"))
                .arg(&plist),
        )? != *expected
        {
            return Err(format!("安装包 {key} 不匹配"));
        }
    }
    checked_output(
        Command::new("/usr/bin/codesign")
            .args(["--verify", "--deep", "--strict"])
            .arg(&bundle),
    )?;
    if checked_output(Command::new(executable(stage, m)).arg("--shiyong-protocol"))? != "1" {
        return Err("应用不支持拾用生命周期协议".into());
    }
    Ok(())
}
fn verify_hash(bytes: &[u8], expected: &str) -> Result<()> {
    if format!("{:x}", Sha256::digest(bytes)) != expected.to_ascii_lowercase() {
        return Err("安装包 SHA-256 校验失败，未安装".into());
    }
    Ok(())
}
// A receipt and the bundle move together. Crash recovery restores the old directory.
fn recover(root: &Path) -> Result<()> {
    let dest = root.join("net-split");
    let backup = root.join("net-split.backup");
    if backup.exists() {
        if dest.exists() {
            fs::remove_dir_all(&backup)
        } else {
            fs::rename(&backup, &dest)
        }
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn commit(stage: &Path, root: &Path) -> Result<()> {
    let dest = root.join("net-split");
    let backup = root.join("net-split.backup");
    if dest.exists() {
        fs::rename(&dest, &backup).map_err(|e| e.to_string())?;
    }
    if let Err(error) = fs::rename(stage, &dest) {
        if backup.exists() {
            fs::rename(&backup, &dest).map_err(|e| format!("安装失败且回滚失败：{error}; {e}"))?;
        }
        return Err(error.to_string());
    }
    // A leftover backup is cleaned by recover on the next command.
    if backup.exists() {
        let _ = fs::remove_dir_all(backup);
    }
    Ok(())
}
fn install(app: &AppHandle, id: &str) -> Result<Installed> {
    integration(id)?;
    let root = root(app)?;
    recover(&root)?;
    progress(app, "checking", 0, 0);
    let client = client()?;
    let (m, url) = latest(&client)?;
    let dest = root.join(id);
    if dest.exists() {
        let current = read_install(&dest)?;
        if current.version == m.version {
            return Ok(Installed {
                id: m.id,
                version: m.version,
            });
        }
        let numbers = |s: &str| {
            s.split('.')
                .map(|v| v.parse::<u32>().unwrap_or(0))
                .collect::<Vec<_>>()
        };
        if numbers(&current.version) > numbers(&m.version) {
            return Err("已安装版本更新，拒绝降级".into());
        }
    }
    let stage = root.join("net-split.staging");
    if stage.exists() {
        fs::remove_dir_all(&stage).map_err(|e| e.to_string())?;
    }
    fs::create_dir(&stage).map_err(|e| e.to_string())?;
    let result = (|| {
        let mut response = client
            .get(url)
            .send()
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;
        let total = response.content_length().unwrap_or(0);
        if total > MAX_ZIP {
            return Err("安装包过大".into());
        }
        let mut bytes = Vec::new();
        let mut buf = [0; 64 * 1024];
        loop {
            let n = response.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            if bytes.len() as u64 + n as u64 > MAX_ZIP {
                return Err("安装包过大".into());
            }
            bytes.extend_from_slice(&buf[..n]);
            progress(app, "downloading", bytes.len() as u64, total);
        }
        progress(app, "verifying", 0, 0);
        verify_hash(&bytes, &m.sha256)?;
        let zip = stage.join("package.zip");
        fs::File::create(&zip)
            .and_then(|mut f| f.write_all(&bytes))
            .map_err(|e| e.to_string())?;
        extract(&zip, &stage, &m)?;
        fs::remove_file(zip).map_err(|e| e.to_string())?;
        verify_bundle(&stage, &m)?;
        fs::write(
            stage.join("receipt.json"),
            serde_json::to_vec(&m).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        progress(app, "installing", 0, 0);
        if dest.exists() {
            lifecycle(&dest, &read_install(&dest)?, "--shiyong-prepare-update")?;
        }
        commit(&stage, &root)?;
        Ok(Installed {
            id: m.id.clone(),
            version: m.version.clone(),
        })
    })();
    if stage.exists() {
        let _ = fs::remove_dir_all(stage);
    }
    result
}
#[tauri::command]
pub async fn native_install(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
) -> Result<Installed> {
    super::ensure_host(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = OPERATION
            .try_lock()
            .map_err(|_| "另一个应用操作正在进行，请稍后重试")?;
        let result = install(&app, &id);
        progress(&app, if result.is_ok() { "done" } else { "error" }, 0, 0);
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn native_list(app: AppHandle, window: WebviewWindow) -> Result<Vec<Installed>> {
    super::ensure_host(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = OPERATION.lock().map_err(|_| "应用操作锁不可用")?;
        let root = root(&app)?;
        recover(&root)?;
        let dir = root.join("net-split");
        if !dir.exists() {
            return Ok(vec![]);
        }
        let m = read_install(&dir)?;
        Ok(vec![Installed {
            id: m.id,
            version: m.version,
        }])
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn native_open(app: AppHandle, window: WebviewWindow, id: String) -> Result<()> {
    super::ensure_host(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = OPERATION.try_lock().map_err(|_| "应用操作进行中")?;
        integration(&id)?;
        let root = root(&app)?;
        recover(&root)?;
        let dir = root.join(id);
        let m = read_install(&dir)?;
        lifecycle(&dir, &m, "--shiyong-can-open")?;
        checked_output(Command::new("/usr/bin/open").arg(dir.join(m.app_bundle))).map(|_| ())
    })
    .await
    .map_err(|e| e.to_string())?
}
fn remove_after_restore(root: &Path, restore: impl FnOnce() -> Result<()>) -> Result<()> {
    restore()?;
    let dir = root.join("net-split");
    let removed = root.join("net-split.removed");
    if removed.exists() {
        fs::remove_dir_all(&removed).map_err(|e| e.to_string())?;
    }
    fs::rename(&dir, &removed).map_err(|e| e.to_string())?;
    fs::remove_dir_all(&removed).map_err(|e| format!("应用已卸载，残留文件清理失败：{e}"))
}

#[tauri::command]
pub async fn native_uninstall(app: AppHandle, window: WebviewWindow, id: String) -> Result<()> {
    super::ensure_host(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = OPERATION.try_lock().map_err(|_| "应用操作进行中")?;
        integration(&id)?;
        let result = (|| {
            let root = root(&app)?;
            recover(&root)?;
            let dir = root.join(id);
            let m = read_install(&dir)?;
            progress(&app, "restoring", 0, 0);
            remove_after_restore(&root, || lifecycle(&dir, &m, "--shiyong-uninstall"))
        })();
        progress(&app, if result.is_ok() { "done" } else { "error" }, 0, 0);
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    fn manifest() -> Manifest {
        Manifest {
            schema_version: 1,
            id: "net-split".into(),
            version: "0.5.0".into(),
            platform: "macos".into(),
            arch: "arm64".into(),
            asset: "NetSplit-0.5.0-macos-arm64.zip".into(),
            sha256: "a".repeat(64),
            bundle_id: "com.weiyuhang.netsplit".into(),
            app_bundle: "NetSplit.app".into(),
            executable: "NetSplit".into(),
            lifecycle_version: 1,
        }
    }
    #[test]
    fn manifest_pins_identity_and_package() {
        let m = manifest();
        assert!(validate(&m).is_ok());
        let mut bad = m.clone();
        bad.app_bundle = "../other.app".into();
        assert!(validate(&bad).is_err());
        let mut bad = m.clone();
        bad.version = "../1".into();
        assert!(validate(&bad).is_err());
        let mut bad = m.clone();
        bad.arch = "x64".into();
        assert!(validate(&bad).is_err());
        let mut bad = m;
        bad.lifecycle_version = 2;
        assert!(validate(&bad).is_err());
    }
    #[test]
    fn digest_rejects_corruption() {
        let hash = format!("{:x}", Sha256::digest(b"good"));
        assert!(verify_hash(b"good", &hash).is_ok());
        assert!(verify_hash(b"bad", &hash).is_err());
    }
    #[test]
    fn assets_stay_in_registered_release() {
        assert_eq!(package_url(&manifest()).unwrap(), "https://github.com/Capyhw/NetSplit/releases/download/v0.5.0/NetSplit-0.5.0-macos-arm64.zip");
        let mut bad = manifest();
        bad.asset = "https://evil.test/x.zip".into();
        assert!(package_url(&bad).is_err());
    }
    #[test]
    fn swap_rolls_back_and_recovers_interrupted_update() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        fs::create_dir(root.join("net-split")).unwrap();
        fs::write(root.join("net-split/old"), "old").unwrap();
        assert!(commit(&root.join("missing"), root).is_err());
        assert!(root.join("net-split/old").exists());
        fs::rename(root.join("net-split"), root.join("net-split.backup")).unwrap();
        recover(root).unwrap();
        assert!(root.join("net-split/old").exists());
        fs::create_dir(root.join("stage")).unwrap();
        fs::write(root.join("stage/new"), "new").unwrap();
        commit(&root.join("stage"), root).unwrap();
        assert!(root.join("net-split/new").exists());
        assert!(!root.join("net-split/old").exists());
    }
    #[test]
    fn failed_restore_preserves_installed_app_and_receipt() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        fs::create_dir(root.join("net-split")).unwrap();
        fs::write(root.join("net-split/receipt.json"), "receipt").unwrap();
        fs::write(root.join("net-split/app"), "app").unwrap();
        fs::create_dir(root.join("other-app")).unwrap();
        assert!(remove_after_restore(root, || Err("授权已取消".into())).is_err());
        assert!(root.join("net-split/app").exists());
        assert!(root.join("net-split/receipt.json").exists());
        remove_after_restore(root, || Ok(())).unwrap();
        assert!(!root.join("net-split").exists());
        assert!(root.join("other-app").exists());
    }
    #[test]
    fn rejects_zip_traversal_and_foreign_bundles() {
        for name in ["../escape", "Other.app/file", "NetSplit.app/../../escape"] {
            let tmp = tempfile::tempdir().unwrap();
            let file = fs::File::create(tmp.path().join("test.zip")).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            zip.start_file(name, zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(b"data").unwrap();
            zip.finish().unwrap();
            assert!(extract(
                &tmp.path().join("test.zip"),
                &tmp.path().join("stage"),
                &manifest()
            )
            .is_err());
            assert!(!tmp.path().join("escape").exists());
        }
    }
    #[test]
    #[ignore = "requires locally built NetSplit toolbox package; never changes network"]
    fn local_package_validates_and_extracts() {
        let package_dir =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tools/net-split/macos/build");
        let m: Manifest = serde_json::from_slice(
            &fs::read(package_dir.join("shiyong-macos-arm64.json")).unwrap(),
        )
        .unwrap();
        validate(&m).unwrap();
        verify_hash(&fs::read(package_dir.join(&m.asset)).unwrap(), &m.sha256).unwrap();
        let tmp = tempfile::tempdir().unwrap();
        extract(&package_dir.join(&m.asset), tmp.path(), &m).unwrap();
        verify_bundle(tmp.path(), &m).unwrap();
    }
}
