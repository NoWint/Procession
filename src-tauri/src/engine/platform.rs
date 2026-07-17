use std::collections::HashMap;

use async_trait::async_trait;

use crate::types::*;

fn derive_process_relations(processes: &[ProcessInfo]) -> Vec<ProcessRelation> {
    let mut children: HashMap<u64, Vec<u64>> = HashMap::new();
    for p in processes {
        children.entry(p.ppid).or_default().push(p.pid);
    }
    let mut relations: Vec<ProcessRelation> = Vec::with_capacity(processes.len());
    for p in processes {
        let child_list = children.remove(&p.pid).unwrap_or_default();
        relations.push(ProcessRelation {
            pid: p.pid,
            ppid: p.ppid,
            children: child_list,
            ipc_peers: vec![],
        });
    }
    relations
}

#[async_trait]
pub trait PlatformAdapter: Send + Sync {
    async fn get_processes(&self) -> Vec<ProcessInfo>;
    async fn get_cpu(&self) -> CpuInfo;
    async fn get_memory(&self) -> MemoryInfo;
    async fn get_network(&self) -> Option<NetworkInfo>;
    async fn get_disk(&self) -> DiskInfo;
    async fn get_gpu(&self) -> Option<GpuInfo>;
    async fn get_temperature(&self) -> Option<CpuGpuTemp>;

    /// Build process relation tree from ppid data. Override to add IPC peer detection.
    async fn get_process_relations(&self, processes: &[ProcessInfo]) -> Vec<ProcessRelation> {
        derive_process_relations(processes)
    }

    /// Collect listening ports. Default returns empty vec.
    async fn get_listening_ports(&self) -> Vec<ListeningPort> {
        vec![]
    }

    /// Collect filesystem hotspots. Default returns empty vec.
    async fn get_fs_hotspots(&self) -> Vec<FsHotspot> {
        vec![]
    }

    async fn collect_snapshot(&self) -> SystemSnapshot {
        let processes = self.get_processes().await;
        let cpu = self.get_cpu().await;
        let memory = self.get_memory().await;
        let network = self.get_network().await;
        let disk = self.get_disk().await;
        let gpu = self.get_gpu().await;
        let temperature = self.get_temperature().await;
        let process_relations = self.get_process_relations(&processes).await;
        let listening_ports = self.get_listening_ports().await;
        let fs_hotspots = self.get_fs_hotspots().await;

        SystemSnapshot {
            processes,
            cpu,
            memory,
            network: network.unwrap_or_default(),
            disk,
            gpu,
            temperature,
            process_relations,
            listening_ports,
            fs_hotspots,
            plugins: std::collections::HashMap::new(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            stale: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_process_relations_basic() {
        let processes = vec![
            ProcessInfo { pid: 1, ppid: 0, name: "init".into(), cpu: 0.0, memory_mb: 0, state: ProcessState::Running, user: "root".into() },
            ProcessInfo { pid: 2, ppid: 1, name: "child1".into(), cpu: 0.0, memory_mb: 0, state: ProcessState::Running, user: "root".into() },
            ProcessInfo { pid: 3, ppid: 1, name: "child2".into(), cpu: 0.0, memory_mb: 0, state: ProcessState::Running, user: "root".into() },
            ProcessInfo { pid: 4, ppid: 2, name: "grandchild".into(), cpu: 0.0, memory_mb: 0, state: ProcessState::Running, user: "root".into() },
        ];
        let relations = derive_process_relations(&processes);
        assert_eq!(relations.len(), 4);

        let root = relations.iter().find(|r| r.pid == 1).unwrap();
        assert_eq!(root.ppid, 0);
        assert_eq!(root.children, vec![2, 3]);

        let child = relations.iter().find(|r| r.pid == 2).unwrap();
        assert_eq!(child.children, vec![4]);

        let leaf = relations.iter().find(|r| r.pid == 4).unwrap();
        assert!(leaf.children.is_empty());
    }

    #[test]
    fn test_derive_process_relations_orphan() {
        // Child with no parent in the list should still appear
        let processes = vec![
            ProcessInfo { pid: 5, ppid: 999, name: "orphan".into(), cpu: 0.0, memory_mb: 0, state: ProcessState::Running, user: "user".into() },
        ];
        let relations = derive_process_relations(&processes);
        assert_eq!(relations.len(), 1);
        assert_eq!(relations[0].ppid, 999);
        assert!(relations[0].children.is_empty());
    }
}
