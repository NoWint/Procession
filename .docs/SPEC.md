# Procession 设计规格书

> 版本: v0.1-draft
> 最后更新: 2026-07-17

---

## 1. 项目身份

| 字段 | 值 |
|------|-----|
| 名称 | Procession |
| 语源 | Process（进程）+ Procession（巡游/行列） |
| 标语 | 进程列队，系统成诗 |
| 仓库 | github.com/PleaseEnterYourText-Studio/Procession |
| 团队 | 严梓峻, 夏天 |

## 2. 核心概念

Procession 将操作系统的运行状态实时映射为一座动态的 3D 城市。

**设计哲学：**
- 默认是桌面艺术品，好看是第一要务
- 交互后是实用工具，信息密度足够
- 不依赖云服务，一切本地处理
- 数据不撒谎——城市状态严格对应真实系统

## 3. 目标平台

| 平台 | 首发 | 优先级 |
|------|------|--------|
| Windows 10/11 | ✅ | 最高 |
| macOS (Ventura+) | ✅ | 紧随 Windows |
| Linux | ❌ | 社区贡献考虑 |

**构建工具:** Tauri 2.x
**最低系统要求:** 4GB RAM, 支持 WebGPU/WebGL2 的 GPU

## 4. 技术栈

| 层级 | 技术 | 理由 |
|------|------|------|
| 桌面壳 | Tauri 2.x | 跨平台、轻量 (≈5MB)、Rust 后端 |
| 后端语言 | Rust | 性能、安全、系统 API 访问 |
| 系统信息 | `sysinfo` crate | 跨平台系统数据 (CPU/内存/进程/磁盘) |
| Window 补充 | `windows-rs` crate | sysinfo 无法覆盖的 Win32 API |
| macOS 补充 | `IOKit` / `libc` | sysinfo 无法覆盖的 macOS API |
| 网络连接 | `sysinfo` + 平台特定 | TCP 连接表 |
| 前端框架 | React 18 + TypeScript | 熟悉的声明式 UI |
| 3D 渲染 | Three.js + React Three Fiber | 成熟 3D Web 生态 |
| 后处理 | UnrealBloomPass (three/addons) | 辉光氛围 |
| IPC | Tauri invoke + event | 请求/响应 + 推送 |

## 5. 系统数据规格

### 5.1 采集频率

| 数据 | 频率 | 说明 |
|------|------|------|
| CPU + 内存 | 1Hz | 足够感知变化，低开销 |
| 进程列表 | 1Hz | 含 PID, CPU, 内存, 状态 |
| 网络连接 | 每 2 帧 (2s) | 连接表变化不频繁 |
| GPU + 温度 | 每 5 帧 (5s) | 可选，非关键数据 |

### 5.2 进程数上限

- 默认上限: 500 进程
- 用户可配置: 100-2000
- 超出时: 按 CPU 占用降序保留，HUD 提示 "N 个进程未显示"
- 静态进程 (内核/空闲): 显示为极低矮建筑，不占据布局位置

### 5.3 网络连接分组

为保证性能，网络连接不逐条渲染，而是按 `(PID, 远端 IP 段)` 聚合为一条"光缆"，活跃度 = 该聚合组的连接数 × 吞吐量。

## 6. 视觉系统

### 6.1 建筑 (进程)

**几何体:** 长方体 + 顶部金字塔尖（类似摩天楼轮廓）
**实例化:** InstancedMesh — 所有进程一次 draw call
**LOD 策略:**
- 近距离 (>50 单位): 完整建筑 + 棱角 + 窗户纹理线条
- 中距离 (50-150): 简化长方体 + 发光
- 远距离 (>150): 仅一个发光点

**建筑属性映射:**

| 输入 | 输出 | 映射函数 |
|------|------|---------|
| CPU% | 高度 (Y) | `height = 0.5 + cpu% * 0.15`，范围 0.5-15.5 单位 |
| 内存 (MB) | 底面积 | `size = 0.3 + sqrt(mem_mb/512) * 0.7`，范围 0.3-7.3 单位 |
| 进程类型 | 颜色 | 系统进程 → 蓝色 #4A90D9，用户进程 → 橙色 #E8903C，当前活动 → 白金色 #FFE4B5 |
| 状态 | 视觉效果 | running → 顶部旋转光环，sleeping → 静默发光，stopped → 灰暗半透明 |

