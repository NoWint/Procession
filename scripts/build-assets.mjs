#!/usr/bin/env node
/**
 * 生成预建建筑 GLB 模型，输出到 public/models/。
 *
 * 用 three.js 程序化生成几何（无 CanvasTexture 依赖，纯几何），
 * 然后用 GLTFExporter 导出为 GLB（二进制 glTF）。
 *
 * 运行方式：
 *   node scripts/build-assets.mjs
 *
 * 输出文件（每个 10-50KB）：
 *   public/models/building-low.glb        — 2 层，扁平，CPU<5% idle 进程
 *   public/models/building-mid.glb        — 4 层，中等底面积，CPU 5-30% 普通用户进程
 *   public/models/building-tall.glb       — 6 层，中等高度，CPU>50% 活跃进程
 *   public/models/building-skyscraper.glb — 22 单位超高，3 段收窄，城市地标（综合负载 Top 3）
 *   public/models/vehicle-car.glb         — 轿车（Phase C 道路交通）：车身+车顶+4轮+前/尾灯
 *   public/models/vehicle-truck.glb       — 卡车（Phase C 道路交通）：车头+集装箱+4轮+前/尾灯
 *   public/models/skyline-silhouette.glb  — 远景城市剪影（Phase D）：50 个扁平剪影建筑沿 X 轴排列
 *
 * 设计原则：
 *   - 同一套基础几何（底座 + 主体 + 窗户 + 屋顶），参数化差异
 *   - 窗户用小 Box geometry + emissive material（点亮的）/暗灰（未点亮）
 *   - emissive 颜色保持中性白，运行时由 BuildingCluster shader 注入主题色
 *   - low-poly（每个模型 <1500 三角形），保证 InstancedMesh 渲染开销低
 *   - skyscraper 三段式收窄（底/中/顶）模拟真实摩天大楼造型
 *   - 车辆 ~80-100 三角形，朝向 +X 为车头方向（TrafficFlow 通过 rotY 控制行驶方向）
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

// Polyfill FileReader（GLTFExporter binary 模式需要）
// Node 18+ 已有全局 Blob，但 FileReader 需手动提供
class FileReaderPolyfill {
  constructor() {
    this.result = null;
    this.onloadend = null;
  }
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onloadend) this.onloadend();
    });
  }
}
globalThis.FileReader = FileReaderPolyfill;

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = pathResolve(__dirname, "..");
const OUTPUT_DIR = pathResolve(PROJECT_ROOT, "public", "models");

// ========== 变体配置 ==========
const VARIANTS = [
  {
    id: "building-low",
    floors: 2,
    floorHeight: 1.0,
    baseWidth: 1.6,
    baseDepth: 1.6,
    windowDensity: 0.25,
    roofType: "flat",
  },
  {
    id: "building-mid",
    floors: 4,
    floorHeight: 1.0,
    baseWidth: 1.2,
    baseDepth: 1.2,
    windowDensity: 0.5,
    roofType: "flat",
  },
  {
    id: "building-tall",
    // 6 层（之前 8 层），为 skyscraper 让出"高"的视觉位置
    // 现在三层级：low(2) / mid(4) / tall(6) / skyscraper(22+)
    floors: 6,
    floorHeight: 1.0,
    baseWidth: 0.9,
    baseDepth: 0.9,
    windowDensity: 0.75,
    roofType: "antenna",
  },
  {
    // 摩天大楼：3 段收窄 + 顶部尖塔，模拟真实地标建筑
    // 总高 22 单位（底 10 + 中 8 + 顶 4）+ 尖塔 4 = 26
    id: "building-skyscraper",
    floors: 0,                  // 不使用标准 floors（用 segments 自定义）
    floorHeight: 1.0,
    baseWidth: 1.2,
    baseDepth: 1.2,
    windowDensity: 0.85,
    roofType: "spire",
    // 三段式配置
    segments: [
      { yStart: 0, height: 10, width: 1.2, depth: 1.2, floors: 6 },  // 底段：宽
      { yStart: 10, height: 8, width: 1.0, depth: 1.0, floors: 5 },   // 中段：退台收窄
      { yStart: 18, height: 4, width: 0.8, depth: 0.8, floors: 3 },   // 顶段：再收窄
    ],
    spireHeight: 4,              // 尖塔高度
  },
  // === Phase E: 状态特化变体 ===
  {
    // 僵尸进程：废弃建筑，倾斜 + 全暗窗户 + 暗黄绿主体
    // 视觉感：将倾的废墟，警示异常状态
    id: "building-zombie",
    floors: 2,
    floorHeight: 0.8,
    baseWidth: 1.2,
    baseDepth: 1.2,
    windowDensity: 0.0,         // 无亮窗（废弃感）
    roofType: "flat",
    tilt: 0.08,                // 整体倾斜约 4.5 度（将倾感）
    bodyTint: 0x2a2820,        // 暗黄绿（腐朽感）
    darkTint: 0x1a1815,        // 底座更深
  },
  {
    // 停止进程：静止建筑，深黑 + 极少亮窗
    // 视觉感：黑洞般的沉默建筑
    id: "building-stopped",
    floors: 3,
    floorHeight: 0.9,
    baseWidth: 1.1,
    baseDepth: 1.1,
    windowDensity: 0.1,        // 极少亮窗（几乎停止活动）
    roofType: "flat",
    bodyTint: 0x1a1a1a,        // 深黑
    darkTint: 0x0a0a0a,        // 底座
  },
  {
    // 睡眠进程：低活动建筑，暗灰蓝 + 部分亮窗
    // 视觉感：深夜安静的住宅楼
    id: "building-sleeping",
    floors: 4,
    floorHeight: 0.8,          // 楼层稍矮（沉睡感）
    baseWidth: 1.1,
    baseDepth: 1.1,
    windowDensity: 0.3,        // 部分亮窗
    roofType: "flat",
    bodyTint: 0x2a3038,        // 暗灰蓝
    darkTint: 0x1a1f25,        // 底座
  },
  // === Phase F: 类型特化变体 ===
  {
    // 系统进程：扁平宽基座，模拟"基础设施"地基感
    // 视觉感：低矮但宽厚，稳定的政府机构建筑
    id: "building-system",
    floors: 2,
    floorHeight: 1.2,           // 楼层稍高（庄重感）
    baseWidth: 1.8,             // 宽基座
    baseDepth: 1.8,
    windowDensity: 0.4,
    roofType: "flat",
    bodyTint: 0x2a3a4a,         // 蓝灰（冷感）
    darkTint: 0x1a2a3a,         // 底座更深
  },
  {
    // 数据库进程：高瘦塔 + 顶部光柱，模拟"存储塔"
    // 视觉感：像数据中心机房，顶部信号灯标识"数据节点"
    id: "building-database",
    floors: 5,
    floorHeight: 1.0,
    baseWidth: 0.8,             // 高瘦
    baseDepth: 0.8,
    windowDensity: 0.6,
    roofType: "antenna",        // 顶部光柱（紫色信号灯）
    bodyTint: 0x3a2a4a,         // 紫调
    darkTint: 0x2a1a3a,         // 底座
  },
  {
    // 浏览器进程：多窗户，模拟"多 tab"密集感
    // 视觉感：商务写字楼，窗户密集像蜂巢
    id: "building-browser",
    floors: 4,
    floorHeight: 0.9,
    baseWidth: 1.3,             // 中等宽
    baseDepth: 1.3,
    windowDensity: 0.95,        // 极高窗户密度（多 tab）
    roofType: "flat",
    bodyTint: 0x2a2a3a,         // 蓝灰
    darkTint: 0x1a1a2a,         // 底座
  },
  {
    // 编辑器进程：标准高度 + 天线，模拟"工作台"
    // 视觉感：程序员的工作塔，顶部天线发射"思考信号"
    id: "building-editor",
    floors: 4,
    floorHeight: 0.9,
    baseWidth: 1.1,
    baseDepth: 1.1,
    windowDensity: 0.7,
    roofType: "antenna",
    bodyTint: 0x3a3a2a,         // 黄绿（编辑器暖色感）
    darkTint: 0x2a2a1a,         // 底座
  },
  {
    // 运行时进程：中等高度，模拟"流水线"
    // 视觉感：工厂般的传输带建筑，绿色 emissive 表达"运行中"
    id: "building-runtime",
    floors: 3,
    floorHeight: 1.0,
    baseWidth: 1.2,
    baseDepth: 1.2,
    windowDensity: 0.5,
    roofType: "flat",
    bodyTint: 0x2a3a2a,         // 绿调（运行态）
    darkTint: 0x1a2a1a,         // 底座
  },
  {
    // 云服务进程：高 + 顶部光柱，模拟"云端"
    // 视觉感：通往云端的发射塔，顶部白色信号灯
    id: "building-cloud",
    floors: 6,
    floorHeight: 0.9,
    baseWidth: 0.9,             // 高瘦
    baseDepth: 0.9,
    windowDensity: 0.8,
    roofType: "antenna",        // 顶部光柱（云信号）
    bodyTint: 0x3a3a3a,         // 亮灰（云白）
    darkTint: 0x2a2a2a,         // 底座
  },
];

// ========== 地标配置 ==========
// Phase B: 城市地标 GLB 资产
//   - landmark-central-tower: 中央雕塑塔，5 段收窄 + 顶部光柱
//   - street-tree: 街边树木（树干 + 树冠）
//   - streetlight-pole: 路灯（杆 + 弧臂 + 灯头 + 基座）
// 所有几何 mergeGeometries 合并为单一 BufferGeometry，便于 InstancedMesh 渲染。
// 树木用 vertex colors 保留 trunk/crown 颜色；路灯灯头 emissive 由运行时 shader 注入。
const LANDMARKS = [
  { id: "landmark-central-tower", kind: "central-tower" },
  { id: "street-tree", kind: "tree" },
  { id: "streetlight-pole", kind: "streetlight" },
];

// 地标专用材质（独立于 building shared 材质）
const landmarkAccentMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xffffff,
  emissiveIntensity: 1.5,
  roughness: 0.35,
  metalness: 0.5,
});
const landmarkTrunkMat = new THREE.MeshStandardMaterial({
  color: 0x6b4226,
  roughness: 0.9,
  metalness: 0.0,
});
const landmarkCrownMat = new THREE.MeshStandardMaterial({
  color: 0x4a7c3a,
  roughness: 0.85,
  metalness: 0.05,
});
const landmarkPoleMat = new THREE.MeshStandardMaterial({
  color: 0x2a2a2a,
  roughness: 0.6,
  metalness: 0.6,
});
const landmarkLampMat = new THREE.MeshStandardMaterial({
  color: 0xffeb99,
  emissive: 0xffeb99,
  emissiveIntensity: 1.5,
  roughness: 0.3,
});
const landmarkBaseMat = new THREE.MeshStandardMaterial({
  color: 0x202020,
  roughness: 0.9,
  metalness: 0.2,
});

/**
 * 为几何的所有顶点写入同一个颜色（用于 vertex colors，让 mergeGeometries 后保留分段颜色）。
 */
