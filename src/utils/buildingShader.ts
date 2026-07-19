import * as THREE from "three";

export interface BuildingShaderOptions {
  windowColor: THREE.Color;
  windowColorSleeping: THREE.Color;
  windowDensity: number;
  windowSize: number;
  nightIntensity: number;
  flickerRate: number;
}

interface BuildingUniforms {
  uWindowColor: { value: THREE.Color };
  uWindowColorSleeping: { value: THREE.Color };
  uWindowDensity: { value: number };
  uWindowSize: { value: number };
  uNightIntensity: { value: number };
  uFlickerRate: { value: number };
  uTime: { value: number };
}

const VERTEX_DECLS = `
attribute float aPid;
attribute float aState;
varying float vPid;
varying float vState;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
`;

const VERTEX_LOGIC = `
vPid = aPid;
vState = aState;
vWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
vWorldNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
`;

const FRAG_UNIFORMS = `
uniform vec3 uWindowColor;
uniform vec3 uWindowColorSleeping;
uniform float uWindowDensity;
uniform float uWindowSize;
uniform float uNightIntensity;
uniform float uFlickerRate;
uniform float uTime;
varying float vPid;
varying float vState;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
`;

const FRAG_HELPERS = `
float hash31(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash33(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
`;

const FRAG_WINDOW_LOGIC = `
{
  vec3 normalDir = normalize(vWorldNormal);
  if (abs(normalDir.y) < 0.5) {
    float floorIdx = floor(vWorldPos.y * uWindowDensity);
    vec2 sidePos = vec2(
      dot(vWorldPos, vec3(1.0, 0.0, 0.0)),
      dot(vWorldPos, vec3(0.0, 0.0, 1.0))
    );
    float horiz = abs(normalDir.x) > abs(normalDir.z) ? sidePos.x : sidePos.z;
    float colIdx = floor(horiz * 4.0);
    vec2 cellUv = vec2(
      fract(horiz * 4.0),
      fract(vWorldPos.y * uWindowDensity)
    );
    float inWindow = step(uWindowSize * 0.5, cellUv.x) * step(cellUv.x, 1.0 - uWindowSize * 0.5)
                   * step(uWindowSize * 0.5, cellUv.y) * step(cellUv.y, 1.0 - uWindowSize * 0.5);
    float litHash = hash33(vec3(vPid * 0.013, floorIdx, colIdx));
    float lit = step(0.55, litHash);
    float flicker = 0.85 + 0.15 * sin(uTime * uFlickerRate + litHash * 6.28);
    vec3 winColor = mix(uWindowColor, uWindowColorSleeping, vState);
    float stateMask = vState < 1.5 ? 1.0 : 0.0;
    float windowMask = inWindow * lit * stateMask;
    vec3 winEmissive = winColor * uNightIntensity * flicker * windowMask;
    totalEmissiveRadiance += winEmissive;
    diffuseColor.rgb = mix(diffuseColor.rgb, winColor * 0.4, windowMask * 0.4);
  }
}
`;

export function createBuildingMaterial(
  baseColor: THREE.ColorRepresentation,
  opts: BuildingShaderOptions,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(baseColor),
    roughness: 0.55,
    metalness: 0.35,
    emissiveIntensity: 0.6,
  });

  const uniforms: BuildingUniforms = {
    uWindowColor: { value: opts.windowColor.clone() },
    uWindowColorSleeping: { value: opts.windowColorSleeping.clone() },
    uWindowDensity: { value: opts.windowDensity },
    uWindowSize: { value: opts.windowSize },
    uNightIntensity: { value: opts.nightIntensity },
    uFlickerRate: { value: opts.flickerRate },
    uTime: { value: 0 },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_DECLS}`)
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>\n${VERTEX_LOGIC}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\n${FRAG_UNIFORMS}\n${FRAG_HELPERS}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\n${FRAG_WINDOW_LOGIC}`,
      );
  };

  material.customProgramCacheKey = () => "procession-building-shader-v1";
  material.userData.buildingUniforms = uniforms;

  return material;
}

export function updateBuildingMaterialTime(
  mat: THREE.MeshStandardMaterial,
  t: number,
): void {
  const u = mat.userData.buildingUniforms as BuildingUniforms | undefined;
  if (u) u.uTime.value = t;
}
