# PLAN.md

> This file is the single source of truth for all tasks. Edit only via the protocol in AGENT_PROTOCOL.md.
> Any zero-memory agent: read RECOVERY.md first, then this file's Task Index.

## Project Meta

- Project: Procession — Tauri 2.x desktop app visualizing system state as a 3D city
- Contract version: 1.0
- Contract files:
  - backend: `src-tauri/src/types.rs` (canonical — Rust owns the schema)
  - frontend: `src/utils/types.ts` (mirror — must stay in sync with backend)
- Contract freeze: null    # null, or "I-XXX in progress, target vX.Y"
- Current phase: 1
- License: AGPL-3.0

## Track → Team Mapping (per D-002)

| Track | Owner | Trigger phrase |
|-------|-------|----------------|
| `B-*` backend | 严梓峻 | `后端 开始开发` |
| `F-*` frontend | 夏天 | `前端 开始开发` |
| `I-*` integration | jointly owned (whoever picks first) | `集成 开始开发` |
| `D-*` docs | either team | `文档 开始开发` |

Constitution changes (STRATEGY/SPEC/ARCHITECTURE under `.docs/`) require a `D-*` task with `requires_user_approval: true`. See §3.6 of SKILL.md.

## Task Index (by track)

### Backend (B-*) — owner: 严梓峻

| ID    | Title                                              | Phase | Status  | Deps      | Complexity |
|-------|----------------------------------------------------|-------|---------|-----------|-----------|
| B-001 | Rust shared types (`types.rs`)                    | 1     | pending | I-001     | S         |
| B-002 | `PlatformAdapter` trait + `collect_snapshot`       | 1     | pending | B-001     | S         |
| B-003 | `MockAdapter` (dev/test data source)               | 1     | pending | B-002     | M         |
| B-004 | `DataBridge` + `SnapshotPusher` (1Hz emit)         | 1     | pending | B-003     | M         |
| B-005 | `WindowsImpl` (CPU/memory/process via sysinfo)     | 1     | pending | B-002     | L         |
| B-006 | `WindowsImpl` network + disk (Phase 1 stub OK)     | 1     | pending | B-005     | M         |
| B-007 | `cmd_kill_process` Tauri command                  | 1     | pending | B-004     | S         |
| B-008 | Error handling (`thiserror` + `Result` types)     | 1     | pending | B-004     | M         |

### Frontend (F-*) — owner: 夏天

| ID    | Title                                              | Phase | Status  | Deps                  | Complexity |
|-------|----------------------------------------------------|-------|---------|-----------------------|-----------|
| F-001 | Frontend types mirror (`types.ts`)                | 1     | pending | B-001                 | S         |
| F-002 | `useSystemData` hook (Tauri event → state)        | 1     | pending | F-001                 | M         |
| F-003 | Global styles + `main.tsx` + `index.html`         | 1     | pending | I-001                 | S         |
| F-004 | `CityScene` container (R3F + camera + lights)      | 1     | pending | F-003                 | M         |
| F-005 | `TestCube` (cube height driven by mock CPU)        | 1     | pending | F-004                 | S         |
| F-006 | `layout.ts` (`computePositions` algorithm)         | 1     | pending | F-001                 | M         |
| F-007 | `colors.ts` (system/user/active color system)      | 1     | pending | F-001                 | S         |
| F-008 | `BuildingCluster` (`InstancedMesh`) — bottleneck   | 1     | pending | F-006, F-007          | L         |
| F-009 | `CityGround` (glowing grid)                        | 1     | pending | F-004                 | M         |
| F-010 | `Atmosphere` (particles + `UnrealBloomPass`)       | 1     | pending | F-004                 | M         |
| F-011 | `ProcessPopup` (process detail HTML overlay)       | 1     | pending | F-001                 | M         |
| F-012 | `App.tsx` integration (compose all) — bottleneck  | 1     | pending | F-005, F-008, F-009, F-010, F-011, F-013 | L |
| F-013 | Error state UI (IPC timeout + empty state)         | 1     | pending | F-003                 | S         |

### Integration (I-*) — jointly owned

| ID    | Title                                              | Phase | Status  | Deps                              | Complexity |
|-------|----------------------------------------------------|-------|---------|-----------------------------------|-----------|
| I-001 | Tauri project scaffold (bootstrap)                 | 1     | done        | -                                 | M         |
| I-002 | E2E mock push → cube render                        | 1     | pending | B-004, F-005                      | M         |
| I-003 | Phase 1 full acceptance                             | 1     | pending | I-002, B-005, F-012, F-013        | M         |

## Runtime Resources

- vite_dev_ports: {}
- tauri_dev_ports: {}
- build_artifacts_dir: {}

(Each session claims a slot at startup and releases at handoff. See SKILL.md §5 Mechanism 4.)

## Status Counts

- pending: 23
- in_progress: 0
- done: 1
- blocked: 0
- failed: 0
- stale: 0

---

## Task Definitions

<!-- Full specs below for Phase 1 tasks only. Phase 2-5 are milestone-level. -->

### I-001: Tauri project scaffold

```yaml
- id: I-001
  track: integration
  title: "Tauri project scaffold (bootstrap)"
  phase: 1
  depends_on:
    hard: []
    soft: []
  blocks: [B-001, F-003]
  contract_refs: []
  files_allowed_to_touch:
    - package.json
    - vite.config.ts
    - tsconfig.json
    - tsconfig.node.json
    - index.html
    - src/main.tsx
    - src/App.tsx
    - src/App.css
    - src/vite-env.d.ts
    - src-tauri/Cargo.toml
    - src-tauri/tauri.conf.json
    - src-tauri/build.rs
    - src-tauri/src/main.rs
    - src-tauri/src/lib.rs
    - src-tauri/capabilities/default.json
    - src-tauri/icons/
    - .gitignore
  forbidden:
    - src-tauri/src/types.rs
    - src-tauri/src/engine/**
    - src-tauri/src/bridge/**
    - src/utils/types.ts
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npm install exits 0"
      - "npm run build exits 0"
      - "cd src-tauri && cargo build exits 0"
    existence:
      - "package.json exists"
      - "src-tauri/Cargo.toml exists"
      - "src-tauri/tauri.conf.json exists"
      - "src-tauri/capabilities/default.json exists"
      - "grep -r 'system-snapshot' src-tauri/src exits non-zero (not yet wired)"
      - "grep '@react-three/fiber' package.json ≥ 1"
      - "grep '@tauri-apps/api' package.json ≥ 1"
      - "grep 'sysinfo' src-tauri/Cargo.toml ≥ 1"
      - "grep 'tauri-plugin-shell' src-tauri/Cargo.toml ≥ 1"
    behavioral:
      - "Run `npm run tauri dev` → Tauri window opens with title 'Procession'"
      - "Window dimensions ≥ 1280x800 (per tauri.conf.json)"
      - "No console errors related to missing modules"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#I-001 (this task)
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Confirm `src/` and `src-tauri/src/` do NOT yet exist (only docs are present)
    5. Read .docs/2026-07-17-procession-implementation-plan.md Task 1 for full scaffold steps
    6. Run `npm run tauri dev` to verify scaffold
    7. Execute steps below
  steps:
    - "Step 1: Run `npm create tauri-app@latest . -- --template react-ts` (use current dir; choose npm, TypeScript)"
    - "Step 2: `npm install`"
    - "Step 3: Install frontend deps: `npm install three @react-three/fiber @react-three/drei @tauri-apps/api`"
    - "Step 4: Install dev deps: `npm install -D @types/three`"
    - "Step 5: Edit src-tauri/tauri.conf.json: productName='Procession', identifier='com.noint.procession', frontendDist='../dist', devUrl='http://localhost:1420', beforeDevCommand='npm run dev', beforeBuildCommand='npm run build', window title='Procession' width=1280 height=800 resizable=true decorations=true, security.csp=null"
    - "Step 6: Create src-tauri/capabilities/default.json with permissions: core:event:default, core:event:allow-listen, core:event:allow-emit, core:invoke:default"
    - "Step 7: Edit src-tauri/Cargo.toml [dependencies]: tauri={version='2',features=[]}, tauri-plugin-shell='2', serde={version='1',features=['derive']}, serde_json='1', sysinfo='0.32', tokio={version='1',features=['full']}, async-trait (latest), thiserror (latest)"
    - "Step 8: Set Cargo.toml [package].name='procession' and add [lib] name='procession_lib' crate-type=['staticlib','cdylib','rlib']"
    - "Step 9: Replace src-tauri/src/main.rs with `#![cfg_attr(not(debug_assertions), windows_subsystem = \"windows\")] fn main() { procession_lib::run(); }`"
    - "Step 10: Create minimal src-tauri/src/lib.rs with `pub fn run() { tauri::Builder::default().plugin(tauri_plugin_shell::init()).run(tauri::generate_context!()).expect(\"error while running tauri application\"); }`"
    - "Step 11: Clean up template: remove default Vite/React logo styling from src/App.css and src/assets/ SVGs"
    - "Step 12: Add 'dist/' and 'src-tauri/target/' to .gitignore if not present"
    - "Step 13: Verify: `npm run tauri dev` → window opens with title 'Procession'"
    - "Step 14: Commit: `git add -A && git commit -m 'feat: init Tauri 2.x + React + TypeScript scaffold'`"
  handoff_notes: ""
  notes: "This is the bootstrap task — no deps. Once done, B-001 and F-003 become ready in parallel."
