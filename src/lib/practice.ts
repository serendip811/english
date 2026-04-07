import type { Lesson, LessonSessionState, LoopMode, SentenceSegment } from "./types";

export interface LoopRange {
  startIndex: number;
  endIndex: number;
  mode: LoopMode;
}

export type AutoAdvanceDecision =
  | { kind: "continue"; completedIterations: number }
  | { kind: "advance"; nextIndex: number }
  | { kind: "stop" };

export function clampIndex(index: number, totalSegments: number): number {
  if (totalSegments <= 0) {
    return 0;
  }
  return Math.min(Math.max(index, 0), totalSegments - 1);
}

export function clampLoopRange(range: LoopRange, totalSegments: number): LoopRange {
  if (totalSegments <= 0) {
    return { startIndex: 0, endIndex: 0, mode: "single" };
  }

  const startIndex = clampIndex(range.startIndex, totalSegments);
  const endIndex = Math.min(Math.max(range.endIndex, startIndex), totalSegments - 1);
  return { ...range, startIndex, endIndex };
}

export function effectiveLoopRange(
  loopMode: LoopMode,
  currentIndex: number,
  loopStartIndex: number,
  loopEndIndex: number
): LoopRange {
  if (loopMode === "single") {
    return { startIndex: currentIndex, endIndex: currentIndex, mode: "single" };
  }

  return {
    startIndex: Math.min(loopStartIndex, loopEndIndex),
    endIndex: Math.max(loopStartIndex, loopEndIndex),
    mode: "range"
  };
}

export function playbackStartIndex(
  range: LoopRange,
  totalSegments: number,
  currentIndex = range.startIndex
): number {
  const clampedRange = clampLoopRange(range, totalSegments);
  const clampedCurrentIndex = clampIndex(currentIndex, totalSegments);

  if (clampedRange.mode === "single") {
    return clampedRange.startIndex;
  }

  if (
    clampedCurrentIndex < clampedRange.startIndex ||
    clampedCurrentIndex > clampedRange.endIndex
  ) {
    return clampedRange.startIndex;
  }

  return clampedCurrentIndex;
}

export function nextPlaybackIndex(
  range: LoopRange,
  currentIndex: number,
  totalSegments: number
): number {
  const clampedRange = clampLoopRange(range, totalSegments);

  if (clampedRange.mode === "single") {
    return clampedRange.startIndex;
  }

  const normalizedCurrent = Math.min(
    Math.max(currentIndex, clampedRange.startIndex),
    clampedRange.endIndex
  );

  if (normalizedCurrent >= clampedRange.endIndex) {
    return clampedRange.startIndex;
  }

  return normalizedCurrent + 1;
}

export function autoAdvanceDecision(
  loopMode: LoopMode,
  repeatCount: number,
  completedIterations: number,
  currentIndex: number,
  totalSegments: number
): AutoAdvanceDecision {
  if (loopMode !== "single" || repeatCount <= 0 || totalSegments <= 0) {
    return { kind: "continue", completedIterations };
  }

  const nextCompletedIterations = completedIterations + 1;
  if (nextCompletedIterations < repeatCount) {
    return { kind: "continue", completedIterations: nextCompletedIterations };
  }

  const nextIndex = currentIndex + 1;
  if (nextIndex >= totalSegments) {
    return { kind: "stop" };
  }

  return { kind: "advance", nextIndex };
}

export function shouldAutoplaySentenceNavigation(
  isPlaying: boolean,
  loopMode: LoopMode
): boolean {
  return isPlaying;
}

export function effectivePlaybackEndTime(
  segments: SentenceSegment[],
  index: number,
  minimumDuration = 0.25,
  trimBeforeNextStart = 0.12
): number {
  if (index < 0 || index >= segments.length) {
    return 0;
  }

  const segment = segments[index];
  const minimumEndTime = segment.startTime + minimumDuration;

  if (index >= segments.length - 1) {
    return Math.max(segment.endTime, minimumEndTime);
  }

  const nextStartTime = segments[index + 1].startTime;
  if (nextStartTime >= segment.endTime) {
    return Math.max(segment.endTime, minimumEndTime);
  }

  const trimmedEndTime = Math.min(segment.endTime, nextStartTime - trimBeforeNextStart);
  return Math.max(minimumEndTime, trimmedEndTime);
}

export function createDefaultSession(lesson: Lesson): LessonSessionState {
  return {
    lastPracticedSegmentIndex: 0,
    loopMode: "single",
    loopStartIndex: 0,
    loopEndIndex: 0,
    autoAdvanceRepeatCount: 0,
    showTranscript: false,
    showKorean: false,
    bookmarkedSegmentIndices: [],
    lastPracticedAt: null
  };
}

export function sanitizeSession(lesson: Lesson, session?: LessonSessionState): LessonSessionState {
  const fallback = createDefaultSession(lesson);
  if (!session) {
    return fallback;
  }

  const totalSegments = lesson.segments.length;
  const lastPracticedSegmentIndex = clampIndex(session.lastPracticedSegmentIndex, totalSegments);
  const loopStartIndex = clampIndex(session.loopStartIndex, totalSegments);
  const loopEndIndex = Math.max(loopStartIndex, clampIndex(session.loopEndIndex, totalSegments));

  return {
    lastPracticedSegmentIndex,
    loopMode: session.loopMode === "range" ? "range" : "single",
    loopStartIndex,
    loopEndIndex,
    autoAdvanceRepeatCount: Math.min(Math.max(session.autoAdvanceRepeatCount, 0), 10),
    showTranscript: Boolean(session.showTranscript),
    showKorean:
      Boolean(session.showKorean) &&
      lesson.segments.some((segment) => Boolean(segment.textKo?.trim())),
    bookmarkedSegmentIndices: Array.from(
      new Set(session.bookmarkedSegmentIndices.filter((index) => index >= 0 && index < totalSegments))
    ).sort((left, right) => left - right),
    lastPracticedAt: session.lastPracticedAt ?? null
  };
}

export function formatTimestamp(secondsValue: number): string {
  const totalSeconds = Math.max(0, Math.floor(secondsValue));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.max(0, Math.floor((secondsValue - Math.floor(secondsValue)) * 10));
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}
