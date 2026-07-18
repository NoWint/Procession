import { describe, it, expect } from "vitest";
import { diffProcesses } from "./lifecycle";
import type { ProcessInfo } from "./types";

function makeProcess(pid: number, name: string): ProcessInfo {
  return {
    pid,
    ppid: 0,
    name,
    cpu: 0,
    memory_mb: 0,
    state: "Running",
    user: "user",
  };
}

describe("diffProcesses", () => {
  it("returns empty diff when lists are identical", () => {
    const p = makeProcess(1, "a");
    const result = diffProcesses([p], [p]);
    expect(result.births).toHaveLength(0);
    expect(result.deaths).toHaveLength(0);
  });

  it("detects newborn processes", () => {
    const prev = [makeProcess(1, "a")];
    const current = [makeProcess(1, "a"), makeProcess(2, "b")];
    const result = diffProcesses(prev, current);
    expect(result.births).toHaveLength(1);
    expect(result.births[0].pid).toBe(2);
    expect(result.deaths).toHaveLength(0);
  });

  it("detects dead processes", () => {
    const prev = [makeProcess(1, "a"), makeProcess(2, "b")];
    const current = [makeProcess(1, "a")];
    const result = diffProcesses(prev, current);
    expect(result.births).toHaveLength(0);
    expect(result.deaths).toHaveLength(1);
    expect(result.deaths[0].pid).toBe(2);
  });

  it("handles complete turnover", () => {
    const prev = [makeProcess(1, "a")];
    const current = [makeProcess(2, "b")];
    const result = diffProcesses(prev, current);
    expect(result.births[0].pid).toBe(2);
    expect(result.deaths[0].pid).toBe(1);
  });
});