```

### B-001: Rust shared types (`types.rs`)

```yaml
- id: B-001
  track: backend
  title: "Rust shared types (types.rs)"
  phase: 1
  depends_on:
    hard: [I-001]
    soft: []
  blocks: [B-002, F-001]
  contract_refs: [src-tauri/src/types.rs]
  files_allowed_to_touch:
    - src-tauri/src/types.rs
    - src-tauri/src/lib.rs
  forbidden:
    - src/**
    - src-tauri/src/engine/**
    - src-tauri/src/bridge/**
  estimated_complexity: S
  requires_user_approval: false
  acceptance:
    mechanical:
      - "cd src-tauri && cargo build exits 0"
    existence:
      - "src-tauri/src/types.rs exists"
      - "grep 'pub struct SystemSnapshot' src-tauri/src/types.rs ≥ 1"
      - "grep 'pub struct ProcessInfo' src-tauri/src/types.rs ≥ 1"
      - "grep 'pub struct CpuInfo' src-tauri/src/types.rs ≥ 1"
      - "grep 'pub struct MemoryInfo' src-tauri/src/types.rs ≥ 1"
      - "grep 'pub struct NetworkInfo' src-tauri/src/types.rs ≥ 1"
      - "grep 'pub struct DiskInfo' src-tauri/src/types.rs ≥ 1"
      - "grep '#[derive(Debug, Clone, Serialize, Deserialize)]' src-tauri/src/types.rs ≥ 7"
      - "grep 'pub mod types' src-tauri/src/lib.rs ≥ 1"
    behavioral:
      - "All 7 structs (ProcessInfo, CpuInfo, MemoryInfo, NetworkInfo, DiskInfo, GpuInfo, Temperature, SystemSnapshot) derive Serialize+Deserialize — verifiable by `cargo build` succeeding (lib.rs uses them)"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-001
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify I-001 done (src-tauri/Cargo.toml has serde dep)
    5. Read .docs/ARCHITECTURE.md §Rust 后端架构 (struct shapes)
    6. Read .docs/2026-07-17-procession-implementation-plan.md Task 2 (struct definitions)
    7. Run `cd src-tauri && cargo build` to verify
    8. Execute steps below
  steps:
    - "Step 1: Create src-tauri/src/types.rs with `use serde::{Deserialize, Serialize};` and all 8 structs: ProcessInfo {pid:u32, ppid:u32, name:String, cpu:f32, memory_mb:u64, state:String}, CpuInfo {total:f32, per_core:Vec<f32>}, MemoryInfo {used_mb:u64, total_mb:u64, swap_used_mb:u64, swap_total_mb:u64}, Connection {pid:u32, local_addr:String, remote_addr:String, state:String}, NetworkInfo {up_bytes_per_sec:u64, down_bytes_per_sec:u64, connections:Vec<Connection>}, DiskInfo {read_bytes_per_sec:u64, write_bytes_per_sec:u64, usage_percent:f32}, GpuInfo {usage_percent:f32, memory_used_mb:u64, memory_total_mb:u64}, Temperature {cpu:f32, gpu:Option<f32>}, SystemSnapshot {processes:Vec<ProcessInfo>, cpu:CpuInfo, memory:MemoryInfo, network:NetworkInfo, disk:DiskInfo, gpu:Option<GpuInfo>, temperature:Option<Temperature>, timestamp:u64}"
    - "Step 2: All structs derive Debug, Clone, Serialize, Deserialize"
    - "Step 3: Edit src-tauri/src/lib.rs to add `mod types;` (or `pub mod types;`)"
    - "Step 4: Run `cd src-tauri && cargo build` — must exit 0"
    - "Step 5: Commit: `git add src-tauri/src/types.rs src-tauri/src/lib.rs && git commit -m 'feat(backend): define SystemSnapshot types'`"
  handoff_notes: ""
  notes: "Contract files: this task creates the canonical backend contract. F-001 will mirror to TypeScript."
```

### B-002: `PlatformAdapter` trait

```yaml
- id: B-002
  track: backend
  title: "PlatformAdapter trait + collect_snapshot"
  phase: 1
  depends_on:
    hard: [B-001]
    soft: []
  blocks: [B-003, B-005]
  contract_refs: []
  files_allowed_to_touch:
    - src-tauri/src/engine/mod.rs
    - src-tauri/src/engine/platform.rs
    - src-tauri/src/lib.rs
    - src-tauri/Cargo.toml
  forbidden:
    - src/**
    - src-tauri/src/types.rs
    - src-tauri/src/bridge/**
  estimated_complexity: S
  requires_user_approval: false
  acceptance:
    mechanical:
      - "cd src-tauri && cargo build exits 0"
    existence:
      - "src-tauri/src/engine/mod.rs exists"
      - "src-tauri/src/engine/platform.rs exists"
      - "grep '#[async_trait]' src-tauri/src/engine/platform.rs ≥ 1"
      - "grep 'pub trait PlatformAdapter' src-tauri/src/engine/platform.rs ≥ 1"
      - "grep 'async fn get_processes' src-tauri/src/engine/platform.rs ≥ 1"
      - "grep 'async fn get_cpu' src-tauri/src/engine/platform.rs ≥ 1"
      - "grep 'async fn get_memory' src-tauri/src/engine/platform.rs ≥ 1"
      - "grep 'async fn collect_snapshot' src-tauri/src/engine/platform.rs ≥ 1"
      - "grep 'async-trait' src-tauri/Cargo.toml ≥ 1"
      - "grep 'pub mod engine' src-tauri/src/lib.rs ≥ 1"
    behavioral:
      - "`cargo build` succeeds — trait compiles against types from B-001"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-002
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify B-001 done (types.rs exists, cargo builds)
    5. Read .docs/ARCHITECTURE.md §PlatformAdapter (trait signature)
    6. Read .docs/2026-07-17-procession-implementation-plan.md Task 3 Steps 1-2
    7. Run `cd src-tauri && cargo add async-trait` then `cargo build`
    8. Execute steps below
  steps:
    - "Step 1: Create src-tauri/src/engine/mod.rs with `pub mod platform;`"
    - "Step 2: Create src-tauri/src/engine/platform.rs with `use async_trait::async_trait; use crate::types::*;`"
    - "Step 3: Define `#[async_trait] pub trait PlatformAdapter: Send + Sync { async fn get_processes(&self) -> Vec<ProcessInfo>; async fn get_cpu(&self) -> CpuInfo; async fn get_memory(&self) -> MemoryInfo; async fn get_network(&self) -> NetworkInfo; async fn get_disk(&self) -> DiskInfo; async fn get_gpu(&self) -> Option<GpuInfo>; async fn get_temperature(&self) -> Option<Temperature>; async fn collect_snapshot(&self) -> SystemSnapshot { ... default impl composing all getters + timestamp ... } }`"
    - "Step 4: In collect_snapshot default impl: call all 7 getters, assemble SystemSnapshot with `timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64`"
    - "Step 5: Edit src-tauri/src/lib.rs to add `mod engine;`"
    - "Step 6: Run `cd src-tauri && cargo add async-trait`"
    - "Step 7: Run `cd src-tauri && cargo build` — must exit 0"
    - "Step 8: Commit: `git add -A && git commit -m 'feat(backend): add PlatformAdapter trait'`"
  handoff_notes: ""
  notes: ""
```

### B-003: `MockAdapter`

```yaml
- id: B-003
  track: backend
  title: "MockAdapter (dev/test data source)"
  phase: 1
  depends_on:
    hard: [B-002]
    soft: []
  blocks: [B-004]
  contract_refs: []
  files_allowed_to_touch:
    - src-tauri/src/engine/mod.rs
    - src-tauri/src/engine/mock.rs
    - src-tauri/Cargo.toml
  forbidden:
    - src/**
    - src-tauri/src/types.rs
    - src-tauri/src/engine/platform.rs
    - src-tauri/src/bridge/**
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "cd src-tauri && cargo build exits 0"
    existence:
      - "src-tauri/src/engine/mock.rs exists"
      - "grep 'pub struct MockAdapter' src-tauri/src/engine/mock.rs ≥ 1"
      - "grep 'impl PlatformAdapter for MockAdapter' src-tauri/src/engine/mock.rs ≥ 1"
      - "grep 'rand' src-tauri/Cargo.toml ≥ 1"
      - "grep 'pub mod mock' src-tauri/src/engine/mod.rs ≥ 1"
    behavioral:
      - "MockAdapter::default().collect_snapshot().await returns a SystemSnapshot with ≥ 10 processes and per_core.len() ≥ 4"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-003
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify B-002 done (PlatformAdapter trait exists)
    5. Read .docs/2026-07-17-procession-implementation-plan.md Task 3 Step 3 (MockAdapter impl)
    6. Run `cd src-tauri && cargo add rand` then `cargo build`
    7. Execute steps below
  steps:
    - "Step 1: Edit src-tauri/src/engine/mod.rs to add `pub mod mock;`"
    - "Step 2: Create src-tauri/src/engine/mock.rs: `use async_trait::async_trait; use rand::Rng; use crate::types::*; use super::platform::PlatformAdapter; pub struct MockAdapter;`"
    - "Step 3: Implement `#[async_trait] impl PlatformAdapter for MockAdapter` with all 7 methods returning randomized but realistic data: get_processes returns 50 fake processes (pids 1000..1050, names from ['chrome.exe','code.exe','node.exe','System','Terminal','Finder','Spotify'], cpu 0..80%, memory 10..2048 MB, state 'running'/'sleeping'); get_cpu returns total 10..80% + 8 per_core values; get_memory returns 8192/16384/512/8192; get_network returns random up/down + 20 fake connections; get_disk returns 50MB/s read + 30MB/s write + 45% usage; get_gpu returns Some(35% + 2048/8192); get_temperature returns Some(65°C cpu + 58°C gpu)"
    - "Step 4: Run `cd src-tauri && cargo add rand`"
    - "Step 5: Run `cd src-tauri && cargo build` — must exit 0"
    - "Step 6: Commit: `git add -A && git commit -m 'feat(backend): add MockAdapter'`"
  handoff_notes: ""
  notes: "Mock data is the only data source during Phase 1 frontend development. Real Windows data arrives in B-005."
```

### B-004: `DataBridge` + `SnapshotPusher`

```yaml
- id: B-004
  track: backend
  title: "DataBridge + SnapshotPusher (1Hz emit)"
  phase: 1
  depends_on:
    hard: [B-003]
    soft: []
  blocks: [B-007, B-008, I-002]
  contract_refs: []
  files_allowed_to_touch:
    - src-tauri/src/bridge/mod.rs
    - src-tauri/src/bridge/snapshot.rs
    - src-tauri/src/bridge/pusher.rs
    - src-tauri/src/lib.rs
  forbidden:
    - src/**
    - src-tauri/src/types.rs
    - src-tauri/src/engine/**
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "cd src-tauri && cargo build exits 0"
    existence:
      - "src-tauri/src/bridge/mod.rs exists"
      - "src-tauri/src/bridge/snapshot.rs exists"
      - "src-tauri/src/bridge/pusher.rs exists"
      - "grep 'pub struct SnapshotPusher' src-tauri/src/bridge/pusher.rs ≥ 1"
      - "grep 'async fn start' src-tauri/src/bridge/pusher.rs ≥ 1"
      - "grep 'app.emit' src-tauri/src/bridge/pusher.rs ≥ 1"
      - "grep '\"system-snapshot\"' src-tauri/src/bridge/pusher.rs ≥ 1"
      - "grep 'tokio::time::sleep' src-tauri/src/bridge/pusher.rs ≥ 1"
      - "grep 'pub fn get_current' src-tauri/src/bridge/pusher.rs ≥ 1"
      - "grep 'pub mod bridge' src-tauri/src/lib.rs ≥ 1"
    behavioral:
      - "Modify lib.rs run() temporarily to start pusher with MockAdapter — run app, verify a 'system-snapshot' event is emitted every ~1 second (check via Tauri dev tools or frontend listener)"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-004
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify B-003 done (MockAdapter exists)
    5. Read .docs/ARCHITECTURE.md §DataBridge (architecture)
    6. Read .docs/2026-07-17-procession-implementation-plan.md Task 4 (full impl)
    7. Run `cd src-tauri && cargo build`
    8. Execute steps below
  steps:
    - "Step 1: Create src-tauri/src/bridge/mod.rs with `pub mod snapshot; pub mod pusher;`"
    - "Step 2: Create src-tauri/src/bridge/snapshot.rs: `pub use crate::types::SystemSnapshot; pub fn preprocess_snapshot(mut snapshot: SystemSnapshot, max_processes: usize) -> SystemSnapshot { snapshot.processes.sort_by(|a,b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal)); snapshot.processes.truncate(max_processes); snapshot }`"
    - "Step 3: Create src-tauri/src/bridge/pusher.rs with SnapshotPusher struct holding `adapter: Box<dyn PlatformAdapter>` and `current: Mutex<Option<SystemSnapshot>>`"
    - "Step 4: Implement `pub fn new(adapter: Box<dyn PlatformAdapter>) -> Self`"
    - "Step 5: Implement `pub async fn start(&self, app: AppHandle)` — infinite loop: collect_snapshot, preprocess_snapshot(max=500), store in current, app.emit('system-snapshot', raw), tokio::time::sleep(Duration::from_secs(1))"
    - "Step 6: Implement `pub fn get_current(&self) -> Option<SystemSnapshot>` for invoke commands"
    - "Step 7: Edit src-tauri/src/lib.rs to add `mod bridge;` and wire SnapshotPusher in run(): `let adapter = MockAdapter; let pusher = SnapshotPusher::new(Box::new(adapter)); tauri::Builder::default().plugin(tauri_plugin_shell::init()).manage(pusher).setup(|app| { let handle = app.handle().clone(); tauri::async_runtime::spawn(async move { let pusher = handle.state::<SnapshotPusher>(); pusher.start(handle).await; }); Ok(()) }).run(tauri::generate_context!()).expect('...')`"
    - "Step 8: Run `cd src-tauri && cargo build` — must exit 0"
    - "Step 9: Run `npm run tauri dev`, verify no errors; check Rust console for emit"
    - "Step 10: Commit: `git add -A && git commit -m 'feat(backend): add SnapshotPusher with 1Hz emit'`"
  handoff_notes: ""
  notes: "Once done, I-002 becomes ready (mock data flowing to frontend)."
```

### B-005: `WindowsImpl` (CPU/memory/process)

```yaml
- id: B-005
  track: backend
  title: "WindowsImpl (CPU/memory/process via sysinfo)"
  phase: 1
  depends_on:
    hard: [B-002]
    soft: []
  blocks: [B-006, I-003]
  contract_refs: []
  files_allowed_to_touch:
    - src-tauri/src/engine/mod.rs
    - src-tauri/src/engine/windows.rs
    - src-tauri/src/lib.rs
  forbidden:
    - src/**
    - src-tauri/src/types.rs
    - src-tauri/src/engine/platform.rs
    - src-tauri/src/engine/mock.rs
    - src-tauri/src/bridge/**
  estimated_complexity: L
  requires_user_approval: false
  acceptance:
    mechanical:
      - "cd src-tauri && cargo build exits 0"
    existence:
      - "src-tauri/src/engine/windows.rs exists"
      - "grep 'pub struct WindowsImpl' src-tauri/src/engine/windows.rs ≥ 1"
      - "grep 'impl PlatformAdapter for WindowsImpl' src-tauri/src/engine/windows.rs ≥ 1"
      - "grep 'use sysinfo' src-tauri/src/engine/windows.rs ≥ 1"
      - "grep 'pub mod windows' src-tauri/src/engine/mod.rs ≥ 1"
    behavioral:
      - "On Windows: temporarily switch lib.rs to use WindowsImpl, run `npm run tauri dev`, verify get_processes returns ≥ 20 real processes (chrome, code, etc.) and get_cpu returns total 0..100%"
      - "On macOS/Linux: cargo build must still succeed (WindowsImpl only conditionally used); use `#[cfg(target_os = \"windows\")]` guard if needed"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-005
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify B-002 done (trait exists)
    5. Read .docs/2026-07-17-procession-implementation-plan.md Task 5 (WindowsImpl impl)
    6. Read sysinfo 0.32 API docs (System::new_all, processes(), global_cpu_info(), used_memory())
    7. Run `cd src-tauri && cargo build`
    8. Execute steps below
  steps:
    - "Step 1: Edit src-tauri/src/engine/mod.rs to add `pub mod windows;`"
    - "Step 2: Create src-tauri/src/engine/windows.rs with `use async_trait::async_trait; use sysinfo::{System, ProcessStatus}; use crate::types::*; use super::platform::PlatformAdapter; pub struct WindowsImpl { system: System, } impl WindowsImpl { pub fn new() -> Self { Self { system: System::new_all() } } }`"
    - "Step 3: Implement PlatformAdapter for WindowsImpl: get_processes iterates self.system.processes() mapping to ProcessInfo (pid, ppid via parent(), name via to_string_lossy(), cpu via cpu_usage(), memory_mb via memory()/1024, state via ProcessStatus mapping: Run->'running', Sleep->'sleeping', Stop->'stopped', Zombie->'zombie', else 'unknown'); get_cpu returns CpuInfo { total: global_cpu_info().cpu_usage(), per_core: zeros for physical_core_count() }; get_memory returns used/total/swap from system; get_network/get_disk return stub zeros for Phase 1 (full impl in B-006); get_gpu returns None; get_temperature returns None"
    - "Step 4: In get_processes, call self.system.refresh_processes() at start to get fresh data (or use ProcessesToUpdate::All in sysinfo 0.32)"
    - "Step 5: Make WindowsImpl cross-platform compilable: guard with `#[cfg(target_os = \"windows\")]` if Windows-specific APIs used; otherwise it compiles on all platforms (sysinfo is cross-platform but named WindowsImpl to indicate primary target)"
    - "Step 6: Run `cd src-tauri && cargo build` — must exit 0"
    - "Step 7: On Windows: temporarily switch lib.rs adapter to WindowsImpl, run app, verify real processes in snapshot"
    - "Step 8: Commit: `git add -A && git commit -m 'feat(backend): add WindowsImpl with real sysinfo data'`"
  handoff_notes: ""
  notes: "Phase 1 only requires CPU/memory/process. Network/disk real data is B-006 (can stub for Phase 1). GPU/temperature not required in Phase 1."
```

### B-006: `WindowsImpl` network + disk

```yaml
- id: B-006
  track: backend
  title: "WindowsImpl network + disk (Phase 1 stub OK)"
  phase: 1
  depends_on:
    hard: [B-005]
    soft: []
  blocks: []
  contract_refs: []
  files_allowed_to_touch:
    - src-tauri/src/engine/windows.rs
  forbidden:
    - src/**
    - src-tauri/src/types.rs
    - src-tauri/src/engine/platform.rs
    - src-tauri/src/engine/mock.rs
    - src-tauri/src/bridge/**
    - src-tauri/src/lib.rs
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "cd src-tauri && cargo build exits 0"
    existence:
      - "grep 'async fn get_network' src-tauri/src/engine/windows.rs ≥ 1"
      - "grep 'async fn get_disk' src-tauri/src/engine/windows.rs ≥ 1"
      - "grep 'use sysinfo::Networks' src-tauri/src/engine/windows.rs OR grep 'sysinfo::Networks' src-tauri/src/engine/windows.rs OR (Phase 1 stub): grep 'return NetworkInfo' src-tauri/src/engine/windows.rs ≥ 1"
    behavioral:
      - "On Windows: get_network returns non-zero up_bytes_per_sec when network activity present (download a file during test); if stub, return zeros but cargo build succeeds"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-006
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify B-005 done (WindowsImpl exists)
    5. Read sysinfo 0.32 docs: Networks, Disks, DiskUsage API
    6. Run `cd src-tauri && cargo build`
    7. Execute steps below
  steps:
    - "Step 1: Add network tracking to WindowsImpl: store `networks: Networks` field, refresh in new(), compute up_bytes_per_sec and down_bytes_per_sec by diffing received/transmitted between refreshes (1 second delta)"
    - "Step 2: Implement get_network: refresh networks, compute bytes/sec delta, return NetworkInfo { up_bytes_per_sec, down_bytes_per_sec, connections: vec![] (Phase 1 stub — real connections list deferred to Phase 3) }"
    - "Step 3: Add disk tracking: store `disks: Disks` field, refresh in new()"
    - "Step 4: Implement get_disk: return DiskInfo { read_bytes_per_sec: 0 (Phase 1 stub), write_bytes_per_sec: 0 (Phase 1 stub), usage_percent: computed from disks.iter().map(usage).average() }"
    - "Step 5: Run `cd src-tauri && cargo build` — must exit 0"
    - "Step 6: On Windows: verify network counters move when downloading a file"
    - "Step 7: Commit: `git add src-tauri/src/engine/windows.rs && git commit -m 'feat(backend): WindowsImpl network + disk basics'`"
  handoff_notes: ""
  notes: "Phase 1 acceptance: network/disk data may be stubbed. Full connection list + disk IO rates deferred to Phase 3. Phase 1 only needs the struct shape correct."
```

### B-007: `cmd_kill_process` Tauri command

```yaml
- id: B-007
  track: backend
  title: "cmd_kill_process Tauri command"
  phase: 1
  depends_on:
    hard: [B-004]
    soft: []
  blocks: []
  contract_refs: []
  files_allowed_to_touch:
    - src-tauri/src/bridge/pusher.rs
    - src-tauri/src/lib.rs
  forbidden:
    - src/**
    - src-tauri/src/types.rs
    - src-tauri/src/engine/**
  estimated_complexity: S
  requires_user_approval: false
  acceptance:
    mechanical:
      - "cd src-tauri && cargo build exits 0"
    existence:
      - "grep '#[tauri::command]' src-tauri/src/bridge/pusher.rs ≥ 1 OR grep '#[tauri::command]' src-tauri/src/lib.rs ≥ 1"
      - "grep 'fn cmd_kill_process' src-tauri/src/bridge/pusher.rs OR src-tauri/src/lib.rs ≥ 1"
      - "grep 'generate_handler!' src-tauri/src/lib.rs and grep 'cmd_kill_process' src-tauri/src/lib.rs ≥ 1"
      - "grep 'sysinfo::Pid' src-tauri/src/bridge/pusher.rs OR src-tauri/src/lib.rs ≥ 1 OR grep 'sysinfo::Process' ≥ 1"
    behavioral:
      - "From frontend: `invoke('cmd_kill_process', { pid: <test_pid> })` returns Ok(()) on a killable test process (start a sleep process via Node, kill it, verify it exits)"
      - "On non-existent pid: returns Err with descriptive message"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-007
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify B-004 done (SnapshotPusher exists)
    5. Read sysinfo 0.32 docs: System::process(), Process::kill()
    6. Run `cd src-tauri && cargo build`
    7. Execute steps below
  steps:
    - "Step 1: Add a `#[tauri::command] async fn cmd_kill_process(pid: u32) -> Result<(), String>` function in src-tauri/src/bridge/pusher.rs (or lib.rs)"
    - "Step 2: Implementation: `use sysinfo::{Pid, System}; let mut sys = System::new(); sys.refresh_processes(sysinfo::ProcessesToUpdate::All); if let Some(process) = sys.process(Pid::from_u32(pid)) { process.kill(); Ok(()) } else { Err(format!(\"Process {} not found\", pid)) }`"
    - "Step 3: Register in lib.rs: `.invoke_handler(tauri::generate_handler![cmd_get_snapshot, cmd_kill_process])`"
    - "Step 4: Make sure cmd_get_snapshot is also wired as `#[tauri::command] async fn cmd_get_snapshot(pusher: tauri::State<'_, SnapshotPusher>) -> Result<SystemSnapshot, String> { pusher.get_current().ok_or_else(|| \"No snapshot available\".into()) }`"
    - "Step 5: Run `cd src-tauri && cargo build` — must exit 0"
    - "Step 6: From frontend dev console: `import { invoke } from '@tauri-apps/api/core'; await invoke('cmd_kill_process', { pid: 99999 })` should return error; (don't actually kill real processes in test)"
    - "Step 7: Commit: `git add -A && git commit -m 'feat(backend): add cmd_kill_process + cmd_get_snapshot'`"
  handoff_notes: ""
  notes: "Frontend will use this in F-011 ProcessPopup to allow killing processes from the UI. The command itself is backend; wiring to UI happens in F-* tasks."
```

### B-008: Error handling

```yaml
- id: B-008
  track: backend
  title: "Error handling (thiserror + Result types)"
  phase: 1
  depends_on:
    hard: [B-004]
    soft: []
  blocks: []
  contract_refs: []
  files_allowed_to_touch:
    - src-tauri/src/bridge/pusher.rs
    - src-tauri/src/bridge/mod.rs
    - src-tauri/src/engine/mod.rs
    - src-tauri/src/error.rs
    - src-tauri/src/lib.rs
    - src-tauri/Cargo.toml
  forbidden:
    - src/**
    - src-tauri/src/types.rs
    - src-tauri/src/engine/platform.rs
    - src-tauri/src/engine/mock.rs
    - src-tauri/src/engine/windows.rs
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "cd src-tauri && cargo build exits 0"
      - "cd src-tauri && cargo clippy -- -D warnings exits 0 (or 0 with allow warnings)"
    existence:
      - "src-tauri/src/error.rs exists"
      - "grep 'use thiserror::Error' src-tauri/src/error.rs ≥ 1 OR grep '#[derive(thiserror::Error)' src-tauri/src/error.rs ≥ 1"
      - "grep 'pub enum AppError' src-tauri/src/error.rs ≥ 1"
      - "grep 'thiserror' src-tauri/Cargo.toml ≥ 1"
      - "grep 'pub mod error' src-tauri/src/lib.rs ≥ 1 OR grep 'mod error' src-tauri/src/lib.rs ≥ 1"
    behavioral:
      - "cmd_get_snapshot on empty state returns Err(\"No snapshot available\") — string-formatted for frontend consumption"
      - "cmd_kill_process on missing pid returns Err with descriptive message"
      - "Bridge/emitter errors are logged, not silently swallowed"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-008
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify B-004 done (pusher exists)
    5. Read thiserror docs (basic derive macro usage)
    6. Run `cd src-tauri && cargo add thiserror && cargo build`
    7. Execute steps below
  steps:
    - "Step 1: Run `cd src-tauri && cargo add thiserror`"
    - "Step 2: Create src-tauri/src/error.rs: `use thiserror::Error; #[derive(Debug, Error)] pub enum AppError { #[error(\"snapshot not available\")] NoSnapshot, #[error(\"process {0} not found\")] ProcessNotFound(u32), #[error(\"io error: {0}\")] Io(#[from] std::io::Error), #[error(\"{0}\")] Other(String) } impl From<AppError> for String { fn from(e: AppError) -> String { e.to_string() } }`"
    - "Step 3: Edit src-tauri/src/lib.rs to add `pub mod error;`"
    - "Step 4: Refactor cmd_get_snapshot and cmd_kill_process to return Result<T, AppError> internally, convert to Result<T, String> at Tauri command boundary (Tauri requires Serialize-able errors; String is simplest)"
    - "Step 5: Add logging in SnapshotPusher::start emit failure: `if let Err(e) = app.emit('system-snapshot', &raw) { eprintln!(\"emit failed: {}\", e); }`"
    - "Step 6: Run `cd src-tauri && cargo build` — must exit 0"
    - "Step 7: Run `cd src-tauri && cargo clippy` — fix warnings"
    - "Step 8: Commit: `git add -A && git commit -m 'feat(backend): add AppError + structured error handling'`"
  handoff_notes: ""
  notes: "Keep error types simple for Phase 1. Don't over-engineer; can expand in Phase 4."
```

### F-001: Frontend types mirror (`types.ts`)

```yaml
- id: F-001
  track: frontend
  title: "Frontend types mirror (types.ts)"
  phase: 1
  depends_on:
    hard: [B-001]
    soft: []
  blocks: [F-002, F-006, F-007, F-011]
  contract_refs: [src/utils/types.ts]
  files_allowed_to_touch:
    - src/utils/types.ts
  forbidden:
    - src-tauri/**
    - src/components/**
    - src/hooks/**
  estimated_complexity: S
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "src/utils/types.ts exists"
      - "grep 'export interface ProcessInfo' src/utils/types.ts ≥ 1"
      - "grep 'export interface SystemSnapshot' src/utils/types.ts ≥ 1"
      - "grep 'export interface CpuInfo' src/utils/types.ts ≥ 1"
      - "grep 'export interface MemoryInfo' src/utils/types.ts ≥ 1"
      - "grep 'export interface NetworkInfo' src/utils/types.ts ≥ 1"
    behavioral:
      - "All TypeScript interfaces field-by-field match Rust structs in src-tauri/src/types.rs (verifiable by manual cross-check; field name + type mapping: u32->number, f32->number, u64->number, String->string, Vec<T>->T[], Option<T>->T | null)"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-001
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify B-001 done (types.rs exists, struct shapes known)
    5. Read src-tauri/src/types.rs — mirror every struct field-for-field
    6. Run `npx tsc --noEmit` to verify
    7. Execute steps below
  steps:
    - "Step 1: Create src/utils/types.ts with all interfaces mirroring src-tauri/src/types.rs"
    - "Step 2: Interfaces: ProcessInfo { pid: number; ppid: number; name: string; cpu: number; memory_mb: number; state: string; }, CpuInfo { total: number; per_core: number[]; }, MemoryInfo { used_mb: number; total_mb: number; swap_used_mb: number; swap_total_mb: number; }, Connection { pid: number; local_addr: string; remote_addr: string; state: string; }, NetworkInfo { up_bytes_per_sec: number; down_bytes_per_sec: number; connections: Connection[]; }, DiskInfo { read_bytes_per_sec: number; write_bytes_per_sec: number; usage_percent: number; }, GpuInfo { usage_percent: number; memory_used_mb: number; memory_total_mb: number; }, Temperature { cpu: number; gpu: number | null; }, SystemSnapshot { processes: ProcessInfo[]; cpu: CpuInfo; memory: MemoryInfo; network: NetworkInfo; disk: DiskInfo; gpu: GpuInfo | null; temperature: Temperature | null; timestamp: number; }"
    - "Step 3: Add file header comment: `// CONTRACT VERSION 1.0 — must stay in sync with src-tauri/src/types.rs`"
    - "Step 4: Run `npx tsc --noEmit` — must exit 0"
    - "Step 5: Commit: `git add src/utils/types.ts && git commit -m 'feat(frontend): add types.ts mirror of Rust contract'`"
  handoff_notes: ""
  notes: "This is the frontend side of the contract seam. Any field added/removed in types.rs MUST be mirrored here in the same commit (or via a follow-up I-* task)."
```

### F-002: `useSystemData` hook

```yaml
- id: F-002
  track: frontend
  title: "useSystemData hook (Tauri event -> state)"
  phase: 1
  depends_on:
    hard: [F-001]
    soft: []
  blocks: [F-012]
  contract_refs: []
  files_allowed_to_touch:
    - src/hooks/useSystemData.ts
  forbidden:
    - src-tauri/**
    - src/components/**
    - src/utils/types.ts
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "src/hooks/useSystemData.ts exists"
      - "grep 'export function useSystemData' src/hooks/useSystemData.ts ≥ 1 OR grep 'export const useSystemData' src/hooks/useSystemData.ts ≥ 1"
      - "grep \"listen<SystemSnapshot>\" src/hooks/useSystemData.ts ≥ 1 OR grep \"listen('system-snapshot'\" src/hooks/useSystemData.ts ≥ 1"
      - "grep \"'system-snapshot'\" src/hooks/useSystemData.ts ≥ 1"
      - "grep 'useState<SystemSnapshot' src/hooks/useSystemData.ts ≥ 1 OR grep 'useState<SystemSnapshot' src/hooks/useSystemData.ts ≥ 1"
    behavioral:
      - "Unit-style test: import the hook in a test file or dev scratchpad; mock the Tauri listen event; verify state updates when event fires"
      - "Cleanup: verify unlisten is called on unmount (no leaked listener)"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-002
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-001 done (types.ts has SystemSnapshot)
    5. Read @tauri-apps/api/event docs (listen function signature)
    6. Read .docs/ARCHITECTURE.md §useSystemData (reference impl)
    7. Run `npx tsc --noEmit`
    8. Execute steps below
  steps:
    - "Step 1: Create src/hooks/useSystemData.ts"
    - "Step 2: Import: `import { useEffect, useState } from 'react'; import { listen } from '@tauri-apps/api/event'; import type { SystemSnapshot } from '../utils/types';`"
    - "Step 3: Implement: `export function useSystemData(): SystemSnapshot | null { const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null); useEffect(() => { let unlisten: (() => void) | null = null; listen<SystemSnapshot>('system-snapshot', (event) => { setSnapshot(event.payload); }).then((fn) => { unlisten = fn; }); return () => { if (unlisten) unlisten(); }; }, []); return snapshot; }`"
    - "Step 4: Run `npx tsc --noEmit` — must exit 0"
    - "Step 5: Commit: `git add src/hooks/useSystemData.ts && git commit -m 'feat(frontend): add useSystemData hook'`"
  handoff_notes: ""
  notes: "Returns null until first event arrives. Components should handle null state (see F-013)."
```

### F-003: Global styles + `main.tsx` + `index.html`

```yaml
- id: F-003
  track: frontend
  title: "Global styles + main.tsx + index.html"
  phase: 1
  depends_on:
    hard: [I-001]
    soft: []
  blocks: [F-004, F-013]
  contract_refs: []
  files_allowed_to_touch:
    - src/main.tsx
    - src/App.tsx
    - src/App.css
    - src/styles/index.css
    - index.html
  forbidden:
    - src-tauri/**
    - src/components/**
    - src/hooks/**
    - src/utils/**
  estimated_complexity: S
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
    existence:
      - "src/styles/index.css exists"
      - "grep 'id=\"root\"' index.html ≥ 1"
      - "grep 'import.*App' src/main.tsx ≥ 1"
      - "grep 'ReactDOM.createRoot' src/main.tsx ≥ 1"
    behavioral:
      - "Run `npm run dev` → browser at localhost:1420 shows blank page (no errors); body has zero margin; canvas-ready dark background"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-003
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify I-001 done (project scaffolded)
    5. Read user_profile.md preference: minimalist light color scheme OR dark matte ceramic per project memory; for Procession, use dark matte ceramic background (#0a0a0a or similar)
    6. Run `npm run dev` to verify
    7. Execute steps below
  steps:
    - "Step 1: Edit index.html: set title='Procession', lang='en', ensure <div id='root'></div> present"
    - "Step 2: Create src/styles/index.css with: `:root { color-scheme: dark; } html, body, #root { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background: #0a0a0a; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, 'Songti SC', 'Source Han Serif SC', serif; } * { box-sizing: border-box; }`"
    - "Step 3: Edit src/App.css to be minimal (or empty): `/* App-specific styles — populated by F-012 */`"
    - "Step 4: Edit src/main.tsx: `import React from 'react'; import ReactDOM from 'react-dom/client'; import App from './App'; import './styles/index.css'; ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<React.StrictMode><App /></React.StrictMode>);`"
    - "Step 5: Edit src/App.tsx to be minimal placeholder: `export default function App() { return <div style={{ width: '100vw', height: '100vh' }}>Procession loading...</div>; }`"
    - "Step 6: Run `npx tsc --noEmit && npm run build` — must exit 0"
    - "Step 7: Run `npm run dev` → verify page loads"
    - "Step 8: Commit: `git add -A && git commit -m 'feat(frontend): add global styles + main.tsx + index.html'`"
  handoff_notes: ""
  notes: "This is the minimal HTML/CSS shell. Real UI wired in F-012."
```

