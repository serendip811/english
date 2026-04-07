import { useEffect, useRef } from "react";
import type { PlayerCommand } from "../lib/types";
import { startSegmentLoopMonitor } from "../lib/playerLoop";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeLoaderPromise: Promise<any> | null = null;

function loadYouTubeAPI(): Promise<any> {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (youtubeLoaderPromise) {
    return youtubeLoaderPromise;
  }

  youtubeLoaderPromise = new Promise((resolve) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]'
    );

    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(window.YT);
    };

    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return youtubeLoaderPromise;
}

interface YouTubePlayerProps {
  command: PlayerCommand;
  onPlayerError: (code: number) => void;
  onIterationCompleted: () => void;
}

export function YouTubePlayer({
  command,
  onPlayerError,
  onIterationCompleted
}: YouTubePlayerProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const pendingCommandRef = useRef<PlayerCommand | null>(null);
  const appliedSequenceRef = useRef(-1);
  const stopMonitorRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let isMounted = true;

    loadYouTubeAPI().then((YT) => {
      if (!isMounted || !containerRef.current) {
        return;
      }

      playerRef.current = new YT.Player(containerRef.current, {
        width: "100%",
        height: "100%",
        playerVars: {
          playsinline: 1,
          controls: 1
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            applyPendingCommand();
          },
          onError: (event: { data: number }) => {
            onPlayerError(event.data);
          }
        }
      });
    });

    return () => {
      isMounted = false;
      clearPlaybackTimer();
      readyRef.current = false;
      if (playerRef.current?.destroy) {
        playerRef.current.destroy();
      }
      playerRef.current = null;
    };
  }, [onPlayerError]);

  useEffect(() => {
    if (command.sequence === appliedSequenceRef.current) {
      return;
    }

    pendingCommandRef.current = command;
    if (readyRef.current) {
      applyPendingCommand();
    }
  }, [command]);

  function clearPlaybackTimer(): void {
    stopMonitorRef.current?.();
    stopMonitorRef.current = null;
  }

  function runSegment(commandToRun: Extract<PlayerCommand, { kind: "playLoop" | "playSegment" }>): void {
    clearPlaybackTimer();

    const player = playerRef.current;
    if (!player) {
      return;
    }

    const loopStart = Number.isFinite(commandToRun.startTime)
      ? Math.max(0, commandToRun.startTime)
      : 0;
    const loopEnd = Number.isFinite(commandToRun.endTime)
      ? Math.max(loopStart + 0.05, commandToRun.endTime)
      : loopStart + 0.05;

    player.loadVideoById(commandToRun.videoId, loopStart, "large");

    stopMonitorRef.current = startSegmentLoopMonitor({
      kind: commandToRun.kind,
      loopStart,
      loopEnd,
      player: {
        getCurrentTime: () => playerRef.current.getCurrentTime(),
        seekTo: (time, allowSeekAhead) => playerRef.current.seekTo(time, allowSeekAhead),
        playVideo: () => playerRef.current.playVideo(),
        pauseVideo: () => playerRef.current.pauseVideo()
      },
      onIterationCompleted
    });
  }

  function applyPendingCommand(): void {
    const player = playerRef.current;
    const pendingCommand = pendingCommandRef.current;

    if (!readyRef.current || !player || !pendingCommand) {
      return;
    }

    appliedSequenceRef.current = pendingCommand.sequence;
    pendingCommandRef.current = null;

    switch (pendingCommand.kind) {
      case "idle":
        return;
      case "stop":
        clearPlaybackTimer();
        player.pauseVideo();
        return;
      case "cue":
        clearPlaybackTimer();
        player.cueVideoById(pendingCommand.videoId, pendingCommand.startTime, "large");
        return;
      case "playLoop":
      case "playSegment":
        runSegment(pendingCommand);
        return;
    }
  }

  return (
    <div className="player-frame">
      <div ref={containerRef} className="player-embed" />
    </div>
  );
}
