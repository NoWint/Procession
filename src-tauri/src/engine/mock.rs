use std::time::Instant;

use async_trait::async_trait;
use rand::Rng;
use rand::rngs::StdRng;
use rand::SeedableRng;

use crate::types::*;
use super::platform::PlatformAdapter;

const PROCESS_NAMES: &[(&str, u64, f64)] = &[
    // (name, base_mem_mb, base_cpu)
    ("System", 2, 2.0),
    ("chrome.exe", 400, 20.0),
    ("code.exe", 300, 8.0),
    ("node.exe", 150, 15.0),
    ("terminal.exe", 50, 5.0),
    ("spotify.exe", 120, 3.0),
    ("explorer.exe", 80, 2.0),
    ("discord.exe", 200, 6.0),
    ("powershell.exe", 100, 4.0),
    ("nvim.exe", 40, 7.0),
    ("git.exe", 30, 1.0),
    ("docker.exe", 250, 10.0),
    ("teams.exe", 350, 12.0),
    ("outlook.exe", 180, 4.0),
    ("winlogon.exe", 8, 0.5),
    ("svchost.exe", 20, 1.0),
    ("lsass.exe", 15, 0.3),
    ("OneDrive.exe", 90, 2.0),
    ("Steam.exe", 60, 1.5),
    ("claude.exe", 300, 15.0),
];

pub struct MockAdapter {
    start_time: Instant,
}

impl MockAdapter {
    pub fn new() -> Self {
        Self {
            start_time: Instant::now(),
        }
    }

    fn sinusoidal(&self, base: f64, amplitude: f64, frequency: f64, phase: f64) -> f64 {
        let t = self.start_time.elapsed().as_secs_f64();
        base + (t * frequency + phase).sin() * amplitude
    }
}

fn mock_process(
    rng: &mut StdRng,
    pid: u64,
    ppid: u64,
    name: &str,
    base_cpu: f64,
    base_mem: u64,
    user: &str,
    is_spike: bool,
) -> ProcessInfo {
    let cpu = if is_spike {
        // Simulate a process that spikes to 95% CPU every ~10s
        let cycle = (rng.gen::<f64>() * 20.0).sin() * 50.0 + 50.0;
        cycle.clamp(5.0, 99.0)
    } else {
        (base_cpu + rng.gen::<f64>() * 10.0).clamp(0.0, 100.0)
    };
    let mem = base_mem + rng.gen_range(0..256);
    let state = if cpu > 5.0 {
        if rng.gen_bool(0.05) {
            ProcessState::Stopped
        } else {
            ProcessState::Running
        }
    } else {
        if rng.gen_bool(0.02) {
            ProcessState::Zombie
        } else {
            ProcessState::Sleeping
        }
    };
    ProcessInfo {
        pid,
        ppid,
        name: name.to_string(),
        cpu,
        memory_mb: mem,
        state,
        user: user.to_string(),
    }
}

fn build_process_tree(rng: &mut StdRng) -> Vec<ProcessInfo> {
    let mut processes = Vec::with_capacity(80);
    // Root process (pid=1)
    processes.push(ProcessInfo {
        pid: 1,
        ppid: 0,
        name: "init.exe".to_string(),
        cpu: 0.5,
        memory_mb: 4,
        state: ProcessState::Running,
        user: "SYSTEM".to_string(),
    });

    // System services (depth 1)
    let system_children = [
        (2, "svchost.exe", "SYSTEM"),
        (3, "lsass.exe", "SYSTEM"),
        (4, "winlogon.exe", "SYSTEM"),
        (5, "explorer.exe", "USER"),
    ];
    for &(pid, name, user) in &system_children {
        let cpu = rng.gen_range(0.3..3.0);
        processes.push(ProcessInfo {
            pid,
            ppid: 1,
            name: name.to_string(),
            cpu,
            memory_mb: rng.gen_range(8..100),
            state: ProcessState::Running,
            user: user.to_string(),
        });
    }

    // User applications (depth 2, children of explorer.exe or independent)
    for (i, &(name, base_mem, base_cpu)) in PROCESS_NAMES.iter().enumerate() {
        let pid = 1000 + i as u64;
        let ppid = if i < 3 { 5 } else { 1 }; // some under explorer, some directly
        let is_spike = name == "chrome.exe";
        processes.push(mock_process(rng, pid, ppid, name, base_cpu, base_mem, "USER", is_spike));
    }

    // Child processes (depth 3)
    processes.push(mock_process(rng, 2000, 1000, "chrome_helper.exe", 2.0, 80, "USER", false));
    processes.push(mock_process(rng, 2001, 1000, "chrome_worker.exe", 5.0, 120, "USER", false));
    processes.push(mock_process(rng, 2002, 1002, "git-bash.exe", 1.0, 30, "USER", false));
    processes.push(mock_process(rng, 2003, 1001, "node_child.exe", 3.0, 60, "USER", false));
    processes.push(mock_process(rng, 2004, 1001, "npm.exe", 8.0, 100, "USER", false));

    processes
}

