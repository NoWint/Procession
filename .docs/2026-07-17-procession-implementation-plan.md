# Procession 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 1-2 周内完成 Procession MVP 脚手架——从零搭建 Tauri 桌面应用，实现 Rust 后端系统数据采集 → IPC 推送 → WebView 3D 场景渲染的全链路打通。

**Architecture:** Tauri 2.x 桌面壳，Rust 后端负责系统数据采集（CPU/内存/进程列表），通过 IPC event 以 1Hz 频率推送到 WebView 前端。前端 React + React Three Fiber 接收数据驱动 3D 场景。首阶段目标是在屏幕上看到按真实 CPU 数据变化高度的方块。

**Tech Stack:** Tauri 2.x, Rust, sysinfo crate, React 18, TypeScript, Three.js, React Three Fiber (R3F), Vite, UnrealBloomPass

**设计文档位置:** `E:\WechatDevelop\Procession\` 下的 SPEC.md, ARCHITECTURE.md, ROADMAP.md

---

## 文件结构一览

```
Procession/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                 # Tauri 入口 + 命令注册
│   │   ├── lib.rs                  # 模块导出
│   │   ├── engine/
│   │   │   ├── mod.rs
│   │   │   ├── platform.rs         # PlatformAdapter trait
│   │   │   ├── windows.rs          # WindowsImpl
│   │   │   ├── mac.rs              # MacImpl (stub)
│   │   │   └── mock.rs             # MockAdapter (开发/测试用)
│   │   ├── bridge/
│   │   │   ├── mod.rs
│   │   │   ├── snapshot.rs         # SystemSnapshot 类型定义
│   │   │   └── pusher.rs           # SnapshotPusher 定时推送
│   │   └── types.rs                # 共享类型
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   └── icons/                      # 应用图标
├── src/
│   ├── main.tsx                    # React 入口
│   ├── App.tsx                     # 根组件
│   ├── App.css                     # 全局样式
│   ├── hooks/
│   │   └── useSystemData.ts        # Tauri event → React state
│   ├── components/
│   │   ├── CityScene.tsx           # R3F 场景容器
│   │   ├── BuildingCluster.tsx     # InstancedMesh 建筑群
│   │   ├── CityGround.tsx          # 发光网格地面
│   │   ├── Atmosphere.tsx          # 粒子背景/辉光
│   │   └── ProcessPopup.tsx        # 进程详情浮窗
│   ├── utils/
│   │   ├── layout.ts               # 建筑布局算法
│   │   ├── colors.ts               # 配色系统
│   │   └── types.ts                # 前端类型定义
│   ├── vite-env.d.ts
│   └── styles/
│       └── index.css
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

---

## Phase 1: 脚手架 · 让城市有地基建

**目标：** Tauri 项目初始化 → Rust 后端采集 CPU/内存/进程 → IPC 推送到前端 → R3F 渲染可动态变化的 3D 场景。

---

### Task 1: 初始化 Tauri 2.x + React + TypeScript 项目

**Files:**
- Create: `Procession/` 整个项目骨架 (由 `create-tauri-app` 生成)
- Modify: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`

- [ ] **Step 1: 使用 create-tauri-app 生成项目**

```bash
cd E:/WechatDevelop
npm create tauri-app@latest Procession -- --template react-ts
cd Procession
npm install
```

验证项目能正常启动：

```bash
npm run tauri dev
```

Expected: 一个 Tauri 窗口弹出，显示默认 React 页面（Vite + React 模板）。

- [ ] **Step 2: 安装前端依赖**

```bash
npm install three @react-three/fiber @react-three/drei @tauri-apps/api
npm install -D @types/three
```

- [ ] **Step 3: 配置 tauri.conf.json**

编辑 `src-tauri/tauri.conf.json`，确保关键配置：

```json
{
  "productName": "Procession",
  "version": "0.1.0",
  "identifier": "com.peyt-studio.procession",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "Procession",
        "width": 1280,
        "height": 800,
        "resizable": true,
        "fullscreen": false,
        "decorations": true
      }
    ],
    "security": {
      "csp": null
    }
  }
}
```

- [ ] **Step 4: 配置 Tauri capabilities**

创建 `src-tauri/capabilities/default.json`：

```json
{
  "identifier": "default",
  "description": "Permissive default capability for Procession development",
  "windows": ["main"],
  "permissions": [
    "core:event:default",
    "core:event:allow-listen",
    "core:event:allow-emit",
    "core:invoke:default"
  ]
}
```

- [ ] **Step 5: 添加 Rust crate 依赖**

编辑 `src-tauri/Cargo.toml`，添加 `sysinfo` 和 `serde`：

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sysinfo = "0.32"
tokio = { version = "1", features = ["full"] }
```

- [ ] **Step 6: 清理模板文件**

删除 `src/App.css` 中默认的 Vite/React logo 样式，保留空白 CSS。删除 `src/assets/` 下的 Vite/React SVG 图标。

- [ ] **Step 7: 提交**

```bash
git init
git add .
git commit -m "feat: init Tauri 2.x + React + TypeScript project scaffold"
```

---

### Task 2: Rust 后端 — 系统数据类型定义

**Files:**
- Create: `src-tauri/src/types.rs`

- [ ] **Step 1: 定义 SystemSnapshot 和所有子类型**

`src-tauri/src/types.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub ppid: u32,
    pub name: String,
    pub cpu: f32,
    pub memory_mb: u64,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuInfo {
    pub total: f32,
    pub per_core: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryInfo {
    pub used_mb: u64,
    pub total_mb: u64,
    pub swap_used_mb: u64,
    pub swap_total_mb: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub pid: u32,
    pub local_addr: String,
    pub remote_addr: String,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInfo {
    pub up_bytes_per_sec: u64,
    pub down_bytes_per_sec: u64,
    pub connections: Vec<Connection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskInfo {
    pub read_bytes_per_sec: u64,
    pub write_bytes_per_sec: u64,
    pub usage_percent: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub usage_percent: f32,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Temperature {
    pub cpu: f32,
    pub gpu: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemSnapshot {
    pub processes: Vec<ProcessInfo>,
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub network: NetworkInfo,
    pub disk: DiskInfo,
    pub gpu: Option<GpuInfo>,
    pub temperature: Option<Temperature>,
    pub timestamp: u64,
}
```

