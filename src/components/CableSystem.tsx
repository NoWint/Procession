import { useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Connection } from "../utils/types";
import type { BuildingPosition } from "../utils/layout";
import { cableColorForProtocol } from "../utils/colors";
import { FALLBACK_THEME, type Theme } from "../utils/theme";
import { CABLE_Y } from "../utils/worldCoords";

/**
 * 城市地下光缆系统
 *
 * 设计逻辑（"城市"隐喻）：
 * - 光缆贴地铺设（y=0.04，紧贴地面，下沉到 halo 下方避免共面）
 * - L 形路径（Manhattan 路径）：先沿 X 走到目标 X，再沿 Z 走到目标 Z
 *   模拟城市光缆沿道路铺设的视觉
 * - 流光脉冲：管道内有数据脉冲流动（一个亮带沿管道移动），不是整条发光
 * - 节点装饰：
 *   - 起点（建筑底部出口）：小圆盘
 *   - 转角（L 形拐弯处）：接线盒
 *   - 末端（地图边缘）：出城接口
 * - 协议分色：HTTP=青/SSH=绿/DB=紫/P2P=红/系统=蓝
 */

const cableVertexShader = `
  varying vec2 vUv;
  varying vec3 vColor;
  attribute vec3 color;

  void main() {
    vUv = uv;
    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const cableFragmentShader = `
  varying vec2 vUv;
  varying vec3 vColor;
  uniform float uTime;

  void main() {
    // 基础管道色（暗）：管道本身不发光，只是颜色标识
    vec3 baseColor = vColor * 0.35;

    // 流光脉冲：一个亮带沿管道方向移动
    // uTime 推进脉冲位置，脉冲宽度 0.15，间隔 1.0（每条管道一个脉冲）
    float pulsePos = fract(vUv.x - uTime * 0.4);
    float pulse = exp(-pow((pulsePos - 0.5) * 6.0, 2.0));  // 高斯峰
    vec3 pulseColor = vColor * pulse * 2.5;

    // 头尾淡入淡出（避免突兀的端点）
    float fade = smoothstep(0.0, 0.05, vUv.x) * (1.0 - smoothstep(0.95, 1.0, vUv.x));

    vec3 finalColor = baseColor + pulseColor;
    gl_FragColor = vec4(finalColor, 0.9 * fade);
  }