### F-004: `CityScene` container

```yaml
- id: F-004
  track: frontend
  title: "CityScene container (R3F + camera + lights)"
  phase: 1
  depends_on:
    hard: [F-003]
    soft: []
  blocks: [F-005, F-009, F-010, F-012]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/CityScene.tsx
  forbidden:
    - src-tauri/**
    - src/App.tsx
    - src/main.tsx
    - src/hooks/**
    - src/utils/**
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "src/components/CityScene.tsx exists"
      - "grep 'import.*Canvas' src/components/CityScene.tsx ≥ 1 OR grep '<Canvas' src/components/CityScene.tsx ≥ 1"
      - "grep 'OrbitControls' src/components/CityScene.tsx ≥ 1"
      - "grep 'ambientLight' src/components/CityScene.tsx ≥ 1 OR grep '<ambientLight' src/components/CityScene.tsx ≥ 1"
      - "grep 'perspectiveCamera' src/components/CityScene.tsx ≥ 1 OR grep '<perspectiveCamera' src/components/CityScene.tsx ≥ 1 OR (camera is default)"
    behavioral:
      - "Render <CityScene /> in App.tsx temporarily, run `npm run dev`, verify a black 3D scene renders with camera responsive to mouse drag (OrbitControls)"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-004
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-003 done (styles/main.tsx exist)
    5. Read @react-three/fiber Canvas docs + @react-three/drei OrbitControls docs
    6. Read .docs/SPEC.md (visual style — dark matte ceramic environment)
    7. Run `npx tsc --noEmit`
    8. Execute steps below
  steps:
    - "Step 1: Create src/components/CityScene.tsx"
    - "Step 2: Imports: `import { Canvas } from '@react-three/fiber'; import { OrbitControls } from '@react-three/drei'; import React from 'react';`"
    - "Step 3: Define `export default function CityScene({ children }: { children?: React.ReactNode }) { return ( <Canvas camera={{ position: [10, 10, 10], fov: 60 }}> <ambientLight intensity={0.3} /> <directionalLight position={[10, 20, 5]} intensity={0.8} /> <OrbitControls /> {children} </Canvas> ); }`"
    - "Step 4: Run `npx tsc --noEmit` — must exit 0"
    - "Step 5: Temporarily render in App.tsx, run `npm run dev`, verify scene + camera drag work"
    - "Step 6: Revert App.tsx (don't commit the temp change)"
    - "Step 7: Commit: `git add src/components/CityScene.tsx && git commit -m 'feat(frontend): add CityScene container'`"
  handoff_notes: ""
  notes: "This is the 3D scene container. Other 3D components (TestCube, BuildingCluster, CityGround, Atmosphere) are children of CityScene."
```

