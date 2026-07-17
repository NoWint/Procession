use std::sync::{Mutex, PoisonError};

use async_trait::async_trait;
use sysinfo::{CpuRefreshKind, ProcessStatus, ProcessesToUpdate, System};

use crate::types::*;
use super::platform::PlatformAdapter;

/// Recover from a poisoned mutex: log the poison and reclaim the inner value.
fn recover_mutex<T>(e: PoisonError<T>) -> T {
    eprintln!("[Procession] Mutex was poisoned, recovering");
    e.into_inner()
}

pub struct WindowsImpl {
    sys: Mutex<System>,
}

impl WindowsImpl {
    pub fn new() -> Self {
        Self {
            sys: Mutex::new(System::new()),
        }
    }
}

fn map_process_status(status: ProcessStatus) -> ProcessState {
    match status {
        ProcessStatus::Run | ProcessStatus::Idle => ProcessState::Running,
        ProcessStatus::Sleep => ProcessState::Sleeping,
        ProcessStatus::Stop => ProcessState::Stopped,
        _ => ProcessState::Zombie,
    }
}

#[async_trait]
impl PlatformAdapter for WindowsImpl {
    async fn get_processes(&self) -> Vec<ProcessInfo> {
        let mut sys = self.sys.lock().unwrap_or_else(recover_mutex);
        sys.refresh_processes(ProcessesToUpdate::All, false);
        sys.processes()
            .iter()
            .map(|(pid, process)| ProcessInfo {
                pid: pid.as_u32() as u64,
                ppid: process.parent().map(|p| p.as_u32() as u64).unwrap_or(0),
                name: process.name().to_string_lossy().to_string(),
                cpu: process.cpu_usage() as f64,
                memory_mb: process.memory() / 1024 / 1024,
                state: map_process_status(process.status()),
                user: String::new(),
            })
            .collect()
    }

    async fn get_cpu(&self) -> CpuInfo {
        let mut sys = self.sys.lock().unwrap_or_else(recover_mutex);
        sys.refresh_cpu_specifics(CpuRefreshKind::everything());
        let per_core: Vec<f64> = sys
            .cpus()
            .iter()
            .map(|c| c.cpu_usage() as f64)
            .collect();
        let total = if per_core.is_empty() {
            0.0
        } else {
            per_core.iter().sum::<f64>() / per_core.len() as f64
        };
        CpuInfo { total, per_core }
    }

    async fn get_memory(&self) -> MemoryInfo {
        let mut sys = self.sys.lock().unwrap_or_else(recover_mutex);
        sys.refresh_memory();
        MemoryInfo {
            used_mb: sys.used_memory() / 1024 / 1024,
            total_mb: sys.total_memory() / 1024 / 1024,
            swap_used_mb: sys.used_swap() / 1024 / 1024,
            swap_total_mb: sys.total_swap() / 1024 / 1024,
        }
    }

    async fn get_network(&self) -> Option<NetworkInfo> {
        // Phase 3: real network connection collection
        Some(NetworkInfo::default())
    }

    async fn get_disk(&self) -> DiskInfo {
        // Phase 3: real disk I/O rates
        DiskInfo::default()
    }

    async fn get_gpu(&self) -> Option<GpuInfo> {
        // Phase 4: NVAPI / AMD SDK
        None
    }

    async fn get_temperature(&self) -> Option<CpuGpuTemp> {
        // Phase 4: WMI / sensor driver
        None
    }
}