**位置计算:**

```
function computePosition(process, allProcesses):
  depth = processTreeDepth(process)            // 根 = 1, 子 = 2...
  angle = processIndexInLevel * (2π / levelCount)
  radius = depth * spacing                     // 逐层向外

  x = radius * cos(angle)
  z = radius * sin(angle)

  // 加入高斯抖动避免完美圆形
  x += gaussNoise(0.5)
  z += gaussNoise(0.5)

  return [x, z]
```

### 6.2 地面网格

- 圆形发光网格，半径 120 单位
- 双层: 外圈静态网格 + 内圈动态脉动环
- 颜色: 深蓝紫 #1a1a2e → 逐渐透明向外
- 脉动: 低频呼吸 (周期 4s)，振幅受整体 CPU 影响

### 6.3 光缆 (网络连接)

**几何:** CatmullRomCurve3 + TubeGeometry + Points

**渲染策略:**
- 最多渲染 200 条光缆（按活跃度降序）
- 每条光缆使用 TubeGeometry + 渐变颜色
- 粒子沿曲线运动，方向 = 数据流向

**颜色协议映射:**

| 协议 | 端口范围 | 颜色 |
|------|---------|------|
| HTTP/HTTPS | 80, 443, 8080 | 青色 #00BCD4 |
| SSH | 22 | 绿色 #4CAF50 |
| Database | 3306, 5432, 27017 | 紫色 #9C27B0 |
| P2P | 随机高端口 | 红色 #F44336 |
| 系统服务 | <1024 | 蓝色 #2196F3 |
| 其他 | 默认 | 灰色 #9E9E9E |

### 6.4 天空/氛围

- **背景:** 深色渐变 #0a0a1a → #1a1a3e
- **粒子:** 500 颗星星缓慢旋转
- **CPU 负载关联:**
  - CPU < 30%: 晴朗星空
  - CPU 30-70%: 淡雾
  - CPU > 70%: 粒子风暴效果，颜色转红

### 6.5 后处理

| 效果 | 配置 | 性能开销 |
|------|------|---------|
| UnrealBloomPass | strength: 0.3, radius: 0.5, threshold: 0.1 | 中等 |
| 可选 TAA | 如果出现闪烁 | 较高 |

## 7. 交互系统

### 7.1 相机控制

| 操作 | 效果 |
|------|------|
| 左键拖拽 | 绕 Y 轴旋转 (OrbitControls) |
| 滚轮 | 缩放 (范围: 10-150 单位) |
| 右键拖拽 | 平移 (pan) |
| 双击建筑 | 镜头飞向该建筑，15 单位距离，持续 500ms |

### 7.2 进程详情浮窗

**触发方式:** 鼠标点击建筑
**内容:**
```
┌───────────────────────┐
│ chrome.exe (PID: 1234)│
│ CPU:  ████████░░ 32%  │
│ 内存: ██████░░░░ 1.2GB│
│ 状态: ● Running       │
│ 子进程: 7             │
│ 网络: ↑1.2 ↓3.4 MB/s │
│ ───────────────────── │
│ [结束进程] [定位文件]  │
└───────────────────────┘
```

### 7.3 实用模式 (空格切换)

**默认模式:** 纯艺术展示，无文字标签
**实用模式叠加:**
- 建筑上方显示进程名（2-3 字省略）
- 屏幕顶部 HUD 栏: CPU/内存/网络实时仪表盘
- 建筑类型彩色图例
- 可搜索/过滤进程

### 7.4 设置面板

- 配色主题选择
- 数据刷新率 (0.5Hz - 5Hz)
- 进程数上限
- 性能模式 / 画质模式
- 开机自启选项

## 8. 错误处理

### 8.1 数据采集失败

| 失败场景 | 行为 |
|---------|------|
| 单进程数据缺失 | 该建筑保留但标记灰色 + tooltip "数据不可用" |
| 整帧采集失败 | 复用上一帧数据，HUD 显示 "⚠ 数据延迟 N 秒" |
| GPU/温度不可用 | 隐藏相关系统指标，继续运行 |
| macOS 未实现特性 | 该功能不可用，不崩溃，HUD 提示 |

### 8.2 启动阶段

