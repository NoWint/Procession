# Procession 后端实现规格

> 版本: v0.1-draft
> 本文档将 ARCHITECTURE.md 的设计决策固化为可指导编码的实现规格。
> 读者应已阅读 ARCHITECTURE.md 和 SPEC.md。

---

## 一、模块依赖图

```
main.rs
  ├── engine::mod      → types
  │   ├── platform.rs  → [无外部依赖，纯 trait]
  │   ├── windows.rs   → platform, sysinfo, windows-rs
  │   ├── mac.rs       → platform (stub)
  │   └── mock.rs      → platform, rand
  ├── bridge::mod      → engine, types
  │   ├── snapshot.rs  → tauri::AppHandle, types
  │   └── cache.rs     → types
  └── types.rs         → serde, tauri (Tag)
```

- `types.rs` 是唯一被 **所有模块** 引用的叶子模块，修改需通知前端
- `engine` 不依赖 `bridge`——即使 DataBridge 不存在，SystemEngine 也能独立跑
- `bridge` 依赖 `engine` 产出的 `SystemSnapshot` 类型

---

## 二、Tauri 2.x 项目集成

### 2.1 生命周期绑定

SystemEngine 的 1Hz 循环运行在 Tauri 管理的 **异步后台任务** 中，通过 `setup` hook 启动：

```rust
// main.rs
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut engine = SystemEngine::new(WindowsImpl::new());
                let bridge = DataBridge::new(handle);
                engine.run(bridge).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 2.2 托管的共享状态（Managed State）

Tauri 2.x 的 managed state 用于配置和缓存：

```rust
app.manage(Mutex::new(Config::default()));
app.manage(Mutex::new(CacheBuffer::new(1000)));
```

### 2.3 Tauri 配置项（tauri.conf.json）

```json
{
  "productName": "Procession",
  "identifier": "com.nowint.procession",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [{
      "title": "Procession",
      "width": 1280,
      "height": 720,
      "resizable": true,
      "fullscreen": false
    }]
  }
}
```

---

## 三、SystemEngine 完整设计

### 3.1 核心循环（含错误隔离）

```rust
pub struct SystemEngine {
    platform: Box<dyn PlatformAdapter>,
    last_snapshot: Option<SystemSnapshot>,
}

impl SystemEngine {
    pub fn new(platform: impl PlatformAdapter + 'static) -> Self {
        Self { platform: Box::new(platform), last_snapshot: None }
    }

    pub async fn run(&mut self, bridge: DataBridge) {
        let mut tick: u64 = 0;
        loop {
            tick += 1;
            match self.collect_snapshot(tick).await {
                Ok(snapshot) => {
                    bridge.push(snapshot.clone()).await;
                    self.last_snapshot = Some(snapshot);
                }
                Err(_) => {
                    if let Some(ref last) = self.last_snapshot {
                        bridge.push_stale(last.clone()).await;
                    }
                }
            }
            tokio::time::sleep(Duration::from_millis(1000)).await;
        }
    }

    async fn collect_snapshot(&mut self, tick: u64) -> Result<SystemSnapshot, EngineError> {
        let processes = self.platform.get_processes().await.unwrap_or_default();
        let cpu = self.platform.get_cpu().await.unwrap_or_default();
        let memory = self.platform.get_memory().await.unwrap_or_default();

        let network = if tick % 2 == 0 {
            self.platform.get_network().await.ok()
        } else {
            None
        };

        let disk = self.platform.get_disk().await.unwrap_or_default();
        let gpu = if tick % 5 == 0 {
            self.platform.get_gpu().await.unwrap_or(None)
        } else {
            None
        };
        let temperature = if tick % 5 == 0 {
            self.platform.get_temperature().await.unwrap_or(None)
        } else {
            None
        };

        Ok(SystemSnapshot {
            processes: EventFilter::apply_limit(processes, 500),
            cpu,
            memory,
            network: network.unwrap_or_default(),
            disk,
            gpu,
            temperature,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            stale: false,
        })
    }
}
```

### 3.2 关键决策

- **每个 `get_*` 独立 `unwrap_or`**：一个传感器失败不影响整帧
- **降频在 engine 层控制**：PlatformAdapter 本身总是返回最新数据
- **tick 自增**：不依赖系统时钟，避免回拨
- **整帧失败复用上一帧**：标记 `stale: true`，前端据此显示延迟警告

---

## 四、PlatformAdapter 实现细节

### 4.1 WindowsImpl（sysinfo 方案）

```rust
use sysinfo::{
    CpuRefreshKind, Disks, Networks, System,
};

