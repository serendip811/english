import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { PlayerCommand, PlayerCommandInput } from "../lib/types";
import { startSegmentLoopMonitor } from "../lib/playerLoop";
import {
  choosePlaybackTransport,
  createCueOptions,
  createLoadOptions,
  shouldReuseLoadedVideo,
  YOUTUBE_PLAYER_STATE
} from "../lib/youtubeTransport";

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
  initialVideoId: string;
  command: PlayerCommand;
  onPlayerError: (code: number) => void;
  onIterationCompleted: () => void;
}

type SegmentPlaybackCommand =
  | Extract<PlayerCommand, { kind: "playLoop" | "playSegment" }>
  | Extract<PlayerCommandInput, { kind: "playLoop" | "playSegment" }>;

export interface YouTubePlayerHandle {
  runCommand: (command: PlayerCommandInput) => boolean;
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(function YouTubePlayer(
  {
    initialVideoId,
    command,
    onPlayerError,
    onIterationCompleted
  }: YouTubePlayerProps,
  ref
): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const pendingCommandRef = useRef<PlayerCommand | null>(null);
  const appliedSequenceRef = useRef(-1);
  const stopMonitorRef = useRef<(() => void) | null>(null);
  const activeVideoIdRef = useRef<string | null>(null);
  const playerStateRef = useRef<number>(YOUTUBE_PLAYER_STATE.UNSTARTED);

  useEffect(() => {
    let isMounted = true;

    loadYouTubeAPI().then((YT) => {
      if (!isMounted || !containerRef.current) {
        return;
      }

      playerRef.current = new YT.Player(containerRef.current, {
        width: "100%",
        height: "100%",
        videoId: initialVideoId,
        playerVars: {
          playsinline: 1,
          controls: 1
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            activeVideoIdRef.current = initialVideoId;
            applyPendingCommand();
          },
          onStateChange: (event: { data: number }) => {
            playerStateRef.current = event.data;
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
      activeVideoIdRef.current = null;
      playerStateRef.current = YOUTUBE_PLAYER_STATE.UNSTARTED;
      if (playerRef.current?.destroy) {
        playerRef.current.destroy();
      }
      playerRef.current = null;
    };
  }, [initialVideoId, onPlayerError]);

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

  function canExecuteImmediately(): boolean {
    return Boolean(readyRef.current && playerRef.current);
  }

  function isCurrentVideo(videoId: string): boolean {
    return shouldReuseLoadedVideo(activeVideoIdRef.current, videoId);
  }

  function runSegment(commandToRun: SegmentPlaybackCommand): void {
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

    if (
      choosePlaybackTransport(
        activeVideoIdRef.current,
        commandToRun.videoId,
        playerStateRef.current
      ) === "seek"
    ) {
      player.seekTo(loopStart, true);
      player.playVideo();
    } else {
      player.loadVideoById(createLoadOptions(commandToRun.videoId, loopStart));
      activeVideoIdRef.current = commandToRun.videoId;
    }

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

  function executeCommand(commandToRun: PlayerCommand | PlayerCommandInput): void {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    switch (commandToRun.kind) {
      case "idle":
        return;
      case "stop":
        clearPlaybackTimer();
        player.pauseVideo();
        return;
      case "cue":
        clearPlaybackTimer();
        if (isCurrentVideo(commandToRun.videoId)) {
          player.pauseVideo();
          player.seekTo(commandToRun.startTime, true);
        } else {
          player.cueVideoById(createCueOptions(commandToRun.videoId, commandToRun.startTime));
          activeVideoIdRef.current = commandToRun.videoId;
        }
        return;
      case "playLoop":
      case "playSegment":
        runSegment(commandToRun);
        return;
    }
  }

  useImperativeHandle(ref, () => ({
    runCommand(commandToRun: PlayerCommandInput): boolean {
      if (!canExecuteImmediately()) {
        return false;
      }

      pendingCommandRef.current = null;
      executeCommand(commandToRun);
      return true;
    }
  }));

  function applyPendingCommand(): void {
    const pendingCommand = pendingCommandRef.current;

    if (!canExecuteImmediately() || !pendingCommand) {
      return;
    }

    appliedSequenceRef.current = pendingCommand.sequence;
    pendingCommandRef.current = null;
    executeCommand(pendingCommand);
  }

  return (
    <div className="player-frame">
      <div ref={containerRef} className="player-embed" />
    </div>
  );
});
