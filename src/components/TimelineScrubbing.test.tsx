// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Timeline } from "./Timeline";

afterEach(cleanup);

describe("Timeline filmstrip scrubbing", () => {
  it("captures the pointer and follows drag movement without native image dragging", () => {
    const onSeek = vi.fn();
    render(
      <Timeline
        units={[]}
        routes={[]}
        selectedId=""
        currentFrame={0}
        totalFrames={100}
        frameRate={{ numerator: 30, denominator: 1 }}
        thumbnails={["data:image/png;base64,AAAA"]}
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
      getBoundingClientRect: {
        value: () => ({ left: 0, width: 100, right: 100, top: 0, bottom: 60, height: 60, x: 0, y: 0, toJSON: () => ({}) })
      },
      setPointerCapture: { value: setPointerCapture },
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: releasePointerCapture }
    });

    fireEvent.pointerDown(filmstrip, { pointerId: 7, button: 0, clientX: 10 });
    fireEvent.pointerMove(filmstrip, { pointerId: 7, buttons: 1, clientX: 55 });
    fireEvent.pointerUp(filmstrip, { pointerId: 7, button: 0, clientX: 80 });

    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(onSeek.mock.calls.map(([frame]) => frame)).toEqual([10, 55, 80]);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(filmstrip.getAttribute("aria-valuenow")).toBe("80");
    expect(filmstrip.querySelector(".playhead")?.textContent).toContain("80f");

    const thumbnail = filmstrip.querySelector("img");
    expect(thumbnail?.draggable).toBe(false);
    expect(fireEvent.dragStart(thumbnail!)).toBe(false);
  });

  it("ignores movement from pointers that did not start the scrub", () => {
    const onSeek = vi.fn();
    render(
      <Timeline
        units={[]}
        routes={[]}
        selectedId=""
        currentFrame={0}
        totalFrames={100}
        frameRate={{ numerator: 30, denominator: 1 }}
        thumbnails={[]}
        onSelect={() => undefined}
        onSelectRoute={() => undefined}
        onSeek={onSeek}
        onResize={() => undefined}
        onResizePreview={() => undefined}
        onResizePreviewEnd={() => undefined}
      />
    );

    fireEvent.pointerMove(screen.getByRole("slider", { name: "Video playhead" }), { pointerId: 9, buttons: 1, clientX: 50 });
    expect(onSeek).not.toHaveBeenCalled();
  });
});
