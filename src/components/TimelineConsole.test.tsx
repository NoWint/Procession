import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimelineConsole from "./TimelineConsole";
import type { SystemSnapshot } from "../utils/types";

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

describe("TimelineConsole", () => {
  it("disables controls when history is too short", () => {
    render(
      <TimelineConsole
        history={[makeSnapshot(1000)]}
        mode="live"
        index={0}
        isLive
        canStepBack={false}
        canStepForward={false}
        playbackSpeed={1}
        setPlaybackSpeed={vi.fn()}
        onTogglePlay={vi.fn()}
        onStep={vi.fn()}
        onLive={vi.fn()}
        onScrub={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Play")).toBeDisabled();
    expect(screen.getByLabelText("History scrubber")).toBeDisabled();
  });

  it("calls onTogglePlay when replay is clicked", async () => {
    const onTogglePlay = vi.fn();
    render(
      <TimelineConsole
        history={[makeSnapshot(1000), makeSnapshot(1001)]}
        mode="live"
        index={1}
        isLive
        canStepBack={false}
        canStepForward={false}
        playbackSpeed={1}
        setPlaybackSpeed={vi.fn()}
        onTogglePlay={onTogglePlay}
        onStep={vi.fn()}
        onLive={vi.fn()}
        onScrub={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByLabelText("Play"));
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it("calls onLive when live button is clicked", async () => {
    const onLive = vi.fn();
    render(
      <TimelineConsole
        history={[makeSnapshot(1000), makeSnapshot(1001)]}
        mode="paused"
        index={0}
        isLive={false}
        canStepBack={false}
        canStepForward
        playbackSpeed={1}
        setPlaybackSpeed={vi.fn()}
        onTogglePlay={vi.fn()}
        onStep={vi.fn()}
        onLive={onLive}
        onScrub={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByTitle("Return to live"));
    expect(onLive).toHaveBeenCalledTimes(1);
  });

  it("calls onScrub when the slider changes", async () => {
    const onScrub = vi.fn();
    render(
      <TimelineConsole
        history={[makeSnapshot(1000), makeSnapshot(1001), makeSnapshot(1002)]}
        mode="live"
        index={2}
        isLive
        canStepBack={false}
        canStepForward={false}
        playbackSpeed={1}
        setPlaybackSpeed={vi.fn()}
        onTogglePlay={vi.fn()}
        onStep={vi.fn()}
        onLive={vi.fn()}
        onScrub={onScrub}
      />,
    );

    const slider = screen.getByLabelText("History scrubber");
    fireEvent.change(slider, { target: { value: "1" } });
    expect(onScrub).toHaveBeenCalledWith(1);
  });

  it("calls onStep with correct deltas", async () => {
    const onStep = vi.fn();
    render(
      <TimelineConsole
        history={[makeSnapshot(1000), makeSnapshot(1001), makeSnapshot(1002)]}
        mode="paused"
        index={1}
        isLive={false}
        canStepBack
        canStepForward
        playbackSpeed={1}
        setPlaybackSpeed={vi.fn()}
        onTogglePlay={vi.fn()}
        onStep={onStep}
        onLive={vi.fn()}
        onScrub={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByTitle("Step backward"));
    expect(onStep).toHaveBeenCalledWith(-1);

    await userEvent.click(screen.getByTitle("Step forward"));
    expect(onStep).toHaveBeenCalledWith(1);
  });
});
