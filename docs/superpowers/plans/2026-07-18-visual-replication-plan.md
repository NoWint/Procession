# Procession 前端设计图复刻实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将设计图中的深空数字城市视觉风格复刻到 Procession 的 3D 主界面，包括发光晶体建筑、弧形光缆、数据流粒子、进程标签、圆形地面与大气效果。

**Architecture:** 以自定义 GLSL ShaderMaterial 替换现有建筑的 MeshStandardMaterial，以 TubeGeometry 替换光缆的 LineSegments，同步扩展主题色系统，并通过 Atmosphere/CityGround 组件重构环境与后处理。

**Tech Stack:** React 18, React Three Fiber, Three.js, @react-three/drei, @react-three/postprocessing, TypeScript, GLSL

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `src/utils/theme.ts` | 扩展 `ThemeColors` 接口与验证/应用逻辑 |
| `public/themes/default.json` | 默认主题 JSON，供运行时加载 |
| `src/utils/colors.ts` | 进程颜色与协议颜色映射 |
| `src/components/BuildingCluster.tsx` | 建筑实例化网格、自定义建筑 Shader、进程标签 |
| `src/components/BuildingHalo.tsx` | 建筑底部能量环，随建筑颜色变化 |
| `src/components/CableSystem.tsx` | 弧形 TubeGeometry 光缆与自定义 Shader |
| `src/components/CableFlow.tsx` | 沿光缆流动的数据粒子 |
| `src/components/CityGround.tsx` | 圆形平台地面与暗色网格 |
| `src/components/Atmosphere.tsx` | 星点、尘埃粒子、Bloom 后处理参数 |
| `src/components/CityScene.tsx` | 场景雾效、默认相机角度、环境光 |
| `src/App.tsx` | 组件组合、标签始终可见、相机目标逻辑 |

---

## Task 1: 扩展主题系统

**Files:**
- Modify: `src/utils/theme.ts`
- Modify: `public/themes/default.json`
- Modify: `src/utils/colors.ts`

### Step 1.1: 扩展 `ThemeColors` 接口

- [ ] 在 `src/utils/theme.ts` 中给 `ThemeColors` 接口新增字段：

```ts
export interface ThemeColors {
  // ... existing fields ...
  electricCyan: string;   // #00e5ff
  coldBlue: string;       // #4aa8ff
  pulseWhite: string;     // #ffffff
  amber: string;          // #ffb84d
  deepRed: string;        // #ff3b5c
  databasePurple: string; // #9d7bff
  serviceGreen: string;   // #5ce1a8
}
```

### Step 1.2: 更新 `FALLBACK_THEME`

- [ ] 将 `FALLBACK_THEME.colors` 替换为：

```ts
colors: {
  background: "#03040a",
  surface: "#0c0c10",
  surfaceElevated: "#131318",
  text: "#f2f4f8",
  textMuted: "#9da2ad",
  accent: "#00e5ff",
  border: "#2a2a35",
  grid: "#0f0f18",
  gridSecondary: "#0a0a12",
  ground: "#0c0c14",
  system: "#c0c0d0",
  user: "#9090a0",
  active: "#00e5ff",
  idle: "#4aa8ff",
  sleeping: "#6a6a75",
  stopped: "#3a3a45",
  zombie: "#2a2a35",
  particle: "#a0d0ff",
  electricCyan: "#00e5ff",
  coldBlue: "#4aa8ff",
  pulseWhite: "#ffffff",
  amber: "#ffb84d",
  deepRed: "#ff3b5c",
  databasePurple: "#9d7bff",
  serviceGreen: "#5ce1a8",
},
scene: {
  ambientIntensity: 0.15,
  directionalIntensity: 0.6,
  fogColor: "#03040a",
  fogNear: 15,
  fogFar: 80,
},
```

### Step 1.3: 更新验证函数

- [ ] 在 `validateTheme` 的 `colorKeys` 数组末尾追加新字段：

```ts
const colorKeys: (keyof ThemeColors)[] = [
  // ... existing keys ...
  "electricCyan",
  "coldBlue",
  "pulseWhite",
  "amber",
  "deepRed",
  "databasePurple",
  "serviceGreen",
];
```

### Step 1.4: 更新 CSS 变量应用

- [ ] 在 `applyTheme` 函数末尾追加：

