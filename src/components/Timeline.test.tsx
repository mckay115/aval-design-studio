// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioBodyUnit } from "../model/studio";
import { frameForClientX, packUnitLanes, Timeline } from "./Timeline";

afterEach(() => {
  cleanup();
  document.body.classList.remove("is-timeline-scrubbing", "is-timeline-resizing");
});

function unit(id: string, range: readonly [number, number]): StudioBodyUnit {
  return { id, name: id, kind: "body", sourceId: "source", range, playback: "loop", ports: [{ id: "default", entryFrame: 0, portalFrames: [0] }], color: "teal" };
}

describe("timeline overlap lanes", () => {
  it("stacks overlapping units and reuses a lane after its range ends", () => {
    const packed = packUnitLanes([unit("a", [0, 100]), unit("b", [20, 80]), unit("c", [100, 140])]);
    expect(packed.map(({ unit: value, lane }) => [value.id, lane])).toEqual([["a", 0], ["b", 1], ["c", 0]]);
  });
});

describe("timeline scrubbing", () => {
  it("captures one pointer and follows it through release without native image dragging", () => {
    const onSeek = vi.fn();
    render(
      <Timeline
        units={[unit("idle", [0, 100])]}
        routes={[]}
        selectedId="idle"
        currentFrame={0}
        totalFrames={100}
        frameRate={{ numerator: 30, denominator: 1 }}
        thumbnails={["data:image/png;base64,AA=="]}
        onSelect={() => undefined}
        onSelectRoute={() => undefined}
        onSeek={onSeek}
        onResize={() => undefined}
        onResizePreview={() => undefined}
        onResizePreviewEnd={() => undefined}
      />
    );
    const filmstrip = screen.getByRole("slider", { name: "Video playhead" });
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperties(filmstrip, {
      getBoundingClientRect: { value: () => ({ left: 100, width: 400, right: 500, top: 0, bottom: 60, height: 60, x: 100, y: 0, toJSON: () => ({}) }) },
      setPointerCapture: { value: setPointerCapture },
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: releasePointerCapture }
    });

    fireEvent.pointerDown(filmstrip, { button: 0, clientX: 200, pointerId: 7 });
    fireEvent.pointerMove(filmstrip, { clientX: 300, pointerId: 7 });
    expect(fireEvent.dragStart(filmstrip.querySelector("img")!)).toBe(false);
    fireEvent.pointerUp(filmstrip, { clientX: 420, pointerId: 7 });
    fireEvent.pointerMove(filmstrip, { clientX: 480, pointerId: 7 });

    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onSeek.mock.calls.map(([frame]) => frame)).toEqual([25, 50, 80]);
    expect(document.body.classList.contains("is-timeline-scrubbing")).toBe(false);
  });

  it("clamps pointer positions to the available frame range", () => {
    expect(frameForClientX(20, 100, 400, 100)).toBe(0);
    expect(frameForClientX(600, 100, 400, 100)).toBe(99);
    expect(frameForClientX(300, 100, 400, 100)).toBe(50);
  });
});

describe("timeline range preview", () => {
  function renderTimeline(
    onResize: (id: string, edge: "start" | "end", frame: number) => void,
    onResizePreview: (frame: number) => void,
    onResizePreviewEnd: () => void
  ) {
    render(
      <Timeline
        units={[unit("idle", [10, 90])]}
        routes={[]}
        selectedId="idle"
        currentFrame={35}
        totalFrames={100}
        frameRate={{ numerator: 30, denominator: 1 }}
        thumbnails={[]}
        onSelect={() => undefined}
        onSelectRoute={() => undefined}
        onSeek={() => undefined}
        onResize={onResize}
        onResizePreview={onResizePreview}
        onResizePreviewEnd={onResizePreviewEnd}
      />
    );
    const track = document.querySelector(".unit-track")!;
    Object.defineProperty(track, "getBoundingClientRect", { value: () => ({ left: 100, width: 400, right: 500, top: 0, bottom: 60, height: 60, x: 100, y: 0, toJSON: () => ({}) }) });
  }

  function mockPointerCapture(handle: HTMLElement) {
    Object.defineProperties(handle, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: vi.fn() }
    });
  }

  it("previews a start boundary and commits it only when released", () => {
    const onResize = vi.fn();
    const onResizePreview = vi.fn();
    const onResizePreviewEnd = vi.fn();
    renderTimeline(onResize, onResizePreview, onResizePreviewEnd);
    const handle = screen.getByRole("button", { name: "Resize start of idle" });
    mockPointerCapture(handle);

    fireEvent.pointerDown(handle, { button: 0, clientX: 140, pointerId: 11 });
    fireEvent.pointerMove(handle, { clientX: 260, pointerId: 11 });
    expect(onResize).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, { clientX: 300, pointerId: 11 });

    expect(onResizePreview.mock.calls.map(([frame]) => frame)).toEqual([10, 40, 50]);
    expect(onResize).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledWith("idle", "start", 50);
    expect(onResizePreviewEnd).toHaveBeenCalledOnce();
  });

  it("previews the last included frame for an exclusive end boundary and restores on cancel", () => {
    const onResize = vi.fn();
    const onResizePreview = vi.fn();
    const onResizePreviewEnd = vi.fn();
    renderTimeline(onResize, onResizePreview, onResizePreviewEnd);
    const handle = screen.getByRole("button", { name: "Resize end of idle" });
    mockPointerCapture(handle);

    fireEvent.pointerDown(handle, { button: 0, clientX: 460, pointerId: 12 });
    fireEvent.pointerMove(handle, { clientX: 380, pointerId: 12 });
    fireEvent.pointerCancel(handle, { pointerId: 12 });

    expect(onResizePreview.mock.calls.map(([frame]) => frame)).toEqual([89, 69]);
    expect(onResize).not.toHaveBeenCalled();
    expect(onResizePreviewEnd).toHaveBeenCalledOnce();
  });
});
