# Procession 前端设计图复刻方案

> **文档身份**：本文件定义如何将设计图中的深空数字城市视觉风格复刻到 Procession 前端。它是后续实现工作的直接依据。
>
> **版本**：v1.0
> **最后更新**：2026-07-18
> **关联文档**：`.docs/UI_DESIGN_SYSTEM.md`、`.docs/VFX_DESIGN.md`、`multi-track-development-planning/SKILL.md`

---

## 1. 目标与范围

### 1.1 目标

将用户提供的前端设计图（深空数字城市、发光晶体建筑、弧形光缆、进程标签）以视觉优先原则复刻到 Procession 的 3D 主界面。

### 1.2 复刻范围

**包含：**
- 深空背景与大气效果
- 发光晶体建筑（形态、材质、颜色、高度）
- 弧形发光光缆与数据流粒子
- 地面网格与圆形城市平台
- 背景远景建筑
- 进程名称标签（始终可见）
- 自由 cinematic 相机控制

**不包含：**
- 左上角 HUD 面板（CPU / MEM / NET / TEMP / FPS）
- 右下角主题选择面板

### 1.3 设计原则

- **视觉优先**：在性能可接受范围内，优先还原设计图效果。
- **像素级复刻**：建筑、光缆、光照、标签尽量贴近原图。
- **一揽子重构**：同时改造建筑、光缆、地面、大气、标签，确保视觉统一。

---

## 2. 整体视觉氛围与色彩系统

### 2.1 背景与空间

- 背景色：`#03040a`（接近纯黑的深空）。
- 背景包含稀疏星点和尘埃粒子，营造宇宙感。
- 使用 `FogExp2` 雾效，让远景自然隐入黑暗。
- 城市坐落在暗色圆形平台上，平台边缘无硬边界，自然融入背景。

### 2.2 色彩映射

| 用途 | 色值 | 说明 |
|------|------|------|
| 建筑主体（冷色）| `#4aa8ff` → `#00e5ff` | 从底部冷蓝到顶部电光青渐变 |
| 高负载建筑（暖色）| `#ffb84d` | 高 CPU / 高内存进程，可带 `#ff9d3a` 暗部渐变 |
| 数据库 / 网络服务 | `#9d7bff` | 紫色系 |
| 部分系统服务 | `#5ce1a8` | 绿色系 |
| 脉冲高光 | `#ffffff` | 建筑顶部、选中轮廓 |
| 进程标签文字 | `#f2f4f8` | 柔和白，带深色描边 |
| 地面网格 | `#0a0a12` ~ `#10101a` | 极暗，只在建筑底部附近可见 |
| 背景远景建筑 | `#1a2a40` / `#1a1a2e` | 低亮度剪影 |

### 2.3 后处理 / Bloom

- `strength`：0.45–0.6（增强发光晕影）
- `threshold`：0.55（让更多自发光区域产生 Bloom）
- `radius`：0.4–0.5（避免过度发糊）

### 2.4 光照

- 环境光极弱：`ambientIntensity` ≈ 0.15。
- 主要光源来自建筑自发光和能量流。
- 高塔顶部添加微弱体积光柱。

---

## 3. 建筑形态与材质系统

### 3.1 建筑几何

- 基础形态为修长长方体，`boxGeometry` 底面 `0.6–0.8`，高度由进程数据决定。
- 高度映射：进程内存占用 + CPU 占用共同决定建筑高度。
- 重要进程（内存大、CPU 高）更高更醒目；普通系统进程较矮。
- 远景填充建筑使用更小底面（`0.3–0.5`）和更低高度，形成城市密度。

### 3.2 材质系统

当前 `BuildingCluster.tsx` 中的 `MeshStandardMaterial` 替换为自定义 `ShaderMaterial`：

- **半透明晶体外壳**：Fresnel 边缘光 + 内部能量核心。
- **垂直渐变**：底部冷蓝 `#4aa8ff` 向顶部电光青 `#00e5ff` 渐变。
- **高负载色相偏移**：高 CPU / 内存建筑整体偏向琥珀色 `#ff9d3a`。
- **特殊类型映射**：数据库/网络类偏紫，部分系统服务偏绿。
- **表面能量纹**：细微扫描线缓慢上移，模拟数据流动。

