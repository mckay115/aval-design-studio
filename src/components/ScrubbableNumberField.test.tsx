// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScrubbableNumberField } from "./ScrubbableNumberField";

afterEach(() => {
  cleanup();
  document.body.classList.remove("is-number-scrubbing");
});

describe("ScrubbableNumberField", () => {
  it("adjusts its value by dragging the label horizontally", () => {
    const onChange = vi.fn();
    render(<ScrubbableNumberField label="Start frame" min={0} max={200} value={100} onChange={onChange} />);
    const label = screen.getByText("Start frame");

    fireEvent.pointerDown(label, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 120, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 120, pointerId: 1 });

    expect(onChange).toHaveBeenLastCalledWith(110);
    expect(document.body.classList.contains("is-number-scrubbing")).toBe(false);
  });

  it("clamps drag changes to the field range", () => {
    const onChange = vi.fn();
    render(<ScrubbableNumberField label="End frame" min={40} max={120} value={100} onChange={onChange} />);
    const label = screen.getByText("End frame");

    fireEvent.pointerDown(label, { button: 0, clientX: 100, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 300, pointerId: 2 });
    fireEvent.pointerUp(window, { clientX: 300, pointerId: 2 });

    expect(onChange).toHaveBeenLastCalledWith(120);
  });

  it("keeps direct number entry available", () => {
    const onChange = vi.fn();
    render(<ScrubbableNumberField label="Start frame" min={0} max={200} value={100} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Start frame"), { target: { value: "126" } });

    expect(onChange).toHaveBeenLastCalledWith(126);
  });

  it("focuses the input when the label is clicked without dragging", () => {
    render(<ScrubbableNumberField label="Start frame" min={0} max={200} value={100} onChange={() => undefined} />);
    const label = screen.getByText("Start frame");

    fireEvent.pointerDown(label, { button: 0, clientX: 100, pointerId: 3 });
    fireEvent.pointerUp(window, { clientX: 100, pointerId: 3 });

    expect(document.activeElement).toBe(screen.getByLabelText("Start frame"));
  });
});
