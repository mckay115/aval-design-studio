// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createStudioProject, type MediaDescriptor } from "../model/studio";
import { useProjectHistory } from "./useProjectHistory";

const descriptor: MediaDescriptor = {
  name: "source.mov",
  path: "/tmp/source.mov",
  container: "QuickTime",
  mimeType: "video/quicktime",
  codec: "h264",
  codecParameter: null,
  width: 640,
  height: 360,
  rotation: 0,
  pixelAspect: [1, 1],
  durationSeconds: 2,
  frameRate: { numerator: 30, denominator: 1 },
  averageFrameRate: 30,
  totalFrames: 60,
  variableFrameRate: false,
  canDecode: true,
  canBeTransparent: false,
  hasHighDynamicRange: false,
  audioTrackCount: 0
};

describe("useProjectHistory", () => {
  it("loads an existing project as saved and marks later edits dirty", () => {
    const project = createStudioProject(descriptor);
    const { result } = renderHook(() => useProjectHistory());

    act(() => result.current.reset(project, true));
    expect(result.current.project).toEqual(project);
    expect(result.current.saved).toBe(true);

    act(() => result.current.commit((current) => ({ ...current, name: "Renamed" })));
    expect(result.current.saved).toBe(false);
  });
});
