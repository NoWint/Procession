import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
const saveMock = vi.hoisted(() => vi.fn());
const openMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: saveMock,
  open: openMock,
}));

import { saveHistory, loadHistory, type CityStateFile } from "./persistence";
import type { SystemSnapshot } from "./types";

function makeSnapshot(timestamp: number): SystemSnapshot {
  return {
    processes: [],
    cpu: { total: 0, per_core: [] },
    memory: { used_mb: 0, total_mb: 1, swap_used_mb: 0, swap_total_mb: 0 },
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

describe("saveHistory", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    saveMock.mockReset();
  });

  it("does nothing when the user cancels the dialog", async () => {
    saveMock.mockResolvedValueOnce(null);
    await saveHistory([makeSnapshot(1000)]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("writes a versioned JSON file", async () => {
    saveMock.mockResolvedValueOnce("/tmp/city.json");
    invokeMock.mockResolvedValueOnce(undefined);

    await saveHistory([makeSnapshot(1000), makeSnapshot(1001)]);

    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ name: "Procession City State", extensions: ["json"] }],
      }),
    );
    expect(invokeMock).toHaveBeenCalledWith("save_file", {
      path: "/tmp/city.json",
      data: expect.any(Array),
    });

    const [, args] = invokeMock.mock.calls[0];
    const text = new TextDecoder().decode(new Uint8Array(args.data as number[]));
    const parsed = JSON.parse(text) as CityStateFile;
    expect(parsed.version).toBe(1);
    expect(parsed.snapshots).toHaveLength(2);
  });
});

describe("loadHistory", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    openMock.mockReset();
  });

  it("returns null when the user cancels the dialog", async () => {
    openMock.mockResolvedValueOnce(null);
    const result = await loadHistory();
    expect(result).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("reads and parses a valid city state file", async () => {
    const payload: CityStateFile = {
      version: 1,
      exported_at: 1000,
      snapshots: [makeSnapshot(1000)],
    };
    const bytes = Array.from(new TextEncoder().encode(JSON.stringify(payload)));

    openMock.mockResolvedValueOnce("/tmp/city.json");
    invokeMock.mockResolvedValueOnce(bytes);

    const result = await loadHistory();
    expect(result).toHaveLength(1);
    expect(result?.[0].timestamp).toBe(1000);
  });

  it("throws on unsupported file version", async () => {
    const payload: CityStateFile = {
      version: 99,
      exported_at: 1000,
      snapshots: [makeSnapshot(1000)],
    };
    const bytes = Array.from(new TextEncoder().encode(JSON.stringify(payload)));

    openMock.mockResolvedValueOnce("/tmp/city.json");
    invokeMock.mockResolvedValueOnce(bytes);

    await expect(loadHistory()).rejects.toThrow("Unsupported city state version");
  });
});