pub struct WindowsImpl {
    sys: System,
    networks: Networks,
    disks: Disks,
}

impl WindowsImpl {
    pub fn new() -> Self {
        Self {
            sys: System::new(),
            networks: Networks::new_with_refreshed_list(),
            disks: Disks::new_with_refreshed_list(),
        }
    }
}

#[async_trait]
impl PlatformAdapter for WindowsImpl {
    async fn get_processes(&self) -> Vec<ProcessInfo> {
        self.sys.refresh_processes();
        self.sys.processes().iter().map(|(pid, process)| {
            ProcessInfo {
                pid: pid.as_u32() as u64,
                ppid: process.parent().map(|p| p.as_u32() as u64).unwrap_or(0),
                name: process.name().to_string_lossy().to_string(),
                cpu: process.cpu_usage() as f64,
                memory_mb: process.memory() / 1024 / 1024,
                state: match process.status() {
                    sysinfo::ProcessStatus::Run | sysinfo::ProcessStatus::Idle => ProcessState::Running,
                    sysinfo::ProcessStatus::Sleep => ProcessState::Sleeping,
                    sysinfo::ProcessStatus::Stop => ProcessState::Stopped,
                    _ => ProcessState::Zombie,
                },
                user: String::new(),
            }
        }).collect()
    }

    async fn get_cpu(&self) -> CpuInfo {
        self.sys.refresh_cpu_specifics(CpuRefreshKind::everything());
        let per_core: Vec<f64> = self.sys.cpus().iter()
            .map(|c| c.cpu_usage() as f64)
            .collect();
        let total = per_core.iter().sum::<f64>() / per_core.len() as f64;
        CpuInfo { total, per_core }
    }

    async fn get_memory(&self) -> MemoryInfo {
        self.sys.refresh_memory();
        MemoryInfo {
            used_mb: self.sys.used_memory() / 1024 / 1024,
            total_mb: self.sys.total_memory() / 1024 / 1024,
            swap_used_mb: self.sys.used_swap() / 1024 / 1024,
            swap_total_mb: self.sys.total_swap() / 1024 / 1024,
        }
    }

    async fn get_disk(&self) -> DiskInfo {
        DiskInfo::default()   // Phase 3 实现
    }

    async fn get_network(&self) -> Option<NetworkInfo> {
        Some(NetworkInfo::default())  // Phase 3 实现
    }

    async fn get_gpu(&self) -> Option<GpuInfo> { None }
    async fn get_temperature(&self) -> Option<f32> { None }
}
```

### 4.2 sysinfo 刷新成本

| 方法 | 刷新调用 | 开销 |
|------|---------|------|
| `get_cpu` | `refresh_cpu_specifics(everything)` | 低 |
| `get_memory` | `refresh_memory()` | 极低 |
| `get_processes` | `refresh_processes()` | **中-高**（500 进程 ≈ 2-5ms）|
| `get_disk` | `refresh_disks_list()` | 低 |
| `get_network` | `refresh_networks_list()` | 低 |

### 4.3 MockAdapter 设计

```rust
pub struct MockAdapter {
    rng: StdRng,
    start_time: Instant,
}

#[async_trait]
impl PlatformAdapter for MockAdapter {
    async fn get_processes(&self) -> Vec<ProcessInfo> {
        let t = self.start_time.elapsed().as_secs_f64();
        vec![
            mock_process("wininit.exe", 1, 0, 2.0 + (t * 0.1).sin() * 5.0, 120.0),
            mock_process("chrome.exe", 2, 1, 25.0 + (t * 0.3).sin() * 8.0, 512.0),
            mock_process("code.exe", 3, 1, 8.0 + (t * 0.2).sin() * 3.0, 256.0),
            mock_process("node.exe", 4, 1, 15.0 + (t * 0.5).sin() * 5.0, 180.0),
        ]
    }
    // 其他方法返回合理模拟值
}
```

**模拟数据包含**：4-10 个进程，CPU/内存带正弦波动 + 随机噪声。通过环境变量或 feature flag 启用。

---

## 五、DataBridge 完整设计

### 5.1 SnapshotPusher

```rust
pub struct DataBridge {
    app_handle: AppHandle,
    cache: Arc<Mutex<CacheBuffer>>,
}

