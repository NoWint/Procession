import { useRef, useMemo, useEffect, useCallback } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { ProcessInfo } from "../utils/types";
import { computeTreePositions, type BuildingPosition } from "../utils/layout";
import { colorForProcess, type Theme } from "../utils/colors";
import { diffProcesses } from "../utils/lifecycle";
import { FALLBACK_THEME } from "../utils/theme";

interface BuildingClusterProps {
  processes: ProcessInfo[];
  positions?: BuildingPosition[];
  theme?: Theme;
  selectedPid?: number | null;
  layout?: "radial" | "tree";
  maxBuildings?: number;
  showLabels?: boolean;
  maxLabels?: number;
  onClick?: (process: ProcessInfo) => void;
  onDoubleClick?: (process: ProcessInfo) => void;
  onHover?: (process: ProcessInfo | null) => void;
}

interface LifecycleEntry {
  pid: number;
  state: "born" | "alive" | "dying";
  progress: number;
  position: BuildingPosition;
  color: THREE.Color;
}

const dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _emissive = new THREE.Color();
const _black = new THREE.Color(0x000000);
const BIRTH_DURATION = 0.8;
const DEATH_DURATION = 1.0;

// LOD thresholds (camera distance from origin)
const LOD_NEAR = 25;
const LOD_MID = 50;

// Near vertex shader
const hv = `
attribute vec3 instanceColor;
uniform float uTime;
varying vec2 vUv;
varying vec3 vPos;
varying vec3 vNorm;
varying vec3 vCol;
void main(){
  vUv=uv; vNorm=normalize(normalMatrix*normal); vCol=instanceColor;
  vec4 wp=instanceMatrix*vec4(position,1.0); vPos=wp.xyz;
  gl_Position=projectionMatrix*modelViewMatrix*wp;
}`;

// Near fragment shader
const hf = `
uniform vec3 uEmissive;
uniform float uTime;
uniform float uEnergy;
varying vec2 vUv;
varying vec3 vPos;
varying vec3 vNorm;
varying vec3 vCol;
void main(){
  vec3 bot=vCol*0.35; vec3 top=vCol*1.6+uEmissive*0.45;
  vec3 c=mix(bot,top,pow(vUv.y,0.85));
  float wu=fract(vUv.x*6.0); float wv=fract(vUv.y*18.0);
  float w=step(0.08,wu)*step(0.08,wv);
  float wg=(1.0-w)*(0.5+0.5*sin(uTime*2.0+vUv.y*10.0));
  c+=vCol*wg*0.35;
  vec3 vd=normalize(cameraPosition-vPos);
  float fr=pow(1.0-abs(dot(vd,vNorm)),2.5);
  c+=uEmissive*fr*0.8;
  c+=uEmissive*step(0.96,vUv.y)*0.9;
  float sc=sin(vUv.y*24.0-uTime*2.5)*0.5+0.5;
  c+=uEmissive*sc*0.1*uEnergy;
  gl_FragColor=vec4(c,0.94);
}`;

// Mid vertex shader
const mv = `
attribute vec3 instanceColor;
varying vec3 vCol;
void main(){
  vCol=instanceColor;
  gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);
}`;

// Mid fragment shader
const mf = `
uniform vec3 uEmissive;
varying vec3 vCol;
void main(){
  gl_FragColor=vec4(vCol*1.4+uEmissive*0.2,0.94);
}`;

// Far vertex shader
const lv = `
attribute vec3 instanceColor;
varying vec3 vCol;
void main(){
  vCol=instanceColor;
  gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);
}`;

// Far fragment shader
const lf = `
uniform vec3 uEmissive;
varying vec3 vCol;
void main(){
  gl_FragColor=vec4(vCol*2.5+uEmissive*0.3,0.85);
}`;