- [ ] **Step 2: 提交**

```bash
git add src-tauri/src/types.rs
git commit -m "feat: define SystemSnapshot types"
```

---

### Task 3: Rust 后端 — PlatformAdapter trait + Mock 实现

**Files:**
- Create: `src-tauri/src/engine/mod.rs`
- Create: `src-tauri/src/engine/platform.rs`
- Create: `src-tauri/src/engine/mock.rs`
- Create: `src-tauri/src/lib.rs`

- [ ] **Step 1: 定义 engine 模块导出**

`src-tauri/src/engine/mod.rs`:

```rust
pub mod platform;
pub mod mock;
```

- [ ] **Step 2: 定义 PlatformAdapter trait**

`src-tauri/src/engine/platform.rs`:

```rust
use async_trait::async_trait;
use crate::types::*;

#[async_trait]
pub trait PlatformAdapter: Send + Sync {
    async fn get_processes(&self) -> Vec<ProcessInfo>;
    async fn get_cpu(&self) -> CpuInfo;
    async fn get_memory(&self) -> MemoryInfo;
    async fn get_network(&self) -> NetworkInfo;
    async fn get_disk(&self) -> DiskInfo;
    async fn get_gpu(&self) -> Option<GpuInfo>;
    async fn get_temperature(&self) -> Option<Temperature>;

    /// 采集一次完整快照
    async fn collect_snapshot(&self) -> SystemSnapshot {
        let processes = self.get_processes().await;
        let cpu = self.get_cpu().await;
        let memory = self.get_memory().await;
        let network = self.get_network().await;
        let disk = self.get_disk().await;
        let gpu = self.get_gpu().await;
        let temperature = self.get_temperature().await;

        SystemSnapshot {
            processes,
            cpu,
            memory,
            network,
            disk,
            gpu,
            temperature,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        }
    }
}
```

注意：需要在 `Cargo.toml` 添加 `async-trait` crate：
```bash
cd src-tauri && cargo add async-trait
```

- [ ] **Step 3: 实现 MockAdapter（开发/测试用）**

`src-tauri/src/engine/mock.rs`:

```rust
use async_trait::async_trait;
use rand::Rng;
use crate::types::*;
use super::platform::PlatformAdapter;

pub struct MockAdapter;

#[async_trait]
impl PlatformAdapter for MockAdapter {
    async fn get_processes(&self) -> Vec<ProcessInfo> {
        let mut rng = rand::thread_rng();
        let names = ["chrome.exe", "code.exe", "node.exe", "System", "Terminal", "Finder", "Spotify"];
        (0..50).map(|i| ProcessInfo {
            pid: 1000 + i as u32,
            ppid: if i == 0 { 0 } else { 1000 + rng.gen_range(0..i) as u32 },
            name: names[rng.gen_range(0..names.len())].to_string(),
            cpu: rng.gen_range(0.0..80.0),
            memory_mb: rng.gen_range(10..2048),
            state: if rng.gen_bool(0.8) { "running".into() } else { "sleeping".into() },
        }).collect()
    }

    async fn get_cpu(&self) -> CpuInfo {
        let mut rng = rand::thread_rng();
        CpuInfo {
            total: rng.gen_range(10.0..80.0),
            per_core: (0..8).map(|_| rng.gen_range(5.0..90.0)).collect(),
        }
    }

    async fn get_memory(&self) -> MemoryInfo {
        MemoryInfo {
            used_mb: 8192,
            total_mb: 16384,
            swap_used_mb: 512,
            swap_total_mb: 8192,
        }
    }

    async fn get_network(&self) -> NetworkInfo {
        let mut rng = rand::thread_rng();
        NetworkInfo {
            up_bytes_per_sec: rng.gen_range(1000..50000),
            down_bytes_per_sec: rng.gen_range(10000..500000),
            connections: (0..20).map(|i| Connection {
                pid: 1000 + i as u32,
                local_addr: format!("192.168.1.2:{}", 3000 + i),
                remote_addr: format!("10.0.0.{}:443", i),
                state: "established".into(),
            }).collect(),
        }
    }

    async fn get_disk(&self) -> DiskInfo {
        DiskInfo {
            read_bytes_per_sec: 50000000,
            write_bytes_per_sec: 30000000,
            usage_percent: 45.0,
        }
    }

    async fn get_gpu(&self) -> Option<GpuInfo> {
        Some(GpuInfo {
            usage_percent: 35.0,
            memory_used_mb: 2048,
            memory_total_mb: 8192,
        })
    }

    async fn get_temperature(&self) -> Option<Temperature> {
        Some(Temperature {
            cpu: 65.0,
            gpu: Some(58.0),
        })
    }
}
```

注意：在 `Cargo.toml` 添加 `rand`：
```bash
cd src-tauri && cargo add rand
```

- [ ] **Step 4: 创建 lib.rs — 模块导出**

`src-tauri/src/lib.rs`:

```rust
mod types;
mod engine;
mod bridge;

use types::SystemSnapshot;
use engine::platform::PlatformAdapter;
use engine::mock::MockAdapter;
use bridge::pusher::SnapshotPusher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let adapter = MockAdapter;
    let pusher = SnapshotPusher::new(Box::new(adapter));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(pusher)
        .invoke_handler(tauri::generate_handler![cmd_get_snapshot])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let pusher = handle.state::<SnapshotPusher>();
                pusher.start(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn cmd_get_snapshot(pusher: tauri::State<'_, SnapshotPusher>) -> Result<SystemSnapshot, String> {
    pusher.get_current().ok_or_else(|| "No snapshot available".into())
}
```