impl DataBridge {
    pub fn new(app_handle: AppHandle, cache: Arc<Mutex<CacheBuffer>>) -> Self {
        Self { app_handle, cache }
    }

    pub async fn push(&self, snapshot: SystemSnapshot) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.push(snapshot.clone());
        }
        if let Err(e) = self.app_handle.emit("system-snapshot", &snapshot) {
            eprintln!("[Procession] emit failed: {}", e);
        }
    }

    pub async fn push_stale(&self, mut snapshot: SystemSnapshot) {
        snapshot.stale = true;
        self.push(snapshot).await;
    }
}
```

### 5.2 EventFilter

```rust
pub struct EventFilter;

impl EventFilter {
    pub fn apply_limit(mut processes: Vec<ProcessInfo>, limit: usize) -> Vec<ProcessInfo> {
        if processes.len() <= limit { return processes; }
        processes.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal));
        processes.truncate(limit);
        processes
    }
}
```

### 5.3 CacheBuffer（环形缓冲区）

```rust
pub struct CacheBuffer {
    buffer: Vec<SystemSnapshot>,
    capacity: usize,
    write_pos: usize,
}

impl CacheBuffer {
    pub fn new(capacity: usize) -> Self {
        Self { buffer: Vec::with_capacity(capacity.min(1000)), capacity, write_pos: 0 }
    }

    pub fn push(&mut self, snapshot: SystemSnapshot) {
        if self.buffer.len() < self.capacity {
            self.buffer.push(snapshot);
        } else {
            self.buffer[self.write_pos % self.capacity] = snapshot;
        }
        self.write_pos += 1;
    }

    pub fn get_latest(&self) -> Option<&SystemSnapshot> {
        if self.buffer.is_empty() { None }
        else { Some(&self.buffer[(self.write_pos - 1) % self.capacity]) }
    }

    pub fn len(&self) -> usize { self.buffer.len().min(self.capacity) }
}
```

---

## 六、类型定义（types.rs）

```rust
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
pub struct SystemSnapshot {
    pub processes: Vec<ProcessInfo>,
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub network: NetworkInfo,
    pub disk: DiskInfo,
    pub gpu: Option<GpuInfo>,
    pub temperature: Option<CpuGpuTemp>,
    pub timestamp: u64,
    #[serde(default)]
    pub stale: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuGpuTemp {
    pub cpu: f32,
    pub gpu: f32,
}
```

---

## 七、IPC API 完整清单

### 7.1 Events（后端 → 前端，`app.emit`）

| 事件名 | 负载 | 频率 | Phase |
|--------|------|------|-------|
| `system-snapshot` | `SystemSnapshot` | 1Hz | 1 |

### 7.2 Commands（前端 → 后端，`invoke`）

```rust
#[tauri::command]
async fn get_snapshot(
    cache: tauri::State<'_, Mutex<CacheBuffer>>
) -> Result<SystemSnapshot, String> {
    cache.lock().map_err(|e| e.to_string())?
        .get_latest().cloned()
        .ok_or_else(|| "No data yet".to_string())
}

#[tauri::command]
async fn get_config(
    config: tauri::State<'_, Mutex<Config>>
) -> Result<Config, String> {
    config.lock().map_err(|e| e.to_string()).map(|c| c.clone())
}

#[tauri::command]
async fn update_config(
    config: tauri::State<'_, Mutex<Config>>,
    new_config: Config,
) -> Result<(), String> {
    *config.lock().map_err(|e| e.to_string())? = new_config;
    Ok(())
}
```

### 7.3 main.rs 完整入口

```rust
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            let cache = Arc::new(Mutex::new(CacheBuffer::new(1000)));
            app.manage(cache.clone());

