use crate::types::SystemSnapshot;
use super::platform::PlatformAdapter;

/// Owns the platform adapter and provides the snapshot collection interface.
/// This is the core of the system data pipeline — engine owns the adapter, bridge owns
/// the communication layer. This separation allows testing collection without Tauri.
///
/// The per-field error isolation happens inside `PlatformAdapter::collect_snapshot()`
/// (default trait method): each get_* call is independently `unwrap_or`-protected so
/// a single sensor failure doesn't collapse the frame.
pub struct SystemEngine {
    adapter: Box<dyn PlatformAdapter>,
}

impl SystemEngine {
    pub fn new(adapter: Box<dyn PlatformAdapter>) -> Self {
        Self { adapter }
    }

    /// Collect a full SystemSnapshot.
    /// Delegates to the trait default which provides per-field error isolation.
    pub async fn collect_snapshot(&self) -> SystemSnapshot {
        self.adapter.collect_snapshot().await
    }
}
