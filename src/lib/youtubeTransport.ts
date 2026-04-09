export function shouldReuseLoadedVideo(
  activeVideoId: string | null | undefined,
  nextVideoId: string
): boolean {
  return Boolean(activeVideoId && activeVideoId === nextVideoId);
}
