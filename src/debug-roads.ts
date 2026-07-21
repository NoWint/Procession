import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

// ============ 改进的道路网络算法 ============

/** 道路方向枚举 */
const E = 1; const S = 2;


/** 每个道路模块=一条线段 */
interface RoadSegment {
  id: string;
  fromGx: number; fromGy: number;
  toGx: number; toGy: number;
  dir: number;           // 0=N, 1=E, 2=S, 3=W
  type: "major" | "minor";
  name?: string;         // 标签
}

interface RoadIntersection {
  gx: number; gy: number;
  type: "major-x" | "major-minor" | "minor-x";
}

interface Building {
  pid: number; ppid: number;
  name: string;
  x: number; z: number;  // 世界坐标
  cpu: number;
  color: number;         // 颜色=进程类型
  isRoot: boolean;
}

interface Result {
  roads: RoadSegment[];
  intersections: RoadIntersection[];
  buildings: Building[];
}

// ============ 虚拟进程数据 ============
interface Proc { pid: number; ppid: number; name: string; cpu: number; }

function createProcs(rootCount: number): Proc[] {
  const procs: Proc[] = [];
  const rootNames = ["systemd", "launchd", "explorer.exe", "nginx", "docker", "postgres", "redis-server", "node"];
  const childNames = ["chrome", "code", "python", "java", "redis-cli", "psql", "bash", "ssh", "vim", "git"];
  let nextPid = 100;
  for (let r = 0; r < rootCount; r++) {
    const rootPid = nextPid++;
    procs.push({ pid: rootPid, ppid: 0, name: rootNames[r % rootNames.length], cpu: 30 + Math.random() * 60 });
    const nc = 2 + Math.floor(Math.random() * 3);
    for (let c = 0; c < nc; c++) {
      procs.push({ pid: nextPid++, ppid: rootPid, name: `${childNames[c % childNames.length]}-${r}-${c}`, cpu: 5 + Math.random() * 25 });
    }
  }
  return procs;
}

// ============ 道路生成算法 ============

