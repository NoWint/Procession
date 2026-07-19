import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import * as THREE from "three";

// Mock useGlbAssets so we can control whether geometry is loaded.
const useGlbAssetsMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useGlbAssets", () => ({
  useGlbAssets: useGlbAssetsMock,
}));

import Skyline, { resolveSkylineTheme } from "./Skyline";
import { FALLBACK_THEME, type Theme } from "../utils/theme";

describe("resolveSkylineTheme", () => {
  it("returns gray silhouette with no emissive for light theme", () => {
    const theme: Theme = { ...FALLBACK_THEME, mode: "light", name: "Monument Valley Light" };
    const result = resolveSkylineTheme(theme);
    expect(result.silhouetteColor).toBe("#4a4a4a");
    expect(result.emissiveIntensity).toBe(0.0);
  });

  it("returns dark silhouette with weak accent emissive for default dark theme", () => {
    const theme: Theme = { ...FALLBACK_THEME, mode: "dark", name: "Digital City" };
    const result = resolveSkylineTheme(theme);
    expect(result.silhouetteColor).toBe("#1a1a1a");
    expect(result.emissiveIntensity).toBeCloseTo(0.2, 5);
  });

  it("returns deep blue silhouette with strong accent emissive for midnight-blue theme", () => {
    const theme: Theme = { ...FALLBACK_THEME, mode: "dark", name: "Midnight Blue" };
    const result = resolveSkylineTheme(theme);
    expect(result.silhouetteColor).toBe("#1a2a4a");
    expect(result.emissiveIntensity).toBeCloseTo(0.5, 5);
  });

  it("treats Monument Valley Noir as dark (not blue) theme", () => {
    const theme: Theme = { ...FALLBACK_THEME, mode: "dark", name: "Monument Valley Noir" };
    const result = resolveSkylineTheme(theme);
    expect(result.silhouetteColor).toBe("#1a1a1a");
    expect(result.emissiveIntensity).toBeCloseTo(0.2, 5);
  });
});

describe("Skyline", () => {
  beforeEach(() => {
    useGlbAssetsMock.mockReset();
  });

  it("renders nothing when skyline geometry is not loaded", () => {
    useGlbAssetsMock.mockReturnValue({
      assets: {},
      loaded: false,
      failed: new Set(),
    });
    const { container } = render(<Skyline theme={FALLBACK_THEME} />);
    expect(container.querySelector("instancedmesh")).toBeNull();
  });

  it("renders 4 instancedMeshes when skyline geometry is loaded", () => {
    useGlbAssetsMock.mockReturnValue({
      assets: {
        skyline: {
          "skyline-silhouette": new THREE.BoxGeometry(1, 1, 1),
        },
      },
      loaded: true,
      failed: new Set(),
    });
    const { container } = render(<Skyline theme={FALLBACK_THEME} />);
    const meshes = container.querySelectorAll("instancedmesh");
    expect(meshes.length).toBe(4);
  });
});
