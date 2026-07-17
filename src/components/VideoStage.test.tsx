// @vitest-environment jsdom

import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { MediaDescriptor } from "../model/studio";
import { VideoStage } from "./VideoStage";

const descriptor: MediaDescriptor = {
  name: "interaction.mp4",
  path: null,
  container: "MP4",
  mimeType: "video/mp4",
  codec: "avc",
  codecParameter: null,
  width: 1920,
  height: 1080,
  rotation: 0,
  pixelAspect: [1, 1],
  durationSeconds: 10,
  frameRate: { numerator: 30, denominator: 1 },
  averageFrameRate: 30,
  totalFrames: 300,
  variableFrameRate: false,
  canDecode: true,
  canBeTransparent: false,
  hasHighDynamicRange: false,
  audioTrackCount: 0
};

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe(): void {}
    disconnect(): void {}
  });
});

afterEach(cleanup);

function renderStage(mode: "unit" | "interactive", onTrigger = vi.fn()) {
  render(
    <VideoStage
      canvasRef={createRef<HTMLCanvasElement>()}
      descriptor={descriptor}
      mode={mode}
      alphaPreview="composite"
      activeState={{ id: "idle", name: "Idle", unitId: "idle.body", color: "teal" }}
      currentFrame={0}
      isPlaying={false}
      status="ready"
      error={null}
      onMode={() => undefined}
      onAlphaPreview={() => undefined}
      onTogglePlayback={() => undefined}
      onStep={() => undefined}
      onTrigger={onTrigger}
      onToggleInteraction={() => undefined}
    />
  );
  return onTrigger;
}

describe("VideoStage interaction testing", () => {
  it("dispatches hover routes from the visible video in interactive mode", () => {
    const onTrigger = renderStage("interactive");
    const canvas = screen.getByLabelText("interaction.mp4 preview");

    fireEvent.pointerEnter(canvas);
    fireEvent.pointerLeave(canvas);

    expect(onTrigger).toHaveBeenNthCalledWith(1, "hover.enter");
    expect(onTrigger).toHaveBeenNthCalledWith(2, "hover.leave");
    expect(screen.getByRole("status").textContent).toContain("Live test");
  });

  it("does not dispatch interaction routes in unit mode", () => {
    const onTrigger = renderStage("unit");
    const canvas = screen.getByLabelText("interaction.mp4 preview");

    fireEvent.pointerEnter(canvas);
    fireEvent.pointerLeave(canvas);

    expect(onTrigger).not.toHaveBeenCalled();
  });
});