function buildRoadNetwork(procs: Proc[]): Result {
  const roots = procs.filter(p => p.ppid === 0);
  const n = roots.length;
  if (n === 0) return { roads: [], intersections: [], buildings: [] };

  // Step 1: 分配根进程到 N×N 棋盘格的 N 个位置
  const side = Math.ceil(Math.sqrt(n * 1.2));
  const half = Math.floor(side / 2);

  // 每个根进程分配一个"hub"位置 = (gx, gy)，在棋盘格上均匀分布
  const hubPositions: { gx: number; gy: number }[] = [];
  let ri = 0;
  for (let row = 0; row < side && ri < n; row++) {
    for (let col = 0; col < side && ri < n; col++) {
      // 棋盘格步长=2（hub 间距=2 格，留空间给内部建筑）
      hubPositions.push({ gx: -half + col * 2, gy: -half + row * 2 });
      ri++;
    }
  }

  // Step 2: 每个 hub 分配一个方向，hub 之间有道路连接
  // hub 方向 = 指向下一个 hub（首尾相连）
  const hubs = roots.map((root, i) => ({
    root,
    gx: hubPositions[i].gx,
    gy: hubPositions[i].gy,
  }));

  // Step 3: 生成每对相邻 hub 之间的道路段
  const roads: RoadSegment[] = [];
  let idCounter = 0;
  const nextId = () => `r${idCounter++}`;

  // 在 x 轴和 z 轴上连接 hub
  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side - 1; col++) {
      const fromI = row * side + col;
      const toI = row * side + col + 1;
      if (fromI >= n || toI >= n) continue;

      const fromH = hubs[fromI];
      const toH = hubs[toI];

      // E-W 方向，从 fromH 到 toH
      const midGx = Math.floor((fromH.gx + toH.gx) / 2);
      roads.push({ id: nextId(), fromGx: fromH.gx, fromGy: fromH.gy, toGx: midGx, toGy: fromH.gy, dir: E, type: "major", name: fromH.root.name });
      roads.push({ id: nextId(), fromGx: midGx, fromGy: fromH.gy, toGx: toH.gx, toGy: toH.gy, dir: E, type: "minor", name: `${fromH.root.name.split('.')[0]}→${toH.root.name.split('.')[0]}` });
    }
  }

  for (let col = 0; col < side; col++) {
    for (let row = 0; row < side - 1; row++) {
      const fromI = row * side + col;
      const toI = (row + 1) * side + col;
      if (fromI >= n || toI >= n) continue;

      const fromH = hubs[fromI];
      const toH = hubs[toI];

      const midGy = Math.floor((fromH.gy + toH.gy) / 2);
      roads.push({ id: nextId(), fromGx: fromH.gx, fromGy: fromH.gy, toGx: fromH.gx, toGy: midGy, dir: S, type: "major", name: fromH.root.name });
      roads.push({ id: nextId(), fromGx: fromH.gx, fromGy: midGy, toGx: toH.gx, toGy: toH.gy, dir: S, type: "minor", name: `${fromH.root.name.split('.')[0]}→${toH.root.name.split('.')[0]}` });
    }
  }

  // Step 4: 生成路口
  const intersections: RoadIntersection[] = [];
  const visited = new Set<string>();
  for (const r of roads) {
    for (const pt of [{ gx: r.fromGx, gy: r.fromGy }, { gx: r.toGx, gy: r.toGy }]) {
      const key = `${pt.gx},${pt.gy}`;
      if (visited.has(key)) continue;
      visited.add(key);

      // 统计相邻道路数量（决定路口类型）
      let count = 0;
      for (const r2 of roads) {
        if ((r2.fromGx === pt.gx && r2.fromGy === pt.gy) || (r2.toGx === pt.gx && r2.toGy === pt.gy)) {
          count++;
        }
      }
      if (count >= 1) {
        const t = count >= 3 ? "major-x" : count === 2 ? "major-minor" : "major-x";
        intersections.push({ gx: pt.gx, gy: pt.gy, type: t });
      }
    }
  }

  // Step 5: 生成建筑（在 hub 上方/下方，子进程在父进程旁边）

  // 计算每个 hub 的子进程列表
  const childrenMap = new Map<number, Proc[]>();
  for (const p of procs) {
    if (p.ppid === 0) continue;
    const list = childrenMap.get(p.ppid) ?? [];
    list.push(p);
    childrenMap.set(p.ppid, list);
  }

  const buildings: Building[] = [];

  // 获取进程在 hub 上的颜色
  function procColor(p: Proc): number {
    // 子进程 = 蓝色系，根进程 = 橙色系
    if (p.ppid === 0) return 0xff8844;
    return 0x4488ff;
  }

  for (const h of hubs) {
    // 根进程建筑（在 hub 中心靠东侧）
    buildings.push({
      pid: h.root.pid,
      ppid: 0,
      name: h.root.name,
      x: (h.gx + 0.4) * 8,     // 世界坐标 = gx * 0.5 偏移 + 缩放因子
      z: h.gy * 8,
      cpu: h.root.cpu,
      color: procColor(h.root),
      isRoot: true,
    });

    // 子进程建筑（在根进程南侧，沿 hub 排列）
    const children = childrenMap.get(h.root.pid) ?? [];
    for (let ci = 0; ci < children.length; ci++) {
      const child = children[ci];
      const offset = (ci - (children.length - 1) / 2) * 1.5;
      buildings.push({
        pid: child.pid,
        ppid: h.root.pid,
        name: child.name,
        x: (h.gx + offset) * 8,
        z: (h.gy + 1) * 8,
        cpu: child.cpu,
        color: procColor(child),
        isRoot: false,
      });
    }
  }

  return { roads, intersections, buildings };
}

// ============ THREE 渲染 ============

const GRID_SIZE = 8;

const canvas = document.getElementById("three-canvas") as HTMLCanvasElement;
const roadsSummary = document.getElementById("roads-summary")!;
const errorsSummary = document.getElementById("errors-summary")!;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12121f);

const camera = new THREE.PerspectiveCamera(60, 1, 1, 200);
camera.position.set(40, 45, 50);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, canvas });
renderer.shadowMap.enabled = true;

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = "absolute";
labelRenderer.domElement.style.top = "0";
labelRenderer.domElement.style.pointerEvents = "none";
document.getElementById("canvas-container")!.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.1;
controls.minDistance = 10;
controls.maxDistance = 120;

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dl = new THREE.DirectionalLight(0xffffff, 0.9);
dl.position.set(50, 100, 50);
dl.castShadow = true;
dl.shadow.mapSize.set(2048, 2048);
scene.add(dl);

// Ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ color: 0x1a2a1a, roughness: 0.9 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

let procs = createProcs(4);
let result = buildRoadNetwork(procs);
let sceneObjects: THREE.Object3D[] = [];
let labelsGroup: THREE.Group = new THREE.Group();
scene.add(labelsGroup);
sceneObjects.push(labelsGroup);

const roadMaterials = {
  major: new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8, metalness: 0.1 }),
  minor: new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.85, metalness: 0.05 }),
};

function gxToWorld(gx: number): number { return gx * GRID_SIZE; }
function gyToWorld(gy: number): number { return gy * GRID_SIZE; }