function paintGeometry(geo, colorHex) {
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  const c = new THREE.Color(colorHex);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * 构建城市地标 Group：
 *   - central-tower: 5 段 BoxGeometry + 顶部光柱 CylinderGeometry，全部 merge 为单一 geometry
 *   - tree: 树干 CylinderGeometry + 树冠 IcosahedronGeometry，paintGeometry 后 merge
 *   - streetlight: 杆/弧臂/灯头/基座，分别构建后 merge 为单一 geometry
 *
 * 所有几何合并到单一 BufferGeometry，运行时用单一材质渲染（InstancedMesh 要求）。
 */
function buildLandmark(landmark) {
  const group = new THREE.Group();
  group.name = landmark.id;

  if (landmark.kind === "central-tower") {
    // 5 段收窄配置
    const segments = [
      { yStart: 0, height: 8, width: 1.5, depth: 1.5 },
      { yStart: 8, height: 6, width: 1.2, depth: 1.2 },
      { yStart: 14, height: 5, width: 0.9, depth: 0.9 },
      { yStart: 19, height: 4, width: 0.6, depth: 0.6 },
      { yStart: 23, height: 3, width: 0.3, depth: 0.3 },
    ];

    const geos = [];
    segments.forEach((seg) => {
      const boxGeo = new THREE.BoxGeometry(seg.width, seg.height, seg.depth);
      boxGeo.translate(0, seg.yStart + seg.height / 2, 0);
      geos.push(boxGeo);
    });

    // 顶部光柱（顶部段顶端 y=26 起，高 5）
    const pillarH = 5;
    const pillarGeo = new THREE.CylinderGeometry(0.15, 0.05, pillarH, 12);
    pillarGeo.translate(0, 26 + pillarH / 2, 0);
    geos.push(pillarGeo);

    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());

    const mesh = new THREE.Mesh(merged, landmarkAccentMat);
    mesh.name = "tower-body";
    group.add(mesh);
    return group;
  }

  if (landmark.kind === "tree") {
    // 树干（CylinderGeometry 是 indexed，IcosahedronGeometry 是 non-indexed，
    // mergeGeometries 要求所有 geometry 的 index 状态一致，统一转 non-indexed）
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 2.0, 8).toNonIndexed();
    trunkGeo.translate(0, 1.0, 0);
    paintGeometry(trunkGeo, 0x6b4226);

    // 树冠（位于 y=2.5）
    const crownGeo = new THREE.IcosahedronGeometry(1.0, 1);
    crownGeo.translate(0, 2.5, 0);
    paintGeometry(crownGeo, 0x4a7c3a);

    const merged = mergeGeometries([trunkGeo, crownGeo], false);
    trunkGeo.dispose();
    crownGeo.dispose();

    // 用 vertexColors，但 GLB 仍用单一 material；运行时由 CityLandmarks 设置 vertexColors:true
    const vertexColorMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(merged, vertexColorMat);
    mesh.name = "tree-body";
    group.add(mesh);
    return group;
  }

  if (landmark.kind === "streetlight") {
    const geos = [];

    // 杆：CylinderGeometry(0.08, 0.1, 4.0)，居中 y=2.0
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 4.0, 8);
    poleGeo.translate(0, 2.0, 0);
    geos.push(poleGeo);

    // 顶部弧臂：CylinderGeometry(0.05, 0.05, 0.8) 旋转 90 度（绕 Z 轴），位置 (0.4, 4.0, 0)
    const armGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6);
    armGeo.rotateZ(Math.PI / 2);
    armGeo.translate(0.4, 4.0, 0);
    geos.push(armGeo);

    // 灯头：SphereGeometry(0.2) emissive 黄白光，位置 (0.8, 4.0, 0)
    const lampGeo = new THREE.SphereGeometry(0.2, 12, 10);
    lampGeo.translate(0.8, 4.0, 0);
    geos.push(lampGeo);

    // 底部基座：BoxGeometry(0.4, 0.15, 0.4)，位置 y=0.075
    const baseGeo = new THREE.BoxGeometry(0.4, 0.15, 0.4);
    baseGeo.translate(0, 0.075, 0);
    geos.push(baseGeo);

    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());

    const mesh = new THREE.Mesh(merged, landmarkPoleMat);
    mesh.name = "streetlight-body";
    group.add(mesh);
    return group;
  }

  return group;
}