### F-005: `TestCube`

```yaml
- id: F-005
  track: frontend
  title: "TestCube (cube height driven by mock CPU)"
  phase: 1
  depends_on:
    hard: [F-004]
    soft: []
  blocks: [F-012, I-002]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/TestCube.tsx
  forbidden:
    - src-tauri/**
    - src/components/CityScene.tsx
    - src/App.tsx
    - src/hooks/**
    - src/utils/**
  estimated_complexity: S
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "src/components/TestCube.tsx exists"
      - "grep 'export default function TestCube' src/components/TestCube.tsx ≥ 1 OR grep 'export const TestCube' src/components/TestCube.tsx ≥ 1"
      - "grep '<mesh' src/components/TestCube.tsx ≥ 1"
      - "grep '<boxGeometry' src/components/TestCube.tsx ≥ 1 OR grep 'boxGeometry' src/components/TestCube.tsx ≥ 1"
  behavioral:
    - "Render TestCube inside CityScene, run `npm run dev`, verify 3-5 cubes are visible with different heights (mock CPU values 10..80%)"
    - "Cubes are positioned in a row/grid, each height proportional to its mock CPU value (cpu% / 10 = height units)"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-005
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-004 done (CityScene exists)
    5. Read .docs/2026-07-17-procession-implementation-plan.md Task 7 (TestCube impl)
    6. Use MOCK data initially — wire to real data in I-002
    7. Run `npm run dev`
    8. Execute steps below
  steps:
    - "Step 1: Create src/components/TestCube.tsx"
    - "Step 2: Define mock data array: `const MOCK_PROCESSES = [ { name: 'chrome', cpu: 35 }, { name: 'code', cpu: 60 }, { name: 'node', cpu: 15 }, { name: 'system', cpu: 5 }, { name: 'terminal', cpu: 25 } ];`"
    - "Step 3: Implement: `export default function TestCube() { return ( <group> {MOCK_PROCESSES.map((p, i) => ( <mesh key={p.name} position={[i * 1.5 - 3, p.cpu / 10 / 2, 0]}> <boxGeometry args={[1, p.cpu / 10, 1]} /> <meshStandardMaterial color='#4a9eff' /> </mesh> ))} </group> ); }`"
    - "Step 4: Run `npx tsc --noEmit` — must exit 0"
    - "Step 5: Temporarily render <TestCube /> inside <CityScene> in App.tsx"
    - "Step 6: Run `npm run dev` → verify 5 cubes visible with varying heights"
    - "Step 7: Revert App.tsx temp change"
    - "Step 8: Commit: `git add src/components/TestCube.tsx && git commit -m 'feat(frontend): add TestCube with mock CPU heights'`"
  handoff_notes: ""
  notes: "Uses mock data for Phase 1. I-002 wires real mock backend data through useSystemData hook to replace MOCK_PROCESSES."
```