export default function BuildingCluster({
  processes,
  positions: propPositions,
  theme = FALLBACK_THEME,
  selectedPid = null,
  layout: _layout = "tree",
  maxBuildings = 200,
  onClick,
  onDoubleClick,
  onHover,
}: BuildingClusterProps) {
  const highRef = useRef<THREE.InstancedMesh>(null);
  const midRef = useRef<THREE.InstancedMesh>(null);
  const lowRef = useRef<THREE.InstancedMesh>(null);
  const highMatRef = useRef<THREE.ShaderMaterial>(null);
  const midMatRef = useRef<THREE.ShaderMaterial>(null);
  const lowMatRef = useRef<THREE.ShaderMaterial>(null);
  const initialRef = useRef(false);
  const firstFrameRef = useRef(true);

  // Keep refs in sync with latest props to avoid stale closure in useFrame.
  const processesRef = useRef(processes);
  const positionsRef = useRef<BuildingPosition[]>([]);
  const themeRef = useRef(theme);
  const selectedPidRef = useRef(selectedPid);
  const hoveredIdRef = useRef(-1);
  processesRef.current = processes;
  themeRef.current = theme;
  selectedPidRef.current = selectedPid;

  const positions = useMemo(
    () =>
      propPositions ??
      computeTreePositions(processes, maxBuildings),
    [propPositions, processes, maxBuildings],
  );
  positionsRef.current = positions;

  const lifecycleRef = useRef<Map<number, LifecycleEntry>>(new Map());
  const prevProcessesRef = useRef<ProcessInfo[]>([]);
  const prevPositionsRef = useRef<BuildingPosition[]>([]);

  // ---- lifecycle effect ----
  useEffect(() => {
    const t = themeRef.current;
    const { births, deaths } = diffProcesses(prevProcessesRef.current, processes);

    // Revive dying entries that reappear in the new list
    for (const p of processes) {
      const entry = lifecycleRef.current.get(p.pid);
      if (entry && entry.state === "dying") {
        entry.state = "alive";
        entry.progress = 1;
        const pos = positions.find((pos) => pos.pid === p.pid);
        if (pos) entry.position = pos;
        entry.color.set(colorForProcess(p, t));
      }
    }

    for (const p of births) {
      const pos = positions.find((pos) => pos.pid === p.pid);
      lifecycleRef.current.set(p.pid, {
        pid: p.pid,
        state: initialRef.current ? "born" : "alive",
        progress: initialRef.current ? 0 : 1,
        position: pos ?? { x: 0, y: 0, z: 0, pid: p.pid, height: 1 },
        color: new THREE.Color(colorForProcess(p, t)),
      });
    }

    for (const p of deaths) {
      const pos = prevPositionsRef.current.find((pos) => pos.pid === p.pid);
      if (pos) {
        lifecycleRef.current.set(p.pid, {
          pid: p.pid,
          state: "dying",
          progress: 1,
          position: pos,
          color: new THREE.Color(colorForProcess(p, t)),
        });
      }
    }

    prevProcessesRef.current = processes;
    prevPositionsRef.current = positions;
    initialRef.current = true;
  }, [processes, positions]);

  // ---- fill ONE InstancedMesh with current positions + lifecycle data ----
  function fill(
    mesh: THREE.InstancedMesh,
    ppos: BuildingPosition[],
    pprocs: ProcessInfo[],
    elapsed: number,
    scale: "high" | "mid" | "low",
  ) {
    let idx = 0;

    for (let i = 0; i < ppos.length; i++) {
      const pos = ppos[i];
      const proc = pprocs.find((p) => p.pid === pos.pid);
      const entry = lifecycleRef.current.get(pos.pid);
      const lifeScale = entry?.progress ?? 1;
      const hScale = scale === "low" ? 1 : pos.height;

      dummy.position.set(pos.x, (pos.height / 2) * lifeScale, pos.z);
      dummy.scale.set(lifeScale, lifeScale * hScale, lifeScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);

      const t = themeRef.current;
      _color.set(proc ? colorForProcess(proc, t) : entry?.color ?? t.colors.idle);

      if (entry?.state === "born") {
        _color.lerp(_emissive.set(t.colors.pulseWhite), (1 - entry.progress) * 0.5);
      } else if (entry?.state === "alive" && proc && proc.cpu > 50) {
        const pulse = (Math.sin(elapsed * 3) + 1) * 0.5;
        _color.lerp(_emissive.set(t.colors.pulseWhite), pulse * 0.25);
      }

      if (scale === "low") _color.multiplyScalar(2.5);
      else if (scale === "mid") _color.multiplyScalar(1.4);

      if (scale === "high") {
        const sel = selectedPidRef.current === pos.pid;
        const hov = hoveredIdRef.current === i;
        if (sel || hov) {
          _color.lerp(_emissive.set(t.colors.pulseWhite), sel ? 0.45 : 0.25);
        }
      }

      mesh.setColorAt(idx, _color);
      idx++;
    }

    // Dying entries rendered at their old positions
    for (const entry of lifecycleRef.current.values()) {
      if (entry.state !== "dying") continue;
      const lifeScale = entry.progress;
      const hScale = scale === "low" ? 1 : entry.position.height;

      dummy.position.set(entry.position.x, (entry.position.height / 2) * lifeScale, entry.position.z);
      dummy.scale.set(lifeScale, lifeScale * hScale, lifeScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);

      _color.copy(entry.color).lerp(_black, 1 - lifeScale);
      mesh.setColorAt(idx, _color);
      idx++;
    }

    mesh.count = idx;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  // ---- per-frame: lifecycle animation + LOD switching ----
  useFrame(({ camera }, delta) => {
    // Advance lifecycle animations
    for (const entry of lifecycleRef.current.values()) {
      if (entry.state === "born") {
        entry.progress = Math.min(1, entry.progress + delta / BIRTH_DURATION);
        if (entry.progress >= 1) entry.state = "alive";
      } else if (entry.state === "dying") {
        entry.progress = Math.max(0, entry.progress - delta / DEATH_DURATION);
      }
    }
    for (const [pid, entry] of lifecycleRef.current) {
      if (entry.state === "dying" && entry.progress <= 0) {
        lifecycleRef.current.delete(pid);
      }
    }

    const elapsed = firstFrameRef.current ? 0.001 : (firstFrameRef.current = false, 0.001);
    const dist = camera.position.length();
    const level = dist < LOD_NEAR ? 0 : dist < LOD_MID ? 1 : 2;
    const ppos = positionsRef.current;
    const pprocs = processesRef.current;

    if (!ppos.length) return;

    const high = highRef.current;
    const mid = midRef.current;
    const low = lowRef.current;

    if (high) {
      high.visible = level === 0;
      if (level === 0) fill(high, ppos, pprocs, elapsed, "high");
    }
    if (mid) {
      mid.visible = level === 1;
      if (level === 1) fill(mid, ppos, pprocs, elapsed, "mid");
    }
    if (low) {
      low.visible = level === 2;
      if (level === 2) fill(low, ppos, pprocs, elapsed, "low");
    }

    // Update emissive uniforms
    _emissive.set(themeRef.current.colors.electricCyan);
    if (highMatRef.current) {
      highMatRef.current.uniforms.uTime.value = elapsed;
      highMatRef.current.uniforms.uEmissive.value.copy(_emissive);
    }
    if (midMatRef.current) midMatRef.current.uniforms.uEmissive.value.copy(_emissive);
    if (lowMatRef.current) lowMatRef.current.uniforms.uEmissive.value.copy(_emissive);
  });

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = e.instanceId;
    if (id === undefined) return;
    hoveredIdRef.current = id;
    const pos = positionsRef.current[id];
    if (pos) {
      const p = processesRef.current.find((p) => p.pid === pos.pid);
      if (p) onHover?.(p);
    }
  }, [onHover]);

  const handlePointerOut = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hoveredIdRef.current = -1;
    onHover?.(null);
  }, [onHover]);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = e.instanceId;
    if (id === undefined || !onClick) return;
    const pos = positionsRef.current[id];
    if (pos) {
      const p = processesRef.current.find((p) => p.pid === pos.pid);
      if (p) onClick(p);
    }
  }, [onClick]);

  const handleDoubleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = e.instanceId;
    if (id === undefined || !onDoubleClick) return;
    const pos = positionsRef.current[id];
    if (pos) {
      const p = processesRef.current.find((p) => p.pid === pos.pid);
      if (p) onDoubleClick(p);
    }
  }, [onDoubleClick]);

  const ic = Math.max(1, maxBuildings * 2);

  return (
    <group>
      {/* Near: full shader */}
      <instancedMesh ref={highRef} args={[undefined, undefined, ic]}
        onClick={handleClick} onDoubleClick={handleDoubleClick}
        onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
        <boxGeometry args={[0.5, 1, 0.5]} />
        <shaderMaterial ref={highMatRef}
          vertexShader={hv} fragmentShader={hf}
          vertexColors transparent depthWrite={false}
          uniforms={{ uTime: { value: 0 }, uEmissive: { value: new THREE.Color(theme.colors.electricCyan) }, uEnergy: { value: 0.7 } }} />
      </instancedMesh>

      {/* Mid: simplified shader */}
      <instancedMesh ref={midRef} args={[undefined, undefined, ic]}>
        <boxGeometry args={[0.5, 1, 0.5]} />
        <shaderMaterial ref={midMatRef}
          vertexShader={mv} fragmentShader={mf}
          vertexColors transparent depthWrite={false}
          uniforms={{ uEmissive: { value: new THREE.Color(theme.colors.electricCyan) } }} />
      </instancedMesh>

      {/* Far: glow dots */}
      <instancedMesh ref={lowRef} args={[undefined, undefined, ic]}>
        <boxGeometry args={[0.15, 0.15, 0.15]} />
        <shaderMaterial ref={lowMatRef}
          vertexShader={lv} fragmentShader={lf}
          vertexColors transparent depthWrite={false}
          uniforms={{ uEmissive: { value: new THREE.Color(theme.colors.electricCyan) } }} />
      </instancedMesh>

      {/* Labels — Html naturally fades via distanceFactor */}
      {positions.map((pos) => {
        const process = processes.find((p) => p.pid === pos.pid);
        if (!process) return null;
        return (
          <Html key={`l-${pos.pid}`}
            position={[pos.x, pos.height + 0.9, pos.z]}
            center distanceFactor={14} style={{ pointerEvents: "none" }}>
            <div className="building-label">{process.name}</div>
          </Html>
        );
      })}
    </group>
  );
}
