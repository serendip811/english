import { describe, expect, it } from "vitest";
import { shouldReuseLoadedVideo } from "./youtubeTransport";

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
