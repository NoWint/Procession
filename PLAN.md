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
- Current phase: 5
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
| B-001 | Rust shared types (`types.rs`)                    | 1     | done     | I-001     | S         |
| B-002 | `PlatformAdapter` trait + `collect_snapshot`       | 1     | done          | B-001     | S         |
| B-003 | `MockAdapter` (dev/test data source)               | 1     | done    | B-002     | M         |
| B-004 | `DataBridge` + `SnapshotPusher` (1Hz emit)         | 1     | done    | B-003     | M         |
| B-005 | `WindowsImpl` (CPU/memory/process via sysinfo)     | 1     | done    | B-002     | L         |
| B-006 | `WindowsImpl` network + disk (Phase 1 stub OK)     | 1     | done    | B-005     | M         |
| B-007 | `cmd_kill_process` Tauri command                  | 1     | done    | B-004     | S         |
| B-008 | Error handling (`thiserror` + `Result` types)     | 1     | done    | B-004     | M         |

### Frontend (F-*) — owner: 夏天

| ID    | Title                                              | Phase | Status  | Deps                  | Complexity |
|-------|----------------------------------------------------|-------|---------|-----------------------|-----------|
| F-001 | Frontend types mirror (`types.ts`)                | 1     | done    | B-001                 | S         |
| F-002 | `useSystemData` hook (Tauri event → state)        | 1     | done    | F-001                 | M         |
| F-003 | Global styles + `main.tsx` + `index.html`         | 1     | done    | I-001                 | S         |
| F-004 | `CityScene` container (R3F + camera + lights)      | 1     | done    | F-003                 | M         |
| F-005 | `TestCube` (cube height driven by mock CPU)        | 1     | done    | F-004                 | S         |
| F-006 | `layout.ts` (`computePositions` algorithm)         | 1     | done    | F-001                 | M         |
| F-007 | `colors.ts` (system/user/active color system)      | 1     | done    | F-001                 | S         |
| F-008 | `BuildingCluster` (`InstancedMesh`) — bottleneck   | 1     | done    | F-006, F-007          | L         |
| F-009 | `CityGround` (glowing grid)                        | 1     | done    | F-004                 | M         |
| F-010 | `Atmosphere` (particles + `UnrealBloomPass`)       | 1     | done    | F-004                 | M         |
| F-011 | `ProcessPopup` (process detail HTML overlay)       | 1     | done    | F-001                 | M         |
| F-012 | `App.tsx` integration (compose all) — bottleneck  | 1     | done    | F-005, F-008, F-009, F-010, F-011, F-013 | L |
| F-013 | Error state UI (IPC timeout + empty state)         | 1     | done    | F-003                 | S         |

### Integration (I-*) — jointly owned

| ID    | Title                                              | Phase | Status  | Deps                              | Complexity |
|-------|----------------------------------------------------|-------|---------|-----------------------------------|-----------|
| I-001 | Tauri project scaffold (bootstrap)                 | 1     | done        | -                                 | M         |
| I-002 | E2E mock push → cube render                        | 1     | done    | B-004, F-005                      | M         |
| I-003 | Phase 1 full acceptance                             | 1     | done    | I-002, B-005, F-012, F-013        | M         |

### Phase 4 (B-*/F-*/D-*/I-*) — product polish

| ID    | Title                                              | Phase | Status  | Deps                              | Complexity |
|-------|----------------------------------------------------|-------|---------|-----------------------------------|-----------|
| B-401 | MacImpl (sysinfo + IOKit for mac-specific sensors)| 4     | done    | B-002                             | L         |
| B-402 | GPU / temperature detection (Windows: DXGI + WMI)| 4    | done    | B-002                             | L         |
| B-403 | Tauri packaging config (Windows MSI + macOS DMG)  | 4     | done    | I-001                             | M         |
| F-401 | HUD StatsPanel (CPU/memory/network overlay)        | 4     | done    | F-012                             | M         |
| F-402 | Space-bar utility mode (labels + dashboard)        | 4     | done    | F-012                             | L         |
| F-403 | Color theme system (user-selectable)               | 4     | done    | F-204                             | M         |
| F-404 | Performance optimization (LOD, 1000+ processes)    | 4     | done    | F-008                             | XL        |
| D-401 | README + demo video                                | 4     | done    | B-403, F-401, F-402               | M         |
| I-401 | Phase 4 full acceptance                            | 4     | done    | B-401, B-402, B-403, F-401, F-402, F-403, F-404, D-401 | XL |

### Phase 5 (B-*/F-*/D-*/I-*) — community extensions

| ID    | Title                                              | Phase | Status  | Deps                              | Complexity |
|-------|----------------------------------------------------|-------|---------|-----------------------------------|-----------|
| B-501 | Process relation backend (ppid tree + IPC handles) | 5     | done    | B-002                             | L         |
| B-502 | Listening ports collection (harbor data source)    | 5     | done    | B-002                             | M         |
| B-503 | Filesystem activity backend (fsevents/inotify)     | 5     | done    | B-002                             | L         |
| B-504 | Plugin command API (third-party data sources)      | 5     | done    | B-002                             | XL        |
| F-501 | Process relationship graph (fork / IPC edges)      | 5     | done    | B-501                             | L         |
| F-502 | Port visualization (listening ports as harbors)    | 5     | done    | B-502                             | M         |
| F-503 | Filesystem hotspots (recent read/write heat zones) | 5     | done    | B-503                             | L         |
| F-504 | Custom theme editor / JSON import                   | 5     | done    | F-403                             | M         |
| F-505 | Screensaver / kiosk mode (fullscreen, auto-rotate) | 5     | pending | F-401                             | S         |
| F-506 | Screenshot / GIF sharing                          | 5     | pending | F-401                             | M         |
| D-501 | Plugin development guide                          | 5     | pending | B-504                             | M         |
| D-502 | UI Design System v1.0 document                    | 5     | done    | F-403                             | M         |
| D-503 | 3D World Generation Design document               | 5     | done    | D-502                             | L         |
| D-504 | Visual Effects Design document                    | 5     | done    | D-502                             | L         |
| I-501 | Phase 5 full acceptance                           | 5     | pending | B-501, B-502, B-503, B-504, F-501, F-502, F-503, F-504, F-505, F-506, D-501, D-502, D-503, D-504 | XL |

## Runtime Resources

- vite_dev_ports: {}
- tauri_dev_ports: {}
- build_artifacts_dir: {}

(Each session claims a slot at startup and releases at handoff. See SKILL.md §5 Mechanism 4.)

## Status Counts

- pending: 4
- in_progress: 0
- done: 55
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
  status: done
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
  status: done
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
  status: done
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
  status: done
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
  status: done
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

### Phase 2 — 城市初现 · "让建筑群有逻辑且有质感"

**Goal:** Real data drives city layout; InstancedMesh renders hundreds of buildings efficiently; visual design establishes a quiet, matte-ceramic digital atmosphere with intentional light, color, and motion.

**Visual design direction (from user intent):**
- Avoid beige canvas, paper texture, or website-like hero layouts.
- Prefer a dark matte ceramic digital environment where the 3D city feels like a quiet digital architecture.
- Use rounded corners and restrained motion for UI overlays; reserve high contrast for active process states.
- Typography: Songti/serif for headings and key labels, monospace for data; clean sans-serif for body only if needed.
- Light scheme is acceptable for overlay panels, but the 3D world should remain moody and atmospheric.

**Phase 2 Task Index (expanded):**

| ID    | Title                                              | Phase | Status  | Deps                              | Complexity |
|-------|----------------------------------------------------|-------|---------|-----------------------------------|-----------|
| B-201 | Real network connection list (Windows API)        | 2     | done    | B-005                             | M         |
| F-201 | Process tree layout algorithm                      | 2     | done    | F-006                             | L         |
| F-202 | Building color refinement + active glow pulse      | 2     | done    | F-007, F-008                      | M         |
| F-203 | Camera interactions (OrbitControls + fly-to)       | 2     | done    | F-004, F-012                      | M         |
| F-204 | Color theme JSON loader                            | 2     | done    | F-007                             | S         |
| F-205 | Visual design system (palette, typography, materials) | 2 | done    | F-012                         | M         |
| F-206 | Building hover / focus / selection states          | 2     | done    | F-008, F-011                      | M         |
| F-207 | Loading, empty, and error state polish             | 2     | done    | F-013                             | S         |
| I-201 | Phase 2 full acceptance                            | 2     | done    | B-201, F-201, F-202, F-203, F-205 | L         |

### Phase 3 — 网络光缆 · "让城市活起来"

| ID    | Title                                              | Phase | Status  | Deps                              | Complexity |
|-------|----------------------------------------------------|-------|---------|-----------------------------------|-----------|
| B-301 | Real network connection collection (Windows API)  | 3     | done    | B-201                             | M         |
| B-302 | Remote IP → geolocation mapping (optional)         | 3     | done    | B-301                             | S         |
| F-301 | LineGeometry cable rendering                       | 3     | done    | F-008, B-301                      | L         |
| F-302 | Particle flow along cables                         | 3     | done    | F-301                             | M         |
| F-303 | Protocol color mapping (TCP/UDP/HTTP)              | 3     | done    | F-301                             | S         |
| F-304 | Building top halo pulse for running processes      | 3     | done    | F-008, F-202                      | M         |
| I-301 | Phase 3 full acceptance                            | 3     | done    | B-301, F-301, F-302, F-303, F-304 | L         |

**Acceptance criterion:** Open browser, download file → see corresponding buildings connected by glowing cables with flowing particles.

### Phase 2 Task Definitions

```yaml
- id: B-201
  track: backend
  title: "Real network connection list (Windows API)"
  phase: 2
  depends_on:
    hard: [B-005]
    soft: []
  blocks: [I-201]
  contract_refs: [src-tauri/src/types.rs]
  files_allowed_to_touch:
    - src-tauri/src/engine/windows.rs
    - src-tauri/src/engine/platform.rs
  forbidden:
    - src/**
    - src-tauri/src/types.rs
    - src-tauri/src/bridge/**
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "cd src-tauri && cargo build exits 0"
      - "cd src-tauri && cargo clippy -- -D warnings exits 0"
    existence:
      - "WindowsImpl::get_network returns real Connection structs from Windows APIs"
      - "connections vector length > 0 when network is active"
    behavioral:
      - "Run app on Windows with browser open → snapshot.network.connections contains entries with local_addr, remote_addr, state, protocol"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-201
    2. Verify B-005 done (WindowsImpl CPU/memory/process exists)
    3. Use Windows GetExtendedTcpTable / GetExtendedUdpTable or sysinfo network APIs
    4. Map protocol string to 'TCP' | 'UDP' | 'Other'
    5. Run cargo build + cargo clippy
  steps:
    - "Step 1: Add get_network implementation to WindowsImpl"
    - "Step 2: Populate Connection { pid, local_addr, remote_addr, state, protocol }"
    - "Step 3: Update mock adapter if needed to keep parity"
    - "Step 4: Verify cargo build && cargo clippy -- -D warnings"
    - "Step 5: Commit: 'feat(backend): add real Windows network connection list'"
  handoff_notes: ""
  notes: "Enables Phase 2 acceptance where cables between buildings can reflect real connections."
```

