pub mod types;
mod engine;
mod bridge;
mod error;

use tauri::Manager;
use bridge::pusher::SnapshotPusher;
use engine::system::SystemEngine;
use engine::mock::MockAdapter;
#[cfg(target_os = "windows")]
use engine::windows::WindowsImpl;
#[cfg(target_os = "macos")]
use engine::macos::MacImpl;
#[cfg(target_os = "linux")]
use engine::linux::LinuxImpl;
use engine::platform::PlatformAdapter;

/// Reject paths containing traversal components as a defense-in-depth
/// measure. The dialog plugin already vets user-selected paths.
fn is_safe_path(path: &str) -> bool {
    !path.contains("..")
}

#[tauri::command]
async fn get_snapshot(
    pusher: tauri::State<'_, SnapshotPusher>,
) -> Result<crate::types::SystemSnapshot, String> {
    pusher
        .get_latest_cached()
        .ok_or_else(|| error::AppError::NoSnapshot.into())
}

#[tauri::command]
async fn get_config() -> crate::types::Config {
    crate::types::Config::default()
}

#[tauri::command]
fn save_file(path: String, data: Vec<u8>) -> Result<(), String> {
    if !is_safe_path(&path) {
        return Err("Path contains traversal components".into());
    }
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file(path: String) -> Result<Vec<u8>, String> {
    if !is_safe_path(&path) {
        return Err("Path contains traversal components".into());
    }
    std::fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_kill_process(pid: u64) -> Result<(), String> {
    // Uses its own System instance to avoid sharing mutex state with the
    // running collector. PID-reuse races are inherent to the kill() syscall;
    // a separate System does not materially affect this.
    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, false);
    let process =
        sys.process(sysinfo::Pid::from_u32(pid as u32))
            .ok_or(error::AppError::ProcessNotFound(pid))?;
    process
        .kill()
        .then_some(())
        .ok_or_else(|| error::AppError::Other(format!("Failed to kill process {}", pid)).into())
}

pub fn run() {
    // Log any unexpected panics so they don't disappear silently
    std::panic::set_hook(Box::new(|info| {
        eprintln!("[Procession] CRASH: {}", info);
    }));

    #[cfg(target_os = "windows")]
    let adapter: Box<dyn PlatformAdapter> = if cfg!(feature = "mock") {
        Box::new(MockAdapter::new())
    } else {
        Box::new(WindowsImpl::new())
    };

    #[cfg(target_os = "macos")]
    let adapter: Box<dyn PlatformAdapter> = if cfg!(feature = "mock") {
        Box::new(MockAdapter::new())
    } else {
        Box::new(MacImpl::new())
    };

    #[cfg(target_os = "linux")]
    let adapter: Box<dyn PlatformAdapter> = if cfg!(feature = "mock") {
        Box::new(MockAdapter::new())
    } else {
        Box::new(LinuxImpl::new())
    };

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    let adapter: Box<dyn PlatformAdapter> = Box::new(MockAdapter::new());

    let engine = SystemEngine::new(adapter);
    let pusher = SnapshotPusher::new(engine);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(pusher)
        .invoke_handler(tauri::generate_handler![get_snapshot, cmd_kill_process, get_config, save_file, read_file])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let pusher = handle.state::<SnapshotPusher>();
                pusher.start(handle.clone()).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
