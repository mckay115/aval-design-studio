// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { applyStateTemplate } from "../model/graphOperations";
import { createStudioProject, type MediaDescriptor } from "../model/studio";
import { useGraphPreview } from "./useGraphPreview";

const descriptor: MediaDescriptor = {
  name: "graph.mov",
  path: "/graph.mov",
  container: "QuickTime",
  mimeType: "video/quicktime",
  codec: "prores",
  codecParameter: null,
  width: 640,
  height: 360,
  rotation: 0,
  pixelAspect: [1, 1],
  durationSeconds: 4,
  frameRate: { numerator: 30, denominator: 1 },
  averageFrameRate: 30,
  totalFrames: 120,
  variableFrameRate: false,
  canDecode: true,
  canBeTransparent: false,
  hasHighDynamicRange: false,
  audioTrackCount: 0
};

afterEach(() => vi.useRealTimers());

describe("graph-backed interaction preview", () => {
  it("drives bridge frames and commits an event target using MotionGraphEngine", () => {
    vi.useFakeTimers();
    const project = applyStateTemplate(createStudioProject(descriptor), "hover", "replace", {
      anchor: [0, 30],
      hover: [30, 60],
      enter: [60, 66],
      exit: [66, 72]
    });
    const onFrame = vi.fn();
    const { result } = renderHook(() => useGraphPreview(project, true, onFrame));

    act(() => result.current.sendEvent("hover.enter"));
    act(() => vi.advanceTimersByTime(700));

    expect(result.current.activeStateId).toBe("hover");
    expect(onFrame).toHaveBeenCalled();
    expect(onFrame.mock.calls.some(([frame]) => frame >= 60 && frame < 66)).toBe(true);
  });
});
