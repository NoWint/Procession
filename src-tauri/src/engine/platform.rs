use async_trait::async_trait;

use crate::types::*;

#[async_trait]
pub trait PlatformAdapter: Send + Sync {
    async fn get_processes(&self) -> Vec<ProcessInfo>;
    async fn get_cpu(&self) -> CpuInfo;
    async fn get_memory(&self) -> MemoryInfo;
    async fn get_network(&self) -> Option<NetworkInfo>;
    async fn get_disk(&self) -> DiskInfo;
    async fn get_gpu(&self) -> Option<GpuInfo>;
    async fn get_temperature(&self) -> Option<CpuGpuTemp>;

    async fn collect_snapshot(&self) -> SystemSnapshot {
        let processes = self.get_processes().await;
        let cpu = self.get_cpu().await;
        let memory = self.get_memory().await;
        let network = self.get_network().await;
        let disk = self.get_disk().await;
        let gpu = self.get_gpu().await;
        let temperature = self.get_temperature().await;

        SystemSnapshot {
            processes,
            cpu,
            memory,
            network: network.unwrap_or_default(),
            disk,
            gpu,
            temperature,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            stale: false,
        }
    }
}