### 3.3 建筑底部与顶部

- 每个建筑底部添加环形光晕（Torus 或 Sprite），颜色与建筑一致。
- 高塔顶部添加发光片和微弱垂直体积光柱。

### 3.4 进程标签

- 每个主要建筑顶部显示进程名。
- 使用 `Html` 组件，位置 `y + 0.8`，始终面向相机。
- 样式：12–14px 无衬线体，白色 `#f2f4f8`，带 1px 深色描边。
- **始终可见**，不对标签数量做硬性限制；远景小建筑可半透明或省略。

### 3.5 生命周期动画

- 诞生：建筑从地面能量环中升起，伴随向上聚合粒子。
- 死亡：建筑下沉、解体为粒子，底部光环收缩消失。
- 保留现有的实例化矩阵更新与生命周期状态机，但视觉表现（材质、光环、粒子）完全按设计图重构。

---

## 4. 光缆系统与数据流

### 4.1 光缆几何

当前 `CableSystem.tsx` 中的 `LineSegments` 替换为 `TubeGeometry`：

- 使用 `CatmullRomCurve3` 创建平滑抛物线路径。
- 起点：建筑中部偏上（`height * 0.7`）。
- 终点：目标建筑中部偏上。
- 控制点：两点中点上方 `4–10` 单位，拱高随距离增加。
- 管径：`0.08–0.15`，重要连接更粗。

### 4.2 光缆材质

- 自定义 `ShaderMaterial`：
  - 基础颜色按协议映射（HTTP 青、SSH 绿、Database 紫、系统服务蓝）。
  - 管体有尾迹衰减：从一端到另一端透明度渐变。
  - 管体本身微弱发光，配合 Bloom 产生晕影。

### 4.3 数据流粒子

- 沿每条光缆曲线放置流动粒子。
- 粒子大小 `0.1–0.3`，颜色比管体更亮。
- 速度由网络带宽 / 连接活跃度决定。
- 使用 GPU 实例化或 `THREE.Points` 渲染，支持 100–200 条光缆同时流动。

### 4.4 数量与分布

- `maxCables` 保持 100–200。
- 优先渲染活跃度高的连接。
- 高网络负载时，光缆亮度增强、粒子密度增加。

---

## 5. 地面、背景城市与大气

### 5.1 地面

- 细腻点阵 / 细线网格，颜色 `#0a0a12` ~ `#10101a`。
- 圆形平台边缘柔和，无硬边界。
- 建筑底部有微弱反射或光晕。

### 5.2 背景城市

- 在主建筑群外围生成大量低密度远景建筑剪影。
- 尺寸小、亮度低、颜色偏冷蓝 / 暗紫。
- 使用简化几何和共享材质，保证性能。

### 5.3 天空与粒子

- 深空背景点缀稀疏星点和尘埃粒子。
- 粒子缓慢漂移，速度轻微受系统整体负载调制。
- 高负载时粒子数量和亮度微增。

### 5.4 体积光

- 城市中心和高塔顶部添加克制体积光柱。
- 只在高 CPU 或特殊事件时明显。

---

## 6. 相机与交互

### 6.1 相机

- **完全保留现有自由 cinematic 相机控制**（平移、旋转、缩放）。
- 不添加轨道控制器限制。
- 默认起始位置采用图片中的俯视角度（约 45° 俯瞰城市）。

### 6.2 交互

- Hover 建筑：边缘出现液态金属高亮轮廓，标签微微放大。
- Click 建筑：保持现有 Entry Probe 逻辑（镜头靠近 + 建筑半透明）。
- 不新增 HUD 或主题面板相关交互。

---

## 7. 主题系统更新

### 7.1 扩展 `ThemeColors` 接口

在 `src/utils/theme.ts` 中新增以下字段：

