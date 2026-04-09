export function shouldReuseLoadedVideo(
  activeVideoId: string | null | undefined,
  nextVideoId: string
): boolean {
  return Boolean(activeVideoId && activeVideoId === nextVideoId);
}

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