// ========== 几何构建 ==========

// 共享材质（所有变体复用，让运行时 BuildingCluster 用 onBeforeCompile 注入主题色）
// 命名为 shared* 以便 buildBuilding 内的本地 bodyMat/darkMat 别名可以遮蔽
const sharedBodyMat = new THREE.MeshStandardMaterial({
  color: 0x404040,
  roughness: 0.7,
  metalness: 0.2,
});
const sharedDarkMat = new THREE.MeshStandardMaterial({
  color: 0x202020,
  roughness: 0.9,
  metalness: 0.1,
});
const windowLitMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xffffff,
  emissiveIntensity: 1.0,
  roughness: 0.5,
});
const windowDarkMat = new THREE.MeshStandardMaterial({
  color: 0x1a1a1a,
  roughness: 0.8,
  metalness: 0.3,
});
const antennaMat = new THREE.MeshStandardMaterial({
  color: 0x333333,
  roughness: 0.7,
  metalness: 0.5,
});
const signalLightMat = new THREE.MeshStandardMaterial({
  color: 0xff3030,
  emissive: 0xff3030,
  emissiveIntensity: 2.0,
});

// 窗户尺寸常量
const WIN_W = 0.18;
const WIN_H = 0.4;
const WIN_DEPTH = 0.02;
const winGeoFront = new THREE.BoxGeometry(WIN_W, WIN_H, WIN_DEPTH);
const winGeoSide = new THREE.BoxGeometry(WIN_DEPTH, WIN_H, WIN_W);

/**
 * 在指定位置生成一圈窗户（前后各 2 个 + 左右各 1 个）。
 * 用于标准楼层和 skyscraper 各段。
 */
function addWindowsForFloor(group, y, width, depth, density, floorIdx, segmentIdx = 0) {
  const lit = Math.random() < density;
  const mat = lit ? windowLitMat : windowDarkMat;
  const segPrefix = segmentIdx > 0 ? `s${segmentIdx}-` : "";

  // 前面 2 个
  for (let c = 0; c < 2; c++) {
    const win = new THREE.Mesh(winGeoFront, mat);
    const xOff = (c - 0.5) * width * 0.4;
    win.position.set(xOff, y, depth / 2 + WIN_DEPTH / 2);
    win.name = `win-f-${segPrefix}${floorIdx}-${c}`;
    group.add(win);
  }
  // 后面 2 个
  for (let c = 0; c < 2; c++) {
    const win = new THREE.Mesh(winGeoFront, mat);
    const xOff = (c - 0.5) * width * 0.4;
    win.position.set(xOff, y, -depth / 2 - WIN_DEPTH / 2);
    win.name = `win-b-${segPrefix}${floorIdx}-${c}`;
    group.add(win);
  }
  // 左右各 1 个
  for (const side of [1, -1]) {
    const win = new THREE.Mesh(winGeoSide, mat);
    win.position.set(side * (width / 2 + WIN_DEPTH / 2), y, 0);
    win.name = `win-${segPrefix}${side > 0 ? "r" : "l"}-${floorIdx}`;
    group.add(win);
  }
}

/**
 * 构建一个建筑的完整 Group：
 *   - 底座（略宽，深色）
 *   - 主体（光滑 Box，运行时由 BuildingCluster 注入颜色）
 *   - 窗户（小 box，按密度随机点亮 emissive）
 *   - 屋顶（flat 平顶 / antenna 天线 / spire 尖塔）
 *
 * skyscraper 变体使用 segments 多段构建，其他变体使用标准 floors。
 */