- [ ] **Step 5: 替换 main.rs**

`src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    procession_lib::run();
}
```

注意：需要在 `Cargo.toml` 中更新包名：

```toml
[package]
name = "procession"
# ...

[lib]
name = "procession_lib"
crate-type = ["staticlib", "cdylib", "rlib"]
```

- [ ] **Step 6: 编译验证**

```bash
cd src-tauri && cargo build
```

Expected: 编译成功，无错误。

- [ ] **Step 7: 提交**

```bash
git add src-tauri/src/
git add src-tauri/Cargo.toml
git add src-tauri/Cargo.lock
git commit -m "feat: add PlatformAdapter trait + MockAdapter + lib entry"
```

---

### Task 4: Rust 后端 — DataBridge + SnapshotPusher

**Files:**
- Create: `src-tauri/src/bridge/mod.rs`
- Create: `src-tauri/src/bridge/snapshot.rs`
- Create: `src-tauri/src/bridge/pusher.rs`

- [ ] **Step 1: 定义 bridge 模块导出**

`src-tauri/src/bridge/mod.rs`:

```rust
pub mod snapshot;
pub mod pusher;
```

- [ ] **Step 2: 更新 snapshot.rs 类型定义（如果需要桥接层包装，目前复用 types 即可）**

`src-tauri/src/bridge/snapshot.rs`:

```rust
// 桥接层目前直接复用 crate::types::SystemSnapshot
// 未来可在此模块中添加数据压缩、截断、过滤等逻辑
pub use crate::types::SystemSnapshot;

/// 对快照执行预处理（截断进程列表、过滤等）
pub fn preprocess_snapshot(mut snapshot: SystemSnapshot, max_processes: usize) -> SystemSnapshot {
    // 按 CPU 占用降序排列，保留前 max_processes 个
    snapshot.processes.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal));
    snapshot.processes.truncate(max_processes);
    snapshot
}
```

- [ ] **Step 3: 实现 SnapshotPusher**

`src-tauri/src/bridge/pusher.rs`:

```rust
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use crate::engine::platform::PlatformAdapter;
use crate::types::SystemSnapshot;
use super::snapshot::preprocess_snapshot;

pub struct SnapshotPusher {
    adapter: Box<dyn PlatformAdapter>,
    current: Mutex<Option<SystemSnapshot>>,
}

impl SnapshotPusher {
    pub fn new(adapter: Box<dyn PlatformAdapter>) -> Self {
        Self {
            adapter,
            current: Mutex::new(None),
        }
    }

    pub async fn start(&self, app: AppHandle) {
        loop {
            let mut raw = self.adapter.collect_snapshot().await;
            raw = preprocess_snapshot(raw, 500);

            // 缓存当前帧（供 invoke 命令同步读取）
            if let Ok(mut cur) = self.current.lock() {
                *cur = Some(raw.clone());
            }

            // 通过 event 推送到 WebView
            let _ = app.emit("system-snapshot", raw);

            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }
    }

    pub fn get_current(&self) -> Option<SystemSnapshot> {
        self.current.lock().ok()?.clone()
    }
}
```

- [ ] **Step 4: 编译验证**

```bash
cd src-tauri && cargo build
```

Expected: 编译成功。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/bridge/
git commit -m "feat: add SnapshotPusher with 1Hz event emission"
```

---

### Task 5: Rust 后端 — Windows 真实数据实现

**Files:**
- Create: `src-tauri/src/engine/windows.rs`
- Modify: `src-tauri/src/engine/mod.rs`
- Modify: `src-tauri/src/lib.rs`（切换 Adapter）

- [ ] **Step 1: 实现 WindowsImpl**

`src-tauri/src/engine/windows.rs`:

```rust
use async_trait::async_trait;
use sysinfo::{System, ProcessesToUpdate, Networks, Disks};
use crate::types::*;
use super::platform::PlatformAdapter;

pub struct WindowsImpl {
    system: System,
}

impl WindowsImpl {
    pub fn new() -> Self {
        Self {
            system: System::new_all(),
        }
    }
}

#[async_trait]
impl PlatformAdapter for WindowsImpl {
    async fn get_processes(&self) -> Vec<ProcessInfo> {
        self.system.processes().iter().map(|(pid, process)| {
            ProcessInfo {
                pid: pid.as_u32(),
                ppid: process.parent().map(|p| p.as_u32()).unwrap_or(0),
                name: process.name().to_string_lossy().into_owned(),
                cpu: process.cpu_usage(),
                memory_mb: process.memory() / 1024,
                state: match process.status() {
                    sysinfo::ProcessStatus::Run => "running".into(),
                    sysinfo::ProcessStatus::Sleep => "sleeping".into(),
                    sysinfo::ProcessStatus::Stop => "stopped".into(),
                    sysinfo::ProcessStatus::Zombie => "zombie".into(),
                    _ => "unknown".into(),
                },
            }
        }).collect()
    }

    async fn get_cpu(&self) -> CpuInfo {
        CpuInfo {
            total: self.system.global_cpu_info().cpu_usage(),
            per_core: (0..self.system.physical_core_count().unwrap_or(1)).map(|_| 0.0).collect(),
        }
    }

    async fn get_memory(&self) -> MemoryInfo {
        MemoryInfo {
            used_mb: self.system.used_memory() / 1024,
            total_mb: self.system.total_memory() / 1024,
            swap_used_mb: self.system.used_swap() / 1024,
            swap_total_mb: self.system.total_swap() / 1024,
        }
    }

    async fn get_network(&self) -> NetworkInfo {
        NetworkInfo {
            up_bytes_per_sec: 0,
            down_bytes_per_sec: 0,
            connections: vec![],
        }
    }