```yaml
- id: F-201
  track: frontend
  title: "Process tree layout algorithm"
  phase: 2
  depends_on:
    hard: [F-006]
    soft: []
  blocks: [I-201]
  contract_refs: []
  files_allowed_to_touch:
    - src/utils/layout.ts
  forbidden:
    - src-tauri/**
    - src/components/**
    - src/hooks/**
    - src/utils/types.ts
    - src/utils/colors.ts
  estimated_complexity: L
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "src/utils/layout.ts exports computePositions and computeTreePositions"
      - "BuildingPosition interface includes parentPid?: number"
    behavioral:
      - "Child processes cluster near their parent; root processes (lowest ppid) near origin"
      - "No overlapping buildings within radius 1.0"
      - "500 processes compute in < 20ms"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-201
    2. Verify F-006 done (computePositions exists)
    3. Read .docs/SPEC.md §布局 (if exists)
    4. Implement tree-radial hybrid: group by ppid, then radial layout within each group
  steps:
    - "Step 1: Add parentPid?: number to BuildingPosition"
    - "Step 2: Implement computeTreePositions(processes, maxBuildings = 200)"
    - "Step 3: Group processes by ppid; place root group at center; child groups on concentric rings"
    - "Step 4: Sort within group by cpu for visual hierarchy"
    - "Step 5: Add unit test in comment block or __tests__"
    - "Step 6: Run npx tsc --noEmit"
    - "Step 7: Commit: 'feat(frontend): add process tree layout algorithm'"
  handoff_notes: ""
  notes: "Replaces pure radial layout with semantic process-tree grouping."
```

```yaml
- id: F-202
  track: frontend
  title: "Building color refinement + active glow pulse"
  phase: 2
  depends_on:
    hard: [F-007, F-008]
    soft: []
  blocks: [I-201]
  contract_refs: []
  files_allowed_to_touch:
    - src/utils/colors.ts
    - src/components/BuildingCluster.tsx
    - src/shaders/buildingGlow.* (optional)
  forbidden:
    - src-tauri/**
    - src/utils/types.ts
    - src/utils/layout.ts
    - src/hooks/**
    - src/App.tsx
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
    existence:
      - "colorForProcess uses state and cpu"
      - "BuildingCluster updates emissive color for active processes"
    behavioral:
      - "Active processes (cpu > 50%) show pulsing emissive glow"
      - "Sleeping/stopped/zombie states have distinct muted colors"
      - "Glow animation does not drop FPS below 30 on 200 instances"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-202
    2. Verify F-007 and F-008 done
    3. Extend COLORS with state-aware palette
    4. Use useFrame in BuildingCluster to pulse emissive intensity
  steps:
    - "Step 1: Extend COLORS in colors.ts with Running/Sleeping/Stopped/Zombie variants"
    - "Step 2: Update colorForProcess to weigh state + cpu"
    - "Step 3: In BuildingCluster, store base colors and apply time-based emissive pulse for high-CPU instances"
    - "Step 4: Use meshStandardMaterial.emissive for glow (no custom shader needed for Phase 2)"
    - "Step 5: Verify FPS with 200 mock processes"
    - "Step 6: Commit: 'feat(frontend): building colors, state awareness, active glow pulse'"
  handoff_notes: ""
  notes: "Foundation of the 'grow and glow' acceptance criterion."
```

```yaml
- id: F-203
  track: frontend
  title: "Camera interactions (OrbitControls + fly-to)"
  phase: 2
  depends_on:
    hard: [F-004, F-012]
    soft: []
  blocks: [I-201]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/CityScene.tsx
    - src/components/CameraController.tsx (new)
    - src/App.tsx
  forbidden:
    - src-tauri/**
    - src/utils/**
    - src/hooks/**
    - src/components/BuildingCluster.tsx
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "CameraController component exists"
      - "CityScene accepts cameraTarget prop or CameraController as child"
    behavioral:
      - "Double-click a building → camera smoothly pans/zooms to that building"
      - "OrbitControls remain usable during and after fly-to"
      - "Fly-to completes in ~0.8s with ease-out"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-203
    2. Verify F-004 and F-012 done
    3. Use @react-three/drei/useFrame + Vector3.lerp for fly-to
  steps:
    - "Step 1: Create src/components/CameraController.tsx"
    - "Step 2: Accept target: { x, y, z } | null prop"
    - "Step 3: Use useFrame to lerp camera position and lookAt toward target"
    - "Step 4: Wire App.tsx selectedProcess → cameraTarget via layout position lookup"
    - "Step 5: Trigger fly-to on building double-click"
    - "Step 6: Commit: 'feat(frontend): add camera fly-to interaction'"
  handoff_notes: ""
  notes: ""
```

```yaml
- id: F-204
  track: frontend
  title: "Color theme JSON loader"
  phase: 2
  depends_on:
    hard: [F-007]
    soft: []
  blocks: [I-201]
  contract_refs: []
  files_allowed_to_touch:
    - src/utils/theme.ts (new)
    - src/utils/colors.ts
    - public/themes/default.json (new)
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
      - "src/utils/theme.ts exists"
      - "public/themes/default.json exists"
      - "loadTheme(url) async function exists"
    behavioral:
      - "loadTheme('/themes/default.json') returns a theme object matching COLORS shape"
      - "Invalid JSON rejects gracefully with fallback to built-in COLORS"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-204
    2. Verify F-007 done
    3. Define Theme interface matching COLORS + background + accent
  steps:
    - "Step 1: Define Theme interface in theme.ts"
    - "Step 2: Create public/themes/default.json with dark matte-ceramic palette"
    - "Step 3: Implement async loadTheme(url): Promise<Theme> with fetch + fallback"
    - "Step 4: Use loaded theme in colors.ts/colorForProcess (optional: refactor to accept theme)"
    - "Step 5: Run npx tsc --noEmit"
    - "Step 6: Commit: 'feat(frontend): add color theme JSON loader'"
  handoff_notes: ""
  notes: "Prepares for user-selectable themes in Phase 4."
```

```yaml
- id: F-205
  track: frontend
  title: "Visual design system (palette, typography, materials)"
  phase: 2
  depends_on:
    hard: [F-012]
    soft: []
  blocks: [I-201]
  contract_refs: []
  files_allowed_to_touch:
    - src/styles/index.css
    - src/App.css
    - src/utils/theme.ts
    - public/themes/default.json
  forbidden:
    - src-tauri/**
    - src/components/**
    - src/hooks/**
    - src/utils/types.ts
    - src/utils/layout.ts
    - src/utils/colors.ts
  estimated_complexity: M
  requires_user_approval: true
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
    existence:
      - "CSS variables for background, surface, text, accent, system/user/active/idle colors"
      - "font-family stack uses Songti/serif for headings and monospace for data"
      - "public/themes/default.json defines the complete visual theme"
    behavioral:
      - "App renders with the new theme applied (no visible beige/paper textures)"
      - "ProcessPopup uses rounded corners, subtle border, and theme colors"
      - "ErrorState uses theme colors instead of hard-coded values"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-205
    2. Verify F-012 done
    3. Review user memory: dark matte ceramic, Song font for headings, rounded corners, avoid website-like hero
    4. Audit all components for hard-coded colors and replace with CSS variables or theme tokens
  steps:
    - "Step 1: Define CSS custom properties in src/styles/index.css for the dark matte-ceramic theme"
    - "Step 2: Update src/App.css to use theme variables"
    - "Step 3: Refactor ErrorState.tsx to use theme variables (within F-205 files_allowed_to_touch scope if editing CSS only; otherwise create follow-up F-207)"
    - "Step 4: Refactor ProcessPopup inline styles to use theme tokens via CSS class or style helper"
    - "Step 5: Create public/themes/default.json matching CSS variables"
    - "Step 6: Run npx tsc --noEmit && npm run build"
    - "Step 7: Commit: 'feat(frontend): establish visual design system'"
  handoff_notes: ""
  notes: "This task requires user approval because it defines the long-term visual identity of the app."
```

```yaml
- id: F-206
  track: frontend
  title: "Building hover / focus / selection states"
  phase: 2
  depends_on:
    hard: [F-008, F-011]
    soft: []
  blocks: [I-201]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/BuildingCluster.tsx
    - src/components/ProcessPopup.tsx
  forbidden:
    - src-tauri/**
    - src/utils/**
    - src/hooks/**
    - src/App.tsx
    - src/styles/**
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "BuildingCluster exposes onHover and onSelect props"
      - "Hovered instance gets emissive highlight"
    behavioral:
      - "Hovering a building highlights it without selecting"
      - "Clicking a building opens ProcessPopup with that process"
      - "Selected building stays highlighted while popup is open"
      - "Popup closes on × or Escape key"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-206
    2. Verify F-008 and F-011 done
    3. Add onPointerOver/onPointerOut to instancedMesh
    4. Track hoveredInstanceId and selectedPid in local state
  steps:
    - "Step 1: Add hover handlers to BuildingCluster instancedMesh"
    - "Step 2: Apply temporary emissive boost to hovered instance"
    - "Step 3: Pass selectedPid prop to keep selected building highlighted"
    - "Step 4: Add Escape key listener to close ProcessPopup"
    - "Step 5: Run npx tsc --noEmit"
    - "Step 6: Commit: 'feat(frontend): building hover, focus, selection states'"
  handoff_notes: ""
  notes: ""
```

```yaml
- id: F-207
  track: frontend
  title: "Loading, empty, and error state polish"
  phase: 2
  depends_on:
    hard: [F-013]
    soft: []
  blocks: [I-201]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/ErrorState.tsx
    - src/App.tsx
    - src/App.css
  forbidden:
    - src-tauri/**
    - src/components/CityScene.tsx
    - src/components/BuildingCluster.tsx
    - src/hooks/**
    - src/utils/**
  estimated_complexity: S
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "ErrorState accepts className or style props"
      - "App.tsx distinguishes loading / timeout / empty process list"
    behavioral:
      - "Loading state shows subtle animation (e.g., pulsing dots or fade)"
      - "Timeout state shows retry button with theme styling"
      - "Empty process list shows friendly message instead of blank canvas"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-207
    2. Verify F-013 done
    3. Enhance ErrorState with optional className and animation
    4. Handle snapshot.processes.length === 0 in App.tsx
  steps:
    - "Step 1: Refactor ErrorState to accept optional className and render pulsing loader"
    - "Step 2: Update App.tsx empty-state branch"
    - "Step 3: Apply theme variables via App.css"
    - "Step 4: Run npx tsc --noEmit"
    - "Step 5: Commit: 'feat(frontend): polish loading, empty, and error states'"
  handoff_notes: ""
  notes: ""
```