function buildBuilding(variant) {
  const group = new THREE.Group();
  group.name = variant.id;

  // 状态变体本地材质覆盖（zombie/stopped/sleeping 用）
  // 不指定 tint 的变体复用全局 sharedBodyMat/sharedDarkMat
  const bodyMat = variant.bodyTint
    ? new THREE.MeshStandardMaterial({
        color: variant.bodyTint,
        roughness: 0.8,
        metalness: 0.15,
      })
    : sharedBodyMat;
  const darkMat = variant.darkTint
    ? new THREE.MeshStandardMaterial({
        color: variant.darkTint,
        roughness: 0.9,
        metalness: 0.1,
      })
    : sharedDarkMat;

  // === skyscraper: 多段式 ===
  if (variant.segments) {
    // 底座（最宽段 + 0.3）
    const baseWidth = variant.segments[0].width + 0.3;
    const baseDepth = variant.segments[0].depth + 0.3;
    const baseGeo = new THREE.BoxGeometry(baseWidth, 0.2, baseDepth);
    const base = new THREE.Mesh(baseGeo, darkMat);
    base.position.y = 0.1;
    base.name = "base";
    group.add(base);

    // 各段主体 + 窗户
    variant.segments.forEach((seg, segIdx) => {
      // 段主体
      const segGeo = new THREE.BoxGeometry(seg.width, seg.height, seg.depth);
      const segMesh = new THREE.Mesh(segGeo, bodyMat);
      segMesh.position.y = 0.2 + seg.yStart + seg.height / 2;
      segMesh.name = `segment-${segIdx}`;
      group.add(segMesh);

      // 段顶退台装饰（除最后一段）
      if (segIdx < variant.segments.length - 1) {
        const nextSeg = variant.segments[segIdx + 1];
        const stepWidth = (seg.width + nextSeg.width) / 2;
        const stepDepth = (seg.depth + nextSeg.depth) / 2;
        const stepHeight = 0.15;
        const stepGeo = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
        const step = new THREE.Mesh(stepGeo, darkMat);
        step.position.y = 0.2 + seg.yStart + seg.height + stepHeight / 2;
        step.name = `step-${segIdx}`;
        group.add(step);
      }

      // 段内窗户（按 floors 参数均匀分布）
      const segFloorHeight = seg.height / seg.floors;
      for (let f = 0; f < seg.floors; f++) {
        const y = 0.2 + seg.yStart + f * segFloorHeight + segFloorHeight / 2;
        addWindowsForFloor(group, y, seg.width, seg.depth, variant.windowDensity, f, segIdx);
      }
    });

    // 顶部尖塔
    const topSeg = variant.segments[variant.segments.length - 1];
    const spireBaseY = 0.2 + topSeg.yStart + topSeg.height;
    const spireH = variant.spireHeight || 4;

    // 尖塔底部短柱
    const spireBaseGeo = new THREE.CylinderGeometry(0.15, 0.25, 0.5, 8);
    const spireBase = new THREE.Mesh(spireBaseGeo, antennaMat);
    spireBase.position.y = spireBaseY + 0.25;
    spireBase.name = "spire-base";
    group.add(spireBase);

    // 尖塔主体（锥形收窄）
    const spireGeo = new THREE.CylinderGeometry(0.02, 0.15, spireH, 8);
    const spire = new THREE.Mesh(spireGeo, antennaMat);
    spire.position.y = spireBaseY + 0.5 + spireH / 2;
    spire.name = "spire";
    group.add(spire);

    // 顶部红色信号灯（更强）
    const lightGeo = new THREE.SphereGeometry(0.12, 12, 12);
    const light = new THREE.Mesh(lightGeo, signalLightMat);
    light.position.y = spireBaseY + 0.5 + spireH + 0.1;
    light.name = "signal-light";
    group.add(light);

    return group;
  }

  // === 标准变体（low/mid/tall）：单段式 ===
  const totalHeight = variant.floors * variant.floorHeight;
  const w = variant.baseWidth;
  const d = variant.baseDepth;

  // 底座
  const baseGeo = new THREE.BoxGeometry(w + 0.3, 0.2, d + 0.3);
  const base = new THREE.Mesh(baseGeo, darkMat);
  base.position.y = 0.1;
  base.name = "base";
  group.add(base);

  // 主体
  const bodyGeo = new THREE.BoxGeometry(w, totalHeight, d);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.2 + totalHeight / 2;
  body.name = "body";
  group.add(body);

  // 窗户
  for (let floor = 0; floor < variant.floors; floor++) {
    const y = 0.2 + floor * variant.floorHeight + variant.floorHeight / 2;
    addWindowsForFloor(group, y, w, d, variant.windowDensity, floor);
  }

  // 屋顶
  if (variant.roofType === "antenna") {
    const antennaGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6);
    const antenna = new THREE.Mesh(antennaGeo, antennaMat);
    antenna.position.y = 0.2 + totalHeight + 0.75;
    antenna.name = "antenna";
    group.add(antenna);

    const lightGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const light = new THREE.Mesh(lightGeo, signalLightMat);
    light.position.y = 0.2 + totalHeight + 1.5;
    light.name = "signal-light";
    group.add(light);
  } else {
    const roofGeo = new THREE.BoxGeometry(w, 0.1, d);
    const roof = new THREE.Mesh(roofGeo, darkMat);
    roof.position.y = 0.2 + totalHeight + 0.05;
    roof.name = "roof";
    group.add(roof);
  }

  // 状态变体倾斜（zombie 用，将倾的废墟感）
  if (variant.tilt) {
    group.rotation.z = variant.tilt;
  }

  return group;
}

// ========== 车辆变体（Phase C：道路交通） ==========

/**
 * 车辆材质复用表：
 *   - sharedCarBodyMat   ：轿车主体（深灰）
 *   - sharedCarGlassMat  ：车窗玻璃（更深）
 *   - sharedTruckCabMat  ：卡车车头（蓝）
 *   - sharedTruckBoxMat  ：集装箱（灰白）
 *   - sharedTireMat      ：轮胎（黑）
 *   - headlightMat       ：前灯（emissive 白）
 *   - taillightMat       ：尾灯（emissive 红）
 *
 * 与建筑变体一致：材质在运行时由 InstancedMesh 复用，无需多副本。
 */
const sharedCarBodyMat = new THREE.MeshStandardMaterial({
  color: 0x2a2a2a,
  roughness: 0.6,
  metalness: 0.3,
});
const sharedCarGlassMat = new THREE.MeshStandardMaterial({
  color: 0x1a1a1a,
  roughness: 0.2,
  metalness: 0.6,
});
const sharedTruckCabMat = new THREE.MeshStandardMaterial({
  color: 0x3a5a8a,
  roughness: 0.6,
  metalness: 0.3,
});
const sharedTruckBoxMat = new THREE.MeshStandardMaterial({
  color: 0xa8a8a8,
  roughness: 0.7,
  metalness: 0.2,
});
const sharedTireMat = new THREE.MeshStandardMaterial({
  color: 0x0a0a0a,
  roughness: 0.95,
  metalness: 0.05,
});
const headlightMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xffffff,
  emissiveIntensity: 1.6,
  roughness: 0.3,
});
const taillightMat = new THREE.MeshStandardMaterial({
  color: 0xff2020,
  emissive: 0xff2020,
  emissiveIntensity: 1.4,
  roughness: 0.3,
});

// 共享车轮几何：默认 CylinderGeometry 沿 Y 轴；旋转 90° 绕 X 轴使轴向沿 Z（车沿 +X 行驶时车轮正确滚动）
// 低 segments（8）控制三角形数量，车轮体积小、视觉差异不可见
const wheelGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 8);
wheelGeo.rotateX(Math.PI / 2);
const headlightGeo = new THREE.SphereGeometry(0.08, 6, 5);
const taillightGeo = new THREE.SphereGeometry(0.06, 6, 5);

/**
 * 构建轿车模型（vehicle-car）：
 *   - 车身 BoxGeometry(1.6, 0.5, 0.7) 位于 y=0.25（底部贴地）
 *   - 车顶 BoxGeometry(1.0, 0.4, 0.6) 位于 y=0.45（与车身顶部部分重叠）
 *   - 4 个车轮 CylinderGeometry(0.15, 0.15, 0.1)，旋转使轴向沿 Z
 *   - 前灯 ×2 emissive 白色，尾灯 ×2 emissive 红色
 *   - 朝向：+X 为车头方向（与 TrafficFlow 中 rotY=0 → 行驶 +X 对应）
 */