    async fn get_disk(&self) -> DiskInfo {
        DiskInfo {
            read_bytes_per_sec: 0,
            write_bytes_per_sec: 0,
            usage_percent: 0.0,
        }
    }

    async fn get_gpu(&self) -> Option<GpuInfo> {
        None
    }

    async fn get_temperature(&self) -> Option<Temperature> {
        None
    }
}
```

- [ ] **Step 2: 更新 engine/mod.rs**

`src-tauri/src/engine/mod.rs`:

```rust
pub mod platform;
pub mod mock;
#[cfg(target_os = "windows")]
pub mod windows;
```

- [ ] **Step 3: 更新 lib.rs 根据平台选择 Adapter**

`src-tauri/src/lib.rs`:

```rust
#[cfg(target_os = "windows")]
use engine::windows::WindowsImpl;

pub fn run() {
    #[cfg(debug_assertions)]
    let adapter: Box<dyn PlatformAdapter> = Box::new(engine::mock::MockAdapter);
    #[cfg(not(debug_assertions))]
    let adapter: Box<dyn PlatformAdapter> = {
        #[cfg(target_os = "windows")]
        { Box::new(WindowsImpl::new()) }
        #[cfg(not(target_os = "windows"))]
        { Box::new(engine::mock::MockAdapter) }
    };

    let pusher = bridge::pusher::SnapshotPusher::new(adapter);
    // ... rest unchanged
}
```

- [ ] **Step 4: 编译验证**

```bash
cd src-tauri && cargo build
```

Expected: 编译成功。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/
git commit -m "feat: add WindowsImpl platform adapter"
```

---

### Task 6: 前端 — 类型定义 + useSystemData Hook

**Files:**
- Create: `src/utils/types.ts`
- Create: `src/hooks/useSystemData.ts`

- [ ] **Step 1: 定义前端类型**

`src/utils/types.ts`:

```typescript
export interface ProcessInfo {
  pid: number;
  ppid: number;
  name: string;
  cpu: number;
  memory_mb: number;
  state: string;
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

export interface Temperature {
  cpu: number;
  gpu: number | null;
}

export interface SystemSnapshot {
  processes: ProcessInfo[];
  cpu: CpuInfo;
  memory: MemoryInfo;
  network: NetworkInfo;
  disk: DiskInfo;
  gpu: GpuInfo | null;
  temperature: Temperature | null;
  timestamp: number;
}
```

- [ ] **Step 2: 实现 useSystemData hook**

`src/hooks/useSystemData.ts`:

```typescript
import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { SystemSnapshot } from "../utils/types";

interface UseSystemDataReturn {
  snapshot: SystemSnapshot | null;
  isConnected: boolean;
  lastUpdate: number | null;
}

export function useSystemData(): UseSystemDataReturn {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    async function setup() {
      // 先拉取当前帧（快速展示）
      try {
        const initial = await invoke<SystemSnapshot>("cmd_get_snapshot");
        setSnapshot(initial);
        setLastUpdate(initial.timestamp);
        setIsConnected(true);
      } catch {
        // 首次调用时可能还没有数据，忽略
      }

      // 持续监听推送
      const unlistenFn = await listen<SystemSnapshot>("system-snapshot", (event) => {
        setSnapshot(event.payload);
        setLastUpdate(event.payload.timestamp);
        setIsConnected(true);
      });
      unlisten = unlistenFn;
    }

    setup();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return { snapshot, isConnected, lastUpdate };
}
```

- [ ] **Step 3: 提交**

```bash
git add src/utils/types.ts src/hooks/useSystemData.ts
git commit -m "feat: add frontend types + useSystemData hook"
```

---

### Task 7: 前端 — R3F 场景骨架 + 测试立方体

**Files:**
- Create: `src/App.tsx`
- Create: `src/components/CityScene.tsx`
- Create: `src/styles/index.css`
- Modify: `src/main.tsx`

- [ ] **Step 1: 全局样式**

`src/styles/index.css`:

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0a0a1a;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
```

- [ ] **Step 2: 主入口**

`src/main.tsx`:

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: R3F CityScene 组件**

`src/components/CityScene.tsx`:

```typescript
import React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";

interface CitySceneProps {
  children: React.ReactNode;
}

export function CityScene({ children }: CitySceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 60, 80], fov: 45, near: 1, far: 300 }}
      gl={{ antialias: true, alpha: false }}
      style={{ width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} />
      <directionalLight position={[-10, 10, -10]} intensity={0.3} color="#4A90D9" />

      {children}

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={10}
        maxDistance={150}
        maxPolarAngle={Math.PI / 2.1}
      />

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.1}
          luminanceSmoothing={0.9}
          intensity={0.3}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}
```

- [ ] **Step 4: 实现 App.tsx（带测试立方体）**

`src/App.tsx`:

```typescript
import React, { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CityScene } from "./components/CityScene";
import { useSystemData } from "./hooks/useSystemData";

/** 测试立方体：按 CPU 变化高度，验证全链路通 */
function TestCube({ cpu }: { cpu: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);

  useEffect(() => {
    const height = 0.5 + (cpu / 100) * 15;
    meshRef.current.scale.y = height;
    meshRef.current.position.y = height / 2;
    // CPU 越高颜色越红
    const hue = 0.6 - (cpu / 100) * 0.4;
    meshRef.current.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue, 0.8, 0.5),
      emissive: new THREE.Color().setHSL(hue, 0.8, 0.2),
      metalness: 0.3,
      roughness: 0.6,
    });
  }, [cpu]);

  useFrame(() => {
    meshRef.current.rotation.y += 0.005;
  });

  return (
    <mesh ref={meshRef} position={[0, 0.5, 0]}>
      <boxGeometry args={[2, 1, 2]} />
      <meshStandardMaterial color="#4A90D9" />
    </mesh>
  );
}