            tauri::async_runtime::spawn(async move {
                let platform: Box<dyn PlatformAdapter> = if cfg!(feature = "mock") {
                    Box::new(MockAdapter::new())
                } else {
                    Box::new(WindowsImpl::new())
                };
                let mut engine = SystemEngine::new(platform);
                let bridge = DataBridge::new(handle, cache);
                engine.run(bridge).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_snapshot])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**mock 模式启动**：`cargo tauri dev --features mock`

---

## 八、错误处理架构

### 8.1 错误类型

```rust
#[derive(Debug)]
pub enum EngineError {
    PlatformError(String),
    IpcError(String),
}

impl std::fmt::Display for EngineError { /* ... */ }
impl std::error::Error for EngineError {}
```

### 8.2 错误隔离策略

| 层级 | 策略 | 效果 |
|------|------|------|
| 单个 `get_*` 调用 | `unwrap_or(default)` | 该指标用默认值 |
| 整帧采集 | 失败复用上一帧 | HUD 显示 stale |
| IPC 发送失败 | 只 `eprintln!` | 下帧继续 |
| PlatformAdapter 构造 | 启动时退出 | 不可恢复错误 |

---

## 九、配置系统（Phase 1 骨架）

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub process_limit: usize,       // 100-2000, default 500
    pub refresh_rate_hz: f64,       // 0.5-5.0, default 1.0
    pub performance_mode: bool,      // default false
    pub color_theme: String,        // default "default"
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
```

持久化 Phase 4 用 Tauri Plugin Store 实现。

---

## 十、Cargo.toml 依赖

```toml
[package]
name = "procession"
version = "0.1.0"
edition = "2021"

[lib]
name = "procession_lib"
crate-type = ["lib", "cdylib", "staticlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["devtools"] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sysinfo = "0.33"
tokio = { version = "1", features = ["full"] }
rand = "0.8"

[features]
mock = []

[target.'cfg(target_os = "windows")'.dependencies]
windows = "0.58"
```

---

## 十一、测试策略

### 11.1 测试文件组织

```
src-tauri/src/
├── engine/
│   ├── mod.rs
│   ├── platform.rs
│   ├── windows.rs
│   ├── mock.rs
│   └── tests.rs          # SystemEngine + MockAdapter 集成测试
├── bridge/
│   ├── mod.rs
│   ├── snapshot.rs
│   ├── cache.rs
│   └── tests.rs          # CacheBuffer 单元测试
└── types.rs
```

### 11.2 核心测试用例

```rust
#[tokio::test]
async fn test_engine_produces_valid_snapshot() {
    let platform = MockAdapter::new();
    let mut engine = SystemEngine::new(platform);
    let snapshot = engine.collect_snapshot(1).await.unwrap();
    assert!(!snapshot.processes.is_empty());
    assert!(snapshot.cpu.total > 0.0);
    assert!(snapshot.timestamp > 0);
}

#[tokio::test]
async fn test_cache_ring_buffer_wraparound() {
    let mut cache = CacheBuffer::new(3);
    for i in 0..5 {
        let mut s = SystemSnapshot::default();
        s.timestamp = i;
        cache.push(s);
    }
    assert_eq!(cache.get_latest().unwrap().timestamp, 4);
    assert_eq!(cache.len(), 3);
}

#[test]
fn test_event_filter_limit() {
    let processes: Vec<ProcessInfo> = (0..1000).map(|i| ProcessInfo {
        cpu: i as f64,
        pid: i,
        ppid: 0,
        name: format!("p{}", i),
        memory_mb: 100,
        state: ProcessState::Running,
        user: "user".to_string(),
    }).collect();
    let filtered = EventFilter::apply_limit(processes, 500);
    assert_eq!(filtered.len(), 500);
    assert!(filtered[0].cpu > filtered[499].cpu);
}
```

---

## 十二、Phase 1 实施检查清单

- [ ] Tauri 2.x 项目初始化（`npm create tauri-app`）
- [ ] `Cargo.toml` 依赖配置
- [ ] `engine/platform.rs` — PlatformAdapter trait
- [ ] `engine/mock.rs` — MockAdapter（正弦波模拟数据）
- [ ] `engine/windows.rs` — WindowsImpl（CPU/内存/进程 sysinfo 实现）
- [ ] `bridge/cache.rs` — CacheBuffer 环形缓冲区
- [ ] `bridge/snapshot.rs` — DataBridge + SnapshotPusher
- [ ] `types.rs` — 完整类型定义
- [ ] `main.rs` — setup hook + 后台任务 + invoke handler
- [ ] `tauri.conf.json` — 窗口/构建配置
- [ ] mock feature flag
- [ ] 验证：`cargo tauri dev` → 前端收到 system-snapshot event
- [ ] 单元测试覆盖 cache / event_filter / mock