function buildCar() {
  const group = new THREE.Group();
  group.name = "vehicle-car";

  // 车身
  const bodyGeo = new THREE.BoxGeometry(1.6, 0.5, 0.7);
  const body = new THREE.Mesh(bodyGeo, sharedCarBodyMat);
  body.position.set(0, 0.25, 0);
  body.name = "body";
  group.add(body);

  // 车顶（玻璃罩）
  const roofGeo = new THREE.BoxGeometry(1.0, 0.4, 0.6);
  const roof = new THREE.Mesh(roofGeo, sharedCarGlassMat);
  roof.position.set(-0.1, 0.45, 0); // 略微靠后（挡风玻璃斜面简化为平移）
  roof.name = "roof";
  group.add(roof);

  // 4 个车轮（位于车身四角下方）
  const wheelPositions = [
    [0.55, 0.15, 0.4],
    [0.55, 0.15, -0.4],
    [-0.55, 0.15, 0.4],
    [-0.55, 0.15, -0.4],
  ];
  wheelPositions.forEach((p, i) => {
    const wheel = new THREE.Mesh(wheelGeo, sharedTireMat);
    wheel.position.set(p[0], p[1], p[2]);
    wheel.name = `wheel-${i}`;
    group.add(wheel);
  });

  // 前灯 ×2（车头 +X 方向）
  for (const z of [0.25, -0.25]) {
    const hl = new THREE.Mesh(headlightGeo, headlightMat);
    hl.position.set(0.8, 0.3, z);
    hl.name = `headlight-${z > 0 ? "r" : "l"}`;
    group.add(hl);
  }

  // 尾灯 ×2（车尾 -X 方向）
  for (const z of [0.25, -0.25]) {
    const tl = new THREE.Mesh(taillightGeo, taillightMat);
    tl.position.set(-0.8, 0.3, z);
    tl.name = `taillight-${z > 0 ? "r" : "l"}`;
    group.add(tl);
  }

  return group;
}

/**
 * 构建卡车模型（vehicle-truck）：
 *   - 车头 BoxGeometry(0.8, 0.7, 0.7) 位于 y=0.35，前部 +X
 *   - 集装箱 BoxGeometry(2.0, 0.9, 0.7) 位于 y=0.45，后部 -X
 *   - 4 个车轮
 *   - 前灯 ×2、尾灯 ×2
 *   - 朝向：+X 为车头方向
 */
function buildTruck() {
  const group = new THREE.Group();
  group.name = "vehicle-truck";

  // 车头（前部 +X）
  const cabGeo = new THREE.BoxGeometry(0.8, 0.7, 0.7);
  const cab = new THREE.Mesh(cabGeo, sharedTruckCabMat);
  cab.position.set(1.0, 0.35, 0); // 中心位于 +1.0（车头前移）
  cab.name = "cab";
  group.add(cab);

  // 集装箱（后部 -X）
  const boxGeo = new THREE.BoxGeometry(2.0, 0.9, 0.7);
  const box = new THREE.Mesh(boxGeo, sharedTruckBoxMat);
  box.position.set(-0.6, 0.45, 0); // 中心位于 -0.6（集装箱靠后）
  box.name = "container";
  group.add(box);

  // 4 个车轮：2 个在车头下，2 个在集装箱下
  const wheelPositions = [
    [1.0, 0.15, 0.4],
    [1.0, 0.15, -0.4],
    [-0.6, 0.15, 0.4],
    [-0.6, 0.15, -0.4],
  ];
  wheelPositions.forEach((p, i) => {
    const wheel = new THREE.Mesh(wheelGeo, sharedTireMat);
    wheel.position.set(p[0], p[1], p[2]);
    wheel.name = `wheel-${i}`;
    group.add(wheel);
  });

  // 前灯 ×2（车头 +X 方向）
  for (const z of [0.25, -0.25]) {
    const hl = new THREE.Mesh(headlightGeo, headlightMat);
    hl.position.set(1.4, 0.4, z);
    hl.name = `headlight-${z > 0 ? "r" : "l"}`;
    group.add(hl);
  }

  // 尾灯 ×2（集装箱尾端 -X 方向）
  for (const z of [0.25, -0.25]) {
    const tl = new THREE.Mesh(taillightGeo, taillightMat);
    tl.position.set(-1.6, 0.5, z);
    tl.name = `taillight-${z > 0 ? "r" : "l"}`;
    group.add(tl);
  }

  return group;
}

const VEHICLES = [
  { id: "vehicle-car", build: buildCar },
  { id: "vehicle-truck", build: buildTruck },
];

// ========== 远景城市剪影（Phase D：天空云层 + 远景城市轮廓） ==========
//   - skyline-silhouette: 50 个扁平剪影建筑沿 X 轴排列，运行时由 Skyline.tsx
//     用 4 个 InstancedMesh 围绕地图边缘 ±100 单位渲染（4 个方向旋转 0/90/180/270°）
//
// 设计原则：
//   - 每个建筑是薄 BoxGeometry（深 0.4，扁平剪影感）
//   - 高度 5-25 参差，宽度 1.0-2.5，间距均匀 + 抖动
//   - 深色 #1a1a1a vertex colors，运行时由 Skyline.tsx 通过 onBeforeCompile 注入主题 accent emissive
//   - 全部用 mergeGeometries 合并为单一 BufferGeometry（InstancedMesh 要求）
//   - ~600 三角形（50 boxes × 12 tris），仍远低于建筑/车辆级别
const SKYLINES = [
  { id: "skyline-silhouette", kind: "silhouette-row" },
];

const skylineSilhouetteMat = new THREE.MeshStandardMaterial({
  color: 0x1a1a1a,
  roughness: 0.95,
  metalness: 0.0,
  vertexColors: true,
});

/**
 * 构建远景城市剪影 Group：
 *   - 50 个 BoxGeometry 沿 X 轴均匀分布（x: -100 ~ +100），y 起点为 0
 *   - 高度 5-25 随机，宽度 1.0-2.5，深度 0.4（扁平剪影）
 *   - paintGeometry 统一染 #1a1a1a，运行时由 Skyline.tsx 注入 accent emissive
 *   - 全部合并为单一 BufferGeometry
 */
function buildSkyline(skyline) {
  const group = new THREE.Group();
  group.name = skyline.id;

  if (skyline.kind === "silhouette-row") {
    const geos = [];
    const count = 50;
    const span = 200;          // X 轴覆盖 -100 ~ +100
    const step = span / (count - 1);

    // 简单 deterministic PRNG（每次构建得到稳定布局）
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let i = 0; i < count; i++) {
      const x = -100 + i * step + (rand() - 0.5) * step * 0.4;
      const height = 5 + rand() * 20;       // 5-25
      const width = 1.0 + rand() * 1.5;     // 1.0-2.5
      const depth = 0.4;                    // 扁平剪影
      const boxGeo = new THREE.BoxGeometry(width, height, depth);
      boxGeo.translate(x, height / 2, 0);
      paintGeometry(boxGeo, 0x1a1a1a);
      geos.push(boxGeo);
    }

    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());

    const mesh = new THREE.Mesh(merged, skylineSilhouetteMat);
    mesh.name = "skyline-row";
    group.add(mesh);
    return group;
  }

  return group;
}

