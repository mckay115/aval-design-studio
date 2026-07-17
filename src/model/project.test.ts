import { describe, expect, it } from "vitest";

import {
  createStarterSegments,
  projectDocument,
  removeSegment,
  splitSegment,
  updateSegment,
  type VideoSource
} from "./project";

describe("studio project model", () => {
  it("creates the canonical 450-frame rest, entry, loop, and exit layout", () => {
    const segments = createStarterSegments(450);
    expect(segments.map(({ name, startFrame, endFrame }) => ({
      name,
      range: [startFrame, endFrame]
    }))).toEqual([
      { name: "Rest", range: [0, 1] },
      { name: "Entry", range: [1, 60] },
      { name: "Loop", range: [60, 330] },
      { name: "Exit", range: [330, 450] }
    ]);
  });

  it("keeps a resized segment between its neighbours", () => {
    const segments = createStarterSegments(450);
    const resized = updateSegment(
      segments,
      "segment-3",
      { startFrame: 10, endFrame: 440 },
      450
    );
    expect(resized[2]).toMatchObject({ startFrame: 60, endFrame: 330 });
  });

  it("ignores a temporarily empty numeric frame edit", () => {
    const segments = createStarterSegments(450);
    const resized = updateSegment(
      segments,
      "segment-3",
      { startFrame: Number.NaN, endFrame: Number.NaN },
      450
    );
    expect(resized[2]).toMatchObject({ startFrame: 60, endFrame: 330 });
  });

  it("splits the selected range at the playhead", () => {
    const segments = createStarterSegments(450);
    const result = splitSegment(segments, "segment-3", 180);
    expect(result.segments).toHaveLength(5);
    expect(result.segments[2]).toMatchObject({ startFrame: 60, endFrame: 180 });
    expect(result.segments[3]).toMatchObject({ startFrame: 180, endFrame: 330 });
  });

  it("does not remove the final remaining segment", () => {
    const only = createStarterSegments(1);
    expect(removeSegment(only, only[0]!.id).segments).toEqual(only);
  });

  it("serializes source facts without a transient media URL", () => {
    const source: VideoSource = {
      name: "demo.mov",
      path: "/selected/demo.mov",
      url: "blob:preview",
      revokeUrl: null,
      durationSeconds: 15,
      width: 1080,
      height: 1920,
      frameRate: 30,
      totalFrames: 450
    };
    const document = projectDocument(source, createStarterSegments(450));
    expect(document.source).not.toHaveProperty("url");
    expect(document.segments[2]).not.toHaveProperty("color");
  });
});
