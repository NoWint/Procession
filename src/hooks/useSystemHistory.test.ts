import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSystemHistory } from "./useSystemHistory";
import type { SystemSnapshot } from "../utils/types";

function makeSnapshot(timestamp: number, cpuTotal = 10): SystemSnapshot {
  return {
    processes: [],
    cpu: { total: cpuTotal, per_core: [] },
    memory: { used_mb: 100, total_mb: 1000, swap_used_mb: 0, swap_total_mb: 0 },
    network: { up_bytes_per_sec: 0, down_bytes_per_sec: 0, connections: [] },
    disk: { read_bytes_per_sec: 0, write_bytes_per_sec: 0, usage_percent: 0 },
    gpu: null,
    temperature: null,
    process_relations: [],
    listening_ports: [],
    fs_hotspots: [],
    plugins: {},
    timestamp,
    stale: false,
  };
}

describe("useSystemHistory", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in live mode with no history", () => {
    const { result } = renderHook(() => useSystemHistory(null));
    expect(result.current.mode).toBe("live");
    expect(result.current.isLive).toBe(true);
    expect(result.current.displaySnapshot).toBeNull();
  });

  it("captures incoming snapshots and follows live", () => {
    const { result, rerender } = renderHook(
      ({ snapshot }) => useSystemHistory(snapshot, { capacity: 5 }),
      { initialProps: { snapshot: null as SystemSnapshot | null } },
    );

    act(() => {
      rerender({ snapshot: makeSnapshot(1000, 10) });
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.mode).toBe("live");
    expect(result.current.displaySnapshot?.cpu.total).toBe(10);

    act(() => {
      rerender({ snapshot: makeSnapshot(1001, 20) });
    });

    expect(result.current.history).toHaveLength(2);
    expect(result.current.displaySnapshot?.cpu.total).toBe(20);
  });

  it("ignores duplicate timestamps", () => {
    const { result, rerender } = renderHook(
      ({ snapshot }) => useSystemHistory(snapshot, { capacity: 5 }),
      { initialProps: { snapshot: null as SystemSnapshot | null } },
    );

    act(() => rerender({ snapshot: makeSnapshot(1000, 10) }));
    act(() => rerender({ snapshot: makeSnapshot(1000, 20) }));

    expect(result.current.history).toHaveLength(1);
    // Live mode follows the latest incoming snapshot even if its timestamp is a duplicate.
    expect(result.current.displaySnapshot?.cpu.total).toBe(20);
  });

  it("trims history to capacity", () => {
    const { result, rerender } = renderHook(
      ({ snapshot }) => useSystemHistory(snapshot, { capacity: 3 }),
      { initialProps: { snapshot: null as SystemSnapshot | null } },
    );

    act(() => rerender({ snapshot: makeSnapshot(1000, 1) }));
    act(() => rerender({ snapshot: makeSnapshot(1001, 2) }));
    act(() => rerender({ snapshot: makeSnapshot(1002, 3) }));
    act(() => rerender({ snapshot: makeSnapshot(1003, 4) }));

    expect(result.current.history).toHaveLength(3);
    expect(result.current.history[0].cpu.total).toBe(2);
    expect(result.current.history[2].cpu.total).toBe(4);
  });

  it("switches to historical snapshot on scrub", () => {
    const { result, rerender } = renderHook(
      ({ snapshot }) => useSystemHistory(snapshot, { capacity: 5 }),
      { initialProps: { snapshot: null as SystemSnapshot | null } },
    );

    act(() => rerender({ snapshot: makeSnapshot(1000, 10) }));
    act(() => rerender({ snapshot: makeSnapshot(1001, 20) }));
    act(() => rerender({ snapshot: makeSnapshot(1002, 30) }));

    act(() => {
      result.current.setIndex(0);
    });

    expect(result.current.mode).toBe("paused");
    expect(result.current.isLive).toBe(false);
    expect(result.current.displaySnapshot?.cpu.total).toBe(10);
  });

  it("steps forward and backward while paused", () => {
    const { result, rerender } = renderHook(
      ({ snapshot }) => useSystemHistory(snapshot, { capacity: 5 }),
      { initialProps: { snapshot: null as SystemSnapshot | null } },
    );

    act(() => rerender({ snapshot: makeSnapshot(1000, 10) }));
    act(() => rerender({ snapshot: makeSnapshot(1001, 20) }));
    act(() => rerender({ snapshot: makeSnapshot(1002, 30) }));

    act(() => result.current.setIndex(0));
    act(() => result.current.step(1));
    expect(result.current.displaySnapshot?.cpu.total).toBe(20);

    act(() => result.current.step(-1));
    expect(result.current.displaySnapshot?.cpu.total).toBe(10);

    act(() => result.current.step(-10));
    expect(result.current.displaySnapshot?.cpu.total).toBe(10);
  });

  it("returns to live and resumes following new snapshots", () => {
    const { result, rerender } = renderHook(
      ({ snapshot }) => useSystemHistory(snapshot, { capacity: 5 }),
      { initialProps: { snapshot: null as SystemSnapshot | null } },
    );

    act(() => rerender({ snapshot: makeSnapshot(1000, 10) }));
    act(() => rerender({ snapshot: makeSnapshot(1001, 20) }));
    act(() => result.current.setIndex(0));
    act(() => rerender({ snapshot: makeSnapshot(1002, 30) }));

    expect(result.current.displaySnapshot?.cpu.total).toBe(10);

    act(() => result.current.exitHistory());
    expect(result.current.isLive).toBe(true);
    expect(result.current.displaySnapshot?.cpu.total).toBe(30);
  });

  it("plays back history at 1x speed", async () => {
    const { result, rerender } = renderHook(
      ({ snapshot }) => useSystemHistory(snapshot, { capacity: 5 }),
      { initialProps: { snapshot: null as SystemSnapshot | null } },
    );

    act(() => rerender({ snapshot: makeSnapshot(1000, 10) }));
    act(() => rerender({ snapshot: makeSnapshot(1001, 20) }));
    act(() => rerender({ snapshot: makeSnapshot(1002, 30) }));

    act(() => result.current.togglePlay());
    expect(result.current.mode).toBe("playing");
    expect(result.current.index).toBe(0);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.displaySnapshot?.cpu.total).toBe(20);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.displaySnapshot?.cpu.total).toBe(30);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await waitFor(() => expect(result.current.mode).toBe("live"));
  });

  it("toggles pause while playing", () => {
    const { result, rerender } = renderHook(
      ({ snapshot }) => useSystemHistory(snapshot, { capacity: 5 }),
      { initialProps: { snapshot: null as SystemSnapshot | null } },
    );

    act(() => rerender({ snapshot: makeSnapshot(1000, 10) }));
    act(() => rerender({ snapshot: makeSnapshot(1001, 20) }));

    act(() => result.current.togglePlay());
    act(() => result.current.togglePlay());
    expect(result.current.mode).toBe("paused");
    expect(result.current.index).toBe(0);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.displaySnapshot?.cpu.total).toBe(10);
  });
});