```ts
root.style.setProperty("--proc-electric-cyan", c.electricCyan);
root.style.setProperty("--proc-cold-blue", c.coldBlue);
root.style.setProperty("--proc-pulse-white", c.pulseWhite);
root.style.setProperty("--proc-amber", c.amber);
root.style.setProperty("--proc-deep-red", c.deepRed);
root.style.setProperty("--proc-database-purple", c.databasePurple);
root.style.setProperty("--proc-service-green", c.serviceGreen);
```

### Step 1.5: 更新默认主题 JSON

- [ ] 将 `public/themes/default.json` 的 `colors` 替换为与 `FALLBACK_THEME` 完全一致的内容，并新增 `scene` 的对应值。

### Step 1.6: 更新颜色映射

- [ ] 将 `src/utils/colors.ts` 替换为：

```ts
import type { ProcessInfo } from "./types";
import { FALLBACK_THEME, colorForState, type Theme } from "./theme";

const systemNames = ["System", "kernel", "launchd", "init", "systemd", "services", "registry"];
const databaseNames = ["sql", "mysql", "postgres", "mongo", "redis", "db", "database"];
const browserNames = ["chrome", "safari", "firefox", "edge", "opera"];
const editorNames = ["code", "vscode", "cursor", "idea", "vim", "emacs"];

export function isSystemProcess(p: ProcessInfo): boolean {
  return systemNames.some((s) => p.name.toLowerCase().includes(s.toLowerCase())) || p.user === "SYSTEM" || p.user === "root";
}

export function isDatabaseProcess(p: ProcessInfo): boolean {
  return databaseNames.some((s) => p.name.toLowerCase().includes(s));
}

export function isBrowserProcess(p: ProcessInfo): boolean {
  return browserNames.some((s) => p.name.toLowerCase().includes(s));
}

export function isEditorProcess(p: ProcessInfo): boolean {
  return editorNames.some((s) => p.name.toLowerCase().includes(s));
}

export function colorForProcess(p: ProcessInfo, theme: Theme = FALLBACK_THEME): string {
  if (p.state === "Zombie") return theme.colors.zombie;
  if (p.state === "Stopped") return theme.colors.stopped;
  if (p.state === "Sleeping") return theme.colors.sleeping;

  if (p.cpu > 50) return theme.colors.amber;

  if (isDatabaseProcess(p)) return theme.colors.databasePurple;
  if (isBrowserProcess(p)) return theme.colors.coldBlue;
  if (isEditorProcess(p)) return theme.colors.serviceGreen;
  if (isSystemProcess(p)) return theme.colors.system;

  if (p.cpu < 3) return theme.colors.idle;
  return theme.colors.user;
}

const PROTOCOL_COLORS: Record<string, string> = {
  tcp: "#4aa8ff",
  udp: "#5ce1a8",
  http: "#00e5ff",
  https: "#00e5ff",
  ssh: "#5ce1a8",
  dns: "#9d7bff",
};

export function cableColorForProtocol(protocol: string, theme: Theme = FALLBACK_THEME): string {
  const key = protocol.toLowerCase().trim();
  return PROTOCOL_COLORS[key] ?? theme.colors.coldBlue;
}

export { colorForState };
export type { Theme };
```

### Step 1.7: 运行类型检查

Run: `npx tsc --noEmit`
Expected: exit 0

### Step 1.8: 提交

```bash
git add src/utils/theme.ts src/utils/colors.ts public/themes/default.json
git commit -m "feat(theme): extend color tokens for digital-city replication"
```

---

## Task 2: 建筑 Shader 与标签

**Files:**
- Modify: `src/components/BuildingCluster.tsx`

### Step 2.1: 定义建筑 Shader

- [ ] 在 `src/components/BuildingCluster.tsx` 顶部、imports 之后添加 GLSL shader 字符串：

```ts
const buildingVertexShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
  }
`;

