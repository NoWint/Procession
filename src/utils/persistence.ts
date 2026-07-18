import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { SystemSnapshot } from "./types";

export interface CityStateFile {
  version: number;
  exported_at: number;
  snapshots: SystemSnapshot[];
}

const FILE_VERSION = 1;

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeText(bytes: number[] | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new TextDecoder().decode(arr);
}

function defaultFilename(): string {
  return `procession-city-${Date.now()}.json`;
}

export async function saveHistory(snapshots: readonly SystemSnapshot[]): Promise<void> {
  const payload: CityStateFile = {
    version: FILE_VERSION,
    exported_at: Math.floor(Date.now() / 1000),
    snapshots: [...snapshots],
  };

  const data = Array.from(encodeText(JSON.stringify(payload, null, 2)));

  const path = await save({
    defaultPath: defaultFilename(),
    filters: [{ name: "Procession City State", extensions: ["json"] }],
  });

  if (!path) return;
  await invoke("save_file", { path, data });
}

export async function loadHistory(): Promise<SystemSnapshot[] | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Procession City State", extensions: ["json"] }],
  });

  if (!selected || Array.isArray(selected)) return null;

  const bytes: number[] = await invoke("read_file", { path: selected });
  const text = decodeText(bytes);
  const payload = JSON.parse(text) as CityStateFile;

  if (payload.version !== FILE_VERSION) {
    throw new Error(`Unsupported city state version: ${payload.version ?? "unknown"}`);
  }

  if (!Array.isArray(payload.snapshots)) {
    throw new Error("Invalid city state file: snapshots array missing");
  }

  return payload.snapshots;
}
