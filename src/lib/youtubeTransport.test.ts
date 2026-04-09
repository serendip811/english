import { describe, expect, it } from "vitest";
import {
  createCueOptions,
  createLoadOptions,
  choosePlaybackTransport,
  shouldReuseLoadedVideo,
  YOUTUBE_PLAYER_STATE
} from "./youtubeTransport";

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

describe("choosePlaybackTransport", () => {
  it("loads when the lesson switches to a new video", () => {
    expect(choosePlaybackTransport("aaa", "bbb", YOUTUBE_PLAYER_STATE.PLAYING)).toBe("load");
  });

  it("loads when the same video is still only cued", () => {
    expect(choosePlaybackTransport("aaa", "aaa", YOUTUBE_PLAYER_STATE.CUED)).toBe("load");
  });

  it("loads when the same video is still unstarted", () => {
    expect(choosePlaybackTransport("aaa", "aaa", YOUTUBE_PLAYER_STATE.UNSTARTED)).toBe("load");
  });

  it("seeks when the same video is already in an active playback lifecycle", () => {
    expect(choosePlaybackTransport("aaa", "aaa", YOUTUBE_PLAYER_STATE.PLAYING)).toBe("seek");
    expect(choosePlaybackTransport("aaa", "aaa", YOUTUBE_PLAYER_STATE.PAUSED)).toBe("seek");
  });
});
