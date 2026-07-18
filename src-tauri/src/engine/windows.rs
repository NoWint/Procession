use std::net::Ipv4Addr;
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use std::collections::HashMap;

use async_trait::async_trait;
use sysinfo::{CpuRefreshKind, Networks, ProcessStatus, ProcessesToUpdate, System};
use windows::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, GetExtendedUdpTable,
    MIB_TCPROW_OWNER_PID as MibTcpRow,
    MIB_UDPROW_OWNER_PID as MibUdpRow,
    TCP_TABLE_OWNER_PID_ALL, UDP_TABLE_OWNER_PID,
};
use windows::Win32::Networking::WinSock::AF_INET;

use crate::types::*;
use super::platform::PlatformAdapter;

/// TTL cache for GetExtendedTcpTable / GetExtendedUdpTable results.
/// Eliminates 3× redundant kernel calls per snapshot cycle (get_network,
/// get_process_relations, get_listening_ports each query the same tables).
struct ConnTableCache {
    tcp_rows: Vec<(u32, u32, u32, u32, u32, u32)>,
    udp_rows: Vec<(u32, u32, u32)>,
    fetched_at: Instant,
}

type TcpUdpRows = (Vec<(u32, u32, u32, u32, u32, u32)>, Vec<(u32, u32, u32)>);

fn recover_mutex<T>(e: PoisonError<T>) -> T {
    eprintln!("[Procession] Mutex was poisoned, recovering");
    e.into_inner()
}

const MAX_CONNECTIONS: usize = 200;

/// Tracks cumulative network I/O and computes bytes/sec deltas with time normalization.
struct NetworkTracker {
    networks: Networks,
    prev_total_received: u64,
    prev_total_transmitted: u64,
    last_refresh: Instant,
}

impl NetworkTracker {
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

