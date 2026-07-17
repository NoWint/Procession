import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { updateParticles } from "./CableFlow";

describe("updateParticles", () => {
  it("advances particles along the current paths", () => {
    const path = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)];
    const particles = [{ pathIndex: 0, pointIndex: 0, t: 0 }];
    const positions = new Float32Array(3);

    updateParticles(particles, [path], 0.5, 1.8, positions);

    expect(positions[0]).toBeCloseTo(0.9, 1);
  });

  it("wraps to the next segment when t exceeds 1", () => {
    const path = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(2, 0, 0),
    ];
    const particles = [{ pathIndex: 0, pointIndex: 0, t: 0.9 }];
    const positions = new Float32Array(3);

    updateParticles(particles, [path], 0.2, 1.8, positions);

    expect(particles[0].pointIndex).toBe(1);
    expect(particles[0].t).toBeLessThan(1);
  });

  it("uses new paths after paths change", () => {
    const pathA = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)];
    const pathB = [new THREE.Vector3(10, 0, 0), new THREE.Vector3(20, 0, 0)];
    const particles = [{ pathIndex: 0, pointIndex: 0, t: 0 }];
    const positions = new Float32Array(3);

    updateParticles(particles, [pathA], 0.1, 1.8, positions);
    expect(positions[0]).toBeCloseTo(0.18, 1);

    updateParticles(particles, [pathB], 0.1, 1.8, positions);
    expect(positions[0]).toBeGreaterThan(10);
  });
});