#[async_trait]
impl PlatformAdapter for MockAdapter {
    async fn get_processes(&self) -> Vec<ProcessInfo> {
        let mut rng = StdRng::seed_from_u64(self.start_time.elapsed().as_millis() as u64);
        build_process_tree(&mut rng)
    }

    async fn get_cpu(&self) -> CpuInfo {
        let total = self.sinusoidal(25.0, 20.0, 0.2, 0.0) + 10.0;
        let per_core: Vec<f64> = (0..8)
            .map(|i| {
                self.sinusoidal(20.0, 15.0, 0.3, i as f64 * 0.5) + rng_noise()
            })
            .collect();
        CpuInfo {
            total: total.clamp(0.0, 100.0),
            per_core,
        }
    }

    async fn get_memory(&self) -> MemoryInfo {
        let t = self.start_time.elapsed().as_secs_f64();
        MemoryInfo {
            used_mb: 7000 + ((t * 0.1).sin() * 800.0) as u64,
            total_mb: 16384,
            swap_used_mb: 512 + ((t * 0.05).sin() * 100.0) as u64,
            swap_total_mb: 8192,
        }
    }

    async fn get_network(&self) -> Option<NetworkInfo> {
        let t = self.start_time.elapsed().as_secs_f64();
        let connections = (0..25)
            .map(|i| Connection {
                pid: 1000 + (i % 10) as u64,
                local_addr: format!("192.168.1.100:{}", 30000 + i),
                remote_addr: format!("10.0.0.{}:443", (i % 15) + 1),
                state: if i % 5 == 0 { "time_wait".into() } else { "established".into() },
                protocol: match i % 4 {
                    0 => "http".into(),
                    1 => "https".into(),
                    2 => "ssh".into(),
                    _ => "dns".into(),
                },
            })
            .collect();
        Some(NetworkInfo {
            up_bytes_per_sec: (100_000.0 + (t * 0.5).sin() * 50_000.0 + 50_000.0).max(0.0),
            down_bytes_per_sec: (500_000.0 + (t * 0.3).sin() * 200_000.0 + 100_000.0).max(0.0),
            connections,
        })
    }

    async fn get_disk(&self) -> DiskInfo {
        let t = self.start_time.elapsed().as_secs_f64();
        DiskInfo {
            read_bytes_per_sec: (50_000_000.0 + (t * 0.1).sin() * 10_000_000.0).max(0.0),
            write_bytes_per_sec: (30_000_000.0 + (t * 0.15).sin() * 8_000_000.0).max(0.0),
            usage_percent: 45.0 + (t * 0.05).sin() * 5.0,
        }
    }

    async fn get_gpu(&self) -> Option<GpuInfo> {
        Some(GpuInfo {
            usage_percent: 35.0,
            memory_used_mb: 2048,
            memory_total_mb: 8192,
        })
    }

    async fn get_temperature(&self) -> Option<CpuGpuTemp> {
        let t = self.start_time.elapsed().as_secs_f64();
        Some(CpuGpuTemp {
            cpu: (65.0 + (t * 0.05).sin() * 5.0) as f32,
            gpu: (58.0 + (t * 0.04).sin() * 3.0) as f32,
        })
    }
}

fn rng_noise() -> f64 {
    let mut rng = StdRng::seed_from_u64(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64,
    );
    rng.gen_range(0.0..5.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_adapter_produces_valid_snapshot() {
        let adapter = MockAdapter::new();
        let processes = adapter.get_processes().await;
        assert!(!processes.is_empty(), "should have processes");
        assert!(processes.len() >= 20, "should have at least 20 processes");

        let root = processes.iter().find(|p| p.ppid == 0);
        assert!(root.is_some(), "should have a root process with ppid=0");

        let has_system = processes.iter().any(|p| p.user == "SYSTEM");
        let has_user = processes.iter().any(|p| p.user == "USER");
        assert!(has_system, "should have SYSTEM user processes");
        assert!(has_user, "should have USER processes");

        let cpu = adapter.get_cpu().await;
        assert!(!cpu.per_core.is_empty(), "should have per-core data");
        assert!(cpu.total > 0.0, "total CPU should be positive");

        let memory = adapter.get_memory().await;
        assert!(memory.total_mb > 0, "total memory should be positive");
        assert!(memory.used_mb <= memory.total_mb, "used memory should not exceed total");
    }

    #[tokio::test]
    async fn test_mock_adapter_network_disk_gpu_temp() {
        let adapter = MockAdapter::new();
        let network = adapter.get_network().await;
        assert!(network.is_some(), "network should be Some");
        assert!(!network.unwrap().connections.is_empty(), "should have connections");

        let disk = adapter.get_disk().await;
        assert!(disk.usage_percent > 0.0, "disk usage should be positive");

        let gpu = adapter.get_gpu().await;
        assert!(gpu.is_some(), "gpu should be Some");

        let temp = adapter.get_temperature().await;
        assert!(temp.is_some(), "temperature should be Some");
    }
}
