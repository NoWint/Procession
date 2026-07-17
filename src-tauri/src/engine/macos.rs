use std::collections::{HashMap, HashSet};
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
            .map(|d| {
                let total = d.total_space();
                if total == 0 {
                    0.0
                } else {
                    ((total - d.available_space()) as f64 / total as f64) * 100.0
                }
            })
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

    async fn get_process_relations(&self, processes: &[ProcessInfo]) -> Vec<ProcessRelation> {
        macos_process_relations(processes).await
    }

    async fn get_listening_ports(&self) -> Vec<ListeningPort> {
        macos_listening_ports().await
    }
}

/// macOS IPC detection via lsof. Builds parent-child tree from ppid + localhost IPC peers.
async fn macos_process_relations(processes: &[ProcessInfo]) -> Vec<ProcessRelation> {
    use tokio::process::Command;

    let mut children: HashMap<u64, Vec<u64>> = HashMap::new();
    for p in processes {
        children.entry(p.ppid).or_default().push(p.pid);
    }

    let mut local_peers: HashMap<u64, Vec<u64>> = HashMap::new();
    let lsof_output = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        Command::new("lsof").args(["-iTCP", "-sTCP:ESTABLISHED", "-P", "-n"]).output(),
    )
    .await
    .unwrap_or(Err(std::io::Error::new(std::io::ErrorKind::TimedOut, "lsof timed out")));
    if let Ok(output) = lsof_output {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let rows = parse_lsof_connections(&stdout);
            let mut endpoint_to_pid: HashMap<(String, u16), u64> = HashMap::new();
            for (pid, local_addr, local_port, _remote_addr, _remote_port) in &rows {
                if *pid != 0 {
                    endpoint_to_pid.insert((local_addr.clone(), *local_port), *pid);
                }
            }
            for (pid, _local_addr, _local_port, remote_addr, remote_port) in &rows {
                if *pid != 0
                    && matches!(remote_addr.as_str(), "127.0.0.1" | "::1" | "localhost")
                {
                    if let Some(peer_pid) =
                        endpoint_to_pid.get(&(remote_addr.clone(), *remote_port))
                    {
                        if *peer_pid != *pid {
                            local_peers.entry(*pid).or_default().push(*peer_pid);
                            local_peers.entry(*peer_pid).or_default().push(*pid);
                        }
                    }
                }
            }
        }
    }

    let pid_set: HashSet<u64> = processes.iter().map(|p| p.pid).collect();
    let mut relations: Vec<ProcessRelation> = Vec::with_capacity(processes.len());
    for p in processes {
        let child_list = children.remove(&p.pid).unwrap_or_default();
        let children_in_set: Vec<u64> = child_list.into_iter().filter(|c| pid_set.contains(c)).collect();
        let peer_list = local_peers.remove(&p.pid).unwrap_or_default();
        let peers_in_set: Vec<u64> = peer_list.into_iter().filter(|c| pid_set.contains(c)).collect();
        relations.push(ProcessRelation {
            pid: p.pid,
            ppid: p.ppid,
            children: children_in_set,
            ipc_peers: peers_in_set,
        });
    }
    relations
}

/// macOS listening ports enumeration via lsof (TCP LISTEN + UDP).
async fn macos_listening_ports() -> Vec<ListeningPort> {
    use tokio::process::Command;

    let mut ports = Vec::new();
    for &(proto, args) in &[
        ("tcp", &["-iTCP", "-sTCP:LISTEN", "-P", "-n"] as &[_]),
        ("udp", &["-iUDP", "-P", "-n"] as &[_]),
    ] {
        let lsof_output = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            Command::new("lsof").args(args).output(),
        )
        .await
        .unwrap_or(Err(std::io::Error::new(std::io::ErrorKind::TimedOut, "lsof timed out")));
        if let Ok(output) = lsof_output {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines().skip(1) {
                    let fields: Vec<&str> = line.split_whitespace().collect();
                    if fields.len() < 9 {
                        continue;
                    }
                    let pid = match fields[1].parse::<u64>() {
                        Ok(p) => p,
                        Err(_) => continue,
                    };
                    let name_field = fields[8];
                    // NAME format: "*:8080 (LISTEN)" or "192.168.1.1:53"
                    let addr_part = name_field.split_whitespace().next().unwrap_or("");
                    if let Some((address, port_str)) = addr_part.rsplit_once(':') {
                        if let Ok(port) = port_str.parse::<u16>() {
                            let address = if address == "*" || address == "::" {
                                "0.0.0.0".to_string()
                            } else {
                                address.trim_start_matches('[').trim_end_matches(']').to_string()
                            };
                            ports.push(ListeningPort {
                                pid,
                                port,
                                protocol: proto.to_string(),
                                address,
                            });
                        }
                    }
                }
            }
        }
    }
    ports
}

/// Parse lsof -iTCP output into (pid, local_addr, local_port, remote_addr, remote_port).
fn parse_lsof_connections(output: &str) -> Vec<(u64, String, u16, String, u16)> {
    let mut rows = Vec::new();
    for line in output.lines().skip(1) {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() < 9 {
            continue;
        }
        let pid = match fields[1].parse::<u64>() {
            Ok(p) => p,
            Err(_) => continue,
        };
        let name = fields[8];
        let arrow = name.find("->");
        let (local_part, remote_part) = if let Some(pos) = arrow {
            (&name[..pos], &name[pos + 2..])
        } else {
            continue;
        };
        if let (Some((local_addr, local_port)), Some((remote_addr, remote_port))) =
            (local_part.rsplit_once(':'), remote_part.rsplit_once(':'))
        {
            if let (Ok(lp), Ok(rp)) = (local_port.parse::<u16>(), remote_port.parse::<u16>()) {
                // Strip brackets from IPv6 addresses (#1: lsof outputs [::1] not ::1)
                let clean_local = local_addr.trim_start_matches('[').trim_end_matches(']').to_string();
                let clean_remote = remote_addr.trim_start_matches('[').trim_end_matches(']').to_string();
                rows.push((pid, clean_local, lp, clean_remote, rp));
            }
        }
    }
    rows
}
