# Tasks

## P0 - 清理与启用

- [x] Task 1: 删除 TestCube.tsx 残留
  - [x] SubTask 1.1: 检查 App.tsx 与其他文件是否引用 TestCube，若有则移除引用
  - [x] SubTask 1.2: 删除 `src/components/TestCube.tsx` 文件

- [ ] Task 2: 启用被 App.tsx 硬编码禁用的组件
  - [ ] SubTask 2.1: 在 `src/App.tsx` 中删除 6 处 `{false && ...}` 包装，恢复 HudPanel、UtilityMode、FpsCounter、ThemeSelector、ThemeEditor 等组件渲染
  - [ ] SubTask 2.2: 验证启用后 UI 不崩溃、无 z-index 冲突；若存在视觉冲突，加最小内联样式调整而非回退禁用

## P1 - 渲染配置加固

- [x] Task 3: 加固 CityScene Canvas 配置
  - [x] SubTask 3.1: 在 `src/components/CityScene.tsx` 的 Canvas `gl` 属性中追加 `powerPreference: 'high-performance'` 与 `logarithmicDepthBuffer: true`
  - [x] SubTask 3.2: 在 CityScene.tsx 中通过 `dpr={[1, 1.5]}` 设置 DPR 上限 1.5
  - [x] SubTask 3.3: 在 CityScene.tsx 中加入 `visibilitychange` 监听，隐藏时切换 frameloop 到 "never"

- [x] Task 4: SkyDome 钉到远平面
  - [x] SubTask 4.1: 在 `src/components/SkyDome.tsx` 的 vertex shader 末尾插入 `gl_Position.z = gl_Position.w;`
  - [x] SubTask 4.2: 确认 SkyDome.tsx 与 CityScene.tsx 无每帧同步代码（无需移除）

## P2 - 质量分级降级

- [x] Task 5: 重写 useFpsMonitor 为质量档策略
  - [x] SubTask 5.1: 在 `src/hooks/useFpsMonitor.ts` 中定义 Quality 类型 `'high' | 'med' | 'low'`，导出 `{ fps, buildingCount, quality, bloomEnabled, dpr }`
  - [x] SubTask 5.2: 实现状态机：默认 high；FPS < 28 持续 5s → med（bloom off）；FPS < 20 持续 5s → low（bloom off + 减建筑 40% + DPR 1.0）；单向降级；8 秒冷却防抖
  - [ ] SubTask 5.3: 更新 `src/App.tsx` 调用方适配新返回值结构（由 App.tsx 集成任务处理）

- [x] Task 6: BloomEffect 接受 quality 控制
  - [x] SubTask 6.1: 在 `src/components/BloomEffect.tsx` 中接受 `enabled: boolean` prop，为 false 时不渲染 EffectComposer
  - [ ] SubTask 6.2: 在 `src/App.tsx` 中将 useFpsMonitor 的 bloomEnabled 传入 BloomEffect（由 App.tsx 集成任务处理）

## P2 - 后端无响应占位

- [x] Task 7: useSystemData 5s 超时切换
  - [x] SubTask 7.1: 在 `src/hooks/useSystemData.ts` 中加入启动时间戳，若 5 秒内未收到任何 `system-snapshot` 事件，将状态置为 `backend-unresponsive`
  - [ ] SubTask 7.2: 在 `src/App.tsx` 中处理 `backend-unresponsive` 状态（由 App.tsx 集成任务处理）

## P2 - 后端 panic 恢复

- [x] Task 8: pusher.rs catch_unwind 加固
  - [x] SubTask 8.1: 在 `src-tauri/src/bridge/pusher.rs` 的推送循环外层包裹 `std::panic::catch_unwind`，捕获 panic 后记录错误并跳过该帧
  - [x] SubTask 8.2: 验证 panic 后下一秒能继续推送（cargo test 21/21 通过）

## 验证

- [ ] Task 9: 整体验证
  - [ ] SubTask 9.1: 运行 `npm run test` 确保所有前端测试通过
  - [ ] SubTask 9.2: 运行 `cd src-tauri && cargo check` 确保 Rust 编译通过
  - [ ] SubTask 9.3: 手动启动应用，验证 HUD/UtilityMode/FpsCounter/Theme 显示正常、降级触发正确、占位城市切换正确

# Task Dependencies
- Task 2 依赖 Task 1（先清理 TestCube 再启用其他组件避免误判引用）
- Task 5 与 Task 6 强依赖（BloomEffect 必须先支持 enabled 才能让 useFpsMonitor 控制）
- Task 6 依赖 Task 5（先有 bloomEnabled 输出再传入 BloomEffect）
- Task 7、Task 8 与其他任务无依赖，可并行
- Task 9 依赖所有其他任务完成