| 场景 | 行为 |
|------|------|
| 首次启动无数据 | 展示占位城市（模拟数据生成的静态景观） |
| 权限不足 | 引导用户授予权限（macOS 屏幕录制/辅助功能权限） |
| 系统不支持 | Windows <10 提示最低系统要求并退出 |

### 8.3 运行时

| 场景 | 行为 |
|------|------|
| 建筑数超过上限 | 截断并提示 |
| FPS < 20 | 自动关闭 post-processing + 降低建筑细节 |
| Rust 后端 panic | 自动重启后端，保持 WebView 显示最后一帧 |
| 内存泄漏风险 | 后端数据缓存上限 1000 帧，自动清理旧帧 |

## 9. 测试策略

### 9.1 Rust 后端

- **单元测试:** PlatformAdapter 数据解析逻辑
- **集成测试:** macOS/Windows 用 MockAdapter + 真实 sysinfo
- **性能基准:** 采集 500/1000/2000 进程耗时

### 9.2 前端

- **组件测试:** 浮窗、HUD、设置面板等纯 UI
- **3D 场景:** 手动验证为主（目前 R3F 场景测试生态不成熟）
- **IPC 测试:** 模拟后端推送，验证前端渲染正确性

### 9.3 端到端

- 手动 E2E 清单（启动 → 观察城市变化 → 交互验证 → 实用模式 → 关闭）

## 10. 发布

### 10.1 渠道

- GitHub Releases (免费)
- 初期不开源，但可用 GitHub Issues 收集反馈

### 10.2 平台包

| 平台 | 格式 | 签名 |
|------|------|------|
| Windows | MSI Installer | 可选 EV 证书 |
| macOS | DMG + 公证 | 需要 Apple Developer 会员 (¥688/年) |

### 10.3 版本策略

v0.1 (Alpha) → 内部可用，好友测试
v0.2 (Beta) → 公开下载，收集反馈
v1.0 (正式) → 稳定发布

---

## 附录 A: 配色方案 (初始版)

```json
{
  "buildings": {
    "system": "#4A90D9",
    "user": "#E8903C",
    "active": "#FFE4B5",
    "inactive": "#2A2A4A",
    "highlight": "#FFFFFF"
  },
  "ground": {
    "grid": "#1a1a2e",
    "pulse": "#4A90D9"
  },
  "cables": {
    "http": "#00BCD4",
    "ssh": "#4CAF50",
    "db": "#9C27B0",
    "p2p": "#F44336",
    "system": "#2196F3",
    "other": "#9E9E9E"
  },
  "sky": {
    "background": "#0a0a1a",
    "horizon": "#1a1a3e"
  },
  "hud": {
    "text": "#E0E0E0",
    "accent": "#4A90D9",
    "warning": "#FF9800",
    "danger": "#F44336"
  }
}
```

## 附录 B: 目录结构

```
Procession/
├── src-tauri/           # Rust 后端
│   ├── src/
│   │   ├── main.rs
│   │   ├── engine/      # SystemEngine
│   │   │   ├── mod.rs
│   │   │   ├── platform.rs      # PlatformAdapter trait
│   │   │   ├── windows.rs       # WindowsImpl
│   │   │   ├── mac.rs           # MacImpl (stub until Phase 4)
│   │   │   └── mock.rs          # MockAdapter (开发/测试)
│   │   ├── bridge/      # DataBridge
│   │   │   ├── mod.rs
│   │   │   ├── snapshot.rs
│   │   │   └── cache.rs
│   │   └── types.rs     # 共享类型定义
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                 # 前端
│   ├── main.tsx
│   ├── App.tsx
│   ├── hooks/
│   │   └── useSystemData.ts
│   ├── components/
│   │   ├── CityScene.tsx
│   │   ├── BuildingCluster.tsx
│   │   ├── NetworkCables.tsx
│   │   ├── CityGround.tsx
│   │   ├── Atmosphere.tsx
│   │   ├── ProcessPopup.tsx
│   │   └── HUD.tsx
│   ├── utils/
│   │   ├── layout.ts       # 布局算法
│   │   ├── colors.ts       # 配色系统
│   │   └── types.ts        # 前端类型定义
│   └── styles/
│       └── index.css
├── public/
├── package.json
├── tsconfig.json
└── README.md
```
