import { describe, expect, it } from "vitest";
import { createCueOptions, createLoadOptions, shouldReuseLoadedVideo } from "./youtubeTransport";

describe("shouldReuseLoadedVideo", () => {
  it("reuses the current iframe when the same lesson video stays active", () => {
    expect(shouldReuseLoadedVideo("tfuEUuvk8Qs", "tfuEUuvk8Qs")).toBe(true);
  });

  it("does not reuse when no video has been loaded yet", () => {
    expect(shouldReuseLoadedVideo(null, "tfuEUuvk8Qs")).toBe(false);
  });

  it("does not reuse when switching to a different lesson video", () => {
    expect(shouldReuseLoadedVideo("tfuEUuvk8Qs", "dQw4w9WgXcQ")).toBe(false);
  });
});

describe("YouTube queue option helpers", () => {
  it("creates a cue payload with a non-negative start time", () => {
    expect(createCueOptions("tfuEUuvk8Qs", -3)).toEqual({
      videoId: "tfuEUuvk8Qs",
      startSeconds: 0
    });
  });

  it("creates a load payload with the normalized start time", () => {
    expect(createLoadOptions("tfuEUuvk8Qs", 12.4)).toEqual({
      videoId: "tfuEUuvk8Qs",
      startSeconds: 12.4
    });
  });
});
