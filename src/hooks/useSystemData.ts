import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { SystemSnapshot } from "../utils/types";

export function useSystemData(): SystemSnapshot | null {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen<SystemSnapshot>("system-snapshot", (event) => {
      setSnapshot(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return snapshot;
}