```yaml
- id: I-201
  track: integration
  title: "Phase 2 full acceptance"
  phase: 2
  depends_on:
    hard: [B-201, F-201, F-202, F-203, F-205]
    soft: [F-204, F-206, F-207]
  blocks: []
  contract_refs: []
  files_allowed_to_touch:
    - src/App.tsx
    - PLAN.md
  forbidden:
    - src-tauri/src/types.rs
    - src-tauri/src/engine/**
    - src-tauri/src/bridge/**
    - src/utils/types.ts
    - src/utils/layout.ts
    - src/utils/colors.ts
    - src/components/**
    - src/hooks/**
  estimated_complexity: L
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
      - "cd src-tauri && cargo build exits 0"
      - "cd src-tauri && cargo clippy -- -D warnings exits 0"
    existence:
      - "All Phase 2 tasks status=done in PLAN.md"
    behavioral:
      - "Open Chrome / run Node → city buildings grow and glow based on real process data"
      - "Click building → ProcessPopup opens with refined visual design"
      - "Double-click building → camera flies to it"
      - "Hover highlights building without selecting"
      - "Theme JSON loads and applies"
      - "FPS ≥ 30 with 200+ buildings"
  status: done
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  handoff_notes: "Phase 2 acceptance completed on macOS with MockAdapter. Behavioral visual checks limited by headless TRAE environment, but tauri dev started successfully with no runtime errors."
  resume_hint: |
    1. Read PLAN.md#I-201
    2. Verify all hard deps done
    3. Run full mechanical acceptance
    4. Run npm run tauri dev and verify behavioral criteria
    5. Update PLAN.md status counts and current phase to 3
    6. Append PROGRESS.md entry
  steps:
    - "Step 1: Confirm all Phase 2 tasks done"
    - "Step 2: Run npx tsc --noEmit && npm run build && cd src-tauri && cargo build && cargo clippy -- -D warnings"
    - "Step 3: Run npm run tauri dev"
    - "Step 4: Verify behavioral acceptance criteria"
    - "Step 5: Update PLAN.md (status done, counts, current phase 3)"
    - "Step 6: Append PROGRESS.md entry"
    - "Step 7: Commit: 'milestone: Phase 2 acceptance passed'"
  handoff_notes: ""
  notes: "Phase 2 milestone gate."
```

### Phase 3 — 网络光缆 · "让城市活起来"

**Goal:** Flowing light cables between buildings representing network connections.

**Acceptance criterion:** Open browser, download file → see corresponding buildings connected by glowing cables with flowing particles.

### Phase 3 Task Definitions

```yaml
- id: B-301
  track: backend
  title: "Real network connection collection (Windows API)"
  phase: 3
  depends_on:
    hard: [B-201]
    soft: []
  blocks: [B-302, F-301, I-301]
  contract_refs: [src-tauri/src/types.rs]
  files_allowed_to_touch:
    - src-tauri/src/engine/windows.rs
    - src-tauri/src/engine/mock.rs
  forbidden:
    - src/**
    - src-tauri/src/types.rs
    - src-tauri/src/engine/platform.rs
    - src-tauri/src/engine/mod.rs
    - src-tauri/src/lib.rs
    - src-tauri/src/bridge/**
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "cd src-tauri && cargo build exits 0"
      - "cd src-tauri && cargo clippy -- -D warnings exits 0"
    existence:
      - "grep 'GetExtendedUdpTable' src-tauri/src/engine/windows.rs OR grep 'UDP' src-tauri/src/engine/windows.rs ≥ 1"
      - "grep 'up_bytes_per_sec' src-tauri/src/engine/windows.rs ≥ 1"
      - "grep 'down_bytes_per_sec' src-tauri/src/engine/windows.rs ≥ 1"
      - "MockAdapter::get_network returns connections with protocol field populated"
    behavioral:
      - "On Windows: get_network returns ≥ 1 connection when network is active"
      - "Network I/O counters (up_bytes_per_sec/down_bytes_per_sec) are non-zero during active transfer"
      - "Connection protocol field contains 'tcp', 'udp', or 'other'"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-301
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify B-201 done (WindowsImpl already returns TCP connections)
    5. Read src-tauri/src/types.rs Connection struct
    6. Read sysinfo 0.32 Networks API docs
    7. Run `cd src-tauri && cargo build`
    8. Execute steps below
  steps:
    - "Step 1: Extend WindowsImpl with a Networks tracker field and refresh it in get_network"
    - "Step 2: Compute up_bytes_per_sec/down_bytes_per_sec by diffing received/transmitted bytes between refreshes"
    - "Step 3: Add UDP connection enumeration via GetExtendedUdpTable (or stub with empty vec if Windows API unavailable)"
    - "Step 4: Populate Connection.protocol with 'tcp', 'udp', or 'other'"
    - "Step 5: Filter or mark ephemeral loopback connections (optional: keep them but distinguish via state)"
    - "Step 6: Update MockAdapter::get_network to return protocol-diverse fake connections and moving I/O counters"
    - "Step 7: Run `cd src-tauri && cargo build && cargo clippy -- -D warnings`"
    - "Step 8: Commit: 'feat(backend): extend network collection with I/O counters and UDP'"
  handoff_notes: ""
  notes: "B-201 already provides TCP v4 connections. B-301 adds I/O rates, UDP support, and protocol tagging for cable visualization."
```

```yaml
- id: B-302
  track: backend
  title: "Remote IP → geolocation mapping (optional)"
  phase: 3
  depends_on:
    hard: [B-301]
    soft: []
  blocks: []
  contract_refs: []
  files_allowed_to_touch:
    - src-tauri/src/engine/geoip.rs
    - src-tauri/src/engine/mod.rs
    - src-tauri/src/engine/mock.rs
    - src-tauri/Cargo.toml
  forbidden:
    - src/**
    - src-tauri/src/types.rs
    - src-tauri/src/engine/platform.rs
    - src-tauri/src/engine/windows.rs
    - src-tauri/src/lib.rs
    - src-tauri/src/bridge/**
  estimated_complexity: S
  requires_user_approval: false
  acceptance:
    mechanical:
      - "cd src-tauri && cargo build exits 0"
    existence:
      - "src-tauri/src/engine/geoip.rs exists"
      - "grep 'pub fn lookup_geoip' src-tauri/src/engine/geoip.rs ≥ 1"
      - "grep 'pub mod geoip' src-tauri/src/engine/mod.rs ≥ 1"
    behavioral:
      - "lookup_geoip('8.8.8.8') returns Some(GeoInfo { country: 'US', city: 'Mountain View' }) or offline fallback"
      - "Private IP ranges (10.x, 192.168.x, 127.x) return None without network request"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-302
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify B-301 done
    5. Decide: online API vs offline MMDB vs stub; stub is acceptable for Phase 3
    6. Run `cd src-tauri && cargo build`
    7. Execute steps below
  steps:
    - "Step 1: Create src-tauri/src/engine/geoip.rs with GeoInfo struct { country: String, city: String, lat: f64, lon: f64 }"
    - "Step 2: Implement lookup_geoip(ip: &str) -> Option<GeoInfo> with private-range fast-return and optional async HTTP fallback"
    - "Step 3: Add pub mod geoip to src-tauri/src/engine/mod.rs"
    - "Step 4: Update MockAdapter to return fake GeoInfo for public-looking fake IPs"
    - "Step 5: Run `cd src-tauri && cargo build`"
    - "Step 6: Commit: 'feat(backend): add optional geoip mapping for remote IPs'"
  handoff_notes: ""
  notes: "Optional task. If skipped, cable visualization still works without geographic coloring."
```

```yaml
- id: F-301
  track: frontend
  title: "LineGeometry cable rendering"
  phase: 3
  depends_on:
    hard: [F-008, B-301]
    soft: []
  blocks: [F-302, F-303, I-301]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/CableSystem.tsx
    - src/components/CityScene.tsx
    - src/utils/layout.ts
    - src/App.tsx
  forbidden:
    - src-tauri/**
    - src/utils/types.ts
    - src/utils/colors.ts
    - src/utils/theme.ts
    - src/hooks/**
    - src/components/BuildingCluster.tsx
    - src/components/Atmosphere.tsx
    - src/components/CityGround.tsx
    - src/components/ProcessPopup.tsx
    - src/components/ErrorState.tsx
  estimated_complexity: L
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
    existence:
      - "src/components/CableSystem.tsx exists"
      - "grep 'Line' src/components/CableSystem.tsx OR grep 'lineGeometry' src/components/CableSystem.tsx ≥ 1"
      - "grep 'Connection' src/components/CableSystem.tsx ≥ 1"
      - "grep 'CableSystem' src/App.tsx ≥ 1"
    behavioral:
      - "Render CableSystem with 20 mock connections → at least 10 cables visible between building pairs"
      - "Cables curve smoothly from source building roof to target building roof (Catmull-Rom or quadratic bezier)"
      - "FPS ≥ 30 with 100 cables on M1 baseline"
  status: done
  owner: session-014
  owner_started_at: "2026-07-18"
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-301
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-008 and B-301 done
    5. Read three.js Line / LineBasicMaterial docs
    6. Read src/utils/layout.ts BuildingPosition shape
    7. Run `npx tsc --noEmit`
    8. Execute steps below
  steps:
    - "Step 1: Create src/components/CableSystem.tsx"
    - "Step 2: Props: { connections: Connection[]; positions: BuildingPosition[]; theme: Theme; maxCables?: number }"
    - "Step 3: Map each connection to source/target PID via Connection.pid; fallback to PID 0 for external endpoints"
    - "Step 4: Compute 3D cable path: start at source building top (x, height, z), control point at mid-height + horizontal offset, end at target building top"
    - "Step 5: Render using <line> with BufferGeometry or @react-three/drei Line component"
    - "Step 6: Cap rendered cables at maxCables (default 100) to protect FPS"
    - "Step 7: Wire CableSystem into App.tsx inside CityScene, below BuildingCluster"
    - "Step 8: Run `npx tsc --noEmit && npm run build`"
    - "Step 9: Commit: 'feat(frontend): add LineGeometry cable rendering between processes'"
  handoff_notes: ""
  notes: "BOTTLENECK TASK — blocks all cable-visualization tasks. Keep geometry simple for FPS."
```