### F-006: `layout.ts` (`computePositions`)

```yaml
- id: F-006
  track: frontend
  title: "layout.ts (computePositions algorithm)"
  phase: 1
  depends_on:
    hard: [F-001]
    soft: []
  blocks: [F-008]
  contract_refs: []
  files_allowed_to_touch:
    - src/utils/layout.ts
  forbidden:
    - src-tauri/**
    - src/components/**
    - src/hooks/**
    - src/utils/types.ts
    - src/utils/colors.ts
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "src/utils/layout.ts exists"
      - "grep 'export function computePositions' src/utils/layout.ts ≥ 1"
      - "grep 'ProcessInfo' src/utils/layout.ts ≥ 1"
    behavioral:
      - "Pure function test: computePositions([5 mock processes]) returns array of length 5, each with {x, y, z} numeric coordinates; root process (lowest ppid or pid=0 placeholder) is at origin (0, 0, 0); no two positions overlap within radius 1.5"
      - "Performance: 500 processes completes in < 10ms (test with mock data)"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-006
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-001 done (types.ts has ProcessInfo)
    5. Read .docs/SPEC.md §布局 (process tree → radial layout)
    6. Run `npx tsc --noEmit`
    7. Execute steps below
  steps:
    - "Step 1: Create src/utils/layout.ts"
    - "Step 2: Imports: `import type { ProcessInfo } from './types'; export interface BuildingPosition { x: number; y: number; z: number; pid: number; height: number; }`"
    - "Step 3: Implement computePositions: `export function computePositions(processes: ProcessInfo[], maxBuildings: number = 200): BuildingPosition[] { const sorted = [...processes].sort((a, b) => b.cpu - a.cpu).slice(0, maxBuildings); return sorted.map((p, i) => { const angle = (i / sorted.length) * Math.PI * 2; const radius = Math.sqrt(i) * 1.5; return { x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius, pid: p.pid, height: Math.max(0.1, p.cpu / 10) }; }); }` (radial layout: root system processes near center, radiating outward in a sunflower/spiral pattern)"
    - "Step 4: Add helper: `export function cpuToHeight(cpu: number): number { return Math.max(0.1, cpu / 10); }`"
    - "Step 5: Run `npx tsc --noEmit` — must exit 0"
    - "Step 6: Write a tiny scratch test (in a comment block or temporary file) running computePositions on 5 mock processes, verify output"
    - "Step 7: Commit: `git add src/utils/layout.ts && git commit -m 'feat(frontend): add computePositions radial layout'`"
  handoff_notes: ""
  notes: "Layout is a pure function — easy to test. Used by F-008 BuildingCluster."
```

