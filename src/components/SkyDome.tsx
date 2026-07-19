import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

interface SkyDomeProps {
  theme?: Theme;
}

const skyVertexShader = `
varying vec3 vWorldPos;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const skyFragmentShader = `
uniform vec3 uTopColor;       // 顶部夜空色
uniform vec3 uHorizonColor;   // 地平线色
uniform vec3 uGroundColor;    // 地平线以下色（深黑）
uniform float uHorizonGlow;   // 地平线光晕强度
uniform float uTime;

varying vec3 vWorldPos;

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

  gl_FragColor = vec4(sky, 1.0);
}
`;

export default function SkyDome({ theme = FALLBACK_THEME }: SkyDomeProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // ShaderMaterial 创建一次，避免每帧重建；theme 变化时通过 useEffect 更新 uniforms。
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTopColor: { value: new THREE.Color(theme.colors.background) },
          uHorizonColor: { value: new THREE.Color(theme.colors.coldBlue) },
          uGroundColor: { value: new THREE.Color("#000000") },
          uHorizonGlow: { value: 0.4 },
          uTime: { value: 0 },
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

  // theme 变化时只更新 uniforms，不重建 material
  useEffect(() => {
    material.uniforms.uTopColor.value.set(theme.colors.background);
    material.uniforms.uHorizonColor.value.set(theme.colors.coldBlue);
    material.uniforms.uGroundColor.value.set("#000000");
    material.uniforms.uHorizonGlow.value = 0.4;
  }, [
    theme.colors.background,
    theme.colors.coldBlue,
    material,
  ]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh position={[0, 0, 0]} castShadow={false} receiveShadow={false}>
      <sphereGeometry args={[200, 32, 32]} />
      <primitive ref={materialRef} object={material} attach="material" />
    </mesh>
  );
}
