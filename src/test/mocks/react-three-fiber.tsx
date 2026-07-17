import * as React from "react";

export const useFrame = vi.fn((callback: () => void) => {
  // Store callback so tests can trigger it manually.
  (useFrame as { _callback?: () => void })._callback = callback;
});

export function triggerUseFrame() {
  const cb = (useFrame as { _callback?: () => void })._callback;
  if (cb) cb();
}

export const useThree = vi.fn(() => ({
  camera: {
    position: { x: 0, y: 0, z: 0, set: vi.fn(), copy: vi.fn(), lerpVectors: vi.fn() },
    lookAt: vi.fn(),
  },
  gl: { render: vi.fn(), dispose: vi.fn() },
  scene: { add: vi.fn(), remove: vi.fn() },
}));

export function Canvas({ children }: { children?: React.ReactNode }) {
  return <div data-testid="r3f-canvas">{children}</div>;
}
