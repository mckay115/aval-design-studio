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

function renderStage(mode: "unit" | "interactive", onBinding = vi.fn()) {
  render(
    <VideoStage
      canvasRef={createRef<HTMLCanvasElement>()}
      descriptor={descriptor}
      mode={mode}
      alphaPreview="composite"
      activeState={{ id: "idle", name: "Idle", bodyUnitId: "idle.body", color: "teal" }}
      states={[{ id: "idle", name: "Idle", bodyUnitId: "idle.body", color: "teal" }]}
      bindings={[{ source: "pointer.enter", event: "hover.enter" }, { source: "pointer.leave", event: "hover.leave" }]}
      graphSnapshot={null}
      graphError={null}
      currentFrame={0}
      isPlaying={false}
      status="ready"
      error={null}
      onMode={() => undefined}
      onAlphaPreview={() => undefined}
      onTogglePlayback={() => undefined}
      onStep={() => undefined}
      onRequestState={() => undefined}
      onSendEvent={() => undefined}
      onSendBinding={onBinding}
      onRestartGraph={() => undefined}
      onToggleInteraction={() => undefined}
    />
  );
  return onBinding;
}

describe("VideoStage interaction testing", () => {
  it("dispatches hover routes from the visible video in interactive mode", () => {
    const onBinding = renderStage("interactive");
    const canvas = screen.getByLabelText("interaction.mp4 preview");

    fireEvent.pointerEnter(canvas);
    fireEvent.pointerLeave(canvas);

    expect(onBinding).toHaveBeenNthCalledWith(1, "pointer.enter");
    expect(onBinding).toHaveBeenNthCalledWith(2, "pointer.leave");
    expect(screen.getByRole("status").textContent).toContain("Live graph");
  });

  it("does not dispatch interaction routes in unit mode", () => {
    const onBinding = renderStage("unit");
    const canvas = screen.getByLabelText("interaction.mp4 preview");

    fireEvent.pointerEnter(canvas);
    fireEvent.pointerLeave(canvas);

    expect(onBinding).not.toHaveBeenCalled();
  });
});
