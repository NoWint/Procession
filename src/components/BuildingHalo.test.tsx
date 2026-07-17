import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import * as THREE from "three";

const useFrame = vi.hoisted(() => vi.fn());

vi.mock("@react-three/fiber", async () => {
  const actual = await vi.importActual<typeof import("@react-three/fiber")>("@react-three/fiber");
  return {
    ...actual,
    useFrame,
  };
});

import BuildingHalo, { createHaloMaterial } from "./BuildingHalo";
import { FALLBACK_THEME } from "../utils/theme";
import type { ProcessInfo } from "../utils/types";
import type { BuildingPosition } from "../utils/layout";

describe("createHaloMaterial", () => {
  it("returns a ShaderMaterial with time, color and opacity uniforms", () => {
    const material = createHaloMaterial(FALLBACK_THEME);
    expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(material.uniforms.time).toBeDefined();
    expect(material.uniforms.color).toBeDefined();
    expect(material.uniforms.opacity).toBeDefined();
  });

  it("applies the theme active color to the color uniform", () => {
    const theme = { ...FALLBACK_THEME, colors: { ...FALLBACK_THEME.colors, active: "#ff0000" } };
    const material = createHaloMaterial(theme);
    expect(material.uniforms.color.value.getHexString()).toBe("ff0000");
  });
});

describe("BuildingHalo", () => {
  beforeEach(() => {
    useFrame.mockClear();
  });

  const processes: ProcessInfo[] = [{ pid: 1, ppid: 0, name: "app", cpu: 10, memory_mb: 100, state: "Running", user: "user" }];
  const positions: BuildingPosition[] = [{ pid: 1, x: 0, y: 0, z: 0, height: 2 }];

  it("renders an instanced halo mesh", () => {
    const { container } = render(<BuildingHalo processes={processes} positions={positions} />);
    expect(container.querySelector("instancedmesh")).toBeInTheDocument();
  });

  it("registers a single useFrame callback for uniform animation", () => {
    render(<BuildingHalo processes={processes} positions={positions} />);
    expect(useFrame).toHaveBeenCalledTimes(1);
    expect(useFrame.mock.calls[0]?.[0]).toBeInstanceOf(Function);
  });
});