const buildingFragmentShader = `
  uniform vec3 uColorBottom;
  uniform vec3 uColorTop;
  uniform vec3 uEmissive;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uSelected;
  uniform float uHovered;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;

  void main() {
    vec3 baseColor = mix(uColorBottom, uColorTop, vUv.y);

    // Fresnel edge glow
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 2.0);
    baseColor += uEmissive * fresnel * 0.6;

    // Energy scan lines
    float scan = sin(vUv.y * 20.0 - uTime * 2.0) * 0.5 + 0.5;
    baseColor += uEmissive * scan * 0.08 * uEnergy;

    // Highlight for selection/hover
    baseColor = mix(baseColor, vec3(1.0), (uSelected + uHovered * 0.5) * fresnel);

    gl_FragColor = vec4(baseColor, 0.92);
  }
`;
```

### Step 2.2: 替换材质

- [ ] 将组件中的 `<instancedMesh>` 内部材质替换为：

```tsx
<instancedMesh
  ref={meshRef}
  args={[undefined, undefined, Math.max(1, maxBuildings * 2)]}
  onClick={handleClick}
  onDoubleClick={handleDoubleClick}
  onPointerOver={handlePointerOver}
  onPointerOut={handlePointerOut}
  frustumCulled
>
  <boxGeometry args={[0.75, 1, 0.75]} />
  <shaderMaterial
    ref={materialRef}
    vertexShader={buildingVertexShader}
    fragmentShader={buildingFragmentShader}
    transparent
    depthWrite={false}
    uniforms={{
      uTime: { value: 0 },
      uColorBottom: { value: new THREE.Color(theme.colors.coldBlue) },
      uColorTop: { value: new THREE.Color(theme.colors.electricCyan) },
      uEmissive: { value: new THREE.Color(theme.colors.electricCyan) },
      uEnergy: { value: 0.5 },
      uSelected: { value: 0 },
      uHovered: { value: 0 },
    }}
  />
</instancedMesh>
```

### Step 2.3: 更新每帧建筑数据

- [ ] 在 `useFrame` 循环中，为每个实例设置 uniforms 相关颜色（通过 setColorAt 传递 base color），并更新材质全局 uniform：

```ts
// Inside useFrame, after updating matrix and color:
_color.copy(
  process
    ? new THREE.Color(colorForProcess(process, theme))
    : entry?.color ?? new THREE.Color(theme.colors.idle),
);

// Compute top/bottom colors from base
const bottomColor = _color.clone().multiplyScalar(0.7);
const topColor = _color.clone().offsetHSL(0, 0, 0.15);

mesh.setColorAt(instanceIndex, _color);