// ========== 屋顶装饰（Phase A：建筑装饰） ==========
//   - roof-water-tank: 圆柱水箱 + 半球圆顶（深灰金属）
//   - roof-antenna-tall: 高天线 + 红色信号灯 + 基座
//   - roof-billboard-small: 双面板广告牌 + 4 根支撑杆（白色 emissive）
//   - roof-skylight: 扁平发光板 + 凸起（accent emissive）
// 所有几何用 mergeGeometries 合并为单一 BufferGeometry，运行时用 InstancedMesh 渲染。
const ROOF_DECORATIONS = [
  { id: "roof-water-tank", kind: "water-tank" },
  { id: "roof-antenna-tall", kind: "antenna-tall" },
  { id: "roof-billboard-small", kind: "billboard-small" },
  { id: "roof-skylight", kind: "skylight" },
];

// 屋顶装饰材质（运行时由 BuildingCluster onBeforeCompile 注入主题色）
const roofTankMat = new THREE.MeshStandardMaterial({
  color: 0x3a3a3a,
  roughness: 0.6,
  metalness: 0.7,
});
const roofAntennaMat = new THREE.MeshStandardMaterial({
  color: 0x333333,
  roughness: 0.7,
  metalness: 0.5,
});
const roofBillboardMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xffffff,
  emissiveIntensity: 0.6,
  roughness: 0.4,
});
const roofSkylightMat = new THREE.MeshStandardMaterial({
  color: 0x00e5ff,
  emissive: 0x00e5ff,
  emissiveIntensity: 1.0,
  roughness: 0.3,
  metalness: 0.1,
});

/**
 * 构建屋顶装饰 Group：
 *   - water-tank: CylinderGeometry(0.4, 0.4, 0.6) + SphereGeometry(0.4) 半球
 *   - antenna-tall: BoxGeometry 基座 + CylinderGeometry 主杆 + SphereGeometry 信号灯
 *   - billboard-small: 2 × BoxGeometry 面板 + 4 × CylinderGeometry 支撑杆
 *   - skylight: BoxGeometry 扁平板 + BoxGeometry 凸起
 *
 * 所有几何合并为单一 BufferGeometry，运行时用单一材质渲染（InstancedMesh 要求）。
 */
function buildRoofDecoration(deco) {
  const group = new THREE.Group();
  group.name = deco.id;
  const geos = [];

  if (deco.kind === "water-tank") {
    // 圆柱水箱（半径 0.4，高 0.6），中心 y=0.3
    const cylGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.6, 12);
    cylGeo.translate(0, 0.3, 0);
    geos.push(cylGeo);

    // 顶部半球圆顶（半径 0.4），位于 y=0.6
    const domeGeo = new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    domeGeo.translate(0, 0.6, 0);
    geos.push(domeGeo);

    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, roofTankMat);
    mesh.name = "water-tank-body";
    group.add(mesh);
    return group;
  }

  if (deco.kind === "antenna-tall") {
    // 基座：BoxGeometry(0.3, 0.1, 0.3)，y=0.05
    const baseGeo = new THREE.BoxGeometry(0.3, 0.1, 0.3);
    baseGeo.translate(0, 0.05, 0);
    geos.push(baseGeo);

    // 主杆：CylinderGeometry(0.04, 0.04, 2.5, 8)，中心 y=0.1+1.25=1.35
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.5, 8);
    poleGeo.translate(0, 1.35, 0);
    geos.push(poleGeo);

    // 顶部信号灯：SphereGeometry(0.08)，y=0.1+2.5+0.08=2.68
    const lightGeo = new THREE.SphereGeometry(0.08, 8, 6);
    lightGeo.translate(0, 2.68, 0);
    geos.push(lightGeo);

    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, roofAntennaMat);
    mesh.name = "antenna-body";
    group.add(mesh);
    return group;
  }

  if (deco.kind === "billboard-small") {
    // 双面板：BoxGeometry(1.2, 0.8, 0.05)，正反两面间距 0.1
    const panelFrontGeo = new THREE.BoxGeometry(1.2, 0.8, 0.05);
    panelFrontGeo.translate(0, 0.6, 0.05);
    geos.push(panelFrontGeo);

    const panelBackGeo = new THREE.BoxGeometry(1.2, 0.8, 0.05);
    panelBackGeo.translate(0, 0.6, -0.05);
    geos.push(panelBackGeo);

    // 4 根支撑杆：CylinderGeometry(0.05, 0.05, 0.5)，位于面板四角
    const polePositions = [
      [0.5, 0.25, 0.1],
      [-0.5, 0.25, 0.1],
      [0.5, 0.25, -0.1],
      [-0.5, 0.25, -0.1],
    ];
    for (const p of polePositions) {
      const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6);
      poleGeo.translate(p[0], p[1], p[2]);
      geos.push(poleGeo);
    }

    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, roofBillboardMat);
    mesh.name = "billboard-body";
    group.add(mesh);
    return group;
  }

  if (deco.kind === "skylight") {
    // 扁平发光板：BoxGeometry(0.8, 0.05, 0.8)，y=0.025
    const baseGeo = new THREE.BoxGeometry(0.8, 0.05, 0.8);
    baseGeo.translate(0, 0.025, 0);
    geos.push(baseGeo);

    // 凸起：BoxGeometry(0.6, 0.2, 0.6)，y=0.05+0.1=0.15
    const topGeo = new THREE.BoxGeometry(0.6, 0.2, 0.6);
    topGeo.translate(0, 0.15, 0);
    geos.push(topGeo);

    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, roofSkylightMat);
    mesh.name = "skylight-body";
    group.add(mesh);
    return group;
  }

  return group;
}

// ========== 道路（Phase G：主动/被动道路 GLB） ==========
//   - road-straight:       直道（长 10、宽 4，沥青 + 路缘 + 中央虚线）
//   - road-intersection-4: 十字路口（8×8 中心广场 + 4 边斑马线 + 中心标记）
//   - road-intersection-3: T 字路口（8×8 中心广场 + 3 边斑马线 + 三角标记）
//   - road-curve:          90° 弯道（环形扇区 + 内外缘 + 中央曲线）
//   - road-roundabout:     环岛（外环道 + 内中心岛 + 4 入口臂 + 中心装饰）
// 设计原则：
//   - 所有几何放在 y≈0 平面（CityGround 在 ROAD_Y=0.02 偏移）
//   - 使用 vertexColors（paintGeometry）让单次 mergeGeometries 保留多色分段
//   - 标准长度 10 单位，宽度 4 单位（与 MAIN_ROAD_WIDTH 一致）
//   - 运行时由 CityGround 通过 InstancedMesh 实例化，scaleX 适配实际长度
const ROAD_CANONICAL_LENGTH = 10;
const ROAD_CANONICAL_WIDTH = 4;

