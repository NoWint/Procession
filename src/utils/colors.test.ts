import { describe, it, expect } from "vitest";
import { colorForProcess, cableColorForProtocol, isSystemProcess } from "./colors";
import type { ProcessInfo } from "./types";
import { FALLBACK_THEME } from "./theme";

function makeProcess(overrides: Partial<ProcessInfo>): ProcessInfo {
  return {
    pid: 1,
    ppid: 0,
    name: "test",
    cpu: 0,
    memory_mb: 0,
    state: "Running",
    user: "user",
    ...overrides,
  };
}

describe("isSystemProcess", () => {
  it("detects kernel/system named processes", () => {
    expect(isSystemProcess(makeProcess({ name: "kernel_task" }))).toBe(true);
    expect(isSystemProcess(makeProcess({ name: "System" }))).toBe(true);
    expect(isSystemProcess(makeProcess({ name: "systemd" }))).toBe(true);
  });

  it("detects root/SYSTEM users", () => {
    expect(isSystemProcess(makeProcess({ name: "foo", user: "root" }))).toBe(true);
    expect(isSystemProcess(makeProcess({ name: "foo", user: "SYSTEM" }))).toBe(true);
  });

  it("returns false for ordinary user processes", () => {
    expect(isSystemProcess(makeProcess({ name: "chrome", user: "alice" }))).toBe(false);
  });
});

describe("colorForProcess", () => {
  it("uses zombie color for zombie state", () => {
    const p = makeProcess({ state: "Zombie" });
    expect(colorForProcess(p, FALLBACK_THEME)).toBe(FALLBACK_THEME.colors.zombie);
  });

  it("uses amber color for high CPU running processes", () => {
    const p = makeProcess({ state: "Running", cpu: 60 });
    expect(colorForProcess(p, FALLBACK_THEME)).toBe(FALLBACK_THEME.colors.amber);
  });

  it("uses idle color for low CPU running processes", () => {
    const p = makeProcess({ state: "Running", cpu: 1 });
    expect(colorForProcess(p, FALLBACK_THEME)).toBe(FALLBACK_THEME.colors.idle);
  });
});

describe("cableColorForProtocol", () => {
  it("maps known protocols to fixed colors", () => {
    expect(cableColorForProtocol("tcp", FALLBACK_THEME)).toBe("#4aa8ff");
    expect(cableColorForProtocol("UDP", FALLBACK_THEME)).toBe("#5ce1a8");
    expect(cableColorForProtocol("https", FALLBACK_THEME)).toBe("#00e5ff");
  });

  it("falls back to cold blue for unknown protocols", () => {
    expect(cableColorForProtocol("unknown", FALLBACK_THEME)).toBe(FALLBACK_THEME.colors.coldBlue);
  });
});