// Store per-instance data for shader if needed (colors stored in instanceColor)
// For gradient direction we rely on the global color + instanceColor tint.
```

- [ ] 更新材质 uniform：

```ts
if (materialRef.current) {
  materialRef.current.uniforms.uTime.value = clock.elapsedTime;
}
```

### Step 2.4: 标签始终可见

- [ ] 将 `showLabels` 的使用改为无条件渲染所有非空进程标签（移除 `showLabels &&` 和 `maxLabels` 限制）：

```tsx
{positions.map((pos) => {
  const process = processes.find((p) => p.pid === pos.pid);
  if (!process) return null;
  return (
    <Html
      key={`label-${pos.pid}`}
      position={[pos.x, pos.height + 0.9, pos.z]}
      center
      distanceFactor={14}
      style={{ pointerEvents: "none" }}
    >
      <div className="building-label">{process.name}</div>
    </Html>
  );
})}
```

### Step 2.5: 添加标签样式

- [ ] 在 `src/App.css` 中添加：

```css
.building-label {
  color: #f2f4f8;
  font-size: 12px;
  font-family: var(--proc-font-body), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  white-space: nowrap;
  letter-spacing: 0.02em;
  opacity: 0.95;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.building-label:hover {
  opacity: 1;
  transform: scale(1.05);
}
```

### Step 2.6: 运行测试

Run: `npm test -- --run`
Expected: all tests pass

### Step 2.7: 提交

```bash
git add src/components/BuildingCluster.tsx src/App.css
git commit -m "feat(buildings): crystalline shader and always-visible labels"
```

---

## Task 3: 建筑底部能量环

**Files:**
- Modify: `src/components/BuildingHalo.tsx`

### Step 3.1: 更新 Halo 颜色与尺寸

- [ ] 将 `BuildingHalo.tsx` 改为使用建筑实际颜色，并扩大光环范围：

```ts
const HALO_INNER = 0.45;
const HALO_OUTER = 0.7;
```

- [ ] 在 `haloData` 中保留进程到颜色的映射：

```ts
const haloData = useMemo(() => {
  const running = processes.filter((p) => p.state === "Running");
  const posMap = new Map(positions.map((p) => [p.pid, p]));
  return running
    .map((p) => ({ process: p, position: posMap.get(p.pid) }))
    .filter((d): d is { process: ProcessInfo; position: BuildingPosition } => !!d.position)
    .slice(0, 80);
}, [processes, positions]);
```

- [ ] 在 `useEffect` 中按进程颜色设置 instance color：

```ts
import { colorForProcess } from "../utils/colors";

haloData.forEach((d, i) => {
  dummy.position.set(d.position.x, HALO_Y_OFFSET, d.position.z);
  dummy.rotation.set(-Math.PI / 2, 0, 0);
  dummy.scale.set(1 + d.position.height * 0.02, 1 + d.position.height * 0.02, 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
  mesh.setColorAt(i, new THREE.Color(colorForProcess(d.process, theme)));
});
```

### Step 3.2: 增强 Halo Shader

- [ ] 将 fragment shader 改为发光圆环：

```glsl
const fragmentShader = `
  uniform vec3 color;
  uniform float opacity;
  varying vec2 vUv;

  void main() {
    float dist = distance(vUv, vec2(0.5));
    float ring = smoothstep(0.5, 0.48, dist) * smoothstep(0.42, 0.44, dist);
    gl_FragColor = vec4(color, opacity * ring);
  }
`;
```

- [ ] 将 `opacity` uniform 提高到 `0.75`。

### Step 3.3: 运行类型检查

Run: `npx tsc --noEmit`
Expected: exit 0

### Step 3.4: 提交

```bash
git add src/components/BuildingHalo.tsx
git commit -m "feat(halo): colored energy rings per building"
```

---

## Task 4: 弧形光缆几何

**Files:**
- Modify: `src/components/CableSystem.tsx`

### Step 4.1: 改用 TubeGeometry

- [ ] 在 `buildBatchedCableGeometry` 函数中改为生成合并的 `TubeGeometry`：

```ts
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export function buildBatchedCableGeometry(
  cables: CableData[],
  theme: Theme = FALLBACK_THEME,
): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];
  const colorArray: number[] = [];

  for (const cable of cables) {
    const curve = new THREE.CatmullRomCurve3(cable.path);
    const tube = new THREE.TubeGeometry(curve, 32, 0.08, 8, false);
    const count = tube.attributes.position.count;
    const color = new THREE.Color(cableColorForProtocol(cable.protocol, theme));
    for (let i = 0; i < count; i++) {
      colorArray.push(color.r, color.g, color.b);
    }
    geometries.push(tube);
  }

  if (geometries.length === 0) {
    return new THREE.BufferGeometry();
  }

  const merged = mergeGeometries(geometries, false);
  if (!merged) return new THREE.BufferGeometry();

  merged.setAttribute("color", new THREE.Float32BufferAttribute(colorArray, 3));
  return merged;
}
```

### Step 4.2: 更新光缆路径生成

- [ ] 将 `computeCableData` 中的拱高和曲线改为更平滑的 `CatmullRomCurve3`：

```ts
const ARCH_HEIGHT = 4.0;

export function computeCableData(
  connections: Connection[],
  positions: BuildingPosition[],
  maxCables: number = 100,
): CableData[] {
  const posMap = new Map<number, BuildingPosition>();
  for (const p of positions) {
    posMap.set(p.pid, p);
  }

  const cables: CableData[] = [];
  for (const c of connections) {
    if (cables.length >= maxCables) break;

    const src = posMap.get(c.pid);
    if (!src) continue;

    const dst = remoteEndpointPosition(c.remote_addr);
    if (dst.x === 0 && dst.y === 0 && dst.z === 0) continue;

    const start = new THREE.Vector3(src.x, src.height * 0.7, src.z);
    const end = new THREE.Vector3(dst.x, dst.y + 1, dst.z);
    const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
    mid.y = Math.max(start.y, end.y) + ARCH_HEIGHT;

    const control1 = new THREE.Vector3().lerpVectors(start, mid, 0.5);
    const control2 = new THREE.Vector3().lerpVectors(mid, end, 0.5);

    const curve = new THREE.CatmullRomCurve3([start, control1, control2, end]);
    cables.push({ path: curve.getPoints(50), protocol: c.protocol });
  }

  return cables;
}
```

### Step 4.3: 更新渲染材质

- [ ] 将 `<lineSegments>` 替换为：

```tsx
<mesh geometry={geometry} renderOrder={1}>
  <meshStandardMaterial
    vertexColors
    transparent
    opacity={0.7}
    emissive="#ffffff"
    emissiveIntensity={0.2}
    roughness={0.4}
    metalness={0.6}
    depthWrite={false}
  />
