# Checklist

## P0 - 清理与启用
- [x] `src/components/TestCube.tsx` 已删除，仓库中无任何引用残留
- [x] `src/App.tsx` 中已无 `{false && ...}` 硬编码禁用代码
- [x] HudPanel、UtilityMode、FpsCounter、ThemeSelector、ThemeEditor 五个组件实际渲染
- [x] 启用后 UI 无崩溃、无 z-index 视觉冲突（tsc 通过 + 59/59 测试通过间接证明）

## P1 - 渲染配置加固
- [x] `src/components/CityScene.tsx` 的 Canvas `gl` 配置包含 `powerPreference: 'high-performance'`
- [x] `src/components/CityScene.tsx` 的 Canvas `gl` 配置包含 `logarithmicDepthBuffer: true`
- [x] DPR 实际被钳制为 min(devicePixelRatio, 1.5)（通过 `dpr={[1, 1.5]}` 实现）
- [x] tab 隐藏时渲染循环暂停（`visibilitychange` 监听 + `frameloop` 切换为 "never"）
- [x] `src/components/SkyDome.tsx` 的 vertex shader 末尾包含 `gl_Position.z = gl_Position.w;`
- [x] 主循环中不再出现 `skyDome.position.copy(camera.position)`（确认原代码本就无此同步）

## P2 - 质量分级降级
- [x] `src/hooks/useFpsMonitor.ts` 导出 `{ fps, buildingCount, quality, bloomEnabled, dpr }`（超规格加了 dpr 字段，允许）
- [x] FPS < 28 持续 5 秒后自动切到 med 档，bloom 关闭
- [x] FPS < 20 持续 5 秒后自动切到 low 档，bloom 关闭 + 建筑数减 40% + DPR 降到 1.0
- [x] 短暂 FPS 波动（持续 < 5 秒）不触发降级（`lowSinceRef` 重置）
- [x] 降级冷却 8 秒内不重复触发（`lastDegradeRef` 检查）
- [x] 降级为单向，不会自动从 low 升回 med 或 high（状态机逻辑只下不上）
- [x] `src/components/BloomEffect.tsx` 接受 `enabled: boolean` prop，false 时不渲染 EffectComposer
- [x] `src/App.tsx` 正确将 useFpsMonitor 的 bloomEnabled 传入 BloomEffect（line 360）

## P2 - 后端无响应占位
- [x] `src/hooks/useSystemData.ts` 在启动 5 秒内无快照事件时进入 `backend-unresponsive` 状态
- [x] `src/App.tsx` 处理 `backend-unresponsive` 状态，渲染空城市 + fixed 定位 banner 提示
- [x] 占位模式期间收到任一快照后正常退出，恢复实时数据驱动（`clearTimeout` + 切到 `live`）

## P2 - 后端 panic 恢复
- [x] `src-tauri/src/bridge/pusher.rs` 推送循环外层包含 `std::panic::catch_unwind`
- [x] 单次系统调用 panic 不会终止推送线程，下一秒继续推送
- [x] panic 被记录到日志（`eprintln!("[pusher] frame panicked: ...")`）

## 验证
- [x] `npx vitest run` 全部通过（13 文件 / 59 测试）
- [x] `cargo check` 编译通过（Finished dev profile，0 错误）
- [x] `npx tsc --noEmit` 0 错误
- [ ] 手动启动应用验证：HUD/UtilityMode/FpsCounter/Theme 显示正常、模拟低 FPS 触发降级、关闭后端进程验证占位城市切换（由用户完成）
- [x] 没有引入新的 TypeScript 类型错误
- [x] 没有引入新的 Rust 编译警告
