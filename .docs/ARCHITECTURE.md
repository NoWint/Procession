# Procession 技术架构

> **实现指引**: 本文档为架构概览。具体编码实现请参考 [BACKEND_IMPL.md](BACKEND_IMPL.md)，包含完整 Rust 代码、Cargo.toml 依赖、测试策略和 Phase 1 检查清单。

## 总体架构

```
┌───────────────────────────────────────────────────────────┐
│                   Tauri 2.x Desktop App                    │
│                                                            │
│  ┌────────────────────────┐  ┌────────────────────────────┐│
│  │    Rust 后端 (core)     │  │   WebView 前端 (renderer)  ││
│  │                        │  │                            ││
│  │  SystemEngine          │  │  React + TypeScript        ││
│  │   ├─ PlatformAdapter   │  │   ├─ CityScene (R3F)       ││
│  │   │  ├─ WindowsImpl    │◄─┤   ├─ HUD (HTML overlay)    ││
│  │   │  └─ MacImpl        │  │   ├─ Controls (交互层)      ││
│  │   └─ DataAggregator    │  │   └─ Timeline (回放)       ││
│  │                        │  │                            ││
│  │  DataBridge            │  │  useSystemData hook        ││
│  │   ├─ SnapshotPusher    │  │   ├─ 接收 push 事件        ││
│  │   ├─ EventFilter       │  │   ├─ 数据 diff 检测         ││
│  │   └─ CacheBuffer       │  │   └─ 插值动画状态           ││
│  │                        │  │                            ││
│  └────────────────────────┘  └────────────────────────────┘│
│                                                            │
│  ┌────────────────────────────────────────────────────────┐│
│  │               Tauri IPC Layer                          ││
│  │  invoke() ← 同步请求 /   event → 异步推送 (1Hz)       ││
│  └────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────┘
```

## Rust 后端架构

### SystemEngine

系统数据采集引擎，核心循环：

```rust
loop {
    let snapshot = SystemSnapshot {
        processes:  platform.get_processes(),   // 进程树 + 状态
        cpu:        platform.get_cpu(),          // 整体 + 每核
        memory:     platform.get_memory(),        // RAM + Swap
        network:    platform.get_network(),       // 吞吐 + 连接
        disk:       platform.get_disk(),          // 读写速率 + 使用率
        gpu:        platform.get_gpu(),           // 可选，GPU使用率
        temperature: platform.get_temperature(),  // 可选，CPU/GPU温度
        timestamp:  now(),
    };
    bridge.push(snapshot).await;
    sleep(Duration::from_millis(1000)).await;  // 1Hz base rate
}
```

### PlatformAdapter

```rust
#[async_trait]
trait PlatformAdapter: Send + Sync {
    async fn get_processes(&self) -> Vec<ProcessInfo>;
    async fn get_cpu(&self) -> CpuInfo;
    async fn get_memory(&self) -> MemoryInfo;
    async fn get_network(&self) -> NetworkInfo;
    async fn get_disk(&self) -> DiskInfo;
    async fn get_gpu(&self) -> Option<GpuInfo>;
    async fn get_temperature(&self) -> Option<CpuGpuTemp>;
}
```

- **WindowsImpl**: `sysinfo` crate + `winapi` / `windows-rs` 补充
- **MacImpl**: `sysinfo` crate + `libc` / `IOKit` 补充

### DataBridge

- **SnapshotPusher**: 以 1Hz 频率向 WebView 推送 `SystemSnapshot`
- **EventFilter**: 发送前压缩数据（如只传输活跃进程、限制进程数量上限）
- **CacheBuffer**: 保留最近 N 帧快照，供前端时间轴回放

## 前端架构

### 数据层：useSystemData (custom hook)

```typescript
function useSystemData() {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);

  useEffect(() => {
    const unlisten = listen<SystemSnapshot>("system-snapshot", (event) => {
      setSnapshot(event.payload);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  return snapshot;
}
```

接收到的数据通过 React 状态驱动 R3F 场景。

### 场景层：CityScene (R3F 组件树)

```
<CityScene>
  <ambientLight intensity={0.3} />
  <directionalLight position={[10, 20, 10]} />

  <CityGround />              {/* 发光网格地面 + 能量脉动 */}
  <BuildingCluster />         {/* 实例化建筑群，核心 */}
  <NetworkCables />           {/* 光缆线条 + 粒子流 */}
  <Atmosphere />              {/* 粒子背景 + 辉光后处理 */}
  <OrbitControls />           {/* 相机操控 */}
</CityScene>
```

### BuildingCluster 核心逻辑

```typescript
function BuildingCluster({ processes }: { processes: ProcessInfo[] }) {
  const meshRef = useRef<InstancedMesh>(null!);

  // 用 InstancedMesh 渲染所有建筑——单个 draw call
  useEffect(() => {
    const dummy = new THREE.Object3D();
    processes.forEach((p, i) => {
      const [x, z] = computePosition(p);   // 进程树深度 → X, PID顺序 → Z
      const height = mapCpuToHeight(p.cpu); // CPU → 建筑高度
      const size = mapMemToSize(p.mem);     // 内存 → 底面积
      const color = getProcessColor(p);     // 类型 → 颜色

      dummy.position.set(x, height / 2, z);
      dummy.scale.set(size, height, size);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [processes]);

  return <instancedMesh ref={meshRef} args={[null!, null!, processes.length]} />;
}
```

### 视觉层次

| 层次 | 技术方案 | 更新频率 |
|------|---------|---------|
| 建筑群 (Buildings) | InstancedMesh | 数据帧 (1Hz) |
| 光缆 (Cables) | LineGeometry + Points | 数据帧 (1Hz) |
| 粒子流 (Flow particles) | Points | 60fps |
| 地面网格 | Mesh + ShaderMaterial | 60fps 微动 |
| 天空背景 | Points + ShaderMaterial | 60fps |
| 辉光 (Bloom) | EffectComposer + UnrealBloomPass | 60fps (后处理) |

## IPC 数据合约

```typescript
interface ProcessInfo {
  pid: number;
  ppid: number;
  name: string;
  cpu: number;          // 0-100
  memory_mb: number;
  state: "running" | "sleeping" | "stopped" | "zombie";
  user: string;
}

interface Connection {
  pid: number;
  local_addr: string;
  remote_addr: string;
  state: string;
  protocol: "tcp" | "udp";
}

interface SystemSnapshot {
  processes: ProcessInfo[];
  cpu: { total: number; per_core: number[] };
  memory: { used_mb: number; total_mb: number; swap_used_mb: number; swap_total_mb: number };
  network: { up_bytes_per_sec: number; down_bytes_per_sec: number; connections: Connection[] };
  disk: { read_bytes_per_sec: number; write_bytes_per_sec: number; usage_percent: number };
  gpu?: { usage_percent: number; memory_used_mb: number; memory_total_mb: number };
  temperature?: { cpu: number; gpu: number };
  timestamp: number;
}
```

## IPC 方式

| 场景 | 方式 | 说明 |
|------|------|------|
| 实时数据推送 | `app.emit("system-snapshot", snapshot)` | 后端主动推，每秒一次 |
| 初始加载/重连 | `invoke("get_snapshot")` | 前端拉取当前帧 |
| 系统功能调用 | `invoke("kill_process", { pid })` | 前端请求后端操作 |
