# Checklist

## P0 - 清理与启用
- [ ] `src/components/TestCube.tsx` 已删除，仓库中无任何引用残留
- [ ] `src/App.tsx` 中已无 `{false && ...}` 硬编码禁用代码
- [ ] HudPanel、UtilityMode、FpsCounter、ThemeSelector、ThemeEditor 五个组件实际渲染
- [ ] 启用后 UI 无崩溃、无 z-index 视觉冲突

## P1 - 渲染配置加固
- [ ] `src/components/CityScene.tsx` 的 Canvas `gl` 配置包含 `powerPreference: 'high-performance'`
- [ ] `src/components/CityScene.tsx` 的 Canvas `gl` 配置包含 `logarithmicDepthBuffer: true`
- [ ] DPR 实际被钳制为 min(devicePixelRatio, 1.5)，可在控制台通过 `renderer.getPixelRatio()` 验证
- [ ] tab 隐藏时渲染循环暂停（可通过 FPS 计数器从 60 跌至 0 验证）
- [ ] `src/components/SkyDome.tsx` 的 vertex shader 末尾包含 `gl_Position.z = gl_Position.w;`
- [ ] 主循环中不再出现 `skyDome.position.copy(camera.position)`（若原代码存在）

## P2 - 质量分级降级
- [ ] `src/hooks/useFpsMonitor.ts` 导出 `{ fps, buildingCount, quality, bloomEnabled }` 四元组
- [ ] FPS < 28 持续 5 秒后自动切到 med 档，bloom 关闭
- [ ] FPS < 20 持续 5 秒后自动切到 low 档，bloom 关闭 + 建筑数减 40% + DPR 降到 1.0
- [ ] 短暂 FPS 波动（持续 < 5 秒）不触发降级
- [ ] 降级冷却 8 秒内不重复触发
- [ ] 降级为单向，不会自动从 low 升回 med 或 high
- [ ] `src/components/BloomEffect.tsx` 接受 `enabled: boolean` prop，false 时不渲染 EffectComposer
- [ ] `src/App.tsx` 正确将 useFpsMonitor 的 bloomEnabled 传入 BloomEffect

## P2 - 后端无响应占位
- [ ] `src/hooks/useSystemData.ts` 在启动 5 秒内无快照事件时进入 `backend-unresponsive` 状态
- [ ] `src/App.tsx` 处理 `backend-unresponsive` 状态，渲染静态占位城市或 ErrorState 提示
- [ ] 占位模式期间收到任一快照后正常退出，恢复实时数据驱动

## P2 - 后端 panic 恢复
- [ ] `src-tauri/src/bridge/pusher.rs` 推送循环外层包含 `std::panic::catch_unwind`
- [ ] 单次系统调用 panic 不会终止推送线程，下一秒继续推送
- [ ] panic 被记录到日志（如 eprintln 或 tracing）

## 验证
- [ ] `npm run test` 全部通过
- [ ] `cd src-tauri && cargo check` 编译通过
- [ ] 手动启动应用验证：
  - HUD/UtilityMode/FpsCounter/Theme 显示正常
  - 模拟低 FPS（如打开 DevTools 性能面板降速）触发降级
  - 关闭后端进程验证占位城市切换
- [ ] 没有引入新的 TypeScript 类型错误
- [ ] 没有引入新的 Rust 编译警告