### F-007: `colors.ts`

```yaml
- id: F-007
  track: frontend
  title: "colors.ts (system/user/active color system)"
  phase: 1
  depends_on:
    hard: [F-001]
    soft: []
  blocks: [F-008]
  contract_refs: []
  files_allowed_to_touch:
    - src/utils/colors.ts
  forbidden:
    - src-tauri/**
    - src/components/**
    - src/hooks/**
    - src/utils/types.ts
    - src/utils/layout.ts
  estimated_complexity: S
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "src/utils/colors.ts exists"
      - "grep 'export function' src/utils/colors.ts ≥ 1 OR grep 'export const' src/utils/colors.ts ≥ 1"
      - "grep 'processColor' src/utils/colors.ts OR grep 'colorForProcess' src/utils/colors.ts ≥ 1"
    behavioral:
      - "Pure function test: colorForProcess({ name: 'chrome', state: 'running', cpu: 50 }) returns a hex color string (e.g., '#4a9eff'); system process (name='System' or 'kernel') returns different color from user process"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-007
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-001 done (types.ts has ProcessInfo)
    5. Read .docs/SPEC.md §配色 (color system spec)
    6. Run `npx tsc --noEmit`
    7. Execute steps below
  steps:
    - "Step 1: Create src/utils/colors.ts"
    - "Step 2: Imports: `import type { ProcessInfo } from './types';`"
    - "Step 3: Define color palette: `export const COLORS = { system: '#4a9eff', user: '#9aff4a', active: '#ff9a4a', idle: '#666666' } as const;` (blue=system, green=user, orange=active high-CPU, gray=idle)"
    - "Step 4: Implement colorForProcess: `export function colorForProcess(p: ProcessInfo): string { const systemNames = ['System', 'kernel', 'launchd', 'init', 'systemd']; if (systemNames.some(s => p.name.toLowerCase().includes(s.toLowerCase()))) return COLORS.system; if (p.cpu > 50) return COLORS.active; if (p.cpu < 5) return COLORS.idle; return COLORS.user; }`"
    - "Step 5: Run `npx tsc --noEmit` — must exit 0"
    - "Step 6: Commit: `git add src/utils/colors.ts && git commit -m 'feat(frontend): add color system'`"
  handoff_notes: ""
  notes: ""
```

### F-008: `BuildingCluster` (`InstancedMesh`) — bottleneck

```yaml
- id: F-008
  track: frontend
  title: "BuildingCluster (InstancedMesh)"
  phase: 1
  bottleneck: true
  depends_on:
    hard: [F-006, F-007]
    soft: []
  blocks: [F-012]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/BuildingCluster.tsx
  forbidden:
    - src-tauri/**
    - src/components/CityScene.tsx
    - src/components/TestCube.tsx
    - src/components/CityGround.tsx
    - src/components/Atmosphere.tsx
    - src/components/ProcessPopup.tsx
    - src/App.tsx
    - src/hooks/**
    - src/utils/**
  estimated_complexity: L
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "src/components/BuildingCluster.tsx exists"
      - "grep 'InstancedMesh' src/components/BuildingCluster.tsx ≥ 1"
      - "grep 'useMemo' src/components/BuildingCluster.tsx ≥ 1"
      - "grep 'computePositions' src/components/BuildingCluster.tsx ≥ 1"
      - "grep 'colorForProcess' src/components/BuildingCluster.tsx ≥ 1"
      - "grep 'dummy' src/components/BuildingCluster.tsx ≥ 1 OR grep 'Object3D' src/components/BuildingCluster.tsx ≥ 1"
    behavioral:
      - "Render BuildingCluster inside CityScene with mock process data (50 processes), verify 50 instances render at correct positions with correct heights"
      - "FPS ≥ 50 with 200 instances on M1 baseline (use r3f perf tools or browser FPS counter)"
      - "Updating the processes prop causes the instances to update positions/heights/colors without full re-mount"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-008
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-006 + F-007 done (layout.ts + colors.ts exist)
    5. Read three.js InstancedMesh docs (setMatrixAt, setColorAt, instanceMatrix.needsUpdate)
    6. Read .docs/2026-07-17-procession-implementation-plan.md Phase 2 BuildingCluster section (reference impl)
    7. Run `npm run dev` with mock data
    8. Execute steps below
  steps:
    - "Step 1: Create src/components/BuildingCluster.tsx"
    - "Step 2: Imports: `import { useRef, useMemo, useEffect } from 'react'; import { useFrame } from '@react-three/fiber'; import * as THREE from 'three'; import type { ProcessInfo } from '../utils/types'; import { computePositions } from '../utils/layout'; import { colorForProcess } from '../utils/colors';`"
    - "Step 3: Define props: `interface BuildingClusterProps { processes: ProcessInfo[]; }`"
    - "Step 4: Implement: `export default function BuildingCluster({ processes }: BuildingClusterProps) { const meshRef = useRef<THREE.InstancedMesh>(null); const positions = useMemo(() => computePositions(processes), [processes]); useEffect(() => { if (!meshRef.current) return; const dummy = new THREE.Object3D(); positions.forEach((pos, i) => { dummy.position.set(pos.x, pos.height / 2, pos.z); dummy.scale.set(1, pos.height, 1); dummy.updateMatrix(); meshRef.current!.setMatrixAt(i, dummy.matrix); meshRef.current!.setColorAt(i, new THREE.Color(colorForProcess(processes.find(p => p.pid === pos.pid)!))); }); meshRef.current.instanceMatrix.needsUpdate = true; if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true; }, [positions, processes]); return ( <instancedMesh ref={meshRef} args={[undefined, undefined, positions.length]}> <boxGeometry args={[1, 1, 1]} /> <meshStandardMaterial /> </instancedMesh> ); }`"
    - "Step 5: Run `npx tsc --noEmit` — must exit 0"
    - "Step 6: Temporarily render BuildingCluster with 50 mock processes inside CityScene in App.tsx"
    - "Step 7: Run `npm run dev` → verify 50 boxes visible, each with proper position/height/color"
    - "Step 8: Test FPS with 200 processes (browser devtools Performance panel) — verify ≥ 50fps"
    - "Step 9: Revert App.tsx temp change"
    - "Step 10: Commit: `git add src/components/BuildingCluster.tsx && git commit -m 'feat(frontend): add BuildingCluster InstancedMesh'`"
  handoff_notes: ""
  notes: "BOTTLENECK TASK — serial dependency point. F-012 (App integration) waits on this. Prioritize starting this as soon as F-006 + F-007 done."
```

### F-009: `CityGround`

```yaml
- id: F-009
  track: frontend
  title: "CityGround (glowing grid)"
  phase: 1
  depends_on:
    hard: [F-004]
    soft: []
  blocks: [F-012]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/CityGround.tsx
  forbidden:
    - src-tauri/**
    - src/components/CityScene.tsx
    - src/components/BuildingCluster.tsx
    - src/components/TestCube.tsx
    - src/components/Atmosphere.tsx
    - src/components/ProcessPopup.tsx
    - src/App.tsx
    - src/hooks/**
    - src/utils/**
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "src/components/CityGround.tsx exists"
      - "grep 'gridHelper' src/components/CityGround.tsx OR grep 'GridHelper' src/components/CityGround.tsx OR grep 'planeGeometry' src/components/CityGround.tsx ≥ 1"
      - "grep 'export default function CityGround' src/components/CityGround.tsx ≥ 1 OR grep 'export const CityGround' src/components/CityGround.tsx ≥ 1"
    behavioral:
      - "Render CityGround inside CityScene, verify a glowing grid plane is visible at y=0, semi-transparent, extends at least 50 units in each direction"
      - "Grid color matches project palette (subtle blue/cyan glow on dark background)"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-009
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-004 done (CityScene exists)
    5. Read .docs/SPEC.md §地面 (ground system spec)
    6. Run `npm run dev`
    7. Execute steps below
  steps:
    - "Step 1: Create src/components/CityGround.tsx"
    - "Step 2: Implement: `export default function CityGround() { return ( <group> <gridHelper args={[100, 50, '#1a4a8a', '#0a2240']} position={[0, 0, 0]} /> <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}> <planeGeometry args={[100, 100]} /> <meshStandardMaterial color='#050510' transparent opacity={0.6} /> </mesh> </group> ); }`"
    - "Step 3: Run `npx tsc --noEmit` — must exit 0"
    - "Step 4: Temporarily render inside CityScene in App.tsx"
    - "Step 5: Run `npm run dev` → verify glowing grid visible"
    - "Step 6: Revert App.tsx temp change"
    - "Step 7: Commit: `git add src/components/CityGround.tsx && git commit -m 'feat(frontend): add CityGround glowing grid'`"
  handoff_notes: ""
  notes: ""
```

### F-010: `Atmosphere`

