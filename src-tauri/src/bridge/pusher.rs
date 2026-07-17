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

    /// Infinite 1Hz loop: collect → preprocess → store → emit.
    /// On failure (e.g. Mutex poison), logs and continues rather than crashing.
    pub async fn start(&self, app: AppHandle) {
        loop {
            let snapshot = self.engine.collect_snapshot().await;
            let processed = preprocess_snapshot(snapshot, 500);

            // Store in current frame cache — log on poison, don't crash
            if let Ok(mut current) = self.current.lock() {
                *current = Some(processed.clone());
            } else {
                eprintln!("[Procession] current lock poisoned, skipping store");
            }

            // Push to ring-buffer history
            if let Ok(mut cache) = self.cache.lock() {
                cache.push(processed.clone());
            } else {
                eprintln!("[Procession] cache lock poisoned, skipping cache write");
            }

            // Emit to frontend over IPC
            if let Err(e) = app.emit("system-snapshot", &processed) {
                eprintln!("[Procession] emit failed: {}", e);
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
