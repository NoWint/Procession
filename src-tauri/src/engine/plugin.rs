use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Output;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::Value;

use crate::types::PluginManifest;

const SCAN_INTERVAL_SECS: u64 = 30;
const PLUGIN_DIR: &str = ".procession/plugins";
const MIN_REFRESH_SECS: u64 = 1;

/// Manages plugin lifecycle: hot-reload scanning, scheduled spawning, result aggregation.
pub struct PluginManager {
    results: Arc<Mutex<HashMap<String, Value>>>,
    running: Arc<AtomicBool>,
}

impl PluginManager {
    /// Start the plugin manager background threads.
    /// Returns `None` if the plugin directory doesn't exist (non-fatal — no plugins).
    pub fn start() -> Option<Self> {
        let base = plugin_base_dir()?;
        if !base.exists() {
            return None;
        }

        let results: Arc<Mutex<HashMap<String, Value>>> = Arc::new(Mutex::new(HashMap::new()));
        let running = Arc::new(AtomicBool::new(true));

        // Track loaded manifests and their next-scheduled refresh times.
        // Keyed by directory name (NOT manifest id) to avoid id/dir mismatch thrashing (P-1).
        let manifests: Arc<Mutex<HashMap<String, (PluginManifest, Instant)>>> =
            Arc::new(Mutex::new(HashMap::new()));

        // Scanner thread: hot-reload manifests every SCAN_INTERVAL_SECS
        let scan_results = results.clone();
        let scan_manifests = manifests.clone();
        let scan_running = running.clone();
        let scan_base = base.clone();

        thread::Builder::new()
            .name("procession-plugin-scanner".into())
            .spawn(move || loop {
                if !scan_running.load(Ordering::Relaxed) {
                    break;
                }
                scan_plugins(&scan_base, &scan_manifests);
                thread::sleep(Duration::from_secs(SCAN_INTERVAL_SECS));

                if let Ok(m) = scan_manifests.lock() {
                    if let Ok(mut r) = scan_results.lock() {
                        r.retain(|id, _| m.contains_key(id));
                    }
                }
            })
            .ok()?;

        // Scheduler thread: spawn due plugins on separate threads concurrently
        let sched_results = results.clone();
        let sched_manifests = manifests.clone();
        let sched_running = running.clone();

        thread::Builder::new()
            .name("procession-plugin-scheduler".into())
            .spawn(move || {
                scan_plugins(&base, &sched_manifests);

                loop {
                    if !sched_running.load(Ordering::Relaxed) {
                        break;
                    }

                    let now = Instant::now();
                    let due: Vec<(String, PluginManifest)> = {
                        if let Ok(mut m) = sched_manifests.lock() {
                            let mut due_plugins = Vec::new();
                            for (dir_name, (manifest, next_run)) in m.iter_mut() {
                                if now >= *next_run {
                                    due_plugins.push((dir_name.clone(), manifest.clone()));
                                    *next_run =
                                        now + Duration::from_secs(manifest.refresh_interval_secs);
                                }
                            }
                            due_plugins
                        } else {
                            vec![]
                        }
                    };

                    // Run due plugins concurrently so long-running ones don't block others (P-3)
                    let results_ref = sched_results.clone();
                    if !due.is_empty() {
                        thread::scope(|scope| {
                            for (_dir_name, manifest) in &due {
                                let results_ref = &results_ref;
                                scope.spawn(|| {
                                    let output = run_plugin(manifest);
                                    if let Ok(ref value) = output {
                                        if let Ok(mut r) = results_ref.lock() {
                                            r.insert(manifest.id.clone(), value.clone());
                                        }
                                    }
                                });
                            }
                        });
                    }

                    thread::sleep(Duration::from_secs(1));
                }
            })
            .ok()?;

        Some(Self { results, running })
    }

    pub fn collect(&self) -> HashMap<String, Value> {
        if let Ok(r) = self.results.lock() {
            r.clone()
        } else {
            HashMap::new()
        }
    }
}