</mesh>
```

### Step 4.4: 运行类型检查

Run: `npx tsc --noEmit`
Expected: exit 0

### Step 4.5: 提交

```bash
git add src/components/CableSystem.tsx
git commit -m "feat(cables): smooth tube geometry for network cables"
```

---

## Task 5: 数据流粒子增强

**Files:**
- Modify: `src/components/CableFlow.tsx`

### Step 5.1: 增大粒子并增强发光

- [ ] 将 `PARTICLE_SIZE` 改为 `0.22`，粒子颜色亮度提高：

```ts
const PARTICLE_SIZE = 0.22;
```

- [ ] 在 `useMemo` 生成颜色时，将颜色向白色偏移以提高亮度：

```ts
const base = new THREE.Color(cableColorForProtocol(protocol, theme));
const bright = base.clone().offsetHSL(0, 0, 0.25);
colors[i * 3] = bright.r;
colors[i * 3 + 1] = bright.g;
colors[i * 3 + 2] = bright.b;
```

### Step 5.2: 材质增强

- [ ] 将 `pointsMaterial` 替换为：

```tsx
<pointsMaterial
  size={PARTICLE_SIZE}
  transparent
  opacity={0.95}
  depthWrite={false}
  sizeAttenuation
  vertexColors
  blending={THREE.AdditiveBlending}
/>
```

### Step 5.3: 运行类型检查

Run: `npx tsc --noEmit`
Expected: exit 0

### Step 5.4: 提交

```bash
git add src/components/CableFlow.tsx
git commit -m "feat(cable-flow): brighter additive particles"
```

---

## Task 6: 圆形地面平台

**Files:**
- Modify: `src/components/CityGround.tsx`

### Step 6.1: 替换为圆形平台

- [ ] 将 `CityGround.tsx` 替换为：

```tsx
import { useMemo } from "react";
import { FALLBACK_THEME, type Theme } from "../utils/theme";
import * as THREE from "three";

interface CityGroundProps {
  theme?: Theme;
}

