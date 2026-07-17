import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import * as THREE from "three";

import CableSystem, { buildBatchedCableGeometry, type CableData } from "./CableSystem";
import type { Connection } from "../utils/types";
import type { BuildingPosition } from "../utils/layout";

describe("CableSystem", () => {
  const positions: BuildingPosition[] = [{ pid: 1, x: 0, y: 0, z: 0, height: 2 }];
  const connections: Connection[] = [
    { pid: 1, local_addr: "10.0.0.1:1234", remote_addr: "8.8.8.8:443", protocol: "tcp", state: "ESTABLISHED" },
  ];

  it("renders from provided cables", () => {
    const cables: CableData[] = [
      { path: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)], protocol: "tcp" },
    ];

    const { container } = render(<CableSystem cables={cables} positions={[]} connections={[]} />);
    expect(container.querySelector("linesegments")).toBeInTheDocument();
  });

  it("computes cables from connections and positions when no cables prop is provided", () => {
    const { container } = render(<CableSystem connections={connections} positions={positions} maxCables={10} />);
    expect(container.querySelector("linesegments")).toBeInTheDocument();
  });
});

describe("buildBatchedCableGeometry", () => {
  it("creates one LineSegments geometry with segment pairs for all cables", () => {
    const cables: CableData[] = [
      {
        path: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(2, 0, 0)],
        protocol: "tcp",
      },
      {
        path: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 1, 0)],
        protocol: "udp",
      },
    ];

    const geo = buildBatchedCableGeometry(cables);
    const posAttr = geo.attributes.position.array as Float32Array;

    // Cable 1 has 2 segments => 4 vertices (12 floats)
    // Cable 2 has 1 segment => 2 vertices (6 floats)
    expect(posAttr.length).toBe(18);

    // First vertex of cable 2 should start at (0,1,0), not connect from cable 1.
    expect(posAttr[12]).toBe(0);
    expect(posAttr[13]).toBe(1);
    expect(posAttr[14]).toBe(0);
  });

  it("assigns protocol-derived vertex colors", () => {
    const cables: CableData[] = [
      { path: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)], protocol: "tcp" },
    ];

    const geo = buildBatchedCableGeometry(cables);
    const colorAttr = geo.attributes.color.array as Float32Array;

    expect(colorAttr.length).toBe(6);
    expect(colorAttr[0]).toBeGreaterThan(0);
  });
});
