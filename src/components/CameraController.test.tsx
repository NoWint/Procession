import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const vector3Calls: Array<{ x: number; y: number; z: number }> = [];

type MockVec = {
  x: number;
  y: number;
  z: number;
  set: (x: number, y: number, z: number) => void;
  copy: (v: MockVec) => void;
  subVectors: (a: MockVec, b: MockVec) => MockVec;
  normalize: () => MockVec;
  distanceTo: (v: MockVec) => number;
  clone: () => MockVec;
  add: (v: MockVec) => MockVec;
  multiplyScalar: (s: number) => MockVec;
  lerpVectors: (a: MockVec, b: MockVec, t: number) => void;
};

const MockVector3 = vi.hoisted(() =>
  vi.fn(function (this: MockVec, x = 0, y = 0, z = 0) {
    vector3Calls.push({ x, y, z });
    this.x = x;
    this.y = y;
    this.z = z;
    this.set = vi.fn(function (this: MockVec, nx: number, ny: number, nz: number) {
      this.x = nx;
      this.y = ny;
      this.z = nz;
    });
    this.copy = vi.fn(function (this: MockVec, v: MockVec) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      return this;
    });
    this.subVectors = vi.fn(function (this: MockVec, a: MockVec, b: MockVec) {
      this.x = a.x - b.x;
      this.y = a.y - b.y;
      this.z = a.z - b.z;
      return this;
    });
    this.normalize = vi.fn(function (this: MockVec) {
      return this;
    });
    this.distanceTo = vi.fn(() => 10);
    this.clone = vi.fn(function (this: MockVec) {
      return MockVector3(this.x, this.y, this.z) as unknown as MockVec;
    });
    this.add = vi.fn(function (this: MockVec, v: MockVec) {
      this.x += v.x;
      this.y += v.y;
      this.z += v.z;
      return this;
    });
    this.multiplyScalar = vi.fn(function (this: MockVec, s: number) {
      this.x *= s;
      this.y *= s;
      this.z *= s;
      return this;
    });
    this.lerpVectors = vi.fn();
  }),
);

const useFrame = vi.hoisted(() => vi.fn());
const useThree = vi.hoisted(() =>
  vi.fn(() => ({
    camera: {
      position: new MockVector3(0, 0, 0),
      lookAt: vi.fn(),
    },
  })),
);

vi.mock("three", () => ({
  Vector3: MockVector3,
}));

vi.mock("@react-three/fiber", async () => {
  const actual = await vi.importActual<typeof import("@react-three/fiber")>("@react-three/fiber");
  return {
    ...actual,
    useFrame,
    useThree,
  };
});

import CameraController from "./CameraController";

describe("CameraController", () => {
  beforeEach(() => {
    useFrame.mockClear();
    vector3Calls.length = 0;
    MockVector3.mockClear();
  });

  it("registers a useFrame callback", () => {
    render(<CameraController target={{ x: 0, y: 0, z: 0 }} />);
    expect(useFrame).toHaveBeenCalled();
  });

  it("does not allocate new Vector3 instances inside the frame loop", () => {
    render(<CameraController target={{ x: 10, y: 10, z: 10 }} />);
    const callback = useFrame.mock.calls[0][0] as () => void;

    vector3Calls.length = 0;
    callback();
    expect(vector3Calls).toHaveLength(0);
  });
});
