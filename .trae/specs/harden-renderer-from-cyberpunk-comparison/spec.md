# 借鉴 Cyberpunk Megapolis 加固渲染管线 Spec

## Why
对比 cyberpunk-megapolis 项目后，Procession 存在三类显著差距：
1. **写好但未启用的代码**：App.tsx 中 6 处 `{false && ...}` 硬编码禁用了 HUD/UtilityMode/FpsCounter/ThemeSelector/ThemeEditor 等已实现组件，造成工程浪费。
2. **渲染配置缺失**：缺少 `powerPreference`、`logarithmicDepthBuffer`、DPR 上限、tab 隐藏暂停等基础加固项。
3. **降级策略与规格不一致**：SPEC 规定 "FPS < 20 时关闭后处理并降低建筑细节"，但 useFpsMonitor 只降建筑数未关 Bloom，且未做去抖动与单向降级。

本 spec 解决以上三类问题，不引入新功能、不重写已有架构。P3 及以上的大型重构（BuildingCluster 改 MeshStandardMaterial、天空 shader 升级、CameraController roll）暂缓，待后续 spec 处理。

## What Changes
- 删除 `src/App.tsx` 中 6 处 `{false && ...}` 包装，恢复 HUD/UtilityMode/FpsCounter/ThemeSelector/ThemeEditor 上线
- 删除 `src/components/TestCube.tsx` 残留文件
- 在 `src/components/CityScene.tsx` 的 Canvas `gl` 配置中增加 `powerPreference: 'high-performance'` 与 `logarithmicDepthBuffer: true`
- 在 `src/components/CityScene.tsx` 中通过 `setPixelRatio` 将 DPR 上限设为 1.5
- 在 `src/components/SkyDome.tsx` 的顶点着色器中加入 `gl_Position.z = gl_Position.w;` 以将天空球钉到远平面，并移除主循环中 `skyDome.position.copy(camera.position)` 之类同步代码（如存在）
- 在 `src/hooks/useFpsMonitor.ts` 重写为 high/med/low 三档质量策略：
  - high：默认档，bloom on、建筑数=配置值
  - med：FPS < 28 持续 5s 后降至 med，关闭 bloom
  - low：FPS < 20 持续 5s 后降至 low，关闭 bloom + 减建筑数 + DPR 降到 1.0
  - 单向降级（仅下不上），8 秒冷却防抖
- 在 `src/hooks/useSystemData.ts` 中加入 5 秒超时切换：若后端 5s 内未推送任何 `system-snapshot` 事件，前端进入"占位城市"模式（提示用户后端无响应），但不阻塞 UI
- 在 `src-tauri/src/bridge/pusher.rs` 的推送循环外层加 `catch_unwind`，确保单次 Win32 调用 panic 不会让整个推送线程死掉（CLAUDE.md 已规定此行为）
- **BREAKING**：`useFpsMonitor` 返回值结构变化，由 `{ fps, buildingCount }` 改为 `{ fps, buildingCount, quality, bloomEnabled }`，相关调用方需更新

## Impact
- Affected specs:
  - `SPEC.md §视觉系统`（自动降级策略实现一致性）
  - `SPEC.md §错误处理`（首次启动无数据展示占位城市）
  - `CLAUDE.md 错误处理`（Rust 后端 panic 自动重启后端）
- Affected code:
  - `src/App.tsx`（删除 `{false && ...}`，新增 5s 占位城市切换）
  - `src/components/CityScene.tsx`（gl 配置、DPR、tab 暂停）
  - `src/components/SkyDome.tsx`（vertex shader 一行修改）
  - `src/components/BloomEffect.tsx`（接受 quality 控制开关）
  - `src/hooks/useFpsMonitor.ts`（重写为质量档策略）
  - `src/hooks/useSystemData.ts`（5s 超时切换）
  - `src-tauri/src/bridge/pusher.rs`（catch_unwind 加固）
  - `src/components/TestCube.tsx`（删除）

## ADDED Requirements

### Requirement: 渲染管线加固
The system SHALL 在 Canvas 初始化时设置 `powerPreference: 'high-performance'`、`logarithmicDepthBuffer: true`，并将 DPR 上限锁定为 1.5，避免高 DPR 屏幕的 GPU 开销与远处 z-fighting。

#### Scenario: 高 DPR 屏幕渲染
- **WHEN** 用户在 DPR=2 的 retina 屏上启动应用
- **THEN** Canvas 实际 DPR 被钳制为 1.5，渲染负载约为 2.0 的 56%

#### Scenario: tab 隐藏
- **WHEN** 用户切换到其他浏览器 tab 或最小化窗口
- **THEN** 渲染循环跳过重活（保留最后一帧），CPU/GPU 占用回落

### Requirement: 天空球永远跟随相机
The system SHALL 通过 vertex shader 中 `gl_Position.z = gl_Position.w;` 将天空球几何钉到远平面，使其无需在主循环中显式同步相机位置即可永远跟随相机。

#### Scenario: 相机移动到城市边缘
- **WHEN** 相机移动到任意位置
- **THEN** 天空球始终位于视野远景，无可见边界裂缝

### Requirement: 质量分级自动降级
The system SHALL 实现 high/med/low 三档质量策略：
- high：默认，bloom on，建筑数=配置值，DPR=1.5
- med：FPS < 28 持续 5 秒后降级，bloom off
- low：FPS < 20 持续 5 秒后降级，bloom off + 减建筑数 40% + DPR=1.0
- 单向降级（仅下不上），切换冷却 8 秒防抖

#### Scenario: 持续低帧自动降级
- **WHEN** FPS 持续低于 28 超过 5 秒
- **THEN** 系统自动切到 med 档（关闭 bloom），并在 HUD 提示

#### Scenario: 短暂卡顿不触发降级
- **WHEN** FPS 暂时低于 28 但 5 秒内恢复
- **THEN** 不触发降级，避免抖动

### Requirement: 后端无响应占位城市
The system SHALL 在前端启动 5 秒内未收到任何 `system-snapshot` 事件时，切换到"占位城市"模式：使用静态模拟数据渲染城市，HUD 提示"后端无响应"，但不阻塞 UI 与相机交互。

#### Scenario: 后端崩溃
- **WHEN** 后端在启动后 5 秒内未推送任何快照
- **THEN** 前端进入占位模式，显示模拟静态城市

#### Scenario: 后端恢复
- **WHEN** 占位模式期间收到任一快照事件
- **THEN** 前端退出占位模式，恢复实时数据驱动

### Requirement: 推送线程 panic 恢复
The system SHALL 在 SystemEngine 推送循环外层包裹 `catch_unwind`，确保单次系统调用 panic 不会终止推送线程；panic 后记录错误并跳过该帧，下一 tick 继续推送。

#### Scenario: Win32 调用 panic
- **WHEN** 一次 `GetExtendedTcpTable` 调用触发 panic
- **THEN** 推送线程捕获 panic，记录错误日志，跳过该帧，下一秒继续推送

## MODIFIED Requirements

### Requirement: 自动降级策略
原 SPEC §视觉系统：FPS < 20 时关闭后处理并降低建筑细节
现修改为：实现 high/med/low 三档分级策略，FPS < 28 持续 5s 降至 med（关 bloom），FPS < 20 持续 5s 降至 low（关 bloom + 减建筑 + 降 DPR）。单向降级、8 秒冷却防抖。

## REMOVED Requirements

### Requirement: TestCube 组件
**Reason**: Phase 1 测试残留，无实际用途
**Migration**: 直接删除 `src/components/TestCube.tsx` 及其在 App.tsx 中的引用（若有）