```ts
export interface ThemeColors {
  // 原有字段保留
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textMuted: string;
  accent: string;
  border: string;
  grid: string;
  gridSecondary: string;
  ground: string;
  system: string;
  user: string;
  active: string;
  idle: string;
  sleeping: string;
  stopped: string;
  zombie: string;
  particle: string;

  // 新增数据能量色
  electricCyan: string;   // #00e5ff
  coldBlue: string;       // #4aa8ff
  pulseWhite: string;     // #ffffff
  amber: string;          // #ff9d3a
  deepRed: string;        // #ff3b5c
  databasePurple: string; // #9d7bff
  serviceGreen: string;   // #5ce1a8
}
```

### 7.2 更新默认主题

`FALLBACK_THEME` 的颜色按以下方向调整：

- `background`: `#03040a`
- `surface`: `#0c0c10`
- `surfaceElevated`: `#131318`
- `text`: `#f2f4f8`
- `textMuted`: `#9da2ad`
- `accent`: `#00e5ff`
- `grid`: `#0f0f18`
- `gridSecondary`: `#0a0a12`
- `ground`: `#0c0c14`
- `active`: `#00e5ff`
- `idle`: `#4aa8ff`
- `particle`: `#a0d0ff`
- `electricCyan`: `#00e5ff`
- `coldBlue`: `#4aa8ff`
- `pulseWhite`: `#ffffff`
- `amber`: `#ff9d3a`
- `deepRed`: `#ff3b5c`
- `databasePurple`: `#9d7bff`
- `serviceGreen`: `#5ce1a8`

### 7.3 同步主题 JSON

同步更新 `public/themes/default.json`，确保运行时可加载相同配色。

---

## 8. 实现映射

### 8.1 主要改动文件

| 文件 | 改动 |
|------|------|
| `src/utils/theme.ts` | 扩展 `ThemeColors`，更新 `FALLBACK_THEME`、`validateTheme`、`applyTheme` |
| `public/themes/default.json` | 同步默认主题色，新增数据能量色字段 |
| `src/components/BuildingCluster.tsx` | 自定义 ShaderMaterial、建筑底部光环、标签逻辑 |
| `src/components/CableSystem.tsx` | TubeGeometry + 自定义光缆 Shader + 数据流粒子 |
| `src/components/CityGround.tsx` | 圆形平台、网格、反射 |
| `src/components/Atmosphere.tsx` | 星点、尘埃粒子、体积光 |
| `src/utils/colors.ts` | 扩展 `colorForProcess` 映射，支持新色相 |
| `src/App.tsx` | 调整默认相机角度、后处理 Bloom 参数 |

### 8.2 技术要点

- 建筑使用 `InstancedMesh` + `ShaderMaterial` 保持高性能。
- 光缆使用 `TubeGeometry` + 自定义 Shader，避免过多 Draw Call。
- 数据流粒子使用 `THREE.Points` 或 GPU Instancing。
- 后处理栈保留 `UnrealBloomPass` 并调整参数。

---

## 9. 验收标准

### 9.1 视觉验收

- [ ] 深空背景 + 星点/尘埃粒子与设计图氛围一致。
- [ ] 建筑呈现半透明晶体发光效果，有冷蓝到电光青的垂直渐变。
- [ ] 高 CPU / 内存建筑呈现琥珀 / 橙色。
- [ ] 进程标签始终可见，白色文字带描边，可读性强。
- [ ] 光缆为平滑弧形发光管，有流动粒子。
- [ ] 地面为极暗网格 / 点阵，有圆形平台感。
- [ ] 远景有低密度剪影城市。
- [ ] Bloom 后处理让发光区域产生柔和晕影。

### 9.2 技术验收

- [ ] `npx tsc --noEmit` 通过。
- [ ] `npm test` 通过。
- [ ] `npm run build` 通过。
- [ ] M1 / 同级设备 1080p 下保持 ≥ 30fps（画质模式）或 ≥ 50fps（平衡模式）。

### 9.3 排除项验收

- [ ] 不包含左上角 HUD 面板。
- [ ] 不包含右下角主题选择面板。

---

**This file is the single source of truth for the visual replication design.**
**On any conflict between this file and any agent's recollection, this file wins.**
**Edit only via the constitution change protocol defined in `multi-track-development-planning/SKILL.md`.**