function AppContent() {
  const { snapshot, isConnected } = useSystemData();

  if (!snapshot) {
    return (
      <mesh>
        <textGeometry args={["Connecting...", { font: null, size: 2 }]} />
      </mesh>
    );
  }

  return <TestCube cpu={snapshot.cpu.total} />;
}

function App() {
  return (
    <CityScene>
      <AppContent />
    </CityScene>
  );
}

export default App;
```

- [ ] **Step 5: 前端编译验证**

```bash
npx tsc --noEmit
```

Expected: TypeScript 编译无错误。

- [ ] **Step 6: 运行验证全链路**

```bash
npm run tauri dev
```

Expected: 窗口弹出，显示一个 3D 空间中旋转的立方体，高度和颜色随 CPU 百分比变化。

- [ ] **Step 7: 提交**

```bash
git add src/
git commit -m "feat: add R3F scene scaffold with live CPU cube"
```

---

### Task 8: 前端 — 建筑布局算法 + 颜色系统

**Files:**
- Create: `src/utils/layout.ts`
- Create: `src/utils/colors.ts`

- [ ] **Step 1: 布局算法**

`src/utils/layout.ts`:

```typescript
import type { ProcessInfo } from "./types";

export interface BuildingPosition {
  x: number;
  z: number;
  depth: number;
  index: number;
}

/** 构建进程树映射 (pid → children pids) */
function buildProcessTree(processes: ProcessInfo[]): Map<number, number[]> {
  const tree = new Map<number, number[]>();
  for (const p of processes) {
    const children = tree.get(p.ppid) || [];
    children.push(p.pid);
    tree.set(p.ppid, children);
  }
  return tree;
}

/** 计算进程在进程树中的深度 */
function calcDepth(
  pid: number,
  parentMap: Map<number, number>,
  cache: Map<number, number>
): number {
  if (cache.has(pid)) return cache.get(pid)!;
  const ppid = parentMap.get(pid);
  if (!ppid || ppid === 0) {
    cache.set(pid, 1);
    return 1;
  }
  const depth = calcDepth(ppid, parentMap, cache) + 1;
  cache.set(pid, depth);
  return depth;
}

/** 高斯噪声（简化实现） */
function gaussNoise(scale: number): number {
  return (Math.random() + Math.random() - 1) * scale;
}

/** 计算所有进程的 3D 城市位置 */
export function computePositions(
  processes: ProcessInfo[],
  spacing: number = 8
): Map<number, BuildingPosition> {
  // 构建父进程映射
  const parentMap = new Map<number, number>();
  for (const p of processes) {
    parentMap.set(p.pid, p.ppid);
  }

  // 计算每个进程的深度
  const depthCache = new Map<number, number>();
  const depthGroups = new Map<number, number[]>();

  for (const p of processes) {
    const depth = calcDepth(p.pid, parentMap, depthCache);
    const group = depthGroups.get(depth) || [];
    group.push(p.pid);
    depthGroups.set(depth, group);
  }

  // 为每个进程分配 (x, z) 坐标
  const positions = new Map<number, BuildingPosition>();

  for (const [depth, pids] of depthGroups) {
    const radius = depth * spacing;
    const count = pids.length;

    pids.forEach((pid, index) => {
      const angle = (index / count) * Math.PI * 2;
      positions.set(pid, {
        x: radius * Math.cos(angle) + gaussNoise(1.5),
        z: radius * Math.sin(angle) + gaussNoise(1.5),
        depth,
        index,
      });
    });
  }

  return positions;
}
```

- [ ] **Step 2: 颜色系统**

`src/utils/colors.ts`:

```typescript
import * as THREE from "three";
import type { ProcessInfo } from "./types";

export const COLOR_PALETTE = {
  system: new THREE.Color("#4A90D9"),
  user: new THREE.Color("#E8903C"),
  active: new THREE.Color("#FFE4B5"),
  inactive: new THREE.Color("#2A2A4A"),
  highlight: new THREE.Color("#FFFFFF"),
} as const;

// 常见系统进程名（大小写不敏感）
const SYSTEM_PROCESS_NAMES = new Set([
  "system", "systemd", "kernel", "svchost.exe", "runtime broker",
  "windows", "wininit.exe", "services.exe", "lsass.exe", "csrss.exe",
  "smss.exe", "winlogon.exe", "explorer.exe",
]);

/** 根据进程信息返回颜色 */
export function getProcessColor(process: ProcessInfo): THREE.Color {
  // 当前活跃进程（pid 与当前窗口关联逻辑暂简化为 CPU > 50%）
  if (process.cpu > 50) return COLOR_PALETTE.active;
  // 系统进程
  if (SYSTEM_PROCESS_NAMES.has(process.name.toLowerCase())) {
    return COLOR_PALETTE.system;
  }
  // 用户进程
  return COLOR_PALETTE.user;
}

/** 根据进程状态返回透明度 */
export function getProcessOpacity(state: string): number {
  switch (state) {
    case "running": return 1.0;
    case "sleeping": return 0.7;
    case "stopped": return 0.3;
    case "zombie": return 0.15;
    default: return 0.5;
  }
}

/** CPU 占用 → 建筑高度 */
export function cpuToHeight(cpu: number): number {
  return 0.5 + (cpu / 100) * 15;
}

/** 内存占用 → 建筑底面积尺寸 */
export function memToSize(memoryMb: number): number {
  return 0.3 + Math.sqrt(memoryMb / 512) * 0.7;
}
```

- [ ] **Step 3: 提交**

```bash
git add src/utils/
git commit -m "feat: add building layout algorithm + color system"
```

---

### Task 9: 前端 — BuildingCluster InstancedMesh 渲染

**Files:**
- Create: `src/components/BuildingCluster.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 实现 BuildingCluster**

`src/components/BuildingCluster.tsx`:

```typescript
import React, { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ProcessInfo } from "../utils/types";
import { computePositions } from "../utils/layout";
import { getProcessColor, getProcessOpacity, cpuToHeight, memToSize } from "../utils/colors";

interface BuildingClusterProps {
  processes: ProcessInfo[];
}

// 重用几何体和材质以减少 draw call
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({
  metalness: 0.3,
  roughness: 0.6,
});

export function BuildingCluster({ processes }: BuildingClusterProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const prevCountRef = useRef(0);
  const positions = computePositions(processes);

  // 当进程数据变化时更新建筑
  useEffect(() => {
    if (!meshRef.current || processes.length === 0) return;

    const count = Math.min(processes.length, 500); // 上限 500
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    // 确保实例数量足够
    if (meshRef.current.count !== count) {
      meshRef.current.count = count;
    }

    processes.slice(0, count).forEach((p, i) => {
      const pos = positions.get(p.pid);
      if (!pos) return;

      const height = cpuToHeight(p.cpu);
      const size = memToSize(p.memory_mb);
      const opacity = getProcessOpacity(p.state);

      dummy.position.set(pos.x, height / 2, pos.z);
      dummy.scale.set(size, height, size);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      meshRef.current.setColorAt(i, getProcessColor(p));
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.instanceColor!.needsUpdate = true;
    prevCountRef.current = count;
  }, [processes]);

  // 每帧轻微上下波动，模拟"呼吸"
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    const wave = Math.sin(clock.getElapsedTime() * 0.5) * 0.1;

    processes.slice(0, Math.min(processes.length, 500)).forEach((p, i) => {
      const pos = positions.get(p.pid);
      if (!pos) return;

      const height = cpuToHeight(p.cpu);
      const breathOffset = (p.cpu > 20) ? wave * (p.cpu / 50) : 0;

      dummy.position.set(pos.x, height / 2 + breathOffset, pos.z);
      dummy.scale.set(memToSize(p.memory_mb), height, memToSize(p.memory_mb));
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, Math.min(processes.length, 500)]}
      frustumCulled={false}
    />
  );
}
```

- [ ] **Step 2: 更新 App.tsx，用 BuildingCluster 替换 TestCube**

`src/App.tsx`:

```typescript
import React from "react";
import { Text } from "@react-three/drei";
import { CityScene } from "./components/CityScene";
import { BuildingCluster } from "./components/BuildingCluster";
import { CityGround } from "./components/CityGround";
import { Atmosphere } from "./components/Atmosphere";
import { useSystemData } from "./hooks/useSystemData";

function LoadingFallback() {
  return (
    <Text
      position={[0, 0, 0]}
      color="#4A90D9"
      fontSize={3}
      anchorX="center"
      anchorY="middle"
    >
      Connecting...
    </Text>
  );
}

function AppContent() {
  const { snapshot } = useSystemData();

  if (!snapshot) return <LoadingFallback />;

  return (
    <>
      <CityGround />
      <BuildingCluster processes={snapshot.processes} />
      <Atmosphere />
    </>
  );
}

function App() {
  return (
    <CityScene>
      <AppContent />
    </CityScene>
  );
}

export default App;
```

- [ ] **Step 3: 编译 + 运行验证**

```bash
cd src-tauri && cargo build && cd ..
npm run tauri dev
```

Expected: 窗口弹出，显示数十到数百个建筑排列成圆形辐射布局，高度和颜色各不相同，建筑整体有慢速"呼吸"动画。

- [ ] **Step 4: 提交**

```bash
git add src/components/BuildingCluster.tsx src/App.tsx
git commit -m "feat: add BuildingCluster with InstancedMesh rendering"
```

---

### Task 10: 前端 — CityGround + Atmosphere

**Files:**
- Create: `src/components/CityGround.tsx`
- Create: `src/components/Atmosphere.tsx`

- [ ] **Step 1: 发光网格地面**

`src/components/CityGround.tsx`:

```typescript
import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export function CityGround() {
  const ringRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const pulse = 0.8 + Math.sin(clock.getElapsedTime() * 0.25) * 0.2;
    ringRef.current.material.opacity = pulse * 0.3;
  });

  return (
    <group>
      {/* 外圈静态网格 */}
      <gridHelper
        args={[200, 40, "#1a1a2e", "#0d0d1a"]}
        position={[0, -0.1, 0]}
      />

      {/* 内圈动态脉动环 */}
      <mesh
        ref={ringRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
      >
        <ringGeometry args={[20, 30, 64]} />
        <meshBasicMaterial
          color="#4A90D9"
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 中心发光点 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <circleGeometry args={[2, 32]} />
        <meshBasicMaterial color="#4A90D9" transparent opacity={0.2} depthWrite={false} />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 2: 粒子背景 + 氛围**

`src/components/Atmosphere.tsx`:

```typescript
import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function createStarField(count: number) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) {
    positions[i] = (Math.random() - 0.5) * 400;
  }
  return positions;
}

export function Atmosphere() {
  const pointsRef = useRef<THREE.Points>(null!);

  const positions = useMemo(() => createStarField(500), []);
  const geometry = useMemo(() => new THREE.BufferGeometry(), []);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y += 0.0002;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color="#4A90D9"
        size={0.3}
        transparent
        opacity={0.6}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}
```

- [ ] **Step 3: 运行验证**

```bash
npm run tauri dev
```

Expected: 建筑群坐落于发光网格地面上方，深色背景中有缓慢旋转的点点星光。

- [ ] **Step 4: 提交**

```bash
git add src/components/CityGround.tsx src/components/Atmosphere.tsx
git commit -m "feat: add CityGround grid + Atmosphere starfield"
```

---

### Task 11: 前端 — 进程详情浮窗

**Files:**
- Create: `src/components/ProcessPopup.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 实现进程详情浮窗**

`src/components/ProcessPopup.tsx`:

