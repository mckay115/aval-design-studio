import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioProjectV2 } from "../model/studio";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  open: vi.fn()
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
  invoke: mocks.invoke
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));

import { saveStudioProject } from "./desktop";

describe("saveStudioProject", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
  });

  it("uses the native atomic save command without loading the filesystem plugin module", async () => {
    mocks.invoke.mockResolvedValue("/tmp/My-Motion.avalstudio.json");
    const project = { name: "My Motion" } as StudioProjectV2;

    await expect(saveStudioProject(project)).resolves.toBe("/tmp/My-Motion.avalstudio.json");
    expect(mocks.invoke).toHaveBeenCalledWith("save_studio_project", {
      document: project,
      suggestedName: "My-Motion.avalstudio.json"
    });
  });
});
