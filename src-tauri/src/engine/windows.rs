use std::net::Ipv4Addr;
use std::sync::{Mutex, PoisonError};
use std::time::Instant;

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
}

impl WindowsImpl {
    pub fn new() -> Self {
        Self {
            sys: Mutex::new(System::new()),
            net: Mutex::new(NetworkTracker::new()),
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
fn get_tcp_connections() -> Vec<(u32, u32, u32, u32, u32, u32)> {
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
fn get_udp_listeners() -> Vec<(u32, u32, u32)> {
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

        // 2. Collect TCP connections
        let tcp_rows = get_tcp_connections();
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
        let udp_rows = get_udp_listeners();
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
        None
    }

    async fn get_temperature(&self) -> Option<CpuGpuTemp> {
        None
    }
}
