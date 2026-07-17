use crate::types::SystemSnapshot;
use super::platform::PlatformAdapter;
use super::fs_watcher::FsWatcher;
use super::plugin::PluginManager;

pub struct SystemEngine {
    adapter: Box<dyn PlatformAdapter>,
    fs_watcher: Option<FsWatcher>,
    plugin_manager: Option<PluginManager>,
}

impl SystemEngine {
    pub fn new(adapter: Box<dyn PlatformAdapter>) -> Self {
        let fs_watcher = FsWatcher::start();
        let plugin_manager = PluginManager::start();
        Self { adapter, fs_watcher, plugin_manager }
    }

    pub async fn collect_snapshot(&self) -> SystemSnapshot {
        let mut snapshot = self.adapter.collect_snapshot().await;
        if let Some(ref w) = self.fs_watcher {
            snapshot.fs_hotspots = w.hotspots();
        }
        if let Some(ref pm) = self.plugin_manager {
            snapshot.plugins = pm.collect();
        }
        snapshot
    }
}