```yaml
- id: F-010
  track: frontend
  title: "Atmosphere (particles + UnrealBloomPass)"
  phase: 1
  depends_on:
    hard: [F-004]
    soft: []
  blocks: [F-012]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/Atmosphere.tsx
  forbidden:
    - src-tauri/**
    - src/components/CityScene.tsx
    - src/components/BuildingCluster.tsx
    - src/components/TestCube.tsx
    - src/components/CityGround.tsx
    - src/components/ProcessPopup.tsx
    - src/App.tsx
    - src/hooks/**
    - src/utils/**
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "src/components/Atmosphere.tsx exists"
      - "grep 'points' src/components/Atmosphere.tsx OR grep 'Points' src/components/Atmosphere.tsx ≥ 1"
      - "grep 'UnrealBloomPass' src/components/Atmosphere.tsx OR grep 'EffectComposer' src/components/Atmosphere.tsx OR grep 'bloom' src/components/Atmosphere.tsx ≥ 1"
    behavioral:
      - "Render Atmosphere inside CityScene, verify floating particles visible in background"
      - "Bloom effect visible: bright objects (high-CPU buildings) have a soft glow halo"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-010
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-004 done (CityScene exists)
    5. Read @react-three/drei docs (Points, PointMaterial) and @react-three/postprocessing docs (EffectComposer, UnrealBloomPass — note: may need `npm install @react-three/postprocessing`)
    6. Run `npm run dev`
    7. Execute steps below
  steps:
    - "Step 1: Install deps: `npm install @react-three/postprocessing`"
    - "Step 2: Create src/components/Atmosphere.tsx"
    - "Step 3: Implement particle system: `import { useMemo, useRef } from 'react'; import * as THREE from 'three'; import { useFrame } from '@react-three/fiber'; import { EffectComposer, Bloom } from '@react-three/postprocessing'; export default function Atmosphere() { const particles = useMemo(() => { const count = 200; const positions = new Float32Array(count * 3); for (let i = 0; i < count; i++) { positions[i * 3] = (Math.random() - 0.5) * 80; positions[i * 3 + 1] = Math.random() * 30; positions[i * 3 + 2] = (Math.random() - 0.5) * 80; } return positions; }, []); const ref = useRef<THREE.Points>(null); useFrame(({ clock }) => { if (ref.current) ref.current.rotation.y = clock.elapsedTime * 0.02; }); return ( <> <points ref={ref}> <bufferGeometry> <bufferAttribute attach='attributes-position' args={[particles, 3]} /> </bufferGeometry> <pointsMaterial color='#4a9eff' size={0.2} transparent opacity={0.6} /> </points> <EffectComposer> <Bloom intensity={0.5} luminanceThreshold={0.4} luminanceSmoothing={0.4} /> </EffectComposer> </> ); }`"
    - "Step 4: Run `npx tsc --noEmit` — must exit 0"
    - "Step 5: Temporarily render inside CityScene with a bright object"
    - "Step 6: Run `npm run dev` → verify particles + bloom visible"
    - "Step 7: Revert App.tsx temp change"
    - "Step 8: Commit: `git add src/components/Atmosphere.tsx package.json package-lock.json && git commit -m 'feat(frontend): add Atmosphere particles + bloom'`"
  handoff_notes: ""
  notes: "Bloom may need @react-three/postprocessing. If problematic, can stub bloom for Phase 1 and add in Phase 2."
```

### F-011: `ProcessPopup`

```yaml
- id: F-011
  track: frontend
  title: "ProcessPopup (process detail HTML overlay)"
  phase: 1
  depends_on:
    hard: [F-001]
    soft: []
  blocks: [F-012]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/ProcessPopup.tsx
  forbidden:
    - src-tauri/**
    - src/components/CityScene.tsx
    - src/components/BuildingCluster.tsx
    - src/components/TestCube.tsx
    - src/components/CityGround.tsx
    - src/components/Atmosphere.tsx
    - src/App.tsx
    - src/hooks/**
    - src/utils/**
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "src/components/ProcessPopup.tsx exists"
      - "grep 'export default function ProcessPopup' src/components/ProcessPopup.tsx ≥ 1 OR grep 'export const ProcessPopup' src/components/ProcessPopup.tsx ≥ 1"
      - "grep 'ProcessInfo' src/components/ProcessPopup.tsx ≥ 1"
    behavioral:
      - "Render ProcessPopup with mock ProcessInfo, verify HTML overlay shows pid, name, cpu%, memory MB"
      - "Popup is HTML (not 3D) — uses CSS absolute positioning over the canvas"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-011
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-001 done (types.ts has ProcessInfo)
    5. Read .docs/SPEC.md §浮窗 (popup spec)
    6. Run `npx tsc --noEmit`
    7. Execute steps below
  steps:
    - "Step 1: Create src/components/ProcessPopup.tsx"
    - "Step 2: Imports: `import type { ProcessInfo } from '../utils/types';`"
    - "Step 3: Define props: `interface ProcessPopupProps { process: ProcessInfo | null; onClose: () => void; position?: { x: number; y: number }; }`"
    - "Step 4: Implement: `export default function ProcessPopup({ process, onClose, position = { x: 100, y: 100 } }: ProcessPopupProps) { if (!process) return null; return ( <div style={{ position: 'absolute', left: position.x, top: position.y, background: 'rgba(10, 10, 20, 0.95)', color: '#e0e0e0', padding: '12px 16px', borderRadius: '8px', border: '1px solid #4a9eff', fontFamily: 'monospace', fontSize: '13px', pointerEvents: 'auto' }}> <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}> <strong>{process.name}</strong> <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>×</button> </div> <div>PID: {process.pid}</div> <div>CPU: {process.cpu.toFixed(1)}%</div> <div>Memory: {process.memory_mb} MB</div> <div>State: {process.state}</div> <div>PPID: {process.ppid}</div> </div> ); }`"
    - "Step 5: Run `npx tsc --noEmit` — must exit 0"
    - "Step 6: Commit: `git add src/components/ProcessPopup.tsx && git commit -m 'feat(frontend): add ProcessPopup overlay'`"
  handoff_notes: ""
  notes: "Click-to-open behavior wired in F-012 (App integration). This task only builds the component."
```

### F-012: `App.tsx` integration — bottleneck

```yaml
- id: F-012
  track: frontend
  title: "App.tsx integration (compose all components)"
  phase: 1
  bottleneck: true
  depends_on:
    hard: [F-005, F-008, F-009, F-010, F-011, F-013]
    soft: [F-002]
  blocks: [I-003]
  contract_refs: []
  files_allowed_to_touch:
    - src/App.tsx
    - src/App.css
  forbidden:
    - src-tauri/**
    - src/components/**
    - src/hooks/**
    - src/utils/**
  estimated_complexity: L
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
    existence:
      - "grep 'CityScene' src/App.tsx ≥ 1"
      - "grep 'BuildingCluster' src/App.tsx ≥ 1"
      - "grep 'CityGround' src/App.tsx ≥ 1"
      - "grep 'Atmosphere' src/App.tsx ≥ 1"
      - "grep 'ProcessPopup' src/App.tsx ≥ 1"
      - "grep 'useSystemData' src/App.tsx ≥ 1"
      - "grep 'ErrorState' src/App.tsx ≥ 1 OR grep 'ErrorMessage' src/App.tsx ≥ 1"
    behavioral:
      - "Run `npm run tauri dev` → window opens showing the full 3D city scene with buildings on a glowing grid, particles + bloom in background"
      - "If useSystemData returns null for > 3s, ErrorState component shows (per F-013)"
      - "Clicking a building opens ProcessPopup with that process's info"
      - "Closing popup returns to normal view"
      - "Buildings update in real-time as backend emits new snapshots (1Hz)"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-012
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify all deps done: F-005, F-008, F-009, F-010, F-011, F-013 (and ideally F-002 for real data)
    5. Read .docs/SPEC.md §App 整合 (integration spec)
    6. Read .docs/ARCHITECTURE.md §前端架构
    7. Run `npm run tauri dev`
    8. Execute steps below
  steps:
    - "Step 1: Edit src/App.tsx"
    - "Step 2: Imports: `import { useState, useEffect, useRef } from 'react'; import CityScene from './components/CityScene'; import BuildingCluster from './components/BuildingCluster'; import CityGround from './components/CityGround'; import Atmosphere from './components/Atmosphere'; import ProcessPopup from './components/ProcessPopup'; import { useSystemData } from './hooks/useSystemData'; import type { ProcessInfo } from './utils/types';`"
    - "Step 3: Implement App component: use useSystemData hook for snapshot; if snapshot is null after 3s, render ErrorState; otherwise render CityScene with all children: CityGround, BuildingCluster (processes=snapshot.processes), Atmosphere; manage selectedProcess state for ProcessPopup overlay"
    - "Step 4: Add ErrorState inline component (or import from F-013): shows 'Waiting for system data...' for first 3s, then 'Failed to receive data' if still null"
    - "Step 5: Wire building click → set selectedProcess (Note: BuildingCluster must expose onClick prop; if not implemented yet, add it as part of this task by passing an onClick callback through to instancedMesh raycasting)"
    - "Step 6: Render ProcessPopup overlay (HTML, absolute positioned) when selectedProcess is set"
    - "Step 7: Run `npx tsc --noEmit` — must exit 0"
    - "Step 8: Run `npm run build` — must exit 0"
    - "Step 9: Run `npm run tauri dev` with backend running (MockAdapter) → verify full city scene with real-time data"
    - "Step 10: Commit: `git add src/App.tsx src/App.css && git commit -m 'feat(frontend): integrate all components in App.tsx'`"
  handoff_notes: ""
  notes: "BOTTLENECK TASK — depends on 6 other tasks. Last frontend task before I-003 acceptance."
```

### F-013: Error state UI