export default function CityGround({ theme = FALLBACK_THEME }: CityGroundProps) {
  const geometry = useMemo(() => {
    const geo = new THREE.CircleGeometry(55, 128);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  return (
    <group>
      <gridHelper
        args={[110, 80, theme.colors.grid, theme.colors.gridSecondary]}
        position={[0, 0.01, 0]}
      />
      <mesh geometry={geometry} position={[0, -0.02, 0]} rotation={[0, 0, 0]}>
        <meshStandardMaterial
          color={theme.colors.ground}
          transparent
          opacity={0.9}
          roughness={0.95}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
}
```

### Step 6.2: 运行类型检查

Run: `npx tsc --noEmit`
Expected: exit 0

### Step 6.3: 提交

```bash
git add src/components/CityGround.tsx
git commit -m "feat(ground): circular city platform with subtle grid"
```

---

## Task 7: 大气与后处理

**Files:**
- Modify: `src/components/Atmosphere.tsx`
- Modify: `src/components/CityScene.tsx`

### Step 7.1: 增强粒子背景

- [ ] 将 `Atmosphere.tsx` 的粒子数量提升到 `600`，尺寸和颜色调整：

```ts
particleCount = 600,
// positions generation: range 120, y 0-60
positions[i * 3] = (Math.random() - 0.5) * 120;
positions[i * 3 + 1] = Math.random() * 60;
positions[i * 3 + 2] = (Math.random() - 0.5) * 120;
```

- [ ] 将 `pointsMaterial` 调整为：

```tsx
<pointsMaterial
  color={theme.colors.particle}
  size={0.12}
  transparent
  opacity={0.5}
  sizeAttenuation
/>
```

### Step 7.2: 调整 Bloom 参数

- [ ] 将 `Bloom` 参数改为：

```tsx
<Bloom
  intensity={theme.mode === "dark" ? 0.85 : 0.55}
  luminanceThreshold={theme.mode === "dark" ? 0.45 : 0.6}
  luminanceSmoothing={0.35}
  mipmapBlur
/>
```

### Step 7.3: 雾效与相机

- [ ] 在 `CityScene.tsx` 中将 `Fog` 改为 `FogExp2`：

```tsx
import { FogExp2 } from "three";

scene={{
  fog: new FogExp2(new Color(theme.scene.fogColor), 0.018),
  background: new Color(theme.colors.background),
}}
```

- [ ] 调整默认相机位置以匹配设计图俯视角度：

```tsx
camera={{ position: [28, 22, 28], fov: 45 }}
```

### Step 7.4: 运行类型检查

Run: `npx tsc --noEmit`
Expected: exit 0

### Step 7.5: 提交

```bash
git add src/components/Atmosphere.tsx src/components/CityScene.tsx
git commit -m "feat(atmosphere): stronger bloom, fog, and camera angle"
```

---

## Task 8: App 集成与标签可见性

**Files:**
- Modify: `src/App.tsx`

### Step 8.1: 标签始终可见

- [ ] 将 `BuildingCluster` 的 `showLabels` prop 改为 `true`：

```tsx
<BuildingCluster
  processes={displaySnapshot.processes}
  positions={positions}
  theme={theme}
  selectedPid={selectedProcess?.pid ?? null}
  showLabels={true}
  maxBuildings={maxBuildings}
  onClick={handleBuildingClick}
  onDoubleClick={handleBuildingDoubleClick}
  onHover={setHoveredProcess}
/>
```

### Step 8.2: 隐藏 HUD 与主题面板（按复刻范围）

- [ ] 注释或移除 `HudPanel`、`ThemeSelector`、`ThemeEditor`、`FpsCounter`、`UtilityMode` 的渲染：

```tsx
{/* <HudPanel snapshot={displaySnapshot} theme={theme} /> */}
{/* <ThemeSelector currentUrl={currentThemeUrl} onChange={handleThemeChange} /> */}
```

- [ ] 保留 `TimelineConsole`（不在排除范围内，且属于现有功能）。

### Step 8.3: 运行应用验证

Run: `npm run dev`
Expected: 应用启动后显示 3D 城市，建筑发光、标签可见、光缆为管状。

### Step 8.4: 提交

```bash
git add src/App.tsx
git commit -m "feat(app): always-visible labels and hide non-replicated UI"
```

---

## Task 9: 最终验收

**Files:**
- All modified files

### Step 9.1: 运行完整检查

- [ ] Run: `npx tsc --noEmit` → exit 0
- [ ] Run: `npm test -- --run` → all pass
- [ ] Run: `npm run build` → exit 0
- [ ] Run: `cargo clippy` (if applicable) → exit 0

### Step 9.2: 视觉验收

- [ ] 启动应用，确认深空背景和星点。
- [ ] 确认建筑为晶体发光效果，高 CPU 建筑为橙色。
- [ ] 确认进程标签始终可见。
- [ ] 确认光缆为平滑弧形管状，有流动粒子。
- [ ] 确认地面为暗色圆形平台。
- [ ] 确认 Bloom 晕影明显但不糊。

### Step 9.3: 提交与推送

```bash
git add .
git commit -m "feat(visuals): complete digital-city mockup replication"
git push
```

---

## Self-Review Checklist

- [x] **Spec coverage**: 每个 spec 章节（色彩、建筑、光缆、地面、大气、标签、相机）都有对应任务。
- [x] **Placeholder scan**: 无 TBD/TODO/"implement later"。
- [x] **Type consistency**: `ThemeColors` 字段、`colorForProcess` 返回类型、`CableData` 结构在所有任务中一致。
- [x] **No over-engineering**: 复用现有 `CableFlow`、`BuildingHalo`、`TimelineConsole`，只升级视觉效果。

---

## Notes

- 若性能低于 30fps，可降低粒子数量、`maxBuildings` 默认值或关闭 `mipmapBlur`。
- 建筑 Shader 中的 `instanceMatrix` 在 R3F 中可用；如遇到 uniform 更新问题，可将 per-instance 颜色通过 `setColorAt` 与 shader 中的 `instanceColor` attribute 结合。
