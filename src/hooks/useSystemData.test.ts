import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const listen = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/event", () => ({
  listen,
}));

import { useSystemData } from "./useSystemData";

const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
  listen.mockClear();
});

describe("useSystemData", () => {
  it("subscribes to system-snapshot events and exposes payload", async () => {
    let handler: ((event: { payload: unknown }) => void) | null = null;
    listen.mockImplementation(async (channel: string, cb: (event: { payload: unknown }) => void) => {
      if (channel === "system-snapshot") {
        handler = cb;
      }
      return () => {};
    });

    const { result } = renderHook(() => useSystemData());
    expect(result.current).toBeNull();

    const snapshot = {
      cpu: { total: 10, per_core: [] },
      memory: { used_mb: 100, total_mb: 1000, swap_used_mb: 0, swap_total_mb: 0 },
      network: { up_bytes_per_sec: 0, down_bytes_per_sec: 0, connections: [] },
      disk: { read_bytes_per_sec: 0, write_bytes_per_sec: 0, usage_percent: 0 },
      processes: [],
    };

    act(() => {
      handler?.({ payload: snapshot });
    });
    await waitFor(() => expect(result.current).toEqual(snapshot));
  });

  it("warns when the event listener fails to attach", async () => {
    listen.mockRejectedValue(new Error("event bridge unavailable"));

    renderHook(() => useSystemData());
    await waitFor(() =>
      expect(warnSpy).toHaveBeenCalledWith(
        "[useSystemData] Failed to listen for system snapshots:",
        expect.any(Error),
      ),
    );
  });
});