```typescript
import React from "react";
import type { ProcessInfo } from "../utils/types";

interface ProcessPopupProps {
  process: ProcessInfo;
  position: { x: number; z: number };
  onClose: () => void;
}

export function ProcessPopup({ process, position, onClose }: ProcessPopupProps) {
  const cpuPercent = process.cpu.toFixed(1);
  const memPercent = ((process.memory_mb / 16384) * 100).toFixed(1);

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: "auto",
        background: "rgba(10, 10, 26, 0.9)",
        border: "1px solid rgba(74, 144, 217, 0.4)",
        borderRadius: 12,
        padding: 20,
        minWidth: 280,
        color: "#E0E0E0",
        fontFamily: "monospace",
        fontSize: 13,
        backdropFilter: "blur(12px)",
        zIndex: 100,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 标题栏 */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: "#FFFFFF" }}>
            {process.name}
          </div>
          <div style={{ color: "#888", fontSize: 12, marginTop: 2 }}>
            PID: {process.pid} · PPID: {process.ppid}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#666",
            cursor: "pointer",
            fontSize: 18,
            padding: "0 4px",
          }}
        >
          ✕
        </button>
      </div>

      {/* CPU 条 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span>CPU</span>
          <span style={{ color: cpuPercent > "50" ? "#F44336" : "#4CAF50" }}>
            {cpuPercent}%
          </span>
        </div>
        <div style={{ height: 4, background: "#1a1a2e", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            width: `${Math.min(parseFloat(cpuPercent), 100)}%`,
            height: "100%",
            background: `linear-gradient(90deg, #4A90D9, ${parseFloat(cpuPercent) > 50 ? "#F44336" : "#4CAF50"})`,
            borderRadius: 2,
            transition: "width 0.3s ease",
          }} />
        </div>
      </div>

      {/* 内存条 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span>Memory</span>
          <span>{process.memory_mb} MB ({memPercent}%)</span>
        </div>
        <div style={{ height: 4, background: "#1a1a2e", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            width: `${Math.min(parseFloat(memPercent), 100)}%`,
            height: "100%",
            background: "linear-gradient(90deg, #E8903C, #FF9800)",
            borderRadius: 2,
            transition: "width 0.3s ease",
          }} />
        </div>
      </div>

      {/* 状态 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: process.state === "running" ? "#4CAF50"
            : process.state === "sleeping" ? "#FF9800"
            : "#F44336",
        }} />
        <span>{process.state}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 在 App.tsx 中集成浮窗（点击建筑 → 显示详情）**

修改 `src/App.tsx` 添加点击交互——由于 InstancedMesh 点击需要 raycasting，这里先做一个简化：整个场景点击时取最近的建筑（Phase 2 再完善）。

在 `App.tsx` 中加入状态管理：

```typescript
import React, { useState, useCallback } from "react";
// ... 其他 import

function App() {
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null);

  const handleClosePopup = useCallback(() => {
    setSelectedProcess(null);
  }, []);

  return (
    <>
      <CityScene>
        <AppContent onSelectProcess={setSelectedProcess} />
      </CityScene>
      {selectedProcess && (
        <ProcessPopup
          process={selectedProcess}
          position={{ x: 0, z: 0 }}
          onClose={handleClosePopup}
        />
      )}
    </>
  );
}
```

真正的 InstancedMesh 点击拾取（raycasting）是独立功能，Phase 2 详细实现。

- [ ] **Step 3: 提交**

```bash
git add src/components/ProcessPopup.tsx src/App.tsx
git commit -m "feat: add ProcessPopup detail card"
```

---

---

### Task 12: 错误处理 + 降级策略

**Files:**
- Modify: `src-tauri/src/bridge/pusher.rs`
- Modify: `src-tauri/src/bridge/snapshot.rs`
- Modify: `src/hooks/useSystemData.ts`

- [ ] **Step 1: Rust 后端 — 采集失败降级**

修改 `src-tauri/src/bridge/pusher.rs`，添加错误处理：

```rust
pub async fn start(&self, app: AppHandle) {
    let mut consecutive_errors = 0;
    loop {
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            self.adapter.collect_snapshot(),
        ).await;

        match result {
            Ok(Ok(mut raw)) => {
                consecutive_errors = 0;
                raw = preprocess_snapshot(raw, 500);
                if let Ok(mut cur) = self.current.lock() {
                    *cur = Some(raw.clone());
                }
                let _ = app.emit("system-snapshot", raw);
            }
            _ => {
                consecutive_errors += 1;
                // 推送错误事件（前端可展示延迟警告）
                let _ = app.emit("system-error", format!("Data collection failed ({} consecutive)", consecutive_errors));
                // 连续 10 次错误后减慢采集频率
                if consecutive_errors > 10 {
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                }
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }
}
```

- [ ] **Step 2: 前端 — 连接状态 + 延迟提示**

修改 `src/hooks/useSystemData.ts`：

```typescript
interface UseSystemDataReturn {
  snapshot: SystemSnapshot | null;
  isConnected: boolean;
  lastUpdate: number | null;
  connectionError: string | null;
  dataLatency: number; // 毫秒
  processCount: number;
}

export function useSystemData(): UseSystemDataReturn {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [dataLatency, setDataLatency] = useState(0);

  useEffect(() => {
    let unlistenSnapshot: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;

    async function setup() {
      try {
        const initial = await invoke<SystemSnapshot>("cmd_get_snapshot");
        setSnapshot(initial);
        setLastUpdate(initial.timestamp);
        setIsConnected(true);
        setConnectionError(null);
      } catch {
        // 首次暂无数据，不报错
      }

      unlistenSnapshot = await listen<SystemSnapshot>("system-snapshot", (event) => {
        setSnapshot(event.payload);
        setLastUpdate(event.payload.timestamp);
        setDataLatency(Date.now() - event.payload.timestamp);
        setIsConnected(true);
        setConnectionError(null);
      });

      unlistenError = await listen<string>("system-error", (event) => {
        setConnectionError(event.payload);
      });
    }

    setup();

    // 健康检查：5 秒无更新则标记断连
    const healthInterval = setInterval(() => {
      setLastUpdate((prev) => {
        if (prev && Date.now() - prev > 5000) {
          setIsConnected(false);
        }
        return prev;
      });
    }, 2000);

    return () => {
      if (unlistenSnapshot) unlistenSnapshot();
      if (unlistenError) unlistenError();
      clearInterval(healthInterval);
    };
  }, []);

  return {
    snapshot,
    isConnected,
    lastUpdate,
    connectionError,
    dataLatency,
    processCount: snapshot?.processes.length ?? 0,
  };
}
```

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/bridge/pusher.rs src/hooks/useSystemData.ts
git commit -m "feat: add error handling with degraded fallback and health check"
```

---

### Task 13: Rust 后端 — cmd_kill_process 命令

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 添加结束进程命令**

```rust
#[tauri::command]
async fn cmd_kill_process(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .output()
            .map_err(|e| format!("Failed to execute taskkill: {}", e))?;
        if !output.status.success() {
            return Err(format!("Failed to kill process {}: {}", pid,
                String::from_utf8_lossy(&output.stderr)));
        }
    }
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let output = Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output()
            .map_err(|e| format!("Failed to execute kill: {}", e))?;
        if !output.status.success() {
            return Err(format!("Failed to kill process {}: {}", pid,
                String::from_utf8_lossy(&output.stderr)));
        }
    }
    Ok(())
}
```

并在 `lib.rs` 的 `invoke_handler` 中注册：

```rust
.invoke_handler(tauri::generate_handler![cmd_get_snapshot, cmd_kill_process])
```

- [ ] **Step 2: 编译验证**

```bash
cd src-tauri && cargo build
```

Expected: 编译成功。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add cmd_kill_process command"
```

---

### Phase 1 验收检查清单

启动 `npm run tauri dev` 后：

- [ ] Tauri 窗口弹出，全屏 1280x800
- [ ] 3D 城市场景渲染：发光网格地面 + 建筑群 + 星空背景
- [ ] 建筑排列成径向圆形布局（根进程居中，子进程向外辐射）
- [ ] 建筑高度随 CPU 变化（高 CPU → 高建筑）
- [ ] 建筑颜色区分类型（蓝色=系统，橙色=用户，白金=活跃）
- [ ] 建筑有缓慢的"呼吸"波动动画
- [ ] UnrealBloom 辉光效果正常工作
- [ ] OrbitControls 正常：左键旋转、滚轮缩放、右键平移
- [ ] 点击建筑弹出详情浮窗（显示名字/PID/CPU/内存/状态）
- [ ] 后端使用 MockAdapter（Debug 模式）或 WindowsImpl（Release 模式）
- [ ] 帧率稳定在 60fps（500 进程以内）

---

## Phase 2: 城市初现 · 让建筑群更有逻辑

**目标：** 真实进程树布局优化、建筑几何丰富度提升、点击拾取完整实现。

### Task 12: 建筑几何升级

- 从简单长方体升级为"摩天楼"轮廓（长方体 + 顶部金字塔）
- 添加 LOD 系统（近/中/远三级细节）
- 建筑顶部增加一个发光小球体（Running 进程闪烁）

### Task 13: InstancedMesh 点击拾取 (Raycasting)

- 实现鼠标点击 → Raycaster → 检测最近建筑
- 点击后突出高亮（emissive 增强或轮廓线）
- 双击 → 镜头飞向建筑（使用 gsap 或自定义动画）
- 点击空白区域 → 取消选中

### Task 14: 进程详情浮窗升级

- 浮窗跟随 3D 建筑的世界坐标（投影到屏幕 2D 位置）
- 添加"结束进程"按钮（调用 Rust 后端 `cmd_kill_process`）
- 添加子进程数显示、网络活跃度显示

### Task 15: HUD 仪表盘（实用模式前置）

- 屏幕顶部显示 CPU/内存/网络概览条
- 进程总数显示
- 数据延迟警告

---

## Phase 3: 网络光缆 · 让城市活起来

**目标：** 建筑之间有流动的光缆，网络连接可视化。

### Task 16: Windows 网络连接采集

- 在 WindowsImpl 中实现 `get_network()` 真实数据采集
- 使用 `sysinfo::Networks` 或平台 API 获取 TCP 连接表
- 按 `(PID, 远端 IP 段)` 聚合连接

### Task 17: NetworkCables 3D 渲染

- 根据连接关系在建筑间绘制 CatmullRomCurve3 曲线
- 在曲线上添加流动粒子（表示数据流向）
- 光缆颜色按协议映射

---

## Phase 4: 产品打磨

**目标：** macOS 支持、GPU/温度检测、性能优化、实用模式、可发布。

### Task 18: macOS PlatformAdapter

- 实现 MacImpl（使用 sysinfo + IOKit）
- 在 macOS 上测试全链路

### Task 19: GPU + 温度传感器

- 添加 GPU 使用率检测（Windows: NVML / DirectX）
- 温度检测（Windows: WMI）
- 天空风暴效果绑定 CPU 负载

### Task 20: 空格实用模式

- 建筑上方显示进程名标签（sprite text）
- HUD 仪表盘完整版
- 进程搜索/过滤

### Task 21: 性能优化 + 打包

- 实现自动 LOD
- 低帧率降级（FPS < 20 → 关闭 bloom）
- Tauri 打包：Windows MSI + macOS DMG
- README + 宣传截图/GIF

---

## Phase 5: 远景规划

按 ROADMAP.md Phase 5 描述，按需陆续开展：

- 进程关系图谱
- 端口可视化
- 时光回放
- 文件系统热点
- 自定义主题
- 屏保模式
- 插件系统
- 社区分享
