import { describe, expect, it } from "vitest";
import {
  autoAdvanceDecision,
  createDefaultSession,
  nextPlaybackIndex,
  playbackStartIndex,
  sanitizeSession,
  shouldAutoplaySentenceNavigation
} from "./practice";
import type { Lesson } from "./types";

const sampleLesson: Lesson = {
  youtubeVideoID: "demo",
  title: "Demo Lesson",
  sourceURL: "https://example.com",
  duration: 60,
  summary: "",
  segments: [
    {
      index: 0,
      startTime: 0,
      endTime: 3,
      textEn: "Hello there.",
      textKo: "안녕.",
      sourceType: "captions"
    },
    {
      index: 1,
      startTime: 3,
      endTime: 6,
      textEn: "How are you?",
      textKo: null,
      sourceType: "captions"
    }
  ]
};

describe("practice helpers", () => {
  it("starts range playback from the range start", () => {
    expect(
      playbackStartIndex(
        {
          startIndex: 4,
          endIndex: 7,
          mode: "range"
        },
        12
      )
    ).toBe(4);
  });

  it("starts range playback from the current sentence when it is inside the selected range", () => {
    expect(
      playbackStartIndex(
        {
          startIndex: 4,
          endIndex: 7,
          mode: "range"
        },
        12,
        6
      )
    ).toBe(6);
  });

  it("wraps range playback back to the start index", () => {
    expect(
      nextPlaybackIndex(
        {
          startIndex: 4,
          endIndex: 7,
          mode: "range"
        },
        7,
        12
      )
    ).toBe(4);
  });

  it("advances automatically after the configured repeat threshold", () => {
    expect(autoAdvanceDecision("single", 3, 2, 5, 10)).toEqual({
      kind: "advance",
      nextIndex: 6
    });
  });

  it("does not auto-advance in range mode", () => {
    expect(autoAdvanceDecision("range", 3, 1, 5, 10)).toEqual({
      kind: "continue",
      completedIterations: 1
    });
  });

  it("autoplays sentence navigation whenever playback is already active", () => {
    expect(shouldAutoplaySentenceNavigation(true, "single")).toBe(true);
    expect(shouldAutoplaySentenceNavigation(true, "range")).toBe(true);
    expect(shouldAutoplaySentenceNavigation(false, "single")).toBe(false);
  });

  it("defaults transcript visibility to hidden", () => {
    expect(createDefaultSession(sampleLesson).showTranscript).toBe(false);
  });

  it("sanitizes transcript visibility to a boolean", () => {
    expect(
      sanitizeSession(sampleLesson, {
        ...createDefaultSession(sampleLesson),
        showTranscript: true
      }).showTranscript
    ).toBe(true);
  });
});