    /// Refresh counters and return (down_bytes_per_sec, up_bytes_per_sec) normalized by elapsed time.
    fn refresh_and_read(&mut self) -> (f64, f64) {
        self.networks.refresh(true);
        let now = Instant::now();
        let elapsed = (now - self.last_refresh).as_secs_f64().max(0.001); // avoid div-by-zero
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

pub struct WindowsImpl {
    sys: Mutex<System>,
    net: Mutex<NetworkTracker>,
    conn_cache: Mutex<Option<ConnTableCache>>,
}

impl WindowsImpl {
    pub fn new() -> Self {
        Self {
            sys: Mutex::new(System::new()),
            net: Mutex::new(NetworkTracker::new()),
            conn_cache: Mutex::new(None),
        }
    }

    /// Return cached TCP/UDP rows if fetched within the last 100ms,
    /// otherwise re-query the kernel tables. Eliminates 3× redundant
    /// kernel calls per snapshot cycle.
    fn cached_tcp_udp(&self) -> TcpUdpRows {
        let mut cache = self.conn_cache.lock().unwrap_or_else(recover_mutex);
        if let Some(ref c) = *cache {
            if c.fetched_at.elapsed() < Duration::from_millis(100) {
                return (c.tcp_rows.clone(), c.udp_rows.clone());
            }
        }
        let (tcp, udp) = (fetch_tcp_table(), fetch_udp_table());
        *cache = Some(ConnTableCache {
            tcp_rows: tcp.clone(),
            udp_rows: udp.clone(),
            fetched_at: Instant::now(),
        });
        (tcp, udp)
    }

    /// Batch-collect processes, CPU, and memory with a single sysinfo lock
    /// acquisition instead of three separate ones. Extracted so that
    /// `collect_snapshot` can call this directly, bypassing the individual
    /// getter methods (which each lock and refresh independently).
    fn collect_sysinfo(&self) -> (Vec<ProcessInfo>, CpuInfo, MemoryInfo) {
        let mut sys = self.sys.lock().unwrap_or_else(recover_mutex);
        sys.refresh_processes(ProcessesToUpdate::All, false);
        sys.refresh_cpu_specifics(CpuRefreshKind::everything());
        sys.refresh_memory();

        let processes: Vec<ProcessInfo> = sys
            .processes()
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
            .collect();

        let per_core: Vec<f64> = sys.cpus().iter().map(|c| c.cpu_usage() as f64).collect();
        let total = if per_core.is_empty() {
            0.0
        } else {
            per_core.iter().sum::<f64>() / per_core.len() as f64
        };
        let cpu = CpuInfo { total, per_core };

        let memory = MemoryInfo {
            used_mb: sys.used_memory() / 1024 / 1024,
            total_mb: sys.total_memory() / 1024 / 1024,
            swap_used_mb: sys.used_swap() / 1024 / 1024,
            swap_total_mb: sys.total_swap() / 1024 / 1024,
        };

        (processes, cpu, memory)
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

fn tcp_state_str(state: u32) -> &'static str {
    match state {
        1 => "closed",
        2 => "listen",
        3 => "syn_sent",
        4 => "syn_rcvd",
        5 => "established",
        6 => "fin_wait1",
        7 => "fin_wait2",
        8 => "close_wait",
        9 => "closing",
        10 => "last_ack",
        11 => "time_wait",
        12 => "delete_tcb",
        _ => "unknown",
    }
}

fn format_addr(raw_addr: u32, raw_port: u32) -> String {
    let ip = Ipv4Addr::from(raw_addr.to_be_bytes());
    let port = u16::from_be(raw_port as u16);
    format!("{}:{}", ip, port)
}

/// Read dwNumEntries from the raw buffer, then return a slice of rows starting at buf[4..].
/// Avoids creating a struct reference into a potentially 4-byte-only buffer (safe when 0 entries).
unsafe fn parse_rows<T>(buf: &[u8]) -> &[T] {
    if buf.len() < 4 {
        return &[];
    }
    let count = u32::from_ne_bytes(buf[..4].try_into().unwrap_unchecked()) as usize;
    let row_size = std::mem::size_of::<T>();
    let available = buf.len().saturating_sub(4);
    let max_rows = available / row_size;
    let actual = count.min(max_rows);
    if actual == 0 {
        return &[];
    }
    let rows_ptr = buf.as_ptr().add(4) as *const T;
    std::slice::from_raw_parts(rows_ptr, actual)
}

/// Query all TCP v4 connections with owning PID via GetExtendedTcpTable.
fn fetch_tcp_table() -> Vec<(u32, u32, u32, u32, u32, u32)> {
    unsafe {
        let mut buf_size: u32 = 0;
        let rc = GetExtendedTcpTable(None, &mut buf_size, false, AF_INET.0 as u32, TCP_TABLE_OWNER_PID_ALL, 0);
        if rc != 0 && buf_size == 0 {
            return vec![];
        }

        let mut buf: Vec<u8> = vec![0u8; buf_size.max(4) as usize];
        let rc = GetExtendedTcpTable(
            Some(buf.as_mut_ptr() as *mut _), &mut buf_size, false,
            AF_INET.0 as u32, TCP_TABLE_OWNER_PID_ALL, 0,
        );
        if rc != 0 {
            return vec![];
        }

        let rows: &[MibTcpRow] = parse_rows(&buf);
        rows.iter()
            .map(|r| (r.dwState, r.dwLocalAddr, r.dwLocalPort, r.dwRemoteAddr, r.dwRemotePort, r.dwOwningPid))
            .collect()
    }
}

/// Query all UDP v4 listeners with owning PID via GetExtendedUdpTable.
fn fetch_udp_table() -> Vec<(u32, u32, u32)> {
    unsafe {
        let mut buf_size: u32 = 0;
        let rc = GetExtendedUdpTable(None, &mut buf_size, false, AF_INET.0 as u32, UDP_TABLE_OWNER_PID, 0);
        if rc != 0 && buf_size == 0 {
            return vec![];
        }

        let mut buf: Vec<u8> = vec![0u8; buf_size.max(4) as usize];
        let rc = GetExtendedUdpTable(
            Some(buf.as_mut_ptr() as *mut _), &mut buf_size, false,
            AF_INET.0 as u32, UDP_TABLE_OWNER_PID, 0,
        );
        if rc != 0 {
            return vec![];
        }

        let rows: &[MibUdpRow] = parse_rows(&buf);
        rows.iter()
            .map(|r| (r.dwLocalAddr, r.dwLocalPort, r.dwOwningPid))
            .collect()
    }
}

#[async_trait]
impl PlatformAdapter for WindowsImpl {
    /// Override collect_snapshot to batch sysinfo refreshes into a single
    /// lock acquisition (processes + cpu + memory) instead of three separate
    /// ones from the default trait impl.
    async fn collect_snapshot(&self) -> SystemSnapshot {
        let (processes, cpu, memory) = self.collect_sysinfo();

        // Remaining queries run via their individual methods (own locks)
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
        // 1. Refresh I/O counters and read normalized rates (single lock acquisition)
        let (down, up) = if let Ok(mut net) = self.net.lock() {
            net.refresh_and_read()
        } else {
            (0.0, 0.0)
        };

        // 2. Collect TCP connections (from cache — shared with get_process_relations and get_listening_ports)
        let (tcp_rows, udp_rows) = self.cached_tcp_udp();
        let mut connections: Vec<Connection> = tcp_rows
            .into_iter()
            .map(|(state, local_addr, local_port, remote_addr, remote_port, pid)| Connection {
                pid: pid as u64,
                local_addr: format_addr(local_addr, local_port),
                remote_addr: format_addr(remote_addr, remote_port),
                state: tcp_state_str(state).to_string(),
                protocol: "tcp".to_string(),
            })
            .collect();

        // 3. Collect UDP listeners
        connections.extend(udp_rows.into_iter().map(|(local_addr, local_port, pid)| Connection {
            pid: pid as u64,
            local_addr: format_addr(local_addr, local_port),
            remote_addr: "0.0.0.0:0".to_string(),
            state: "listen".to_string(),
            protocol: "udp".to_string(),
        }));

        // 4. Cap total connections to protect frontend rendering
        connections.truncate(MAX_CONNECTIONS);

        Some(NetworkInfo {
            up_bytes_per_sec: up.max(0.0),
            down_bytes_per_sec: down.max(0.0),
            connections,
        })
    }

    async fn get_disk(&self) -> DiskInfo {
        DiskInfo::default()
    }

    async fn get_gpu(&self) -> Option<GpuInfo> {
        super::gpu::get_gpu_info()
    }

    async fn get_temperature(&self) -> Option<CpuGpuTemp> {
        super::gpu::get_temperature()
    }

    async fn get_process_relations(&self, processes: &[ProcessInfo]) -> Vec<ProcessRelation> {
        // 1. Derive parent-child tree from ppid
        let mut children: HashMap<u64, Vec<u64>> = HashMap::new();
        for p in processes {
            children.entry(p.ppid).or_default().push(p.pid);
        }

        // 2. Detect IPC peers from localhost TCP connections.
        //    Build (addr,port) -> pid lookup from TCP rows + UDP listeners
        let (tcp_rows, udp_rows) = self.cached_tcp_udp();
        let mut endpoint_to_pid: HashMap<(u32, u32), u64> = HashMap::new();
        for (_, local_addr, local_port, _remote_addr, _remote_port, pid) in &tcp_rows {
            if *pid != 0 {
                endpoint_to_pid.insert((*local_addr, *local_port), *pid as u64);
            }
        }
        for (local_addr, local_port, pid) in &udp_rows {
            if *pid != 0 {
                endpoint_to_pid.insert((*local_addr, *local_port), *pid as u64);
            }
        }

        let mut local_peers: HashMap<u64, Vec<u64>> = HashMap::new();
        for (state, _local_addr, _local_port, remote_addr, remote_port, pid) in &tcp_rows {
            if *state == 5 /* established */ && *pid != 0 {
                let remote_ip = Ipv4Addr::from(remote_addr.to_be_bytes());
                if remote_ip.is_loopback() {
                    if let Some(peer_pid) = endpoint_to_pid.get(&(*remote_addr, *remote_port)) {
                        if *peer_pid != *pid as u64 {
                            local_peers.entry(*pid as u64).or_default().push(*peer_pid);
                            local_peers.entry(*peer_pid).or_default().push(*pid as u64);
                        }
                    }
                }
            }
        }

        // 3. Build ProcessRelation list
        let pid_set: std::collections::HashSet<u64> = processes.iter().map(|p| p.pid).collect();
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

    async fn get_listening_ports(&self) -> Vec<ListeningPort> {
        let (tcp_rows, udp_rows) = self.cached_tcp_udp();
        let mut ports: Vec<ListeningPort> = Vec::new();

        for (state, local_addr, local_port, _remote_addr, _remote_port, pid) in &tcp_rows {
            if *state == 2 /* listen */ {
                let ip = Ipv4Addr::from(local_addr.to_be_bytes());
                ports.push(ListeningPort {
                    pid: *pid as u64,
                    port: u16::from_be(*local_port as u16),
                    protocol: "tcp".to_string(),
                    address: format!("{}", ip),
                });
            }
        }

        // udp_rows already obtained from cached_tcp_udp() above
        for (local_addr, local_port, pid) in &udp_rows {
            let ip = Ipv4Addr::from(local_addr.to_be_bytes());
            ports.push(ListeningPort {
                pid: *pid as u64,
                port: u16::from_be(*local_port as u16),
                protocol: "udp".to_string(),
                address: format!("{}", ip),
            });
        }

        ports
    }
}
