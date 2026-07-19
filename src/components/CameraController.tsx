import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

interface CameraControllerProps {
  target?: { x: number; y: number; z: number } | null;
  duration?: number;
  offsetDistance?: number; // 相机距离目标的偏移距离
  offsetY?: number; // 相机在 Y 方向的抬高
}

export default function CameraController({
  target,
  duration = 0.8,
  offsetDistance = 18,
  offsetY = 8,
}: CameraControllerProps) {
  const { camera, controls } = useThree();
  const startPos = useRef(new THREE.Vector3());
  const endPos = useRef(new THREE.Vector3());
  const endTarget = useRef(new THREE.Vector3());
  // 临时方向向量 ref：避免在 useEffect/useFrame 内 new Vector3（性能 + 测试约束）
  const tmpDir = useRef(new THREE.Vector3());
  const startTime = useRef<number | null>(null);
  const isFlying = useRef(false);

  useEffect(() => {
    if (!target) {
      // target 被清空时，必须恢复 controls.enabled，否则会因之前飞行被禁用而永远卡死
      isFlying.current = false;
      if (controls) {
        (controls as any).enabled = true;
        (controls as any).update?.();
      }
      return;
    }

    startPos.current.copy(camera.position);
    endTarget.current.set(target.x, target.y, target.z);

    // 计算相机停留位置：从目标点出发，沿"相机→目标"水平方向反退 offsetDistance
    // 这样相机会停在被点击建筑的前方（保持原视角方向），而不是飞到建筑后面
    const dir = tmpDir.current.subVectors(endTarget.current, camera.position);
    // 只保留水平方向（避免相机飞到天上或地下）
    dir.y = 0;
    // 用 |x|+|z| 替代 lengthSq，避免依赖 mock 未实现的方法
    if (Math.abs(dir.x) + Math.abs(dir.z) < 0.001) {
      // 相机已在目标正上方，默认往 +Z 方向退
      dir.set(0, 0, 1);
    } else {
      dir.normalize();
    }
    endPos.current.copy(endTarget.current).add(dir.multiplyScalar(-offsetDistance));
    endPos.current.y = target.y + offsetY;

    startTime.current = null;
    isFlying.current = true;

    // 飞行期间禁用 OrbitControls，避免冲突
    if (controls) {
      (controls as any).enabled = false;
    }

    // 安全兜底：组件卸载或 target 变化时恢复 controls，避免永远禁用
    return () => {
      if (controls) {
        (controls as any).enabled = true;
        (controls as any).update?.();
      }
    };
  }, [target, camera, controls, offsetDistance, offsetY]);

  useFrame(() => {
    if (!isFlying.current || !target) return;

    if (startTime.current === null) {
      startTime.current = performance.now();
    }

    const elapsed = (performance.now() - startTime.current) / 1000;
    const t = Math.min(elapsed / duration, 1);
    // Ease-in-out cubic（比 ease-out 更平滑，适合相机移动）
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    camera.position.lerpVectors(startPos.current, endPos.current, ease);
    camera.lookAt(endTarget.current);

    if (t >= 1) {
      isFlying.current = false;
      // 飞行结束：同步 OrbitControls target 并重新启用
      if (controls) {
        (controls as any).target.copy(endTarget.current);
        (controls as any).enabled = true;
        (controls as any).update?.();
      }
    }
  });

  return null;
}
