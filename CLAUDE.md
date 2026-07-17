# CLAUDE.md

本文档为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 项目概述

Procession 将电脑的运行状态实时映射为一座活着的 3D 城市景观——基于 Tauri 2.x 的桌面应用，Rust 后端 + React Three Fiber 前端。

## 关键文档（工作前请阅读）

- [SPEC.md](.docs/SPEC.md) — 完整设计规格、数据合约、视觉系统、错误处理
- [ARCHITECTURE.md](.docs/ARCHITECTURE.md) — 技术架构：Rust 引擎、PlatformAdapter、IPC、R3F 场景树
- [ROADMAP.md](.docs/ROADMAP.md) — 分阶段实施计划（Phase 1-5）
- [NAMING.md](.docs/NAMING.md) — 命名决策和规范
- [PROCESSION.md](.docs/PROCESSION.md) — 项目定位、视觉隐喻、团队分工

## 技术栈

| 层级 | 技术 |
|-------|-----------|
| 桌面壳 | Tauri 2.x |
| 后端 | Rust（`sysinfo`、`windows-rs`、平台特定 crate） |
| 前端 | React 18 + TypeScript |
| 3D 渲染 | Three.js + React Three Fiber (R3F) |
| 后处理 | UnrealBloomPass（three/addons）|
| IPC | Tauri `invoke()`（请求/响应）+ `app.emit()`（1Hz 推送） |

## 架构概览

```
Tauri 2.x App
├── Rust 后端 (core)
│   ├── SystemEngine（1Hz采集循环）
│   │   └── PlatformAdapter trait（WindowsImpl / MacImpl / MockAdapter）
│   └── DataBridge（SnapshotPusher、EventFilter、CacheBuffer）
└── WebView 前端 (renderer)
    ├── CityScene（R3F 组件树）
    │   ├── BuildingCluster（InstancedMesh）
    │   ├── NetworkCables（LineGeometry + Points）
    │   ├── CityGround（Mesh + ShaderMaterial）
    │   └── Atmosphere（Points + Bloom）
    ├── HUD（HTML 叠加层，实用模式）
    ├── ProcessPopup（进程详情浮窗）
    └── useSystemData hook（IPC → React state）
```

核心原则：
- **后端规则**：Rust 只负责数据采集，不碰任何渲染逻辑
- **IPC 推模式**：后端以 1Hz 推送 `SystemSnapshot`，前端做插值渲染
- **本地优先**：所有处理在本地完成，无云依赖
- **PlatformAdapter** 将系统调用隔离在 `#[async_trait]` 后面

## IPC 数据合约（详见 SPEC.md §5）

核心类型：`SystemSnapshot`、`ProcessInfo`、`Connection`。类型通过 Tauri IPC 共享——在 `src-tauri/src/types.rs` 定义一次，在 `src/utils/types.ts` 中镜像。

## 源码目录结构（规划中，来自 SPEC.md）

```
Procession/
├── src-tauri/           # Rust 后端
│   ├── src/
│   │   ├── main.rs
│   │   ├── engine/      # SystemEngine（mod.rs、platform.rs、windows.rs、mac.rs、mock.rs）
│   │   ├── bridge/      # DataBridge（mod.rs、snapshot.rs、cache.rs）
│   │   └── types.rs     # 共享类型定义
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                 # 前端（React + TypeScript + R3F）
│   ├── main.tsx
│   ├── App.tsx
│   ├── hooks/useSystemData.ts
│   ├── components/      # CityScene、BuildingCluster、NetworkCables、CityGround、Atmosphere、ProcessPopup、HUD
│   ├── utils/           # layout.ts、colors.ts、types.ts
│   └── styles/index.css
├── package.json
├── tsconfig.json
└── ...md 文档
```

## 开发阶段（来自 ROADMAP.md）

| 阶段 | 内容 | 时间 |
|-------|------|----------|
| 1 — 脚手架 | Tauri 初始化、SystemEngine 骨架、sysinfo、IPC、R3F 测试立方体 | 1-2 周 |
| 2 — 城市 | 进程树布局、InstancedMesh 建筑、配色系统、地面/天空、弹窗 | 2-3 周 |
| 3 — 光缆 | 网络连接采集、LineGeometry、粒子流、按协议区分光缆颜色 | 1-2 周 |
| 4 — 打磨 | macOS 适配、实用模式（HUD）、性能优化、打包发布 | 2-3 周 |
| 5 — 远景 | 进程关系图谱、端口可视化、时光回放、主题、屏保 | 长期 |

## 视觉系统概要

- **建筑 = 进程**：高度 ∝ CPU%、底面积 ∝ 内存、颜色 = 进程类型（系统进程蓝、用户进程橙、活跃进程白金）
- **布局**：进程树——根进程居中，子进程按深度向外辐射
- **地面**：圆形发光网格，半径 120 单位，呼吸动画与整体 CPU 关联
- **光缆 = 网络连接**：最多 200 条，CatmullRom 曲线 + 粒子流
- **光缆颜色**：HTTP/HTTPS=青色、SSH=绿色、数据库=紫色、P2P=红色、系统服务=蓝色
- **氛围**：星空粒子，雾/风暴强度与 CPU 负载关联
- **辉光**：UnrealBloomPass（strength: 0.3, radius: 0.5, threshold: 0.1）
- **自动降级**：FPS < 20 时关闭后处理并降低建筑细节

## 交互设计

- 左键拖拽旋转、滚轮缩放（10-150 单位）、右键拖拽平移
- 双击建筑 → 镜头飞向该建筑（500ms，15 单位距离）
- 单击建筑 → 进程详情浮窗
- 空格键 → 切换实用模式（建筑标签 + HUD 仪表盘）

## 命名规范

- **项目名**：Procession（一个单词，8 字母，2 音节）
- **标语**：进程列队，系统成诗
- **Rust**：函数/变量用 snake_case，类型/trait 用 CamelCase
- **TypeScript/React**：函数/变量用 camelCase，组件/类型用 PascalCase
- **IPC 事件名**：kebab-case（如 `system-snapshot`）

## 错误处理（来自 SPEC.md §8）

- 单个进程数据缺失 → 该建筑标记灰色 + tooltip 提示
- 整帧采集失败 → 复用上一帧，HUD 显示延迟警告
- GPU/温度不可用 → 隐藏相关指标，继续运行
- 平台未实现特性 → HUD 提示，不崩溃
- 首次启动无数据 → 展示占位城市（模拟静态场景）
- 进程数超上限 → 按 CPU 占用降序截断 + HUD 通知
- Rust 后端 panic → 自动重启后端，WebView 保留最后一帧
- 后端缓存上限 1000 帧，自动清理
