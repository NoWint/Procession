use std::panic::{self, AssertUnwindSafe};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use crate::engine::system::SystemEngine;
use crate::types::SystemSnapshot;

use super::cache::CacheBuffer;
use super::snapshot::preprocess_snapshot;

/// Drives the 1Hz snapshot collection → emit pipeline.
/// Owns the SystemEngine (which owns the PlatformAdapter) and maintains
/// both the current frame cache and a ring-buffer history (CacheBuffer).
pub struct SnapshotPusher {
    engine: SystemEngine,
    current: Mutex<Option<SystemSnapshot>>,
    cache: Mutex<CacheBuffer>,
}

impl SnapshotPusher {
    pub fn new(engine: SystemEngine) -> Self {
        Self {
            engine,
            current: Mutex::new(None),
            cache: Mutex::new(CacheBuffer::new(1000)),
        }
    }

    /// Infinite 1Hz loop: collect → preprocess → emit → store.
    /// On failure (e.g. Mutex poison), logs and continues rather than crashing.
    ///
    /// Optimized to minimize deep clones: emit from the owned snapshot (zero-copy
    /// serde ref), move into current, then clone once for the ring-buffer cache.
    ///
    /// 每次迭代内部用 `catch_unwind` 包裹同步处理逻辑——单帧 panic 不会终止后续推送。
    pub async fn start(&self, app: AppHandle) {
        loop {
            let snapshot = self.engine.collect_snapshot().await;

            // 包裹单帧同步处理（preprocess + emit + cache）：
            // - 闭包捕获了 &self（含 Mutex）和 &app，需用 AssertUnwindSafe 断言 UnwindSafe
            // - panic 时跳过该帧剩余逻辑（不 emit、不缓存），继续下一轮循环
            let result = panic::catch_unwind(AssertUnwindSafe(|| {
                let processed = preprocess_snapshot(snapshot, 500);

                // Emit first — serializes from &SystemSnapshot, no clone
                if let Err(e) = app.emit("system-snapshot", &processed) {
                    eprintln!("[Procession] emit failed: {}", e);
                }

                // Move into current (zero copy), then clone once for cache.
                // The block scope ensures MutexGuards are dropped before any .await
                // below (satisfying Send bounds on the outer future).
                {
                    let mut snapshot_for_cache = None;
                    if let Ok(mut current) = self.current.lock() {
                        *current = Some(processed);
                        snapshot_for_cache = current.clone();
                    } else {
                        eprintln!("[Procession] current lock poisoned, skipping store");
                    }
                    if let Some(snapshot) = snapshot_for_cache {
                        if let Ok(mut cache) = self.cache.lock() {
                            cache.push(snapshot);
                        } else {
                            eprintln!("[Procession] cache lock poisoned, skipping cache write");
                        }
                    }
                }
            }));

            // 单帧 panic：记录后跳过本帧，1 秒后再尝试下一轮
            if let Err(payload) = result {
                eprintln!("[pusher] frame panicked: {:?}, skipping this tick", payload);
            }

            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }

    #[allow(dead_code)]
    pub fn get_current(&self) -> Option<SystemSnapshot> {
        self.current.lock().ok().and_then(|c| c.clone())
    }

    pub fn get_latest_cached(&self) -> Option<SystemSnapshot> {
        self.cache.lock().ok().and_then(|c| c.get_latest().cloned())
    }
}
