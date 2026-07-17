// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioProject, type MediaDescriptor } from "../model/studio";
import { AddStateDialog } from "./AddStateDialog";

const descriptor: MediaDescriptor = {
  name: "wizard.mov",
  path: "/wizard.mov",
  container: "QuickTime",
  mimeType: "video/quicktime",
  codec: "prores",
  codecParameter: null,
  width: 1080,
  height: 1920,
  rotation: 0,
  pixelAspect: [1, 1],
  durationSeconds: 10,
  frameRate: { numerator: 30, denominator: 1 },
  averageFrameRate: 30,
  totalFrames: 300,
  variableFrameRate: false,
  canDecode: true,
  canBeTransparent: true,
  hasHighDynamicRange: false,
  audioTrackCount: 0
};

afterEach(cleanup);

describe("Add State template wizard", () => {
  it("maps and reviews a hover workflow before one atomic apply", () => {
    const onApply = vi.fn();
    render(<AddStateDialog project={createStudioProject(descriptor)} onApply={onApply} onClose={() => undefined} />);

    expect(screen.getAllByText(/Workflow|State/u).length).toBeGreaterThanOrEqual(9);
    fireEvent.click(screen.getByText("Hover").closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Enter bridge")).toBeTruthy();
    expect(screen.getByText(/Overlap is allowed/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/valid AVAL 1.0 graph/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply template" }));

    const project = onApply.mock.calls[0]?.[0];
    expect(project.states).toHaveLength(2);
    expect(project.routes).toHaveLength(2);
  });
});
