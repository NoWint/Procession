import { useMemo } from "react";
import * as THREE from "three";
import type { BlockInfo } from "../utils/layout";

interface RoadGridProps {
  blocks: BlockInfo[];
  range?: number; // 整体范围（半径），用于外围环路兜底
}

const ROAD_Y = 0.01;          // 道路高度（避免与地面 z-fight）
const MAJOR_HALF_WIDTH = 0.3; // 主干道用两条平行线模拟粗线，每条偏移量
const RING_HALF_WIDTH = 0.4;  // 环路平行线偏移量
const RING_PADDING = 4;       // 环路相对街区边界的留白

/// 道路系统：根据 blocks 数据动态生成
/// - 主干道（major）：相邻街区之间的道路，连接两个街区的近边界
/// - 支干道（minor）：街区内小区之间的道路
/// - 环路（ring）：包围所有街区的外围矩形主干道
export default function RoadGrid({ blocks, range = 80 }: RoadGridProps) {
  const { majorGeo, minorGeo, ringGeo } = useMemo(() => {
    const majorLines: number[] = [];
    const minorLines: number[] = [];
    const ringLines: number[] = [];

    // 推断街区间距：取所有街区中心两两距离的最小值
    let blockCell = 16;
    if (blocks.length >= 2) {
      let minDist = Infinity;
      for (let i = 0; i < blocks.length; i++) {
        for (let j = i + 1; j < blocks.length; j++) {
          const dx = blocks[j].x - blocks[i].x;
          const dz = blocks[j].z - blocks[i].z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > 0.1 && d < minDist) minDist = d;
        }
      }
      if (minDist !== Infinity) blockCell = minDist;
    }
    const neighborMaxDist = blockCell * 1.5;
    const subNeighborMaxDist = blockCell * 0.6;

    // === 主干道：相邻街区之间 ===
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i];
        const b = blocks[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > neighborMaxDist) continue;

        if (Math.abs(dx) > Math.abs(dz)) {
          // 水平相邻：道路沿 x 方向，位于两街区之间的 z 中线
          const left = a.x < b.x ? a : b;
          const right = a.x < b.x ? b : a;
          const roadZ = (a.z + b.z) / 2;
          const startX = left.maxX;
          const endX = right.minX;
          if (endX <= startX) continue; // 街区相互重叠，跳过
          // 两条平行线模拟粗线
          majorLines.push(startX, ROAD_Y, roadZ - MAJOR_HALF_WIDTH, endX, ROAD_Y, roadZ - MAJOR_HALF_WIDTH);
          majorLines.push(startX, ROAD_Y, roadZ + MAJOR_HALF_WIDTH, endX, ROAD_Y, roadZ + MAJOR_HALF_WIDTH);
        } else {
          // 垂直相邻：道路沿 z 方向，位于两街区之间的 x 中线
          const top = a.z < b.z ? a : b;
          const bottom = a.z < b.z ? b : a;
          const roadX = (a.x + b.x) / 2;
          const startZ = top.maxZ;
          const endZ = bottom.minZ;
          if (endZ <= startZ) continue;
          majorLines.push(roadX - MAJOR_HALF_WIDTH, ROAD_Y, startZ, roadX - MAJOR_HALF_WIDTH, ROAD_Y, endZ);
          majorLines.push(roadX + MAJOR_HALF_WIDTH, ROAD_Y, startZ, roadX + MAJOR_HALF_WIDTH, ROAD_Y, endZ);
        }
      }
    }

    // === 支干道：街区内部小区之间 ===
    for (const block of blocks) {
      const subs = block.subblocks;
      for (let i = 0; i < subs.length; i++) {
        for (let j = i + 1; j < subs.length; j++) {
          const a = subs[i];
          const b = subs[j];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > subNeighborMaxDist) continue;

          if (Math.abs(dx) > Math.abs(dz)) {
            const left = a.x < b.x ? a : b;
            const right = a.x < b.x ? b : a;
            const roadZ = (a.z + b.z) / 2;
            if (right.minX <= left.maxX) continue;
            minorLines.push(left.maxX, ROAD_Y, roadZ, right.minX, ROAD_Y, roadZ);
          } else {
            const top = a.z < b.z ? a : b;
            const bottom = a.z < b.z ? b : a;
            const roadX = (a.x + b.x) / 2;
            if (bottom.minZ <= top.maxZ) continue;
            minorLines.push(roadX, ROAD_Y, top.maxZ, roadX, ROAD_Y, bottom.minZ);
          }
        }
      }
    }

    // === 环路：包围所有街区的外围矩形 ===
    let ringMinX = -range;
    let ringMaxX = range;
    let ringMinZ = -range;
    let ringMaxZ = range;
    if (blocks.length > 0) {
      let bMinX = Infinity, bMaxX = -Infinity, bMinZ = Infinity, bMaxZ = -Infinity;
      for (const b of blocks) {
        bMinX = Math.min(bMinX, b.minX);
        bMaxX = Math.max(bMaxX, b.maxX);
        bMinZ = Math.min(bMinZ, b.minZ);
        bMaxZ = Math.max(bMaxZ, b.maxZ);
      }
      ringMinX = Math.min(ringMinX, bMinX - RING_PADDING);
      ringMaxX = Math.max(ringMaxX, bMaxX + RING_PADDING);
      ringMinZ = Math.min(ringMinZ, bMinZ - RING_PADDING);
      ringMaxZ = Math.max(ringMaxZ, bMaxZ + RING_PADDING);
    }
    // 四条边，每条边用两条平行线模拟粗线（偏移方向垂直于边）
    // 顶边（z = ringMinZ），偏移 z
    ringLines.push(ringMinX, ROAD_Y, ringMinZ - RING_HALF_WIDTH, ringMaxX, ROAD_Y, ringMinZ - RING_HALF_WIDTH);
    ringLines.push(ringMinX, ROAD_Y, ringMinZ + RING_HALF_WIDTH, ringMaxX, ROAD_Y, ringMinZ + RING_HALF_WIDTH);
    // 底边（z = ringMaxZ），偏移 z
    ringLines.push(ringMinX, ROAD_Y, ringMaxZ - RING_HALF_WIDTH, ringMaxX, ROAD_Y, ringMaxZ - RING_HALF_WIDTH);
    ringLines.push(ringMinX, ROAD_Y, ringMaxZ + RING_HALF_WIDTH, ringMaxX, ROAD_Y, ringMaxZ + RING_HALF_WIDTH);
    // 左边（x = ringMinX），偏移 x
    ringLines.push(ringMinX - RING_HALF_WIDTH, ROAD_Y, ringMinZ, ringMinX - RING_HALF_WIDTH, ROAD_Y, ringMaxZ);
    ringLines.push(ringMinX + RING_HALF_WIDTH, ROAD_Y, ringMinZ, ringMinX + RING_HALF_WIDTH, ROAD_Y, ringMaxZ);
    // 右边（x = ringMaxX），偏移 x
    ringLines.push(ringMaxX - RING_HALF_WIDTH, ROAD_Y, ringMinZ, ringMaxX - RING_HALF_WIDTH, ROAD_Y, ringMaxZ);
    ringLines.push(ringMaxX + RING_HALF_WIDTH, ROAD_Y, ringMinZ, ringMaxX + RING_HALF_WIDTH, ROAD_Y, ringMaxZ);

    const majGeo = new THREE.BufferGeometry();
    majGeo.setAttribute("position", new THREE.Float32BufferAttribute(majorLines, 3));
    const minGeo = new THREE.BufferGeometry();
    minGeo.setAttribute("position", new THREE.Float32BufferAttribute(minorLines, 3));
    const rngGeo = new THREE.BufferGeometry();
    rngGeo.setAttribute("position", new THREE.Float32BufferAttribute(ringLines, 3));

    return { majorGeo: majGeo, minorGeo: minGeo, ringGeo: rngGeo };
  }, [blocks, range]);

  return (
    <group>
      <lineSegments geometry={ringGeo} frustumCulled={false}>
        <lineBasicMaterial
          color="#c0c0ff"
          transparent
          opacity={0.6}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments geometry={majorGeo} frustumCulled={false}>
        <lineBasicMaterial
          color="#a0a0ff"
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments geometry={minorGeo} frustumCulled={false}>
        <lineBasicMaterial
          color="#404060"
          transparent
          opacity={0.25}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}