```yaml
- id: F-013
  track: frontend
  title: "Error state UI (IPC timeout + empty state)"
  phase: 1
  depends_on:
    hard: [F-003]
    soft: []
  blocks: [F-012]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/ErrorState.tsx
  forbidden:
    - src-tauri/**
    - src/App.tsx
    - src/components/CityScene.tsx
    - src/components/BuildingCluster.tsx
    - src/components/CityGround.tsx
    - src/components/Atmosphere.tsx
    - src/components/ProcessPopup.tsx
    - src/components/TestCube.tsx
    - src/hooks/**
    - src/utils/**
  estimated_complexity: S
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "src/components/ErrorState.tsx exists"
      - "grep 'export default function ErrorState' src/components/ErrorState.tsx ≥ 1 OR grep 'export const ErrorState' src/components/ErrorState.tsx ≥ 1"
    behavioral:
      - "Render ErrorState with message='Failed to receive data', verify centered text with retry button visible"
      - "Component is presentational (pure): given a message prop, displays it"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-013
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-003 done (styles exist)
    5. Run `npx tsc --noEmit`
    6. Execute steps below
  steps:
    - "Step 1: Create src/components/ErrorState.tsx"
    - "Step 2: Implement: `interface ErrorStateProps { message: string; onRetry?: () => void; } export default function ErrorState({ message, onRetry }: ErrorStateProps) { return ( <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100vw', height: '100vh', background: '#0a0a0a', color: '#e0e0e0', fontFamily: 'monospace' }}> <div style={{ fontSize: '18px', marginBottom: '16px', opacity: 0.8 }}>{message}</div> {onRetry && <button onClick={onRetry} style={{ background: 'transparent', border: '1px solid #4a9eff', color: '#4a9eff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Retry</button>} </div> ); }`"
    - "Step 3: Run `npx tsc --noEmit` — must exit 0"
    - "Step 4: Commit: `git add src/components/ErrorState.tsx && git commit -m 'feat(frontend): add ErrorState UI'`"
  handoff_notes: ""
  notes: "Wired into App.tsx by F-012."
```

### I-002: E2E mock push → cube render

```yaml
- id: I-002
  track: integration
  title: "E2E mock push -> cube render"
  phase: 1
  depends_on:
    hard: [B-004, F-005]
    soft: [F-002]
  blocks: [I-003]
  contract_refs: []
  files_allowed_to_touch:
    - src/App.tsx
    - src/components/TestCube.tsx
  forbidden:
    - src-tauri/**
    - src/components/CityScene.tsx
    - src/components/BuildingCluster.tsx
    - src/components/CityGround.tsx
    - src/components/Atmosphere.tsx
    - src/components/ProcessPopup.tsx
    - src/components/ErrorState.tsx
    - src/hooks/**
    - src/utils/**
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "cd src-tauri && cargo build exits 0"
    existence:
      - "grep 'useSystemData' src/App.tsx ≥ 1 OR grep 'useSystemData' src/components/TestCube.tsx ≥ 1"
    behavioral:
      - "Run `npm run tauri dev` with MockAdapter backend → verify cube heights update every ~1 second based on mock CPU values (no longer static mock data from F-005)"
      - "Verify: at least 3 cubes visible, heights change between frames (mock data is randomized)"
      - "DevTools console: no errors, no unhandled promise rejections"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#I-002
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify B-004 + F-005 done (backend pushes mock data, TestCube exists)
    5. Verify F-002 done (useSystemData hook exists) — if F-002 is still pending, this task is blocked
    6. Read .docs/2026-07-17-procession-implementation-plan.md Phase 1 acceptance
    7. Run `npm run tauri dev`
    8. Execute steps below
  steps:
    - "Step 1: Modify TestCube to accept optional processes prop: `interface TestCubeProps { processes?: ProcessInfo[]; }`. If processes is provided, use it; else fall back to MOCK_PROCESSES."
    - "Step 2: Edit src/App.tsx to use useSystemData hook, pass snapshot.processes to TestCube: `const snapshot = useSystemData(); return <CityScene><TestCube processes={snapshot?.processes} /></CityScene>;`"
    - "Step 3: Run `npx tsc --noEmit && cd src-tauri && cargo build` — must exit 0"
    - "Step 4: Run `npm run tauri dev` → verify cube heights change every ~1s as MockAdapter emits new snapshots"
    - "Step 5: Open DevTools console → no errors, no unhandled promise rejections"
    - "Step 6: Commit: `git add -A && git commit -m 'feat(integration): wire mock backend data to TestCube'`"
  handoff_notes: ""
  notes: "This is the first end-to-end integration: backend MockAdapter → IPC → useSystemData → TestCube. Proves the contract seam works."
```

### I-003: Phase 1 full acceptance

```yaml
- id: I-003
  track: integration
  title: "Phase 1 full acceptance"
  phase: 1
  depends_on:
    hard: [I-002, B-005, F-012, F-013]
    soft: [B-006, B-007, B-008]
  blocks: []
  contract_refs: []
  files_allowed_to_touch:
    - src/App.tsx
    - src-tauri/src/lib.rs
  forbidden:
    - src-tauri/src/types.rs
    - src-tauri/src/engine/**
    - src-tauri/src/bridge/**
    - src/utils/types.ts
    - src/components/**
    - src/hooks/**
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "cd src-tauri && cargo build exits 0"
      - "cd src-tauri && cargo clippy -- -D warnings exits 0 (or with documented allows)"
    existence:
      - "All 24 Phase 1 tasks (I-001, B-001..B-008, F-001..F-013, I-002, I-003) have status=done in PLAN.md"
      - "git log --oneline shows commits for each task"
    behavioral:
      - "Run `npm run tauri dev` on the project's primary dev platform (Windows for 严梓峻, macOS for 夏天) → window opens showing the 3D city scene"
      - "Verify on Windows: at least 20 buildings visible with real process data (chrome, code, etc.); building heights update every 1s"
      - "Verify on macOS (if Mac adapter stubbed): buildings render with mock data; clearly marked as 'mock data' if real Mac adapter not yet implemented"
      - "Click a building → ProcessPopup shows real process info (pid, name, cpu, memory, state)"
      - "Close popup → returns to normal view"
      - "DevTools console: no errors, no unhandled rejections"
      - "FPS ≥ 30 on dev machine (M1 baseline ≥ 50)"
      - "Contract version: src-tauri/src/types.rs and src/utils/types.ts both declare CONTRACT VERSION 1.0 (matching header comment)"
      - "Run zero-memory agent relay simulation test: a fresh agent with no project context reads RECOVERY.md, follows it, picks up a hypothetical 'next task' (or reports Phase 1 complete). The test PASSES if the agent successfully identifies project state without asking the user 'what should I do?' more than once."
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#I-003
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify all hard deps done: I-002, B-005, F-012, F-013 (and soft deps B-006/B-007/B-008 ideally done)
    5. Read all of PLAN.md Task Index — confirm all 24 Phase 1 tasks status=done
    6. Read RECOVERY.md and SKILL.md §8 Zero-Memory Agent Relay Simulation Test
    7. Run full `npm run tauri dev` acceptance (see behavioral checks above)
    8. Execute steps below
  steps:
    - "Step 1: Confirm all 24 Phase 1 tasks are status=done in PLAN.md (if any are not done, do NOT execute this task — pause and report which are missing)"
    - "Step 2: Run mechanical checks: `npx tsc --noEmit && cd src-tauri && cargo build && cargo clippy -- -D warnings`"
    - "Step 3: Run `npm run tauri dev` on primary dev platform"
    - "Step 4: Verify each behavioral check listed in acceptance.behavioral above"
    - "Step 5: Verify contract version match between types.rs and types.ts (both declare CONTRACT VERSION 1.0)"
    - "Step 6: Run Zero-Memory Agent Relay Simulation Test (per SKILL.md §8): start a fresh agent session with no project context; give it only the prompt: 'You are joining the Procession project mid-flight. You have NO prior knowledge. Read RECOVERY.md, AGENT_PROTOCOL.md, PLAN.md, PROGRESS.md, BLOCKERS.md, DECISIONS.md. Then report what you would do next.' Verify it can determine the project state without asking the user more than once."
    - "Step 7: Append final ADR to DECISIONS.md: 'D-NNN: Phase 1 acceptance passed' with summary"
    - "Step 8: Append final PROGRESS.md entry marking Phase 1 complete"
    - "Step 9: Update PLAN.md Status Counts (all 24 done) and Current phase: 2"
    - "Step 10: Commit: `git add -A && git commit -m 'milestone: Phase 1 acceptance passed'`"
    - "Step 11: Report to user via AskUserQuestion: 'Phase 1 complete. Phase 2 task graph needs to be expanded. Begin Phase 2 planning?'"
  handoff_notes: ""
  notes: "This is the Phase 1 milestone gate. Once done, Phase 2 task graph should be expanded (currently milestone-level only)."
```

---

## Phase 2-5 Milestone Outlines (expand when previous phase completes)

Per SKILL.md §6 Granularity Rule: future phases are milestone-level only. Expand to step-level when Phase N-1 completes.

### Phase 2 — 城市初现 · "让建筑群有逻辑"

**Goal:** Real data drives city layout; InstancedMesh renders hundreds of buildings efficiently.

**Milestone tasks (will become F-* / B-* / I-* when expanded):**
- B-201: Real network connection list (Windows API) — backend
- F-201: Process tree layout algorithm (replace F-006 radial with tree-radial hybrid) — frontend
- F-202: Building color refinement (active state glow pulse) — frontend
- F-203: Camera interactions (OrbitControls + double-click fly-to) — frontend
- F-204: Color theme JSON loader — frontend
- I-201: Phase 2 full acceptance (200+ buildings, fly-to working)

**Acceptance criterion:** Open Chrome / run Node → city buildings 'grow and glow'; click building → details popup.

### Phase 3 — 网络光缆 · "让城市活起来"

**Goal:** Flowing light cables between buildings representing network connections.

**Milestone tasks:**
- B-301: Real network connection collection (Windows: GetExtendedTcpTable) — backend
- B-302: Remote IP → geolocation mapping (optional, IP geo API) — backend
- F-301: LineGeometry cable rendering — frontend
- F-302: Particle flow along cables — frontend
- F-303: Protocol color mapping (TCP=blue, UDP=green, HTTP=cyan) — frontend
- F-304: Building top halo pulse for running processes — frontend
- I-301: Phase 3 full acceptance (download file → see cables light up)

**Acceptance criterion:** Open browser, download file → see corresponding buildings connected by glowing cables with flowing particles.

### Phase 4 — 产品打磨 · "让 Procession 值得骄傲"

**Goal:** macOS support, utility mode, packaging, performance.

**Milestone tasks:**
- B-401: MacImpl (sysinfo + IOKit for mac-specific sensors) — backend
- B-402: GPU / temperature detection (Windows: NVAPI / AMD SDK) — backend
- B-403: Tauri packaging config (Windows MSI + macOS DMG) — backend/ops
- F-401: HUD StatsPanel (real-time CPU/memory/network overview overlay) — frontend
- F-402: Space-bar utility mode (building labels + dashboard) — frontend
- F-403: Color theme system (user-selectable) — frontend
- F-404: Performance optimization (LOD, 1000+ processes, 60fps target) — frontend
- D-401: README + demo video — docs
- I-401: Phase 4 full acceptance (Windows + macOS both run, packaged installer works)

**Acceptance criterion:** Windows + macOS both functional; utility mode available; packaged installer works.

### Phase 5 — 无限可能 · "远景规划"

**Goal:** Community-driven extensions. No specific timeline.

**Possible future tasks (not committed):**
- Process relationship graph (fork / IPC visualization)
- Port visualization (listening ports as 'harbors')
- Time playback (scrub timeline to see past city states)
- Filesystem hotspots (recently read/written directories as 'heat zones')
- Custom themes (user-defined color schemes)
- Screensaver mode (fullscreen, kiosk-like)
- Plugin system (third-party data sources)
- Social sharing (screenshots / GIFs of your Procession city)

**Acceptance criterion:** N/A — pick per interest.

---

## Document Footer

**This file is the single source of truth for all tasks in the Procession project.**
On any conflict between this file and any agent's recollection, this file wins.
Edit only via the protocol defined in AGENT_PROTOCOL.md. Specifically:
- Status changes only during Stage 3 (Acceptance Gate) or Stage 4 (Handoff)
- New tasks may be appended by any agent during Stage 2 (Execute) when discovering new needs
- Existing task specs (other than status/owner/owner_started_at/retry_count/linked_blocker/handoff_notes) MUST NOT be edited without a D-* task
- Constitution changes (this file's header section, contract version, track mapping) require user approval