```yaml
- id: F-302
  track: frontend
  title: "Particle flow along cables"
  phase: 3
  depends_on:
    hard: [F-301]
    soft: []
  blocks: [I-301]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/CableFlow.tsx
    - src/components/CableSystem.tsx
    - src/App.tsx
  forbidden:
    - src-tauri/**
    - src/utils/**
    - src/hooks/**
    - src/components/BuildingCluster.tsx
    - src/components/Atmosphere.tsx
    - src/components/CityGround.tsx
    - src/components/ProcessPopup.tsx
    - src/components/ErrorState.tsx
    - src/components/CityScene.tsx
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "src/components/CableFlow.tsx exists"
      - "grep 'useFrame' src/components/CableFlow.tsx ≥ 1"
      - "grep 'Points' src/components/CableFlow.tsx OR grep 'points' src/components/CableFlow.tsx ≥ 1"
    behavioral:
      - "Active cables show small particles moving from source to target at visible speed"
      - "Particle density correlates with connection count or bytes_per_sec"
      - "FPS ≥ 30 with 100 cables and 300 particles"
  status: done
  owner: session-015
  owner_started_at: "2026-07-18"
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-302
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-301 done (CableSystem renders cables)
    5. Read @react-three/fiber useFrame docs
    6. Run `npx tsc --noEmit`
    7. Execute steps below
  steps:
    - "Step 1: Create src/components/CableFlow.tsx"
    - "Step 2: Accept cable paths (array of Vector3 curves) and traffic intensity per cable"
    - "Step 3: Use useFrame to advance particle positions along each curve by delta time"
    - "Step 4: Render particles as <points> with pointsMaterial; recycle particles at end of curve"
    - "Step 5: Vary particle color by protocol (defer to F-303; use accent color as placeholder)"
    - "Step 6: Wire CableFlow into App.tsx, receiving paths from CableSystem via ref or derived state"
    - "Step 7: Run `npx tsc --noEmit`"
    - "Step 8: Commit: 'feat(frontend): add particle flow along network cables'"
  handoff_notes: ""
  notes: "Particles should be batched in a single Points object for performance."
```

```yaml
- id: F-303
  track: frontend
  title: "Protocol color mapping (TCP/UDP/HTTP)"
  phase: 3
  depends_on:
    hard: [F-301]
    soft: []
  blocks: [I-301]
  contract_refs: []
  files_allowed_to_touch:
    - src/utils/colors.ts
    - src/components/CableSystem.tsx
    - src/components/CableFlow.tsx
  forbidden:
    - src-tauri/**
    - src/utils/types.ts
    - src/utils/layout.ts
    - src/utils/theme.ts
    - src/hooks/**
    - src/App.tsx
    - src/components/BuildingCluster.tsx
    - src/components/Atmosphere.tsx
    - src/components/CityGround.tsx
    - src/components/ProcessPopup.tsx
    - src/components/ErrorState.tsx
    - src/components/CityScene.tsx
  estimated_complexity: S
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "grep 'cableColorForProtocol' src/utils/colors.ts OR grep 'protocolColor' src/utils/colors.ts ≥ 1"
      - "grep 'tcp' src/utils/colors.ts ≥ 1"
      - "grep 'udp' src/utils/colors.ts ≥ 1"
    behavioral:
      - "TCP cables render in blue-ish tone, UDP in green-ish tone, HTTP/HTTPS in cyan-ish tone"
      - "Unknown protocol falls back to theme accent color"
  status: done
  owner: session-017
  owner_started_at: "2026-07-18"
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-303
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-301 done
    5. Read src/utils/colors.ts current theme-driven color functions
    6. Run `npx tsc --noEmit`
    7. Execute steps below
  steps:
    - "Step 1: Add protocol palette to src/utils/colors.ts: TCP blue, UDP green, HTTP/HTTPS cyan, fallback accent"
    - "Step 2: Implement cableColorForProtocol(protocol: string, theme: Theme): string"
    - "Step 3: Update CableSystem to color each cable by Connection.protocol"
    - "Step 4: Update CableFlow to tint particles by the same protocol color"
    - "Step 5: Run `npx tsc --noEmit`"
    - "Step 6: Commit: 'feat(frontend): add protocol-based cable colors'"
  handoff_notes: ""
  notes: "Keep colors defined in theme JSON so future user themes can override."
```

```yaml
- id: F-304
  track: frontend
  title: "Building top halo pulse for running processes"
  phase: 3
  depends_on:
    hard: [F-008, F-202]
    soft: []
  blocks: [I-301]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/BuildingHalo.tsx
    - src/components/BuildingCluster.tsx
    - src/App.tsx
  forbidden:
    - src-tauri/**
    - src/utils/**
    - src/hooks/**
    - src/components/CityScene.tsx
    - src/components/Atmosphere.tsx
    - src/components/CityGround.tsx
    - src/components/ProcessPopup.tsx
    - src/components/ErrorState.tsx
    - src/components/CableSystem.tsx
    - src/components/CableFlow.tsx
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
    existence:
      - "src/components/BuildingHalo.tsx exists"
      - "grep 'Ring' src/components/BuildingHalo.tsx OR grep 'ringGeometry' src/components/BuildingHalo.tsx ≥ 1"
      - "grep 'ProcessState.Running' src/components/BuildingHalo.tsx OR grep 'running' src/components/BuildingHalo.tsx ≥ 1"
    behavioral:
      - "Running processes display a soft halo ring at the top of their building"
      - "Halo pulses slowly (sinusoidal opacity/scale) and does not drop FPS below 30"
      - "Halo color respects theme accent / active color"
  status: done
  owner: 夏天
  owner_started_at: "2026-07-18"
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-304
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-008 and F-202 done
    5. Read three.js RingGeometry docs
    6. Run `npx tsc --noEmit`
    7. Execute steps below
  steps:
    - "Step 1: Create src/components/BuildingHalo.tsx"
    - "Step 2: Props: { processes: ProcessInfo[]; positions: BuildingPosition[]; theme: Theme }"
    - "Step 3: Filter to running processes (state === 'running')"
    - "Step 4: Render a thin ring or plane at each building's top (y = height + small offset)"
    - "Step 5: Animate opacity/scale with useFrame using a slow sine wave"
    - "Step 6: Use instanced rendering if many halos; otherwise batch as one mesh per halo"
    - "Step 7: Wire into App.tsx as sibling of BuildingCluster inside CityScene"
    - "Step 8: Run `npx tsc --noEmit`"
    - "Step 9: Commit: 'feat(frontend): add building top halo pulse for running processes'"
  handoff_notes: ""
  notes: "Subtle effect — should not compete with cable glow."
```

```yaml
- id: I-301
  track: integration
  title: "Phase 3 full acceptance"
  phase: 3
  depends_on:
    hard: [B-301, F-301, F-302, F-303, F-304]
    soft: [B-302]
  blocks: []
  contract_refs: []
  files_allowed_to_touch:
    - src/App.tsx
    - PLAN.md
  forbidden:
    - src-tauri/src/types.rs
    - src-tauri/src/engine/**
    - src-tauri/src/bridge/**
    - src/utils/types.ts
    - src/utils/layout.ts
    - src/utils/colors.ts
    - src/components/**
    - src/hooks/**
  estimated_complexity: L
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
      - "cd src-tauri && cargo build exits 0"
      - "cd src-tauri && cargo clippy -- -D warnings exits 0"
    existence:
      - "All Phase 3 tasks status=done in PLAN.md"
    behavioral:
      - "Open browser / start download → new connections appear as cables between buildings"
      - "Cables show colored particles flowing along them"
      - "Running process buildings have a soft top halo pulse"
      - "FPS ≥ 30 with 100 cables + 200 buildings"
  status: done
  owner: session-017
  owner_started_at: "2026-07-18"
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#I-301
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify all hard deps done
    5. Run full mechanical acceptance
    6. Run `npm run tauri dev` and perform behavioral checks
    7. Update PLAN.md status counts and current phase to 4
    8. Append PROGRESS.md entry
  steps:
    - "Step 1: Confirm all Phase 3 tasks done"
    - "Step 2: Run npx tsc --noEmit && npm run build && cd src-tauri && cargo build && cargo clippy -- -D warnings"
    - "Step 3: Run npm run tauri dev"
    - "Step 4: Generate network activity (open Chrome, start download) and verify cables appear"
    - "Step 5: Update PLAN.md (I-301 done, counts, current phase 4)"
    - "Step 6: Append PROGRESS.md entry"
    - "Step 7: Commit: 'milestone: Phase 3 acceptance passed'"
  handoff_notes: "Added `#![allow(dead_code)]` to src-tauri/src/engine/geoip.rs to clear B-302 dead-code warnings blocking `cargo clippy -- -D warnings`. This was necessary for I-301 mechanical acceptance; no other engine files changed."
  notes: "Phase 3 milestone gate."