function addRoadSegment(seg: RoadSegment) {
  const fromX = gxToWorld(seg.fromGx);
  const fromZ = gyToWorld(seg.fromGy);
  const toX = gxToWorld(seg.toGx);
  const toZ = gyToWorld(seg.toGy);

  const midX = (fromX + toX) / 2;
  const midZ = (fromZ + toZ) / 2;
  const length = Math.sqrt((toX - fromX) ** 2 + (toZ - fromZ) ** 2);
  const width = seg.type === "major" ? 4.0 : 2.5;

  const geo = new THREE.BoxGeometry(length, 0.4, width);
  geo.translate(0, 0.2, 0);

  const mat = seg.type === "major" ? roadMaterials.major : roadMaterials.minor;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(midX, 0, midZ);
  // Rotate to align with direction
  const angle = Math.atan2(toX - fromX, toZ - fromZ);
  mesh.rotation.y = angle;

  mesh.receiveShadow = true;
  mesh.castShadow = true;
  scene.add(mesh);
  sceneObjects.push(mesh);

  // Label
  const div = document.createElement("div");
  div.textContent = seg.name ?? seg.id;
  div.style.cssText = `color: ${seg.type === "major" ? "#ccddff" : "#8899bb"}; font-size: 10px; background: rgba(0,0,0,0.6); padding: 1px 4px; border-radius: 2px; white-space: nowrap; font-family: monospace;`;
  const label = new CSS2DObject(div);
  label.position.set(midX, 1.2, midZ);
  labelsGroup.add(label);
}

function addIntersection(itx: RoadIntersection) {
  const x = gxToWorld(itx.gx);
  const z = gyToWorld(itx.gy);
  const size = itx.type === "major-x" ? 4.0 : 3.0;

  const shape = new THREE.Shape();
  const h = size / 2;
  shape.moveTo(-h, -h); shape.lineTo( h, -h); shape.lineTo( h,  h); shape.lineTo(-h,  h); shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.2, 0);

  const color = itx.type === "major-x" ? 0x555555 : 0x444444;
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1 }));
  mesh.position.set(x, 0, z);
  mesh.receiveShadow = true;
  scene.add(mesh);
  sceneObjects.push(mesh);
}

function addBuilding(b: Building) {
  const h = 1 + b.cpu * 0.08;
  const w = b.isRoot ? 2.5 : 1.5;
  const d = b.isRoot ? 2.5 : 1.5;

  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, h / 2, 0);

  const mat = new THREE.MeshStandardMaterial({
    color: b.color,
    emissive: b.color,
    emissiveIntensity: 0.2,
    roughness: 0.7,
    metalness: 0.2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(b.x, 0, b.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  sceneObjects.push(mesh);

  // Label
  const div = document.createElement("div");
  div.textContent = b.name;
  div.style.cssText = `color: ${b.isRoot ? "#ffcc88" : "#88ccff"}; font-size: 9px; font-weight: bold; background: rgba(0,0,0,0.5); padding: 1px 3px; border-radius: 2px; white-space: nowrap; font-family: monospace;`;
  const label = new CSS2DObject(div);
  label.position.set(b.x, h + 0.5, b.z);
  labelsGroup.add(label);
}

function clearScene() {
  for (const obj of sceneObjects) { scene.remove(obj); }
  sceneObjects = [];
  labelsGroup = new THREE.Group();
  scene.add(labelsGroup);
  sceneObjects.push(labelsGroup);
}

function renderScene() {
  clearScene();

  for (const seg of result.roads) addRoadSegment(seg);
  for (const itx of result.intersections) addIntersection(itx);
  for (const b of result.buildings) addBuilding(b);

  updateHUD();
}

function updateHUD() {
  let h = "<h2>道路网络数据</h2>";
  h += `<div class="section">
    <div>主干道片段: ${result.roads.filter(r => r.type === "major").length} 段</div>
    <div>次干道片段: ${result.roads.filter(r => r.type === "minor").length} 段</div>
    <div>总道路段: ${result.roads.length} 段</div>
    <div>路口: ${result.intersections.length} 个</div>
    <div>建筑: ${result.buildings.length} 个（${result.buildings.filter(b => b.isRoot).length} 个父进程 + ${result.buildings.filter(b => !b.isRoot).length} 个子进程）</div>
    <div class="muted">GRID_SIZE: ${GRID_SIZE}</div>
  </div>`;
  roadsSummary.innerHTML = h;
  errorsSummary.innerHTML = "";
}

renderScene();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
animate();

function handleResize() {
  const container = document.getElementById("canvas-container")!;
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(1);
  labelRenderer.setSize(w, h);
}
window.addEventListener("resize", handleResize);
handleResize();

function setupButton(id: string, rootCount: number) {
  document.getElementById(id)?.addEventListener("click", (e) => {
    document.querySelectorAll("#actions button").forEach(b => b.classList.remove("active"));
    (e.target as HTMLElement).classList.add("active");
    procs = createProcs(rootCount);
    result = buildRoadNetwork(procs);
    renderScene();
  });
}
setupButton("btn-1root", 1);
setupButton("btn-2roots", 2);
setupButton("btn-4roots", 4);
setupButton("btn-8roots", 8);
document.getElementById("btn-regenerate")?.addEventListener("click", () => {
  result = buildRoadNetwork(procs);
  renderScene();
});
