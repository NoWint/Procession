use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProcessState {
    Running,
    Sleeping,
    Stopped,
    Zombie,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: u64,
    pub ppid: u64,
    pub name: String,
    pub cpu: f64,
    pub memory_mb: u64,
    pub state: ProcessState,
    pub user: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CpuInfo {
    pub total: f64,
    pub per_core: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MemoryInfo {
    pub used_mb: u64,
    pub total_mb: u64,
    pub swap_used_mb: u64,
    pub swap_total_mb: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub pid: u64,
    pub local_addr: String,
    pub remote_addr: String,
    pub state: String,
    pub protocol: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NetworkInfo {
    pub up_bytes_per_sec: f64,
    pub down_bytes_per_sec: f64,
    pub connections: Vec<Connection>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DiskInfo {
    pub read_bytes_per_sec: f64,
    pub write_bytes_per_sec: f64,
    pub usage_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub usage_percent: f64,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuGpuTemp {
    pub cpu: f32,
    pub gpu: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessRelation {
    pub pid: u64,
    pub ppid: u64,
    pub children: Vec<u64>,
    pub ipc_peers: Vec<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListeningPort {
    pub pid: u64,
    pub port: u16,
    pub protocol: String,
    pub address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FsHotspot {
    pub path: String,
    pub event_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub executable: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default = "default_refresh")]
    pub refresh_interval_secs: u64,
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
}

fn default_refresh() -> u64 { 5 }
fn default_timeout() -> u64 { 10 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemSnapshot {
    pub processes: Vec<ProcessInfo>,
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub network: NetworkInfo,
    pub disk: DiskInfo,
    pub gpu: Option<GpuInfo>,
    pub temperature: Option<CpuGpuTemp>,
    #[serde(default)]
    pub process_relations: Vec<ProcessRelation>,
    #[serde(default)]
    pub listening_ports: Vec<ListeningPort>,
    #[serde(default)]
    pub fs_hotspots: Vec<FsHotspot>,
    #[serde(default)]
    pub plugins: HashMap<String, serde_json::Value>,
    pub timestamp: u64,
    #[serde(default)]
    pub stale: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub process_limit: usize,
    pub refresh_rate_hz: f64,
    pub performance_mode: bool,
    pub color_theme: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            process_limit: 500,
            refresh_rate_hz: 1.0,
            performance_mode: false,
            color_theme: "default".to_string(),
        }
    }
}
