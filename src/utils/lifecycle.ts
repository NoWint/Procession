import type { ProcessInfo } from "./types";

export interface ProcessDiff {
  births: ProcessInfo[];
  deaths: ProcessInfo[];
}

export function diffProcesses(
  previous: readonly ProcessInfo[],
  current: readonly ProcessInfo[],
): ProcessDiff {
  const previousPids = new Set(previous.map((p) => p.pid));
  const currentPids = new Set(current.map((p) => p.pid));

  const births = current.filter((p) => !previousPids.has(p.pid));
  const deaths = previous.filter((p) => !currentPids.has(p.pid));

  return { births, deaths };
}
