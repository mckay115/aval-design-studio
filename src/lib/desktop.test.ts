import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioProjectV3 } from "../model/studio";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  open: vi.fn()
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
  invoke: mocks.invoke
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));

import {
  ACCEPTED_VIDEO_EXTENSIONS,
  isAcceptedVideoFileName,
  isStudioProjectFileName,
  openStudioProject,
  pickVideo,
  saveStudioProject
} from "./desktop";

describe("saveStudioProject", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
  });

  it("uses the native atomic save command without loading the filesystem plugin module", async () => {
    mocks.invoke.mockResolvedValue("/tmp/My-Motion.avalstudio");
    const project = { name: "My Motion" } as StudioProjectV3;

    await expect(saveStudioProject(project)).resolves.toBe("/tmp/My-Motion.avalstudio");
    expect(mocks.invoke).toHaveBeenCalledWith("save_studio_project", {
      document: project,
      suggestedName: "My-Motion.avalstudio"
    });
  });
});

describe("pickVideo", () => {
  beforeEach(() => {
    mocks.open.mockReset();
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
  });

  it("limits the native picker to supported video containers", async () => {
    mocks.open.mockResolvedValue("/tmp/source.MOV");

    await expect(pickVideo()).resolves.toMatchObject({ name: "source.MOV", path: "/tmp/source.MOV" });
    expect(mocks.open).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      title: "Open video",
      filters: [{ name: "Supported video", extensions: [...ACCEPTED_VIDEO_EXTENSIONS] }]
    });
  });

  it("rejects unsupported files even if a platform picker returns one", async () => {
    mocks.open.mockResolvedValue("/tmp/readme.txt");

    await expect(pickVideo()).rejects.toThrow("readme.txt is not a supported video file");
  });

  it("recognizes supported extensions case-insensitively", () => {
    expect(isAcceptedVideoFileName("render.WEBM")).toBe(true);
    expect(isAcceptedVideoFileName("render.avi")).toBe(false);
    expect(isAcceptedVideoFileName("render")).toBe(false);
  });
});

describe("openStudioProject", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
  });

  it("uses the native reader so source paths can be resolved safely", async () => {
    const result = {
      document: { studioVersion: 3 },
      path: "/tmp/Motion.avalstudio",
      sourcePaths: ["/tmp/source.mov"],
      missingSourcePaths: []
    };
    mocks.invoke.mockResolvedValue(result);

    await expect(openStudioProject()).resolves.toEqual(result);
    expect(mocks.invoke).toHaveBeenCalledWith("open_studio_project");
  });

  it("recognizes current and legacy Studio filename suffixes only", () => {
    expect(isStudioProjectFileName("Motion.avalstudio")).toBe(true);
    expect(isStudioProjectFileName("Motion.avalstudio.json")).toBe(true);
    expect(isStudioProjectFileName("Motion.json")).toBe(false);
  });
});
