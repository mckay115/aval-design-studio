import { describe, expect, it } from "vitest";

import {
  createStudioProject,
  encodingProfile,
  rationalFrameRate,
  resolveStudioRoute,
  timecodeForFrame,
  toAvalProject,
  validationItems,
  type MediaDescriptor
} from "./studio";

const descriptor: MediaDescriptor = {
  name: "rabbit.webm",
  path: "/video/rabbit.webm",
  container: "WebM",
  mimeType: "video/webm; codecs=vp9",
  codec: "vp9",
  codecParameter: "vp09.00.10.08",
  width: 1280,
  height: 720,
  rotation: 0,
  pixelAspect: [1, 1],
  durationSeconds: 20,
  frameRate: { numerator: 24, denominator: 1 },
  averageFrameRate: 24,
  totalFrames: 480,
  variableFrameRate: false,
  canDecode: true,
  canBeTransparent: false,
  hasHighDynamicRange: false,
  audioTrackCount: 1
};

describe("Studio project v2", () => {
  it("creates a states-first project with exact half-open units", () => {
    const project = createStudioProject(descriptor);
    expect(project.states.map((state) => state.id)).toEqual(["idle", "entering", "hover", "exiting"]);
    expect(project.units[0]?.range[0]).toBe(0);
    expect(project.units.at(-1)?.range[1]).toBe(480);
  });

  it("resolves event and completion routes through the interaction graph", () => {
    const project = createStudioProject(descriptor);
    expect(resolveStudioRoute(project, "idle", { type: "event", name: "hover.enter" })?.state.id).toBe("entering");
    expect(resolveStudioRoute(project, "entering", { type: "completion" })?.state.id).toBe("hover");
    expect(resolveStudioRoute(project, "hover", { type: "event", name: "hover.leave" })?.state.id).toBe("exiting");
    expect(resolveStudioRoute(project, "hover", { type: "event", name: "hover.enter" })).toBeNull();
  });

  it("uses the reviewed balanced codec profile", () => {
    const codecs = encodingProfile(createStudioProject(descriptor));
    expect(codecs.map((encoding) => encoding.codec)).toEqual(["av1", "vp9", "h265", "h264"]);
    expect(codecs[0]).toMatchObject({ cpuUsed: 6, rowMt: true });
    expect(codecs[3]?.renditions[0]).toMatchObject({ crf: 26 });
  });

  it("emits strict AVAL 1.0 authoring fields", () => {
    const document = toAvalProject(createStudioProject(descriptor));
    expect(document.projectVersion).toBe("1.0");
    expect(document.sources[0]?.timing.mode).toBe("exact");
    expect(document.units[0]).toMatchObject({ kind: "body", range: [0, 58] });
    expect(document).not.toHaveProperty("editor");
  });

  it("warns when the packaged compiler is unavailable", () => {
    const items = validationItems(createStudioProject(descriptor), { available: false, encoders: [] });
    expect(items.find((item) => item.id === "toolchain")?.status).toBe("warning");
  });

  it("requires only the encoders selected by the active profile", () => {
    const draft = {
      ...createStudioProject(descriptor),
      build: { ...createStudioProject(descriptor).build, profile: "draft" as const }
    };
    const items = validationItems(draft, { available: true, encoders: ["libx264"] });
    expect(items.find((item) => item.id === "toolchain")?.status).toBe("ok");
    expect(items.find((item) => item.id === "outputs")?.detail).toBe("1 codec output selected");
  });

  it("preserves common fractional rates exactly", () => {
    expect(rationalFrameRate(29.97)).toEqual({ numerator: 30_000, denominator: 1_001 });
  });

  it("formats scrub time as frames within the current second", () => {
    expect(timecodeForFrame(53, { numerator: 30_000, denominator: 1_001 })).toBe("00:00:01:23");
  });
});