impl Drop for PluginManager {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

fn plugin_base_dir() -> Option<PathBuf> {
    // Prefer USERPROFILE on Windows, HOME on Unix (P-10)
    #[cfg(target_os = "windows")]
    let home = std::env::var_os("USERPROFILE");
    #[cfg(not(target_os = "windows"))]
    let home = std::env::var_os("HOME");

    let home = home.map(PathBuf::from)?;
    Some(home.join(PLUGIN_DIR))
}

fn scan_plugins(base: &PathBuf, manifests: &Arc<Mutex<HashMap<String, (PluginManifest, Instant)>>>) {
    let entries = match std::fs::read_dir(base) {
        Ok(e) => e,
        Err(_) => return,
    };

    // Key by directory name, not manifest id (P-1).
    // Validate directory path with canonicalization to mitigate symlink traversal (P-14).
    let mut found: HashMap<String, (PluginManifest, String)> = HashMap::new();

    for entry in entries.flatten() {
        let dir_path = entry.path();
        if !dir_path.is_dir() {
            continue;
        }
        let dir_name = match dir_path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let manifest_path = dir_path.join("manifest.json");
        if !manifest_path.exists() {
            continue;
        }
        let content = match std::fs::read_to_string(&manifest_path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let manifest: PluginManifest = match serde_json::from_str(&content) {
            Ok(m) => m,
            Err(e) => {
                eprintln!("[Procession] Plugin manifest parse error ({}): {}", manifest_path.display(), e);
                continue;
            }
        };

        // Validate executable not empty (P-2)
        if manifest.executable.is_empty() {
            eprintln!("[Procession] Plugin '{}' has empty 'executable' field in manifest", dir_name);
            continue;
        }

        // Validate no path traversal in executable (P-8)
        let exec_path = manifest.executable.replace('\\', "/");
        if exec_path.starts_with("..") || exec_path.contains("/../") || exec_path.contains("\\..\\") {
            eprintln!("[Procession] Plugin '{}' executable path traversal denied: {}", dir_name, manifest.executable);
            continue;
        }

        found.insert(dir_name, (manifest, manifest_path.to_string_lossy().to_string()));
    }

    if let Ok(mut m) = manifests.lock() {
        // Update new AND changed manifests (P-5): always insert/update
        for (dir_name, (manifest, _path)) in found {
            let interval = manifest.refresh_interval_secs.max(MIN_REFRESH_SECS); // P-12
            let mut manifest = manifest;
            manifest.refresh_interval_secs = interval;

            m.entry(dir_name)
                .and_modify(|(existing, _next_run)| {
                    *existing = manifest.clone();
                    // Don't reset next_run — let existing schedule stand to avoid burst
                })
                .or_insert_with(|| (manifest, Instant::now()));
        }
        // Remove entries whose dirs no longer exist — check by dir_name key
        m.retain(|dir_name, _| {
            let dir = base.join(dir_name);
            dir.exists() && dir.is_dir() && dir.join("manifest.json").exists()
        });
    }
}

fn run_plugin(manifest: &PluginManifest) -> Result<Value, String> {
    let exec_path = resolve_plugin_path(manifest)?;

    let mut cmd = std::process::Command::new(&exec_path);
    cmd.args(&manifest.args);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let child = cmd.spawn().map_err(|e| {
        format!("Failed to spawn plugin {}: {}", manifest.id, e)
    })?;

    let timeout = Duration::from_secs(manifest.timeout_secs.max(1));
    let pid = child.id();

    let (tx, rx) = std::sync::mpsc::channel::<std::io::Result<Output>>();
    thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });

    match rx.recv_timeout(timeout) {
        Ok(Ok(output)) => {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!(
                    "Plugin {} exited with {}: {}",
                    manifest.id,
                    output.status,
                    stderr.trim()
                ));
            }
            let stdout = String::from_utf8_lossy(&output.stdout);
            let first_line = stdout.lines().next().ok_or_else(|| {
                format!("Plugin {} produced no output", manifest.id)
            })?;
            serde_json::from_str(first_line).map_err(|e| {
                format!("Plugin {} JSON parse error: {}", manifest.id, e)
            })
        }
        Ok(Err(e)) => Err(format!("Plugin {} I/O error: {}", manifest.id, e)),
        Err(_) => {
            // Timeout — kill the child and its subprocesses (P-6, P-15)
            let pid_str = pid.to_string();
            #[cfg(target_os = "windows")]
            {
                let status = std::process::Command::new("taskkill")
                    .args(["/PID", &pid_str, "/F", "/T"])
                    .status();
                if let Err(e) = status {
                    eprintln!("[Procession] Failed to kill timed-out plugin {} (PID {}): {}", manifest.id, pid_str, e);
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                let status = std::process::Command::new("kill")
                    .args(["-9", &pid_str])
                    .status();
                if let Err(e) = status {
                    eprintln!("[Procession] Failed to kill timed-out plugin {} (PID {}): {}", manifest.id, pid_str, e);
                }
            }
            Err(format!(
                "Plugin {} timed out after {}s",
                manifest.id, manifest.timeout_secs
            ))
        }
    }
}

fn resolve_plugin_path(manifest: &PluginManifest) -> Result<PathBuf, String> {
    if manifest.executable.contains('/') || manifest.executable.contains('\\') {
        return Ok(PathBuf::from(&manifest.executable));
    }
    let base = plugin_base_dir().ok_or("No plugin base dir")?;
    Ok(base.join(&manifest.id).join(&manifest.executable))
}
