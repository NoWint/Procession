import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

interface CameraControllerProps {
  target?: { x: number; y: number; z: number } | null;
  duration?: number;
  minDistance?: number;
}

export default function CameraController({
  target,
  duration = 0.8,
  minDistance = 8,
}: CameraControllerProps) {
  const { camera } = useThree();
  const startPos = useRef(new THREE.Vector3());
  const startTarget = useRef(new THREE.Vector3());
  const endTarget = useRef(new THREE.Vector3());
  const startTime = useRef<number | null>(null);
  const isFlying = useRef(false);

  useEffect(() => {
    if (!target) {
      isFlying.current = false;
      return;
    }

    startPos.current.copy(camera.position);
    startTarget.current.set(0, 0, 0); // Current lookAt target approximation
    endTarget.current.set(target.x, target.y, target.z);
    startTime.current = null;
    isFlying.current = true;
  }, [target, camera]);

  useFrame(() => {
    if (!isFlying.current || !target) return;

    if (startTime.current === null) {
      startTime.current = performance.now();
    }

    const elapsed = (performance.now() - startTime.current) / 1000;
    const t = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const ease = 1 - Math.pow(1 - t, 3);

    const direction = new THREE.Vector3()
      .subVectors(endTarget.current, startPos.current)
      .normalize();
    const distance = Math.max(minDistance, startPos.current.distanceTo(endTarget.current));
    const desiredPos = endTarget.current.clone().add(direction.multiplyScalar(distance));

    camera.position.lerpVectors(startPos.current, desiredPos, ease);
    camera.lookAt(endTarget.current);

    if (t >= 1) {
      isFlying.current = false;
    }
  });

  return null;
}
