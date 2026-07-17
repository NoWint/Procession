use std::sync::Mutex;
use std::time::Instant;

use async_trait::async_trait;
use sysinfo::{
    CpuRefreshKind, Disks, Networks, ProcessStatus, ProcessesToUpdate, System,
};

use crate::types::*;
use super::platform::PlatformAdapter;

fn recover_mutex<T>(e: std::sync::PoisonError<T>) -> T {
    eprintln!("[Procession] MacImpl mutex was poisoned, recovering");
    e.into_inner()
}

/// Tracks cumulative network I/O and computes bytes/sec deltas with time normalization.
struct MacNetworkTracker {
    networks: Networks,
    prev_total_received: u64,
    prev_total_transmitted: u64,
    last_refresh: Instant,
}

impl MacNetworkTracker {
    fn new() -> Self {
        let networks = Networks::new_with_refreshed_list();
        let prev_total_received = networks.list().values().map(|n| n.total_received()).sum();
        let prev_total_transmitted = networks.list().values().map(|n| n.total_transmitted()).sum();
        Self {
            networks,
            prev_total_received,
            prev_total_transmitted,
            last_refresh: Instant::now(),
        }
    }

    fn refresh_and_read(&mut self) -> (f64, f64) {
        self.networks.refresh(true);
        let now = Instant::now();
        let elapsed = (now - self.last_refresh).as_secs_f64().max(0.001);
        self.last_refresh = now;

        let total_received: u64 = self.networks.list().values().map(|n| n.total_received()).sum();
        let total_transmitted: u64 = self.networks.list().values().map(|n| n.total_transmitted()).sum();

        let down = (total_received.saturating_sub(self.prev_total_received)) as f64 / elapsed;
        let up = (total_transmitted.saturating_sub(self.prev_total_transmitted)) as f64 / elapsed;

        self.prev_total_received = total_received;
        self.prev_total_transmitted = total_transmitted;

        (down, up)
    }
}

pub struct MacImpl {
    sys: Mutex<System>,
    net: Mutex<MacNetworkTracker>,
    disks: Mutex<Disks>,
}

impl MacImpl {
    pub fn new() -> Self {
        Self {
            sys: Mutex::new(System::new()),
            net: Mutex::new(MacNetworkTracker::new()),
            disks: Mutex::new(Disks::new_with_refreshed_list()),
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
impl PlatformAdapter for MacImpl {
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
        let per_core: Vec<f64> = sys.cpus().iter().map(|c| c.cpu_usage() as f64).collect();
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
        let (down, up) = if let Ok(mut net) = self.net.lock() {
            net.refresh_and_read()
        } else {
            (0.0, 0.0)
        };
        // macOS connections stub — no equivalent of Windows IP Helper API.
        // Future: parse netstat / lsof output, or use sysinfo's connections if available.
        Some(NetworkInfo {
            up_bytes_per_sec: up.max(0.0),
            down_bytes_per_sec: down.max(0.0),
            connections: vec![],
        })
    }

    async fn get_disk(&self) -> DiskInfo {
        let mut disks = self.disks.lock().unwrap_or_else(recover_mutex);
        disks.refresh(true);
        let usage: Vec<f64> = disks
            .list()
            .iter()
            .map(|d| d.usage())
            .collect();
        let avg_usage = if usage.is_empty() {
            0.0
        } else {
            usage.iter().sum::<f64>() / usage.len() as f64
        };

        // Phase 4: I/O rates (read/write bytes/sec) would need a delta-tracking struct
        // similar to MacNetworkTracker. For now, return usage % only.
        DiskInfo {
            read_bytes_per_sec: 0.0,
            write_bytes_per_sec: 0.0,
            usage_percent: avg_usage,
        }
    }

    async fn get_gpu(&self) -> Option<GpuInfo> {
        // macOS GPU detection via IOKit deferred — returns None for now.
        // Future: use iokit-sys or core-foundation for Metal GPU info.
        None
    }

    async fn get_temperature(&self) -> Option<CpuGpuTemp> {
        // macOS temperature via IOKit SMC (System Management Controller) deferred.
        // Requires iokit-sys crate or running `pmset -g therm`.
        None
    }
}