`;

interface CableSystemProps {
  connections?: Connection[];
  positions?: BuildingPosition[];
  cables?: CableData[];
  theme?: Theme;
  maxCables?: number;
}

export interface CableData {
  path: THREE.Vector3[];
  protocol: string;
  // 装饰节点：起点、转角、末端
  nodes: { pos: THREE.Vector3; type: "start" | "corner" | "end" }[];
}

// 远端终点：分布在地图边缘（半径 72-78），模拟"出城接口"
// 之前 50-58 落在建筑群内会被遮挡，现在贴地走需要到地图边缘
const EXTERNAL_RADIUS_MIN = 72;
const EXTERNAL_RADIUS_VAR = 6;
// 光缆高度：贴地，紧贴地板上方（下沉到 halo 下方避免共面）
const PIPE_Y = CABLE_Y;
// 管道半径：细管道感（不像之前粗管）
const PIPE_RADIUS = 0.12;

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function parseHost(addr: string): string {
  return addr.split(":")[0] ?? addr;
}

function isNullHost(host: string): boolean {
  return host === "0.0.0.0" || host === "::" || host === "";
}

export function remoteEndpointPosition(remoteAddr: string): { x: number; y: number; z: number } {
  const host = parseHost(remoteAddr);
  if (isNullHost(host)) {
    return { x: 0, y: 0, z: 0 };
  }
  const h = hashString(host);
  const angle = (h % 360) * (Math.PI / 180);
  const radius = EXTERNAL_RADIUS_MIN + ((h % 1000) / 1000) * EXTERNAL_RADIUS_VAR;
  return {
    x: Math.cos(angle) * radius,
    y: PIPE_Y,
    z: Math.sin(angle) * radius,
  };
}

/**
 * 生成 L 形（Manhattan）路径：从建筑底部出发，先沿 X 走，再沿 Z 走到目标
 * 模拟城市管道沿道路铺设的视觉
 */
function computeLPath(start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3[] {
  const path: THREE.Vector3[] = [start];

  // 中间转角点：先 X 后 Z（L 形）
  // 加微小圆角避免直角（用 2 个中间点形成短斜线）
  const cornerX = end.x;
  const cornerZ = start.z;
  const corner = new THREE.Vector3(cornerX, PIPE_Y, cornerZ);

  // 圆角：在转角前后各加一个点，形成短斜线
  const cornerOffset = 0.8;
  const preCorner = new THREE.Vector3(
    corner.x - Math.sign(end.x - start.x) * cornerOffset,
    PIPE_Y,
    corner.z,
  );
  const postCorner = new THREE.Vector3(
    corner.x,
    PIPE_Y,
    corner.z + Math.sign(end.z - start.z) * cornerOffset,
  );

  // 避免起点和 preCorner 太近（短管道时退化）
  if (preCorner.distanceTo(start) > 1.0) path.push(preCorner);
  if (postCorner.distanceTo(preCorner) > 0.5) path.push(postCorner);
  path.push(end);

  return path;
}

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

    // 起点：建筑底部（贴地，从建筑边缘出发）
    const start = new THREE.Vector3(src.x, PIPE_Y, src.z);
    const end = new THREE.Vector3(dst.x, PIPE_Y, dst.z);

    // L 形路径（沿道路铺设）
    const path = computeLPath(start, end);

    // 装饰节点
    const nodes: CableData["nodes"] = [
      { pos: start.clone(), type: "start" },
    ];
    // 如果有转角（路径 > 2 个点），添加转角节点
    if (path.length >= 3) {
      // 转角点大约在路径中间
      const cornerIdx = Math.floor(path.length / 2);
      nodes.push({ pos: path[cornerIdx].clone(), type: "corner" });
    }
    nodes.push({ pos: end.clone(), type: "end" });

    cables.push({ path, protocol: c.protocol, nodes });
  }

  return cables;
}

export function computeCablePaths(
  connections: Connection[],
  positions: BuildingPosition[],
  maxCables: number = 100,
): THREE.Vector3[][] {
  return computeCableData(connections, positions, maxCables).map((c) => c.path);
}

/**
 * 构建批量的管道几何（合并所有 TubeGeometry）
 */
export function buildBatchedCableGeometry(
  cables: CableData[],
  theme: Theme = FALLBACK_THEME,
): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];
  const colorArray: number[] = [];

  for (const cable of cables) {
    // 用 CatmullRom 平滑 L 形路径的圆角
    const curve = new THREE.CatmullRomCurve3(cable.path);
    const tube = new THREE.TubeGeometry(curve, 48, PIPE_RADIUS, 8, false);
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

/**
 * 构建装饰节点几何（起点/转角/末端的圆盘）
 * 返回 { geometry, colors } 用于 InstancedMesh 的颜色属性
 */
export function buildCableNodesGeometry(
  cables: CableData[],
  theme: Theme = FALLBACK_THEME,
): { geometry: THREE.BufferGeometry; colors: Float32Array; count: number } {
  const positions: number[] = [];
  const colors: number[] = [];
  const sizes: number[] = [];

  for (const cable of cables) {
    for (const node of cable.nodes) {
      positions.push(node.pos.x, node.pos.y, node.pos.z);
      const color = new THREE.Color(cableColorForProtocol(cable.protocol, theme));
      colors.push(color.r, color.g, color.b);
      // 节点大小：起点 0.3、转角 0.4、末端 0.6（出城接口更大）
      const size = node.type === "end" ? 0.6 : node.type === "corner" ? 0.4 : 0.3;
      sizes.push(size);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));

  return {
    geometry: geo,
    colors: new Float32Array(colors),
    count: positions.length / 3,
  };
}

export default function CableSystem({
  connections = [],
  positions = [],
  cables: providedCables,
  theme = FALLBACK_THEME,
  maxCables = 100,
}: CableSystemProps) {
  const prevGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const prevNodesGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const nodeMaterialRef = useRef<THREE.ShaderMaterial>(null);

  // 流光动画
  useEffect(() => {
    const clock = new THREE.Clock();
    let rafId = 0;
    const animate = () => {
      const t = clock.getElapsedTime();
      if (materialRef.current) {
        materialRef.current.uniforms.uTime.value = t;
      }
      if (nodeMaterialRef.current) {
        nodeMaterialRef.current.uniforms.uTime.value = t;
      }
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const cables = useMemo(
    () => providedCables ?? computeCableData(connections, positions, maxCables),
    [providedCables, connections, positions, maxCables],
  );

  const geometry = useMemo(
    () => buildBatchedCableGeometry(cables, theme),
    [cables, theme],
  );

  const nodesData = useMemo(
    () => buildCableNodesGeometry(cables, theme),
    [cables, theme],
  );

  // 几何清理
  useEffect(() => {
    const prev = prevGeoRef.current;
    prevGeoRef.current = geometry;
    return () => {
      if (prev && prev !== geometry) prev.dispose();
    };
  }, [geometry]);

  useEffect(() => {
    const prev = prevNodesGeoRef.current;
    prevNodesGeoRef.current = nodesData.geometry;
    return () => {
      if (prev && prev !== nodesData.geometry) prev.dispose();
    };
  }, [nodesData.geometry]);

  if (cables.length === 0) return null;

  // 节点 shader：圆盘形发光点，带流光脉冲同步
  const nodeVertexShader = `
    varying vec3 vColor;
    varying vec3 vWorldPos;
    attribute vec3 color;
    attribute float size;

    void main() {
      vColor = color;
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * 80.0 / -mvPos.z;  // 透视缩放
      gl_Position = projectionMatrix * mvPos;
      vWorldPos = position;
    }
  `;

  const nodeFragmentShader = `
    varying vec3 vColor;
    varying vec3 vWorldPos;
    uniform float uTime;

    void main() {
      // 圆盘形状（点精灵到圆形）
      vec2 uv = gl_PointCoord - 0.5;
      float r = length(uv);
      if (r > 0.5) discard;

      // 中心亮 + 边缘晕
      float core = 1.0 - smoothstep(0.0, 0.3, r);
      float halo = 1.0 - smoothstep(0.3, 0.5, r);

      // 呼吸脉冲
      float pulse = 0.7 + sin(uTime * 2.0 + vWorldPos.x * 0.3) * 0.3;

      vec3 color = vColor * (core * 1.5 + halo * 0.5) * pulse;
      gl_FragColor = vec4(color, 0.9);
    }
  `;

  return (
    <group>
      {/* 管道主体（贴地 TubeGeometry） */}
      <mesh geometry={geometry} renderOrder={5}>
        <shaderMaterial
          ref={materialRef}
          vertexShader={cableVertexShader}
          fragmentShader={cableFragmentShader}
          transparent
          depthWrite={false}
          depthTest
          blending={THREE.NormalBlending}
          uniforms={{
            uTime: { value: 0 },
          }}
        />
      </mesh>

      {/* 装饰节点（起点/转角/末端）- 用 Points 实现 */}
      <points geometry={nodesData.geometry} renderOrder={6}>
        <shaderMaterial
          ref={nodeMaterialRef}
          vertexShader={nodeVertexShader}
          fragmentShader={nodeFragmentShader}
          transparent
          depthWrite={false}
          depthTest
          blending={THREE.AdditiveBlending}
          uniforms={{
            uTime: { value: 0 },
          }}
        />
      </points>
    </group>
  );
}