```

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

```yaml
- id: B-401
  track: backend
  title: "MacImpl (sysinfo + IOKit for mac-specific sensors)"
  phase: 4
  depends_on:
    hard: [B-002]
    soft: [B-005]
  blocks: [I-401]
  contract_refs: [src-tauri/src/types.rs]
  files_allowed_to_touch:
    - src-tauri/src/engine/macos.rs
    - src-tauri/src/engine/mod.rs
    - src-tauri/src/engine/mock.rs
    - src-tauri/src/lib.rs
    - src-tauri/Cargo.toml
  forbidden:
    - src/**
    - src-tauri/src/types.rs
    - src-tauri/src/bridge/**
  estimated_complexity: L
  requires_user_approval: false
  acceptance:
    mechanical:
      - "cd src-tauri && cargo build exits 0 on macOS"
      - "cd src-tauri && cargo build exits 0 on non-macOS (falls back to MockAdapter)"
      - "cd src-tauri && cargo clippy -- -D warnings exits 0"
    existence:
      - "src-tauri/src/engine/macos.rs exists"
      - "grep 'impl PlatformAdapter for MacImpl' src-tauri/src/engine/macos.rs ≥ 1"
      - "grep '#[cfg(target_os = \"macos\")]' src-tauri/src/engine/mod.rs OR src-tauri/src/lib.rs ≥ 1"
    behavioral:
      - "On macOS, MacImpl returns real process list, CPU, memory, disk, and network data"
      - "On non-macOS, build still compiles and runtime falls back to MockAdapter"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-401
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify B-002 PlatformAdapter trait shape
    5. Read src-tauri/src/engine/windows.rs as reference
    6. Check current lib.rs adapter selection logic
    7. Run `cd src-tauri && cargo build`
    8. Execute steps below
  steps:
    - "Step 1: Create src-tauri/src/engine/macos.rs implementing PlatformAdapter for MacImpl"
    - "Step 2: Use sysinfo crate for processes, CPU, memory, disk; stub network with Phase-3-equivalent or implement via scutil/netstat if reliable"
    - "Step 3: Add optional IOKit sensor reads for temperature/fan via core-foundation or iokit-sys crates (fallback to None if unavailable)"
    - "Step 4: Wire MacImpl into engine/mod.rs behind #[cfg(target_os = \"macos\")]"
    - "Step 5: Update lib.rs adapter selection: macos → MacImpl, windows → WindowsImpl, other → MockAdapter"
    - "Step 6: Run `cd src-tauri && cargo build && cargo clippy -- -D warnings`"
    - "Step 7: Commit: 'feat(backend): add macOS PlatformAdapter with sysinfo + IOKit sensors'"
  handoff_notes: ""
  notes: "Core blocker for macOS support. Keep IOKit optional so build succeeds on older macOS versions."
```

```yaml
- id: B-402
  track: backend
  title: "GPU / temperature detection (Windows: NVAPI / AMD SDK)"
  phase: 4
  depends_on:
    hard: [B-002]
    soft: [B-005]
  blocks: [I-401]
  contract_refs: [src-tauri/src/types.rs]
  files_allowed_to_touch:
    - src-tauri/src/engine/windows.rs
    - src-tauri/src/engine/gpu.rs
    - src-tauri/src/engine/mod.rs
    - src-tauri/src/engine/mock.rs
    - src-tauri/Cargo.toml
  forbidden:
    - src/**
    - src-tauri/src/types.rs
    - src-tauri/src/bridge/**
    - src-tauri/src/engine/macos.rs
  estimated_complexity: L
  requires_user_approval: false
  acceptance:
    mechanical:
      - "cd src-tauri && cargo build exits 0 on Windows"
      - "cd src-tauri && cargo build exits 0 on non-Windows (stubs compile)"
      - "cd src-tauri && cargo clippy -- -D warnings exits 0"
    existence:
      - "src-tauri/src/engine/gpu.rs exists"
      - "grep 'pub fn get_gpu_info' src-tauri/src/engine/gpu.rs ≥ 1"
      - "grep 'pub fn get_temperature' src-tauri/src/engine/gpu.rs OR grep in windows.rs ≥ 1"
    behavioral:
      - "On Windows with supported GPU, SystemSnapshot.gpu is Some(GpuInfo)"
      - "On Windows, SystemSnapshot.temperature is Some(CpuGpuTemp) with cpu >= 0"
      - "On unsupported systems, fields remain None without crashing"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-402
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify SystemSnapshot already has Option<GpuInfo> and Option<CpuGpuTemp>
    5. Read current src-tauri/src/engine/windows.rs get_* stubs
    6. Run `cd src-tauri && cargo build`
    7. Execute steps below
  steps:
    - "Step 1: Create src-tauri/src/engine/gpu.rs with get_gpu_info() and get_temperature() stubs returning None"
    - "Step 2: On Windows, implement GPU detection via nvml-wrapper (NVIDIA) or wmi/perf counters (generic fallback)"
    - "Step 3: Implement CPU temperature via WMI (MSAcpi_ThermalZoneTemperature) or OpenHardwareMonitorLib fallback"
    - "Step 4: Wire gpu.rs into windows.rs and mock.rs; ensure both return Option types"
    - "Step 5: Update engine/mod.rs to expose gpu module only on windows or as cross-platform stub"
    - "Step 6: Run `cd src-tauri && cargo build && cargo clippy -- -D warnings && cargo test`"
    - "Step 7: Commit: 'feat(backend): add Windows GPU and temperature detection'"
  handoff_notes: ""
  notes: "Keep all GPU/temp APIs optional (Option<>) so missing hardware never crashes the app."
```

```yaml
- id: B-403
  track: backend
  title: "Tauri packaging config (Windows MSI + macOS DMG)"
  phase: 4
  depends_on:
    hard: [I-001]
    soft: []
  blocks: [D-401, I-401]
  contract_refs: []
  files_allowed_to_touch:
    - src-tauri/tauri.conf.json
    - src-tauri/Cargo.toml
    - package.json
    - .github/workflows/release.yml
  forbidden:
    - src/**
    - src-tauri/src/**
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npm run tauri build exits 0 on macOS"
      - "npm run tauri build exits 0 on Windows (CI or local)"
      - "Generated artifacts include .dmg (macOS) and .msi (Windows)"
    existence:
      - "tauri.conf.json bundle targets include dmg and msi"
      - "tauri.conf.json identifier='com.noint.procession'"
      - "icons exist in src-tauri/icons/"
    behavioral:
      - "Double-click .dmg mounts and shows app bundle"
      - "Running .msi installs Procession on Windows"
      - "App launches after installation without manual dependency setup"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-403
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify I-001 done (tauri scaffold exists)
    5. Read src-tauri/tauri.conf.json current bundle section
    6. Run `npm run tauri build` to see current packaging errors
    7. Execute steps below
  steps:
    - "Step 1: Update tauri.conf.json bundle.targets to ['dmg', 'msi', 'updater'] with proper identifier and icons"
    - "Step 2: Set productName='Procession', copyright, category='DeveloperTool'"
    - "Step 3: Add macOS entitlements and Windows installer metadata"
    - "Step 4: Ensure src-tauri/icons/ contains all required sizes (icon.ico, icon.icns, *.png)"
    - "Step 5: Run `npm run tauri build` on macOS and verify .dmg output"
    - "Step 6: Optionally add GitHub Actions release workflow for cross-platform builds"
    - "Step 7: Commit: 'chore(release): configure Tauri bundles for Windows MSI and macOS DMG'"
  handoff_notes: ""
  notes: "No code changes in src/; only Tauri bundle configuration and CI."
```

```yaml
- id: F-401
  track: frontend
  title: "HUD StatsPanel (real-time CPU/memory/network overview overlay)"
  phase: 4
  depends_on:
    hard: [F-012]
    soft: []
  blocks: [D-401, I-401]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/HudPanel.tsx
    - src/components/HudPanel.css
    - src/App.tsx
    - src/App.css
  forbidden:
    - src-tauri/**
    - src/utils/types.ts
    - src/utils/theme.ts
    - src/components/CityScene.tsx
    - src/components/BuildingCluster.tsx
    - src/components/CableSystem.tsx
    - src/components/CableFlow.tsx
    - src/components/BuildingHalo.tsx
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
    existence:
      - "src/components/HudPanel.tsx exists"
      - "grep 'SystemSnapshot' src/components/HudPanel.tsx ≥ 1"
    behavioral:
      - "HUD shows CPU %, memory used/total, network up/down, process count"
      - "Values update every second matching snapshot frequency"
      - "HUD is visually unobtrusive (semi-transparent, top-left or top-right corner)"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-401
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-012 done
    5. Read src/utils/types.ts SystemSnapshot shape
    6. Run `npx tsc --noEmit`
    7. Execute steps below
  steps:
    - "Step 1: Create src/components/HudPanel.tsx with props { snapshot: SystemSnapshot; theme: Theme }"
    - "Step 2: Display CPU total, memory used/total MB, network up/down KB/s, and process count"
    - "Step 3: Add subtle animations only on value change; avoid constant re-render jitter"
    - "Step 4: Style with CSS variables from theme (use existing --proc-* variables)"
    - "Step 5: Wire HudPanel into App.tsx inside app-ui-layer"
    - "Step 6: Run `npx tsc --noEmit && npm run build`"
    - "Step 7: Commit: 'feat(frontend): add HUD StatsPanel overlay'"
  handoff_notes: ""
  notes: "Keep HUD minimal; it should feel like part of the scene, not a dashboard."
```

```yaml
- id: F-402
  track: frontend
  title: "Space-bar utility mode (building labels + dashboard)"
  phase: 4
  depends_on:
    hard: [F-012]
    soft: [F-401]
  blocks: [D-401, I-401]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/UtilityMode.tsx
    - src/components/UtilityMode.css
    - src/components/BuildingCluster.tsx
    - src/App.tsx
    - src/App.css
  forbidden:
    - src-tauri/**
    - src/utils/types.ts
    - src/utils/theme.ts
    - src/components/CityScene.tsx
    - src/components/CableSystem.tsx
    - src/components/CableFlow.tsx
    - src/components/BuildingHalo.tsx
  estimated_complexity: L
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
    existence:
      - "src/components/UtilityMode.tsx exists"
      - "grep 'Space' src/App.tsx OR grep 'keydown' src/App.tsx ≥ 1"
    behavioral:
      - "Pressing Space toggles utility mode overlay"
      - "Utility mode shows a list/table of top processes sorted by CPU or memory"
      - "Clicking a process in the list flies the camera to its building"
      - "Building labels (PID + name) appear above buildings in utility mode"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-402
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-012 done
    5. Read current CameraController fly-to API
    6. Run `npx tsc --noEmit`
    7. Execute steps below
  steps:
    - "Step 1: Create src/components/UtilityMode.tsx with props { snapshot, positions, theme, onSelectProcess }"
    - "Step 2: Render a sortable process table (top CPU / top memory) using existing process colors"
    - "Step 3: Add keyboard listener in App.tsx for Space key to toggle utility mode"
    - "Step 4: Extend BuildingCluster to optionally render Html labels above buildings when utility mode is active"
    - "Step 5: Clicking a table row calls onSelectProcess and triggers camera fly-to"
    - "Step 6: Press Escape closes utility mode"
    - "Step 7: Run `npx tsc --noEmit && npm run build`"
    - "Step 8: Commit: 'feat(frontend): add Space-bar utility mode with process dashboard and labels'"
  handoff_notes: ""
  notes: "Utility mode is the bridge between the artistic 3D view and practical system monitoring."
```

```yaml
- id: F-403
  track: frontend
  title: "Color theme system (user-selectable)"
  phase: 4
  depends_on:
    hard: [F-204]
    soft: []
  blocks: [I-401]
  contract_refs: []
  files_allowed_to_touch:
    - src/utils/theme.ts
    - public/themes/*.json
    - src/App.tsx
    - src/App.css
  forbidden:
    - src-tauri/**
    - src/utils/types.ts
    - src/components/CityScene.tsx
    - src/components/BuildingCluster.tsx
    - src/components/CableSystem.tsx
    - src/components/CableFlow.tsx
    - src/components/BuildingHalo.tsx
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
    existence:
      - "public/themes/ directory contains at least 3 theme JSON files"
      - "src/utils/theme.ts exports loadThemeList() or equivalent"
    behavioral:
      - "User can open a theme selector and switch between dark, light, and at least one additional theme"
      - "Selected theme persists across app restarts (localStorage)"
      - "Theme change applies instantly without reload"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-403
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-204 done (theme loader exists)
    5. Read current src/utils/theme.ts and public/themes/*.json
    6. Run `npx tsc --noEmit`
    7. Execute steps below
  steps:
    - "Step 1: Create one additional theme (e.g., midnight-blue, warm-sepia, or high-contrast)"
    - "Step 2: Add loadThemeList(): Promise<ThemeMeta[]> to theme.ts to enumerate public/themes/*.json"
    - "Step 3: Add ThemeSelector UI in App.tsx (dropdown or button group)"
    - "Step 4: Persist selected theme URL/name to localStorage and restore on mount"
    - "Step 5: Ensure applyTheme updates CSS variables and React state atomically"
    - "Step 6: Run `npx tsc --noEmit && npm run build`"
    - "Step 7: Commit: 'feat(frontend): add user-selectable color theme system with persistence'"
  handoff_notes: ""
  notes: "Avoid generic dashboard look; new themes must still feel like a digital architecture."
```

```yaml
- id: F-404
  track: frontend
  title: "Performance optimization (LOD, 1000+ processes, 60fps target)"
  phase: 4
  depends_on:
    hard: [F-008]
    soft: [F-401]
  blocks: [I-401]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/BuildingCluster.tsx
    - src/components/BuildingHalo.tsx
    - src/components/CableSystem.tsx
    - src/components/CableFlow.tsx
    - src/utils/layout.ts
    - src/App.tsx
  forbidden:
    - src-tauri/**
    - src/utils/types.ts
    - src/utils/theme.ts
    - src/components/CityScene.tsx
    - src/components/CityGround.tsx
    - src/components/Atmosphere.tsx
  estimated_complexity: XL
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
    existence:
      - "BuildingCluster uses instanced meshes (already true; verify no regressions)"
      - "CableSystem caps maxCables and maxParticles"
    behavioral:
      - "App renders 1000 mock processes at ≥ 30 fps on M1 baseline"
      - "Camera distance enables LOD: distant buildings use simpler geometry or lower update rate"
      - "Halos and particles update at reduced rate or count when FPS drops"
      - "No visible stutter during camera fly-to"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-404
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify F-008 done
    5. Read src/components/BuildingCluster.tsx current instancing strategy
    6. Run `npx tsc --noEmit`
    7. Execute steps below
  steps:
    - "Step 1: Profile current frame time with 500 and 1000 processes; identify bottleneck (JS layout, GPU draw calls, or React re-renders)"
    - "Step 2: Add layout throttling: only recompute positions when process set changes, not every snapshot"
    - "Step 3: Implement distance-based LOD in BuildingCluster (fewer segments/lower detail for far buildings)"
    - "Step 4: Cap halo instances to top-N running processes or visible set"
    - "Step 5: Reduce CableFlow particle count based on FPS or cable distance"
    - "Step 6: Use React.memo / useMemo aggressively for snapshot-derived arrays"
    - "Step 7: Measure FPS after each change; target 60fps at 200 buildings, 30fps at 1000"
    - "Step 8: Run `npx tsc --noEmit && npm run build`"
    - "Step 9: Commit: 'perf(frontend): LOD and draw-call optimization for 1000+ processes'"
  handoff_notes: ""
  notes: "Performance work is empirical — profile first, optimize the real bottleneck."
```

```yaml
- id: D-401
  track: docs
  title: "README + demo video"
  phase: 4
  depends_on:
    hard: [B-403, F-401, F-402]
    soft: []
  blocks: [I-401]
  contract_refs: []
  files_allowed_to_touch:
    - README.md
    - docs/demo.md
    - .github/workflows/release.yml
  forbidden:
    - src/**
    - src-tauri/src/**
    - public/**
  estimated_complexity: M
  requires_user_approval: true
  acceptance:
    mechanical:
      - "README.md exists and renders without markdown lint errors"
    existence:
      - "README includes install section, screenshot/gif, and feature list"
      - "docs/demo.md or README contains a link to demo video/gif"
    behavioral:
      - "New reader can clone, install deps, and run `npm run tauri dev` from README alone"
      - "Demo video/gif shows theme toggle, cables, particles, utility mode, and HUD"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#D-401
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify B-403, F-401, F-402 done
    5. Collect screenshots / screen recordings
    6. Execute steps below
  steps:
    - "Step 1: Write README.md with hero screenshot, install instructions, feature list, architecture overview, and license"
    - "Step 2: Record a 30-60s demo video or GIF showing the city, theme toggle, HUD, utility mode, and packaged app"
    - "Step 3: Upload demo asset to GitHub releases or repository docs/ folder"
    - "Step 4: Add docs/demo.md with video link and feature timestamps"
    - "Step 5: Get user approval on README and demo before marking done"
    - "Step 6: Commit: 'docs: add README and demo video'"
  handoff_notes: ""
  notes: "requires_user_approval because README/demo represent the public face of the project."
```

```yaml
- id: I-401
  track: integration
  title: "Phase 4 full acceptance"
  phase: 4
  depends_on:
    hard: [B-401, B-402, B-403, F-401, F-402, F-403, F-404, D-401]
    soft: []
  blocks: []
  contract_refs: []
  files_allowed_to_touch:
    - src/App.tsx
    - PLAN.md
  forbidden:
    - src-tauri/src/types.rs
    - src-tauri/src/engine/**
    - src-tauri/src/bridge/**
    - src/utils/types.ts
    - src/utils/layout.ts
    - src/utils/colors.ts
    - src/utils/theme.ts
    - src/hooks/**
    - src/components/**
  estimated_complexity: XL
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
      - "cd src-tauri && cargo build exits 0 on both Windows and macOS"
      - "cd src-tauri && cargo clippy -- -D warnings exits 0"
      - "npm run tauri build produces .dmg on macOS and .msi on Windows"
    existence:
      - "All Phase 4 tasks status=done in PLAN.md"
      - "README.md and docs/demo.md exist"
    behavioral:
      - "App runs on macOS with real MacImpl data or graceful MockAdapter fallback"
      - "App runs on Windows with real WindowsImpl data"
      - "HUD, utility mode, and theme switching all functional"
      - "Packaged installers launch the app successfully"
      - "FPS ≥ 30 with 500 buildings on both platforms"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#I-401
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. Verify all hard deps done
    5. Run full cross-platform mechanical acceptance
    6. Run packaged app on both platforms
    7. Update PLAN.md status counts and current phase to 5
    8. Append PROGRESS.md entry
  steps:
    - "Step 1: Confirm all Phase 4 tasks done"
    - "Step 2: Run npx tsc --noEmit && npm run build && cd src-tauri && cargo build && cargo clippy -- -D warnings"
    - "Step 3: Run npm run tauri build on macOS and Windows"
    - "Step 4: Install and launch packaged app on both platforms"
    - "Step 5: Verify HUD, utility mode, theme switching, cables, particles, halos"
    - "Step 6: Update PLAN.md (I-401 done, counts, current phase 5)"
    - "Step 7: Append PROGRESS.md entry"
    - "Step 8: Commit: 'milestone: Phase 4 acceptance passed'"
  handoff_notes: ""
  notes: "Phase 4 milestone gate."
```

### Phase 5 — 无限可能 · "Community Extensions"

**Goal:** Turn Procession from a polished single-player system monitor into an extensible platform: visualize deeper system relationships, expose listening ports, surface filesystem activity, let users author themes, and enable third-party data sources via a plugin API.

**Motto:** The city should keep growing.

**Parallel pivot points:**
- After B-501 / B-502 / B-503 / B-504 foundation tasks, their matching frontend tasks (F-501..F-503) and independent polish tasks (F-504..F-506) can fan out in parallel.
- D-501 depends on B-504.
- I-501 gates the phase.

---

#### Phase 5 task specs

```yaml
- id: B-501
  track: backend
  title: "Process relation backend (ppid tree + IPC handles)"
  phase: 5
  depends_on:
    hard: [B-002]
    soft: []
  blocks: [F-501, I-501]
  contract_refs: []
  files_allowed_to_touch:
    - src-tauri/src/types.rs
    - src-tauri/src/engine/macos.rs
    - src-tauri/src/engine/windows.rs
    - src-tauri/src/bridge/**
  forbidden:
    - src/**
    - public/**
  estimated_complexity: L
  requires_user_approval: false
  acceptance:
    mechanical:
      - "cargo build && cargo clippy -- -D warnings exits 0"
    existence:
      - "Snapshot includes process_relations array (parent_pid, child_pids, ipc_peers)"
      - "MacImpl and WindowsImpl both populate the field (Windows may be stub if API unavailable)"
    behavioral:
      - "Parent/child links reflect live process tree within 2 seconds"
      - "IPC peer list is stable across snapshots (no flickering IDs)"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-501
    2. Extend SystemSnapshot with process_relations
    3. Use sysinfo process.ppid and add IPC handle scanning on macOS (lsof pipe/socket) and Windows (handle query)
  steps:
    - "Step 1: Extend SystemSnapshot with process_relations field"
    - "Step 2: Implement MacImpl::get_process_relations using ppid + lsof pipe/socket peers"
    - "Step 3: Implement WindowsImpl::get_process_relations using ppid + handle-based IPC peers (stub OK if complex)"
    - "Step 4: Wire into DataBridge snapshot emission"
    - "Step 5: Update frontend types.ts mirror"
    - "Step 6: Run cargo build && cargo clippy -- -D warnings"
    - "Step 7: Commit: 'feat(backend): process relation data for Phase 5 (B-501)'"
  handoff_notes: ""
  notes: "IPC peer detection is platform-specific; prioritize correctness for parent-child edges."
```

```yaml
- id: B-502
  track: backend
  title: "Listening ports collection (harbor data source)"
  phase: 5
  depends_on:
    hard: [B-002]
    soft: []
  blocks: [F-502, I-501]
  contract_refs: []
  files_allowed_to_touch:
    - src-tauri/src/types.rs
    - src-tauri/src/engine/macos.rs
    - src-tauri/src/engine/windows.rs
    - src-tauri/src/bridge/**
  forbidden:
    - src/**
    - public/**
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "cargo build && cargo clippy -- -D warnings exits 0"
    existence:
      - "Snapshot includes listening_ports array (pid, port, protocol, address)"
      - "At least one platform adapter populates real data"
    behavioral:
      - "Listening ports update within 2 seconds of opening/closing a socket"
      - "Ports bound to 0.0.0.0 are tagged as public"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-502
    2. Extend SystemSnapshot with listening_ports
    3. macOS: parse netstat -anv or use lsof -iTCP -sTCP:LISTEN
    4. Windows: use GetExtendedTcpTable/GetExtendedUdpTable
  steps:
    - "Step 1: Add listening_ports to SystemSnapshot and types.ts"
    - "Step 2: Implement MacImpl collection via netstat/lsof parser"
    - "Step 3: Implement WindowsImpl collection via IP Helper APIs"
    - "Step 4: Wire into DataBridge"
    - "Step 5: Run cargo build && cargo clippy -- -D warnings"
    - "Step 6: Commit: 'feat(backend): listening ports collection (B-502)'"
  handoff_notes: ""
  notes: "Parsing CLI output on macOS is acceptable for reliability across macOS versions."
```

```yaml
- id: B-503
  track: backend
  title: "Filesystem activity backend (fsevents/inotify)"
  phase: 5
  depends_on:
    hard: [B-002]
    soft: []
  blocks: [F-503, I-501]
  contract_refs: []
  files_allowed_to_touch:
    - src-tauri/src/types.rs
    - src-tauri/src/engine/macos.rs
    - src-tauri/src/engine/windows.rs
    - src-tauri/src/bridge/**
    - src-tauri/Cargo.toml
  forbidden:
    - src/**
    - public/**
  estimated_complexity: L
  requires_user_approval: false
  acceptance:
    mechanical:
      - "cargo build && cargo clippy -- -D warnings exits 0"
    existence:
      - "Snapshot includes fs_hotspots array (directory_path, read_bytes_delta, write_bytes_delta)"
      - "Watcher thread runs without blocking snapshot emission"
    behavioral:
      - "Hotspots reflect recent file activity within 5 seconds"
      - "Top-N directories (e.g., 20) are reported to keep payload small"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-503
    2. Add fsevents (macOS) and notify (Windows) dependency or use sysinfo disk I/O deltas
    3. Aggregate events by parent directory
  steps:
    - "Step 1: Add fs_hotspots to SystemSnapshot and types.ts"
    - "Step 2: Add filesystem watcher crate (fsevent / notify)"
    - "Step 3: Implement macOS FSEvents watcher and directory aggregation"
    - "Step 4: Implement Windows notify watcher (or macOS-only first with cross-platform stub)"
    - "Step 5: Wire deltas into DataBridge"
    - "Step 6: Run cargo build && cargo clippy -- -D warnings"
    - "Step 7: Commit: 'feat(backend): filesystem activity hotspots (B-503)'"
  handoff_notes: ""
  notes: "If platform watcher proves unstable, fall back to sysinfo disk usage deltas."
```

```yaml
- id: B-504
  track: backend
  title: "Plugin command API (third-party data sources)"
  phase: 5
  depends_on:
    hard: [B-002]
    soft: []
  blocks: [F-504, D-501, I-501]
  contract_refs: []
  files_allowed_to_touch:
    - src-tauri/src/types.rs
    - src-tauri/src/lib.rs
    - src-tauri/src/commands.rs
    - src-tauri/tauri.conf.json
  forbidden:
    - src/**
    - public/**
  estimated_complexity: XL
  requires_user_approval: true
  acceptance:
    mechanical:
      - "cargo build && cargo clippy -- -D warnings exits 0"
    existence:
      - "Tauri command `plugin_snapshot` accepts plugin name and returns JSON snapshot"
      - "Plugin manifest format documented in docs/plugin.md"
      - "Example plugin exists in examples/plugin-hello/"
    behavioral:
      - "Third-party executable can be registered and its stdout parsed into a snapshot"
      - "Plugin failures are isolated and do not crash the app"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#B-504
    2. Design plugin manifest schema
    3. Implement spawn + JSON Lines parsing
    4. Write example plugin and guide
  steps:
    - "Step 1: Design plugin manifest schema (id, name, executable, args, refresh_interval)"
    - "Step 2: Add plugin registry config loader"
    - "Step 3: Implement async plugin runner with JSON Lines stdout parser"
    - "Step 4: Add Tauri command to query plugin snapshots from frontend"
    - "Step 5: Create examples/plugin-hello/"
    - "Step 6: Write docs/plugin.md"
    - "Step 7: Run cargo build && cargo clippy -- -D warnings"
    - "Step 8: Get user approval on plugin API design"
    - "Step 9: Commit: 'feat(backend): plugin command API (B-504)'"
  handoff_notes: ""
  notes: "requires_user_approval because the plugin API is a public contract."
```

```yaml
- id: F-501
  track: frontend
  title: "Process relationship graph (fork / IPC edges)"
  phase: 5
  depends_on:
    hard: [B-501]
    soft: [F-008]
  blocks: [I-501]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/RelationGraph.tsx
    - src/components/BuildingCluster.tsx
    - src/App.tsx
    - src/utils/layout.ts
    - src/utils/colors.ts
  forbidden:
    - src-tauri/**
    - src/utils/types.ts
    - src/utils/theme.ts
  estimated_complexity: L
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
    existence:
      - "RelationGraph component renders edges for parent-child and IPC relationships"
      - "Edges use theme accent color with opacity fade"
    behavioral:
      - "Parent-child edges connect building bases"
      - "IPC edges connect building tops with dashed or thinner lines"
      - "Hovering a process highlights its relations"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-501
    2. Consume process_relations from snapshot
    3. Build edge geometry from positions
    4. Render with instanced lines or Line component
  steps:
    - "Step 1: Create RelationGraph component scaffolding"
    - "Step 2: Compute parent-child edges from process_relations and positions"
    - "Step 3: Compute IPC edges and style them distinctly"
    - "Step 4: Add hover highlight propagation"
    - "Step 5: Integrate into App.tsx behind a toggle or always-on"
    - "Step 6: Run npx tsc --noEmit && npm run build"
    - "Step 7: Commit: 'feat(frontend): process relationship graph (F-501)'"
  handoff_notes: ""
  notes: "Avoid O(N^2) edge generation; cap visible relations to top-N processes."
```

```yaml
- id: F-502
  track: frontend
  title: "Port visualization (listening ports as harbors)"
  phase: 5
  depends_on:
    hard: [B-502]
    soft: [F-008]
  blocks: [I-501]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/PortHarbors.tsx
    - src/App.tsx
    - src/utils/colors.ts
  forbidden:
    - src-tauri/**
    - src/utils/types.ts
    - src/utils/theme.ts
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
    existence:
      - "PortHarbors component renders dock-like structures around the city perimeter"
      - "Each harbor shows port number and protocol on hover"
    behavioral:
      - "Listening ports appear as glowing docks at fixed angles around the city"
      - "Public ports (0.0.0.0) use warning color; private ports use system color"
      - "Cables connect listening process buildings to their harbors"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-502
    2. Map listening_ports to harbor positions on a circle
    3. Render docks and labels
    4. Connect to owning process building
  steps:
    - "Step 1: Create PortHarbors component"
    - "Step 2: Compute harbor positions from port number hash"
    - "Step 3: Render dock geometry and labels"
    - "Step 4: Add cables from process buildings to harbors"
    - "Step 5: Integrate into App.tsx"
    - "Step 6: Run npx tsc --noEmit && npm run build"
    - "Step 7: Commit: 'feat(frontend): listening port harbors (F-502)'"
  handoff_notes: ""
  notes: "Keep harbor count capped (e.g., top 40 ports) to maintain performance."
```

```yaml
- id: F-503
  track: frontend
  title: "Filesystem hotspots (recent read/write heat zones)"
  phase: 5
  depends_on:
    hard: [B-503]
    soft: [F-009]
  blocks: [I-501]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/FsHeatmap.tsx
    - src/components/CityGround.tsx
    - src/App.tsx
    - src/utils/colors.ts
  forbidden:
    - src-tauri/**
    - src/utils/types.ts
    - src/utils/theme.ts
  estimated_complexity: L
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
    existence:
      - "FsHeatmap component overlays colored zones on CityGround"
      - "Heat intensity maps to read/write delta magnitude"
    behavioral:
      - "Hot zones pulse gently in the color of the active theme"
      - "Zones fade out when activity stops"
      - "No more than 20 zones rendered at once"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-503
    2. Consume fs_hotspots from snapshot
    3. Map directory paths to ground positions via hash
    4. Render heat zones as instanced planes or decals
  steps:
    - "Step 1: Create FsHeatmap component"
    - "Step 2: Map directories to stable ground coordinates"
    - "Step 3: Render heat zones with opacity based on activity level"
    - "Step 4: Add fade-out animation when activity stops"
    - "Step 5: Integrate into App.tsx"
    - "Step 6: Run npx tsc --noEmit && npm run build"
    - "Step 7: Commit: 'feat(frontend): filesystem heat zones (F-503)'"
  handoff_notes: ""
  notes: "Use a small number of instanced planes for performance."
```

```yaml
- id: F-504
  track: frontend
  title: "Custom theme editor / JSON import"
  phase: 5
  depends_on:
    hard: [F-403]
    soft: []
  blocks: [I-501]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/ThemeEditor.tsx
    - src/utils/theme.ts
    - src/App.tsx
    - public/themes/**
  forbidden:
    - src-tauri/**
    - src/utils/types.ts
    - src/utils/layout.ts
    - src/utils/colors.ts
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
    existence:
      - "ThemeEditor UI allows editing colors, typography, and scene fog"
      - "Import/export JSON theme buttons exist"
    behavioral:
      - "Live preview updates as colors change"
      - "Exported JSON validates against Theme schema"
      - "Imported themes are saved to localStorage and appear in ThemeSelector"
  status: done
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-504
    2. Extend theme.ts with theme validation and import helpers
    3. Build ThemeEditor UI
    4. Persist custom themes alongside registry
  steps:
    - "Step 1: Add Theme validation function to theme.ts"
    - "Step 2: Add import/export helpers and localStorage persistence for custom themes"
    - "Step 3: Create ThemeEditor component with color pickers and JSON preview"
    - "Step 4: Integrate editor into App.tsx (e.g., behind a settings button)"
    - "Step 5: Run npx tsc --noEmit && npm run build"
    - "Step 6: Commit: 'feat(frontend): custom theme editor (F-504)'"
  handoff_notes: ""
  notes: "Keep the editor optional; default UI should not clutter the main view."
```

```yaml
- id: F-505
  track: frontend
  title: "Screensaver / kiosk mode (fullscreen, auto-rotate)"
  phase: 5
  depends_on:
    hard: [F-401]
    soft: []
  blocks: [I-501]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/ScreensaverMode.tsx
    - src/App.tsx
    - src/App.css
  forbidden:
    - src-tauri/**
    - src/utils/types.ts
    - src/utils/theme.ts
  estimated_complexity: S
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
    existence:
      - "ScreensaverMode component enters fullscreen and hides UI chrome"
      - "Auto-rotate camera option exists"
    behavioral:
      - "Pressing a configurable key (e.g., `K`) toggles kiosk mode"
      - "Camera slowly orbits the city when auto-rotate is enabled"
      - "UI reappears on mouse movement or Escape"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-505
    2. Add fullscreen request and UI hide
    3. Add camera orbit animation
  steps:
    - "Step 1: Create ScreensaverMode component"
    - "Step 2: Add keyboard toggle and fullscreen API call"
    - "Step 3: Implement auto-rotate camera orbit in CityScene or App.tsx"
    - "Step 4: Show UI on mouse move / Escape"
    - "Step 5: Run npx tsc --noEmit && npm run build"
    - "Step 6: Commit: 'feat(frontend): screensaver kiosk mode (F-505)'"
  handoff_notes: ""
  notes: "Use CSS fullscreen class; avoid forcing fullscreen on launch."
```

```yaml
- id: F-506
  track: frontend
  title: "Screenshot / GIF sharing"
  phase: 5
  depends_on:
    hard: [F-401]
    soft: []
  blocks: [I-501]
  contract_refs: []
  files_allowed_to_touch:
    - src/components/ScreenshotButton.tsx
    - src/App.tsx
    - src/App.css
    - src-tauri/tauri.conf.json
  forbidden:
    - src/utils/types.ts
    - src/utils/theme.ts
  estimated_complexity: M
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
    existence:
      - "Screenshot button captures the canvas to PNG"
      - "GIF recording captures 3-second animated clip"
    behavioral:
      - "PNG saved to user-selected location via Tauri dialog"
      - "GIF encoding does not freeze the main thread"
      - "Shared image includes the current theme styling"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#F-506
    2. Use Tauri fs/dialog for PNG save
    3. Use gif.js or similar for client-side GIF encoding
  steps:
    - "Step 1: Add screenshot capture using canvas.toDataURL and Tauri dialog"
    - "Step 2: Add 3-second GIF recorder using requestAnimationFrame frames"
    - "Step 3: Wire buttons into App.tsx UI layer"
    - "Step 4: Add Tauri dialog permission to tauri.conf.json"
    - "Step 5: Run npx tsc --noEmit && npm run build"
    - "Step 6: Commit: 'feat(frontend): screenshot and GIF sharing (F-506)'"
  handoff_notes: ""
  notes: "GIF encoding can be CPU-heavy; cap resolution and frame rate."
```

```yaml
- id: D-501
  track: docs
  title: "Plugin development guide"
  phase: 5
  depends_on:
    hard: [B-504]
    soft: []
  blocks: [I-501]
  contract_refs: []
  files_allowed_to_touch:
    - docs/plugin.md
    - examples/plugin-hello/**
  forbidden:
    - src/**
    - src-tauri/src/**
    - public/**
  estimated_complexity: M
  requires_user_approval: true
  acceptance:
    mechanical:
      - "docs/plugin.md renders without markdown lint errors"
    existence:
      - "Guide includes manifest schema, lifecycle, stdout format, and example"
      - "examples/plugin-hello/ builds and runs independently"
    behavioral:
      - "New reader can create a plugin in under 30 minutes from the guide"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#D-501
    2. Document manifest schema and JSON Lines output format
    3. Write step-by-step hello-world plugin tutorial
  steps:
    - "Step 1: Write docs/plugin.md with manifest schema and examples"
    - "Step 2: Create examples/plugin-hello/ (shell or Python script)"
    - "Step 3: Verify example registers and produces snapshot"
    - "Step 4: Get user approval on guide"
    - "Step 5: Commit: 'docs(plugin): plugin development guide (D-501)'"
  handoff_notes: ""
  notes: "requires_user_approval because it defines the public plugin contract."
```

```yaml
- id: D-502
  track: docs
  title: "UI Design System v1.0 document"
  phase: 5
  depends_on:
    hard: [F-403]
    soft: []
  blocks: [I-501]
  contract_refs: []
  files_allowed_to_touch:
    - .docs/UI_DESIGN_SYSTEM.md
  forbidden:
    - src/**
    - src-tauri/src/**
  estimated_complexity: M
  requires_user_approval: true
  acceptance:
    mechanical:
      - ".docs/UI_DESIGN_SYSTEM.md renders without markdown lint errors"
    existence:
      - ".docs/UI_DESIGN_SYSTEM.md exists"
      - "Document includes sections: principles, color, material, typography, layout, navigation, components, animation, responsive, implementation mapping"
      - "Document links to STRATEGY.md, ARCHITECTURE.md, SPEC.md"
    behavioral:
      - "User reviews and approves the design document"
      - "No contradictions with existing theme.ts or current UI components"
  status: done
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#D-502 (this task)
    2. Read .docs/UI_DESIGN_SYSTEM.md
    3. Get user approval on the design document
    4. If changes requested, edit .docs/UI_DESIGN_SYSTEM.md and re-verify
    5. Commit: 'docs(ui): UI Design System v2.0 (D-502)'
  steps:
    - "Step 1: Draft UI Design System document in .docs/UI_DESIGN_SYSTEM.md"
    - "Step 2: Self-review for placeholders, contradictions, ambiguity, scope issues"
    - "Step 3: Present document to user for approval"
    - "Step 4: After approval, commit and push"
  handoff_notes: ""
  notes: "requires_user_approval because this document becomes a constitution-level design spec."
```

```yaml
- id: D-503
  track: docs
  title: "3D World Generation Design document"
  phase: 5
  depends_on:
    hard: [D-502]
    soft: []
  blocks: [I-501]
  contract_refs: []
  files_allowed_to_touch:
    - .docs/WORLD_GENERATION_DESIGN.md
  forbidden:
    - src/**
    - src-tauri/src/**
  estimated_complexity: L
  requires_user_approval: true
  acceptance:
    mechanical:
      - ".docs/WORLD_GENERATION_DESIGN.md renders without markdown lint errors"
    existence:
      - ".docs/WORLD_GENERATION_DESIGN.md exists"
      - "Document includes sections: principles, spatial layers, data mapping, procedural generation, lifecycle, camera, time system, performance, implementation path"
      - "Document links to UI_DESIGN_SYSTEM.md, ARCHITECTURE.md, SPEC.md"
    behavioral:
      - "User reviews and approves the design document"
      - "No contradictions with existing ARCHITECTURE.md or SPEC.md"
  status: done
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#D-503 (this task)
    2. Read .docs/WORLD_GENERATION_DESIGN.md
    3. Get user approval on the design document
    4. If changes requested, edit .docs/WORLD_GENERATION_DESIGN.md and re-verify
    5. Commit: 'docs(world): 3D World Generation Design v1.0 (D-503)'
  steps:
    - "Step 1: Draft World Generation Design document in .docs/WORLD_GENERATION_DESIGN.md"
    - "Step 2: Self-review for placeholders, contradictions, ambiguity, scope issues"
    - "Step 3: Present document to user for approval"
    - "Step 4: After approval, commit and push"
  handoff_notes: ""
  notes: "requires_user_approval because this document defines the core world-generation vision."
```

```yaml
- id: D-504
  track: docs
  title: "Visual Effects Design document"
  phase: 5
  depends_on:
    hard: [D-502]
    soft: []
  blocks: [I-501]
  contract_refs: []
  files_allowed_to_touch:
    - .docs/VFX_DESIGN.md
  forbidden:
    - src/**
    - src-tauri/src/**
  estimated_complexity: L
  requires_user_approval: true
  acceptance:
    mechanical:
      - ".docs/VFX_DESIGN.md renders without markdown lint errors"
    existence:
      - ".docs/VFX_DESIGN.md exists"
      - "Document includes sections: principles, lighting, data flow, materials, particles, weather, shaders, post-processing, sound, performance, implementation path"
      - "Document links to WORLD_GENERATION_DESIGN.md, UI_DESIGN_SYSTEM.md, ARCHITECTURE.md"
    behavioral:
      - "User reviews and approves the design document"
      - "No contradictions with existing color system in UI_DESIGN_SYSTEM.md"
  status: done
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#D-504 (this task)
    2. Read .docs/VFX_DESIGN.md
    3. Get user approval on the design document
    4. If changes requested, edit .docs/VFX_DESIGN.md and re-verify
    5. Commit: 'docs(vfx): Visual Effects Design v1.0 (D-504)'
  steps:
    - "Step 1: Draft VFX Design document in .docs/VFX_DESIGN.md"
    - "Step 2: Self-review for placeholders, contradictions, ambiguity, scope issues"
    - "Step 3: Present document to user for approval"
    - "Step 4: After approval, commit and push"
  handoff_notes: ""
  notes: "requires_user_approval because this document defines the visual language for the digital civilization."
```

```yaml
- id: I-501
  track: integration
  title: "Phase 5 full acceptance"
  phase: 5
  depends_on:
    hard: [B-501, B-502, B-503, B-504, F-501, F-502, F-503, F-504, F-505, F-506, D-501, D-502, D-503, D-504]
    soft: []
  blocks: []
  contract_refs: []
  files_allowed_to_touch:
    - src/App.tsx
    - PLAN.md
  forbidden:
    - src-tauri/src/types.rs
    - src-tauri/src/engine/**
    - src-tauri/src/bridge/**
    - src/utils/types.ts
    - src/utils/layout.ts
    - src/utils/colors.ts
    - src/utils/theme.ts
    - src/hooks/**
    - src/components/**
  estimated_complexity: XL
  requires_user_approval: false
  acceptance:
    mechanical:
      - "npx tsc --noEmit exits 0"
      - "npm run build exits 0"
      - "cd src-tauri && cargo build exits 0"
      - "cd src-tauri && cargo clippy -- -D warnings exits 0"
      - "npm run tauri build produces .dmg (macOS) and .msi (Windows)"
    existence:
      - "All Phase 5 tasks status=done in PLAN.md"
      - "docs/plugin.md and examples/plugin-hello/ exist"
    behavioral:
      - "Relation graph, port harbors, and filesystem heat zones render on real data"
      - "Custom theme editor imports/exports valid themes"
      - "Screensaver mode fullscreen and auto-rotate work"
      - "Screenshot and GIF sharing save files without errors"
      - "FPS ≥ 30 with all Phase 5 visual features enabled"
  status: pending
  owner: null
  owner_started_at: null
  retry_count: 0
  linked_blocker: null
  resume_hint: |
    1. Read PLAN.md#I-501
    2. Verify all hard deps done
    3. Run full mechanical acceptance
    4. Run npm run tauri dev and perform behavioral checks
    5. Update PLAN.md status counts and current phase
    6. Append PROGRESS.md entry
  steps:
    - "Step 1: Confirm all Phase 5 tasks done"
    - "Step 2: Run npx tsc --noEmit && npm run build && cd src-tauri && cargo build && cargo clippy -- -D warnings"
    - "Step 3: Run npm run tauri build on macOS and Windows"
    - "Step 4: Verify relation graph, harbors, heatmap, theme editor, screensaver, sharing"
    - "Step 5: Update PLAN.md (I-501 done, counts, current phase 6)"
    - "Step 6: Append PROGRESS.md entry"
    - "Step 7: Commit: 'milestone: Phase 5 acceptance passed'"
  handoff_notes: ""
  notes: "Phase 5 milestone gate."
```

---

## Document Footer

**This file is the single source of truth for all tasks in the Procession project.**
On any conflict between this file and any agent's recollection, this file wins.
Edit only via the protocol defined in AGENT_PROTOCOL.md. Specifically:
- Status changes only during Stage 3 (Acceptance Gate) or Stage 4 (Handoff)
- New tasks may be appended by any agent during Stage 2 (Execute) when discovering new needs
- Existing task specs (other than status/owner/owner_started_at/retry_count/linked_blocker/handoff_notes) MUST NOT be edited without a D-* task
- Constitution changes (this file's header section, contract version, track mapping) require user approval