const ROADS = [
  { id: "road-straight",       kind: "straight" },
  { id: "road-intersection-4", kind: "intersection-4" },
  { id: "road-intersection-3", kind: "intersection-3" },
  { id: "road-curve",          kind: "curve" },
  { id: "road-roundabout",     kind: "roundabout" },
];

// 道路用 vertexColors 材质（mergeGeometries 后保留多色分段）
const roadVertexColorMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.85,
  metalness: 0.05,
  side: THREE.DoubleSide,
});

// 路面配色
const ROAD_COLOR_ASHPALT = 0x2a2a2a;     // 沥青深灰
const ROAD_COLOR_CURB    = 0x6a6a6a;     // 路缘浅灰
const ROAD_COLOR_LANE    = 0xffeb3b;     // 中央黄线
const ROAD_COLOR_CROSS   = 0xf5f5f5;    // 斑马线白
const ROAD_COLOR_MARK    = 0xff5722;    // 中心标记橙
const ROAD_COLOR_ISLAND  = 0x4a7c3a;    // 中心岛绿（草地）

/**
 * 构建道路 Group（5 种形状）。
 * 所有几何都通过 paintGeometry 写入 vertex colors，mergeGeometries 合并为单一 BufferGeometry。
 * 运行时用单一 vertexColors 材质渲染（InstancedMesh 要求）。
 */
function buildRoad(road) {
  const group = new THREE.Group();
  group.name = road.id;
  const geos = [];

  const addPlane = (w, d, x, z, color) => {
    const g = new THREE.PlaneGeometry(w, d, 1, 1).toNonIndexed();
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0, z);
    geos.push(paintGeometry(g, color));
  };
  const addBox = (w, h, d, x, y, z, color) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(x, y, z);
    geos.push(paintGeometry(g, color));
  };

  if (road.kind === "straight") {
    // 沥青路面（10×4 平面，平铺在 y=0）
    addPlane(ROAD_CANONICAL_LENGTH, ROAD_CANONICAL_WIDTH, 0, 0, ROAD_COLOR_ASHPALT);
    // 左右路缘（长 10，高 0.1，宽 0.15）
    addBox(ROAD_CANONICAL_LENGTH, 0.1, 0.15, 0, 0.05, -ROAD_CANONICAL_WIDTH / 2, ROAD_COLOR_CURB);
    addBox(ROAD_CANONICAL_LENGTH, 0.1, 0.15, 0, 0.05,  ROAD_CANONICAL_WIDTH / 2, ROAD_COLOR_CURB);
    // 中央虚线：5 段短黄线，沿 X 方向分布在 x=-4,-2,0,2,4
    for (let i = 0; i < 5; i++) {
      const x = -4 + i * 2;
      addBox(0.6, 0.02, 0.12, x, 0.02, 0, ROAD_COLOR_LANE);
    }
  } else if (road.kind === "intersection-4") {
    // 中心 8×8 广场
    addPlane(8, 8, 0, 0, ROAD_COLOR_ASHPALT);
    // 4 边斑马线（每边 4 条短白线，长 3、宽 0.4）
    const sides = [
      { cx: 0, cz:  4.5, rot: 0 },         // 北
      { cx: 0, cz: -4.5, rot: 0 },         // 南
      { cx:  4.5, cz: 0, rot: Math.PI / 2 }, // 东
      { cx: -4.5, cz: 0, rot: Math.PI / 2 }, // 西
    ];
    for (const s of sides) {
      for (let i = 0; i < 4; i++) {
        const offset = -1.5 + i * 1.0;
        const x = s.cx + (s.rot === 0 ? offset : 0);
        const z = s.cz + (s.rot === 0 ? 0 : offset);
        addBox(0.4, 0.02, 3, x, 0.02, z, ROAD_COLOR_CROSS);
      }
    }
    // 中心橙色标记
    addBox(1, 0.02, 1, 0, 0.02, 0, ROAD_COLOR_MARK);
  } else if (road.kind === "intersection-3") {
    // T 字：中心 8×8 广场
    addPlane(8, 8, 0, 0, ROAD_COLOR_ASHPALT);
    // 3 边斑马线（北/东/西，南边无）
    const sides = [
      { cx: 0,  cz:  4.5, rot: 0 },
      { cx:  4.5, cz: 0, rot: Math.PI / 2 },
      { cx: -4.5, cz: 0, rot: Math.PI / 2 },
    ];
    for (const s of sides) {
      for (let i = 0; i < 4; i++) {
        const offset = -1.5 + i * 1.0;
        const x = s.cx + (s.rot === 0 ? offset : 0);
        const z = s.cz + (s.rot === 0 ? 0 : offset);
        addBox(0.4, 0.02, 3, x, 0.02, z, ROAD_COLOR_CROSS);
      }
    }
    // 中心三角标记（用 3 个 Box 拼成简易三角）
    addBox(0.6, 0.02, 0.6,  0,    0.02,  0.35, ROAD_COLOR_MARK);
    addBox(0.6, 0.02, 0.6, -0.35, 0.02, -0.17, ROAD_COLOR_MARK);
    addBox(0.6, 0.02, 0.6,  0.35, 0.02, -0.17, ROAD_COLOR_MARK);
  } else if (road.kind === "curve") {
    // 90° 弯道：环形扇区，内 R=4、外 R=8、宽 4
    const innerR = 4;
    const outerR = 8;
    const ringGeo = new THREE.RingGeometry(innerR, outerR, 32, 1, 0, Math.PI / 2).toNonIndexed();
    ringGeo.rotateX(-Math.PI / 2);
    geos.push(paintGeometry(ringGeo, ROAD_COLOR_ASHPALT));
    // 内缘（小环段，半径 innerR，宽度 0.15）
    const innerCurb = new THREE.RingGeometry(innerR - 0.15, innerR, 32, 1, 0, Math.PI / 2).toNonIndexed();
    innerCurb.rotateX(-Math.PI / 2);
    innerCurb.translate(0, 0.05, 0);
    geos.push(paintGeometry(innerCurb, ROAD_COLOR_CURB));
    // 外缘
    const outerCurb = new THREE.RingGeometry(outerR, outerR + 0.15, 32, 1, 0, Math.PI / 2).toNonIndexed();
    outerCurb.rotateX(-Math.PI / 2);
    outerCurb.translate(0, 0.05, 0);
    geos.push(paintGeometry(outerCurb, ROAD_COLOR_CURB));
    // 中央曲线（半径 6，宽度 0.2）
    const centerLine = new THREE.RingGeometry(5.9, 6.1, 32, 1, 0, Math.PI / 2).toNonIndexed();
    centerLine.rotateX(-Math.PI / 2);
    centerLine.translate(0, 0.02, 0);
    geos.push(paintGeometry(centerLine, ROAD_COLOR_LANE));
  } else if (road.kind === "roundabout") {
    // 外环道：RingGeometry(4, 6, 32)
    const ringGeo = new THREE.RingGeometry(4, 6, 32, 1).toNonIndexed();
    ringGeo.rotateX(-Math.PI / 2);
    geos.push(paintGeometry(ringGeo, ROAD_COLOR_ASHPALT));
    // 中心岛（CircleGeometry 半径 2）
    const islandGeo = new THREE.CircleGeometry(2, 32).toNonIndexed();
    islandGeo.rotateX(-Math.PI / 2);
    islandGeo.translate(0, 0.05, 0);
    geos.push(paintGeometry(islandGeo, ROAD_COLOR_ISLAND));
    // 4 入口臂：北/东/南/西各一个 2×4 平面
    const arms = [
      { x: 0, z:  8, rot: 0 },
      { x: 8, z:  0, rot: Math.PI / 2 },
      { x: 0, z: -8, rot: 0 },
      { x: -8, z: 0, rot: Math.PI / 2 },
    ];
    for (const a of arms) {
      const armGeo = new THREE.PlaneGeometry(4, 4, 1, 1).toNonIndexed();
      armGeo.rotateX(-Math.PI / 2);
      armGeo.rotateY(a.rot);
      armGeo.translate(a.x, 0, a.z);
      geos.push(paintGeometry(armGeo, ROAD_COLOR_ASHPALT));
    }
    // 中心装饰：小方块
    addBox(0.5, 0.5, 0.5, 0, 0.25, 0, ROAD_COLOR_MARK);
  }

  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());

  const mesh = new THREE.Mesh(merged, roadVertexColorMat);
  mesh.name = `${road.id}-body`;
  group.add(mesh);
  return group;
}

