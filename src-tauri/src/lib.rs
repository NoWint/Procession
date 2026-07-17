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
use engine::platform::PlatformAdapter;

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

    #[cfg(not(target_os = "windows"))]
    let adapter: Box<dyn PlatformAdapter> = Box::new(MockAdapter::new());

    let engine = SystemEngine::new(adapter);
    let pusher = SnapshotPusher::new(engine);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(pusher)
        .invoke_handler(tauri::generate_handler![get_snapshot, cmd_kill_process, get_config])
        .setup(|app| {
            let handle = app.handle().clone();
            let start_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let pusher = handle.state::<SnapshotPusher>();
                pusher.start(start_handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
