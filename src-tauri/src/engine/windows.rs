use std::net::Ipv4Addr;
use std::sync::{Mutex, PoisonError};

use async_trait::async_trait;
use sysinfo::{CpuRefreshKind, ProcessStatus, ProcessesToUpdate, System};
use windows::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, MIB_TCPROW_OWNER_PID as MibRow,
    MIB_TCPTABLE_OWNER_PID as MibTable, TCP_TABLE_OWNER_PID_ALL,
};
use windows::Win32::Networking::WinSock::AF_INET;

use crate::types::*;
use super::platform::PlatformAdapter;

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

/// Query all TCP v4 connections with owning PID via GetExtendedTcpTable.
fn get_tcp_connections() -> Vec<(u32, u32, u32, u32, u32, u32)> {
    unsafe {
        let mut buf_size: u32 = 0;

        // First call: get required buffer size
        let rc = GetExtendedTcpTable(None, &mut buf_size, false, AF_INET.0 as u32, TCP_TABLE_OWNER_PID_ALL, 0);
        if rc != 0 && buf_size == 0 {
            eprintln!("[Procession] GetExtendedTcpTable size query failed: {}", rc);
            return vec![];
        }

        let mut buf: Vec<u8> = vec![0u8; buf_size as usize];
        let rc = GetExtendedTcpTable(
            Some(buf.as_mut_ptr() as *mut _),
            &mut buf_size,
            false,
            AF_INET.0 as u32,
            TCP_TABLE_OWNER_PID_ALL,
            0,
        );
        if rc != 0 {
            eprintln!("[Procession] GetExtendedTcpTable query failed: {}", rc);
            return vec![];
        }

        let table = &*(buf.as_ptr() as *const MibTable);
        let count = table.dwNumEntries as usize;
        let rows = std::slice::from_raw_parts(&table.table as *const _ as *const MibRow, count);

        rows.iter()
            .map(|r| (r.dwState, r.dwLocalAddr, r.dwLocalPort, r.dwRemoteAddr, r.dwRemotePort, r.dwOwningPid))
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
        let raw = get_tcp_connections();
        let connections: Vec<Connection> = raw
            .into_iter()
            .map(|(state, local_addr, local_port, remote_addr, remote_port, pid)| Connection {
                pid: pid as u64,
                local_addr: format_addr(local_addr, local_port),
                remote_addr: format_addr(remote_addr, remote_port),
                state: tcp_state_str(state).to_string(),
                protocol: "tcp".to_string(),
            })
            .collect();

        Some(NetworkInfo {
            up_bytes_per_sec: 0.0,
            down_bytes_per_sec: 0.0,
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