// ========== 导出 ==========
function exportGlb(group, variantId) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      group,
      (result) => {
        const buffer = Buffer.isBuffer(result) ? result : Buffer.from(result);
        const outputPath = pathResolve(OUTPUT_DIR, `${variantId}.glb`);
        writeFileSync(outputPath, buffer);
        console.log(`  ✓ ${variantId}.glb — ${(buffer.length / 1024).toFixed(1)} KB`);
        resolve();
      },
      (err) => reject(err),
      {
        binary: true,
        onlyVisible: true,
        truncateDrawRange: false,
      },
    );
  });
}

// ========== 主流程 ==========
async function main() {
  console.log("Building GLB assets...");

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created ${OUTPUT_DIR}`);
  }

  // === 建筑变体 ===
  for (const variant of VARIANTS) {
    const group = buildBuilding(variant);

    // 统计三角形数（验证 low-poly 约束）
    let triCount = 0;
    group.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        const g = obj.geometry;
        if (g.index) triCount += g.index.count / 3;
        else if (g.attributes.position) triCount += g.attributes.position.count / 3;
      }
    });

    await exportGlb(group, variant.id);
    console.log(`    ${variant.id}: ~${Math.floor(triCount)} triangles`);

    // 清理几何/材质避免内存泄漏（共享材质由全局持有，dispose 仅清理本地引用）
    group.traverse((obj) => {
      if (obj.isMesh) {
        // 车辆/建筑共享几何不在此处 dispose（wheelGeo 等是模块级）
        if (obj.geometry !== wheelGeo &&
            obj.geometry !== headlightGeo &&
            obj.geometry !== taillightGeo) {
          obj.geometry?.dispose();
        }
      }
    });
  }

  // === 车辆变体（Phase C） ===
  for (const vehicle of VEHICLES) {
    const group = vehicle.build();

    let triCount = 0;
    group.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        const g = obj.geometry;
        if (g.index) triCount += g.index.count / 3;
        else if (g.attributes.position) triCount += g.attributes.position.count / 3;
      }
    });

    await exportGlb(group, vehicle.id);
    console.log(`    ${vehicle.id}: ~${Math.floor(triCount)} triangles`);

    // 清理本地几何（共享 wheelGeo/headlightGeo/taillightGeo 不 dispose）
    group.traverse((obj) => {
      if (obj.isMesh) {
        if (obj.geometry !== wheelGeo &&
            obj.geometry !== headlightGeo &&
            obj.geometry !== taillightGeo) {
          obj.geometry?.dispose();
        }
      }
    });
  }

  // === 城市地标（Phase B） ===
  for (const landmark of LANDMARKS) {
    const group = buildLandmark(landmark);

    let triCount = 0;
    group.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        const g = obj.geometry;
        if (g.index) triCount += g.index.count / 3;
        else if (g.attributes.position) triCount += g.attributes.position.count / 3;
      }
    });

    await exportGlb(group, landmark.id);
    console.log(`    ${landmark.id}: ~${Math.floor(triCount)} triangles`);

    // 清理本地合并几何（地标专用材质由全局持有，dispose 仅清理 geometry）
    group.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
      }
    });
  }

  // === 远景城市剪影（Phase D） ===
  for (const skyline of SKYLINES) {
    const group = buildSkyline(skyline);

    let triCount = 0;
    group.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        const g = obj.geometry;
        if (g.index) triCount += g.index.count / 3;
        else if (g.attributes.position) triCount += g.attributes.position.count / 3;
      }
    });

    await exportGlb(group, skyline.id);
    console.log(`    ${skyline.id}: ~${Math.floor(triCount)} triangles`);

    // 清理本地合并几何（剪影材质由全局持有，dispose 仅清理 geometry）
    group.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
      }
    });
  }

  // === 屋顶装饰（Phase A：建筑装饰） ===
  for (const deco of ROOF_DECORATIONS) {
    const group = buildRoofDecoration(deco);

    let triCount = 0;
    group.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        const g = obj.geometry;
        if (g.index) triCount += g.index.count / 3;
        else if (g.attributes.position) triCount += g.attributes.position.count / 3;
      }
    });

    await exportGlb(group, deco.id);
    console.log(`    ${deco.id}: ~${Math.floor(triCount)} triangles`);

    // 清理本地合并几何（装饰材质由全局持有，dispose 仅清理 geometry）
    group.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
      }
    });
  }

  // === 道路（Phase G：主动/被动道路 GLB） ===
  for (const road of ROADS) {
    const group = buildRoad(road);

    let triCount = 0;
    group.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        const g = obj.geometry;
        if (g.index) triCount += g.index.count / 3;
        else if (g.attributes.position) triCount += g.attributes.position.count / 3;
      }
    });

    await exportGlb(group, road.id);
    console.log(`    ${road.id}: ~${Math.floor(triCount)} triangles`);

    // 清理本地合并几何（道路 vertexColors 材质由全局持有，dispose 仅清理 geometry）
    group.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
      }
    });
  }

  console.log("\n✅ All GLB assets generated successfully.");
  console.log(`   Output: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error("❌ Failed to build assets:", err);
  process.exit(1);
});
