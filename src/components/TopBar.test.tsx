// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TopBar } from "./TopBar";

afterEach(cleanup);

function renderTopBar(onRename = vi.fn()) {
  render(
    <TopBar
      projectName="Original project"
      sourceReady
      saved
      canUndo={false}
      canRedo={false}
      onImport={() => undefined}
      onRename={onRename}
      onSave={() => undefined}
      onBuild={() => undefined}
      onUndo={() => undefined}
      onRedo={() => undefined}
    />
  );
  return onRename;
}

describe("TopBar project name control", () => {
  it("opens from the filename chevron and commits a renamed project with Enter", () => {
    const onRename = renderTopBar();
    fireEvent.click(screen.getByRole("button", { name: "Original project" }));

    const input = screen.getByLabelText("Project name") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "Launch animation" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRename).toHaveBeenCalledWith("Launch animation");
    expect(screen.queryByLabelText("Project name")).toBeNull();
  });

  it("cancels without changing the project when Escape is pressed", () => {
    const onRename = renderTopBar();
    fireEvent.click(screen.getByRole("button", { name: "Original project" }));
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "Discard this" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Project name")).toBeNull();
  });

  it("commits on click-away and prevents an empty project name", () => {
    const onRename = renderTopBar();
    fireEvent.click(screen.getByRole("button", { name: "Original project" }));
    const input = screen.getByLabelText("Project name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Renamed on blur  " } });
    fireEvent.blur(input, { relatedTarget: document.body });
    expect(onRename).toHaveBeenCalledWith("Renamed on blur");

    fireEvent.click(screen.getByRole("button", { name: "Original project" }));
    const emptyInput = screen.getByLabelText("Project name");
    fireEvent.change(emptyInput, { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "Rename" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
