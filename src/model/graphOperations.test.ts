import { describe, expect, it } from "vitest";

import {
  applyStateTemplate,
  deleteState,
  duplicateState,
  renameStateId,
  STATE_TEMPLATES,
  stateDeleteImpact,
  templateRangeSlots,
  type StateTemplateId,
  type TemplateRanges
} from "./graphOperations";
import {
  createStudioProject,
  studioGraphErrors,
  toAvalProject,
  type MediaDescriptor,
  type StudioProjectV3
} from "./studio";

const descriptor: MediaDescriptor = {
  name: "templates.mov",
  path: "/video/templates.mov",
  container: "QuickTime",
  mimeType: "video/quicktime",
  codec: "prores",
  codecParameter: null,
  width: 1000,
  height: 333,
  rotation: 0,
  pixelAspect: [1, 1],
  durationSeconds: 20,
  frameRate: { numerator: 30, denominator: 1 },
  averageFrameRate: 30,
  totalFrames: 600,
  variableFrameRate: false,
  canDecode: true,
  canBeTransparent: true,
  hasHighDynamicRange: false,
  audioTrackCount: 0
};

function rangesFor(project: StudioProjectV3, templateId: StateTemplateId, mode: "append" | "replace"): TemplateRanges {
  return Object.fromEntries(templateRangeSlots(project, templateId, mode).map((slot, index) => {
    const start = index * 20;
    const length = slot.singleFrame === true ? 1 : slot.role === "body" ? 80 : 12;
    return [slot.id, [start, start + length] as const];
  }));
}

describe("AVAL graph transactions", () => {
  it.each(STATE_TEMPLATES.map((template) => [template.id] as const))("builds a compiler-shaped, valid %s template", (templateId) => {
    const initial = createStudioProject(descriptor);
    const project = applyStateTemplate(initial, templateId, "replace", rangesFor(initial, templateId, "replace"));

    expect(studioGraphErrors(project)).toEqual([]);
    expect(toAvalProject(project)).toMatchObject({ projectVersion: "1.0" });
  });

  it("appends states without replacing the initial state and permits overlapping source ranges", () => {
    const initial = createStudioProject(descriptor);
    const project = applyStateTemplate(initial, "loop", "append", { body: [0, 600] });

    expect(project.initialState).toBe("idle");
    expect(project.states).toHaveLength(2);
    expect(project.units[0]?.range).toEqual([0, 600]);
    expect(project.units[1]?.range).toEqual([0, 600]);
    expect(studioGraphErrors(project)).toEqual([]);
  });

  it("duplicates a state without copying routes and rewrites every reference when its ID changes", () => {
    const initial = applyStateTemplate(createStudioProject(descriptor), "toggle", "replace", {
      anchor: [0, 100],
      on: [100, 200]
    });
    const duplicated = duplicateState(initial, "on");
    const copy = duplicated.states.find((state) => state.name === "On Copy")!;
    const renamed = renameStateId(duplicated, copy.id, "custom.success");

    expect(renamed.routes).toHaveLength(initial.routes.length);
    expect(renamed.states.some((state) => state.id === "custom.success")).toBe(true);
    expect(studioGraphErrors(renamed)).toEqual([]);
  });

  it("reviews and cascades dependent routes, transition units, and bindings on deletion", () => {
    const project = applyStateTemplate(createStudioProject(descriptor), "hover", "replace", {
      anchor: [0, 80],
      hover: [80, 160],
      enter: [160, 172],
      exit: [172, 184]
    });
    const impact = stateDeleteImpact(project, "hover");
    const next = deleteState(project, "hover");

    expect(impact).toMatchObject({ routeCount: 2, unitCount: 3, bindingCount: 2 });
    expect(next.states.map((state) => state.id)).toEqual(["idle"]);
    expect(next.routes).toEqual([]);
    expect(next.bindings).toEqual([]);
    expect(next.units).toHaveLength(1);
    expect(studioGraphErrors(next)).toEqual([]);
  });
});
