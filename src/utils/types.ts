// CONTRACT VERSION 1.0 — must stay in sync with src-tauri/src/types.rs

export type ProcessState = "Running" | "Sleeping" | "Stopped" | "Zombie";

export interface ProcessInfo {
  pid: number;
  ppid: number;
  name: string;
  cpu: number;
  memory_mb: number;
  state: ProcessState;
  user: string;
}

export interface CpuInfo {
  total: number;
  per_core: number[];
}

export interface MemoryInfo {
  used_mb: number;
  total_mb: number;
  swap_used_mb: number;
  swap_total_mb: number;
}

export interface Connection {
  pid: number;
  local_addr: string;
  remote_addr: string;
  state: string;
  protocol: string;
}

export interface NetworkInfo {
  up_bytes_per_sec: number;
  down_bytes_per_sec: number;
  connections: Connection[];
}

export interface DiskInfo {
  read_bytes_per_sec: number;
  write_bytes_per_sec: number;
  usage_percent: number;
}

export interface GpuInfo {
  usage_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
}

export interface CpuGpuTemp {
  cpu: number;
  gpu: number;
}

export interface SystemSnapshot {
  processes: ProcessInfo[];
  cpu: CpuInfo;
  memory: MemoryInfo;
  network: NetworkInfo;
  disk: DiskInfo;
  gpu: GpuInfo | null;
  temperature: CpuGpuTemp | null;
  timestamp: number;
  stale: boolean;
}

export interface Config {
  process_limit: number;
  refresh_rate_hz: number;
  performance_mode: boolean;
  color_theme: string;
}
