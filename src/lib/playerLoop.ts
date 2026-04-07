export interface SegmentLoopPlayer {
  getCurrentTime: () => number;
  seekTo: (time: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
}

export interface SegmentLoopMonitorOptions {
  kind: "playLoop" | "playSegment";
  loopStart: number;
  loopEnd: number;
  player: SegmentLoopPlayer;
  onIterationCompleted: () => void;
  pollIntervalMs?: number;
  completionThresholdSeconds?: number;
  loopResetThresholdSeconds?: number;
}

export function startSegmentLoopMonitor({
  kind,
  loopStart,
  loopEnd,
  player,
  onIterationCompleted,
  pollIntervalMs = 120,
  completionThresholdSeconds = 0.05,
  loopResetThresholdSeconds = 0.2
}: SegmentLoopMonitorOptions): () => void {
  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  let waitingForLoopRestart = false;

  const stop = () => {
    if (intervalHandle === null) {
      return;
    }

    clearInterval(intervalHandle);
    intervalHandle = null;
  };

  intervalHandle = setInterval(() => {
    const currentTime = player.getCurrentTime();

    if (waitingForLoopRestart) {
      if (currentTime <= loopStart + loopResetThresholdSeconds) {
        waitingForLoopRestart = false;
      }
      return;
    }

    if (currentTime < loopEnd - completionThresholdSeconds) {
      return;
    }

    onIterationCompleted();

    if (kind === "playLoop") {
      waitingForLoopRestart = true;
      player.seekTo(loopStart, true);
      player.playVideo();
      return;
    }

    stop();
    player.pauseVideo();
  }, pollIntervalMs);

  return stop;
}
