import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

interface SkyDomeProps {
  theme?: Theme;
}

/**
 * 主题分类（云层颜色/不透明度差异化）。
 *   - light：白色云 #f5f5f5，不透明度 0.6
 *   - dark：暗紫云 #2a1a3a，不透明度 0.4
 *   - midnight-blue：深蓝云 #1a2a4a，不透明度 0.3（让星空更明显）
 *
 * 与 CityLandmarks / Skyline 中的主题分类保持一致（name + mode 双判定）。
 */
interface CloudTheme {
  color: string;
  opacity: number;
}

function resolveCloudTheme(theme: Theme): CloudTheme {
  const name = theme.name.toLowerCase();
  if (theme.mode === "light") {
    return { color: "#f5f5f5", opacity: 0.6 };
  }
  if (name.includes("blue") || name.includes("midnight")) {
    return { color: "#1a2a4a", opacity: 0.3 };
  }
  return { color: "#2a1a3a", opacity: 0.4 };
}

const skyVertexShader = `
varying vec3 vWorldPos;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
  gl_Position.z = gl_Position.w;  // 钉到远平面，让天空球永远跟随相机
}
`;

const skyFragmentShader = `
uniform vec3 uTopColor;       // 顶部夜空色
uniform vec3 uHorizonColor;   // 地平线色
uniform vec3 uGroundColor;    // 地平线以下色（深黑）
uniform float uHorizonGlow;   // 地平线光晕强度
uniform float uTime;
uniform vec3 uCloudColor;     // 云层颜色（按主题）
uniform float uCloudOpacity;  // 云层不透明度上限（按主题）

varying vec3 vWorldPos;

// === 2D Simplex 噪声（Ashima Arts，公有领域） ===
// 用于程序化云层，无外部纹理依赖。统一使用 #include <common> 引入的标准 GLSL 块。
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise2(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + (v.x+v.y)*C.y);
  vec2 x0 = v - i + (i.x+i.y)*C.x;
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
        + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// FBM：4 层叠加，制造软云团边缘
float fbmCloud(vec2 p) {
  float total = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 4; i++) {
    total += snoise2(p * freq) * amp;
    freq *= 2.0;
    amp *= 0.5;
  }
  return total * 0.5 + 0.5;
}

void main() {
  vec3 dir = normalize(vWorldPos);
  float h = dir.y;  // -1 (下) ~ 1 (上)

  // 主渐变：地平线到顶部
  float t1 = smoothstep(0.0, 0.6, h);
  vec3 sky = mix(uHorizonColor, uTopColor, t1);

  // 地平线以下渐变到 ground 色
  float t2 = smoothstep(0.0, -0.3, h);
  sky = mix(sky, uGroundColor, t2);

  // 地平线光晕（h 接近 0 时增亮）
  float glow = exp(-abs(h) * 8.0) * uHorizonGlow;
  glow *= 0.85 + 0.15 * sin(uTime * 0.3);  // 缓慢呼吸
  sky += uHorizonColor * glow;

  // === 云层 ===
  // 用方向球面坐标采样噪声（避免在球面上拉伸）
  // u = 经度方向 atan(z, x)，v = 纬度方向 h
  float u = atan(dir.z, dir.x) * 1.5;
  vec2 cloudUv = vec2(u, h * 2.0);
  // 缓慢漂移：uTime 推进 uv 偏移
  cloudUv.x += uTime * 0.015;
  cloudUv.y += uTime * 0.005;
  float n = fbmCloud(cloudUv);
  // 锐化云层（中间值过渡到 1，制造"云朵"形状）
  float cloudShape = smoothstep(0.45, 0.85, n);
  // 仅在地平线以上 0~0.6 范围内可见（避免穿地面，避免遮蔽星空顶部）
  float cloudMask = smoothstep(0.0, 0.15, h) * (1.0 - smoothstep(0.4, 0.7, h));
  float cloudAlpha = cloudShape * uCloudOpacity * cloudMask;
  sky = mix(sky, uCloudColor, cloudAlpha);

  gl_FragColor = vec4(sky, 1.0);
}
`;

export default function SkyDome({ theme = FALLBACK_THEME }: SkyDomeProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // 预解析主题云层配置
  const cloudTheme = useMemo(() => resolveCloudTheme(theme), [theme]);

  // ShaderMaterial 创建一次，避免每帧重建；theme 变化时通过 useEffect 更新 uniforms。
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTopColor: { value: new THREE.Color(theme.colors.background) },
          uHorizonColor: { value: new THREE.Color(theme.colors.coldBlue) },
          uGroundColor: { value: new THREE.Color("#000000") },
          uHorizonGlow: { value: 0.1 },
          uTime: { value: 0 },
          uCloudColor: { value: new THREE.Color(cloudTheme.color) },
          uCloudOpacity: { value: cloudTheme.opacity },
        },
        vertexShader: skyVertexShader,
        fragmentShader: skyFragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // P0-2 主题切换 spring 过渡：目标值独立存储，useFrame 中 lerp 到目标
  // 时间常数 ≈ 0.25s（damping 1.0, response 0.25 — Apple critically damped 默认）
  const targetRef = useRef({
    topColor: new THREE.Color(theme.colors.background),
    horizonColor: new THREE.Color(theme.colors.coldBlue),
    groundColor: new THREE.Color("#000000"),
    horizonGlow: 0.1,
    cloudColor: new THREE.Color(cloudTheme.color),
    cloudOpacity: cloudTheme.opacity,
  });

  // theme 变化时只更新 target，由 useFrame 平滑过渡到目标（materialize 而非硬切）
  useEffect(() => {
    targetRef.current.topColor.set(theme.colors.background);
    targetRef.current.horizonColor.set(theme.colors.coldBlue);
    targetRef.current.groundColor.set("#000000");
    targetRef.current.horizonGlow = 0.1;
    targetRef.current.cloudColor.set(cloudTheme.color);
    targetRef.current.cloudOpacity = cloudTheme.opacity;
  }, [
    theme.colors.background,
    theme.colors.coldBlue,
    cloudTheme,
  ]);

  useFrame((state, delta) => {
    const mat = materialRef.current;
    if (!mat) return;
    const u = mat.uniforms;
    const t = targetRef.current;
    // 指数衰减 lerp，帧率无关：k = 1 - exp(-delta / tau)，tau=0.25s
    const k = 1 - Math.exp(-delta / 0.25);
    (u.uTopColor.value as THREE.Color).lerp(t.topColor, k);
    (u.uHorizonColor.value as THREE.Color).lerp(t.horizonColor, k);
    (u.uGroundColor.value as THREE.Color).lerp(t.groundColor, k);
    u.uHorizonGlow.value = THREE.MathUtils.lerp(u.uHorizonGlow.value, t.horizonGlow, k);
    (u.uCloudColor.value as THREE.Color).lerp(t.cloudColor, k);
    u.uCloudOpacity.value = THREE.MathUtils.lerp(u.uCloudOpacity.value, t.cloudOpacity, k);
    u.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh position={[0, 0, 0]} castShadow={false} receiveShadow={false}>
      <sphereGeometry args={[200, 32, 32]} />
      <primitive ref={materialRef} object={material} attach="material" />
    </mesh>
  );
}
