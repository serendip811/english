import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSegmentLoopMonitor, type SegmentLoopPlayer } from "./playerLoop";

describe("startSegmentLoopMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("keeps manual playLoop armed across multiple completed iterations", () => {
    let currentTime = 5;
    const player: SegmentLoopPlayer = {
      getCurrentTime: () => currentTime,
      seekTo: vi.fn((time: number) => {
        currentTime = time;
      }),
      playVideo: vi.fn(),
      pauseVideo: vi.fn()
    };
    const onIterationCompleted = vi.fn();

    const stop = startSegmentLoopMonitor({
      kind: "playLoop",
      loopStart: 5,
      loopEnd: 8,
      player,
      onIterationCompleted,
      pollIntervalMs: 100
    });

    currentTime = 8.1;
    vi.advanceTimersByTime(100);

    expect(onIterationCompleted).toHaveBeenCalledTimes(1);
    expect(player.seekTo).toHaveBeenCalledWith(5, true);
    expect(player.playVideo).toHaveBeenCalledTimes(1);
    expect(player.pauseVideo).not.toHaveBeenCalled();

    currentTime = 5.05;
    vi.advanceTimersByTime(100);
    expect(onIterationCompleted).toHaveBeenCalledTimes(1);

    currentTime = 8.2;
    vi.advanceTimersByTime(100);

    expect(onIterationCompleted).toHaveBeenCalledTimes(2);
    expect(player.seekTo).toHaveBeenCalledTimes(2);
    expect(player.playVideo).toHaveBeenCalledTimes(2);

    stop();
  });

  it("stops monitoring and pauses after a one-shot playSegment completes", () => {
    let currentTime = 12;
    const player: SegmentLoopPlayer = {
      getCurrentTime: () => currentTime,
      seekTo: vi.fn(),
      playVideo: vi.fn(),
      pauseVideo: vi.fn()
    };
    const onIterationCompleted = vi.fn();

    startSegmentLoopMonitor({
      kind: "playSegment",
      loopStart: 10,
      loopEnd: 13,
      player,
      onIterationCompleted,
      pollIntervalMs: 100
    });

    currentTime = 13.1;
    vi.advanceTimersByTime(100);

    expect(onIterationCompleted).toHaveBeenCalledTimes(1);
    expect(player.pauseVideo).toHaveBeenCalledTimes(1);

    currentTime = 13.3;
    vi.advanceTimersByTime(300);
    expect(onIterationCompleted).toHaveBeenCalledTimes(1);
  });
});
