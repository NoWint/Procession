use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use notify::event::EventKind;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};

use crate::types::FsHotspot;

const EVENT_EXPIRY_SECS: u64 = 60;
const HOTSPOT_CLEAN_INTERVAL_SECS: u64 = 10;

struct WatchedState {
    /// directory path -> (total_event_count, last_event_time)
    hot: HashMap<String, (u64, Instant)>,
    pending_paths: Vec<PathBuf>,
}

impl WatchedState {
    fn new() -> Self {
        Self {
            hot: HashMap::new(),
            pending_paths: Vec::with_capacity(512),
        }
    }

    fn record_event(&mut self, path: &str) {
        let now = Instant::now();
        let parent_dir = std::path::Path::new(path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string());

        if parent_dir.is_empty() {
            return;
        }

        let entry = self.hot.entry(parent_dir).or_insert((0, now));
        entry.0 += 1;
        entry.1 = now;
    }

    fn expire_stale(&mut self) {
        let cutoff = Instant::now() - Duration::from_secs(EVENT_EXPIRY_SECS);
        self.hot.retain(|_, &mut (_, last_seen)| last_seen > cutoff);
    }

    fn collect(&mut self) -> Vec<FsHotspot> {
        self.expire_stale();
        let mut hotspots: Vec<FsHotspot> = self
            .hot
            .iter()
            .map(|(path, (count, _))| FsHotspot {
                path: path.clone(),
                event_count: *count,
            })
            .collect();
        hotspots.sort_by_key(|b| std::cmp::Reverse(b.event_count));
        hotspots.truncate(20); // top 20
        // Reset counts after collection (move to decay-based reporting)
        self.hot.clear();
        hotspots
    }
}

/// A background filesystem watcher that aggregates file events by parent directory.
///
/// Watches common user directories (Downloads, Documents, Temp) and collects
/// event counts. The collector aggregates events into `FsHotspot` entries
/// for the top-N hottest directories.
pub struct FsWatcher {
    state: Arc<Mutex<WatchedState>>,
    running: Arc<AtomicBool>,
}

impl FsWatcher {
    /// Create a new FsWatcher. Starts background threads immediately.
    /// Returns `None` if the watcher fails to start (non-fatal).
    pub fn start() -> Option<Self> {
        let state = Arc::new(Mutex::new(WatchedState::new()));
        let running = Arc::new(AtomicBool::new(true));

        // Collect directories to watch
        let dirs = default_watch_directories();
        if dirs.is_empty() {
            return None;
        }

        let state_clone = state.clone();
        let running_clone = running.clone();
        let watcher_running = running.clone();

        // Event processor thread
        let (tx, rx) = std::sync::mpsc::channel::<notify::Result<notify::Event>>();
        let state_processor = state_clone.clone();

        let _processor = thread::Builder::new()
            .name("procession-fs-processor".into())
            .spawn(move || {
                let mut last_clean = Instant::now();
                loop {
                    if !running_clone.load(Ordering::Relaxed) {
                        break;
                    }
                    match rx.recv_timeout(Duration::from_millis(500)) {
                        Ok(Ok(event)) => {
                            if is_write_event(&event.kind) {
                                // Defer to locked section below — coalesce with drain/record/clean
                                if let Ok(mut s) = state_processor.lock() {
                                    for p in &event.paths {
                                        if s.pending_paths.len() < 16_384 {
                                            s.pending_paths.push(p.clone());
                                        }
                                    }
                                }
                            }
                        }
                        Ok(Err(_)) => {}
                        Err(_) => {} // timeout, loop back to check running flag
                    }
                    // Single lock acquisition: drain, record, and periodic cleanup
                    if let Ok(mut s) = state_processor.lock() {
                        let paths = std::mem::take(&mut s.pending_paths);
                        for p in &paths {
                            s.record_event(&p.to_string_lossy());
                        }
                        if last_clean.elapsed().as_secs() >= HOTSPOT_CLEAN_INTERVAL_SECS {
                            s.expire_stale();
                            last_clean = Instant::now();
                        }
                    }
                }
            });

        // Starting notify watcher is best-effort; failure means no hotspot data.
        let _watcher_state = state_clone.clone();
        let _ = thread::Builder::new()
            .name("procession-fs-watcher".into())
            .spawn(move || {
                let mut watcher = match RecommendedWatcher::new(
                    move |res: notify::Result<notify::Event>| {
                        let _ = tx.send(res);
                    },
                    Config::default(),
                ) {
                    Ok(w) => w,
                    Err(_) => return,
                };

                for dir in &dirs {
                    if dir.exists() && dir.is_dir() {
                        let _ = watcher.watch(dir, RecursiveMode::NonRecursive);
                    }
                }

                loop {
                    if !watcher_running.load(Ordering::Relaxed) {
                        break;
                    }
                    thread::sleep(Duration::from_secs(5));
                }

                let _ = watcher;
            });

        Some(Self { state, running })
    }

    /// Collect current hotspot data and reset counters.
    pub fn hotspots(&self) -> Vec<FsHotspot> {
        if let Ok(mut s) = self.state.lock() {
            s.collect()
        } else {
            vec![]
        }
    }
}

impl Drop for FsWatcher {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
    }
}

fn is_write_event(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
    )
}

fn default_watch_directories() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    // Home directory subfolders
    if let Some(home) = dirs_next() {
        let watched = [
            "Downloads",
            "Documents",
            "Desktop",
            "Pictures",
            "Music",
            "Videos",
        ];
        for sub in &watched {
            dirs.push(home.join(sub));
        }
    }

    // Temp directory
    dirs.push(std::env::temp_dir());

    dirs
}

fn dirs_next() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}
