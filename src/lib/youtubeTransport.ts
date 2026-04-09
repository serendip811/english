export function shouldReuseLoadedVideo(
  activeVideoId: string | null | undefined,
  nextVideoId: string
): boolean {
  return Boolean(activeVideoId && activeVideoId === nextVideoId);
}

export const YOUTUBE_PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5
} as const;

export type YouTubePlaybackTransport = "seek" | "load";
export const YOUTUBE_IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

export interface YouTubeQueueOptions {
  videoId: string;
  startSeconds: number;
}

function normalizeStartSeconds(startTime: number): number {
  if (!Number.isFinite(startTime)) {
    return 0;
  }

  return Math.max(0, startTime);
}

export function createCueOptions(videoId: string, startTime: number): YouTubeQueueOptions {
  return {
    videoId,
    startSeconds: normalizeStartSeconds(startTime)
  };
}

export function createLoadOptions(videoId: string, startTime: number): YouTubeQueueOptions {
  return {
    videoId,
    startSeconds: normalizeStartSeconds(startTime)
  };
}

export function choosePlaybackTransport(
  activeVideoId: string | null | undefined,
  nextVideoId: string,
  playerState: number | null | undefined
): YouTubePlaybackTransport {
  if (!shouldReuseLoadedVideo(activeVideoId, nextVideoId)) {
    return "load";
  }

  if (
    playerState === YOUTUBE_PLAYER_STATE.UNSTARTED ||
    playerState === YOUTUBE_PLAYER_STATE.CUED
  ) {
    return "load";
  }

  return "seek";
}
