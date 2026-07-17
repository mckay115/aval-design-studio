import {
  STUDIO_BINDING_SOURCES,
  STUDIO_PROJECT_VERSION,
  studioGraphErrors,
  type StudioProjectV3
} from "./studio";

type JsonRecord = Record<string, unknown>;

const UNIT_KINDS = ["body", "bridge", "one-shot", "reversible"] as const;
const UNIT_COLORS = ["teal", "blue", "violet", "orange", "rose", "yellow"] as const;

function invalid(path: string, expectation: string): never {
  throw new Error(`This Studio project is invalid: ${path} ${expectation}.`);
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid(path, "must be an object");
  return value as JsonRecord;
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(path, "must be an array");
  return value;
}

function string(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0)) invalid(path, "must be a nonempty string");
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return string(value, path);
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return string(value, path, true);
}

function number(value: unknown, path: string, minimum?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || (minimum !== undefined && value < minimum)) {
    invalid(path, minimum === undefined ? "must be a finite number" : `must be at least ${String(minimum)}`);
  }
  return value;
}

function integer(value: unknown, path: string, minimum = 0): number {
  const result = number(value, path, minimum);
  if (!Number.isInteger(result)) invalid(path, "must be an integer");
  return result;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(path, "must be a boolean");
  return value;
}

function oneOf<const T extends readonly string[]>(value: unknown, path: string, values: T): T[number] {
  const result = string(value, path);
  if (!values.includes(result)) invalid(path, `must be one of ${values.join(", ")}`);
  return result as T[number];
}

function rational(value: unknown, path: string): void {
  const item = record(value, path);
  integer(item.numerator, `${path}.numerator`, 1);
  integer(item.denominator, `${path}.denominator`, 1);
}

function pair(value: unknown, path: string, minimum = 0): void {
  const values = array(value, path);
  if (values.length !== 2) invalid(path, "must contain exactly two numbers");
  number(values[0], `${path}[0]`, minimum);
  number(values[1], `${path}[1]`, minimum);
}

function validateDescriptor(value: unknown, path: string): void {
  const descriptor = record(value, path);
  string(descriptor.name, `${path}.name`);
  nullableString(descriptor.path, `${path}.path`);
  string(descriptor.container, `${path}.container`, true);
  string(descriptor.mimeType, `${path}.mimeType`, true);
  string(descriptor.codec, `${path}.codec`, true);
  if (descriptor.codecParameter !== null) string(descriptor.codecParameter, `${path}.codecParameter`, true);
  integer(descriptor.width, `${path}.width`, 1);
  integer(descriptor.height, `${path}.height`, 1);
  number(descriptor.rotation, `${path}.rotation`);
  pair(descriptor.pixelAspect, `${path}.pixelAspect`, 1);
  number(descriptor.durationSeconds, `${path}.durationSeconds`, 0);
  rational(descriptor.frameRate, `${path}.frameRate`);
  number(descriptor.averageFrameRate, `${path}.averageFrameRate`, 0);
  integer(descriptor.totalFrames, `${path}.totalFrames`, 1);
  boolean(descriptor.variableFrameRate, `${path}.variableFrameRate`);
  boolean(descriptor.canDecode, `${path}.canDecode`);
  boolean(descriptor.canBeTransparent, `${path}.canBeTransparent`);
  boolean(descriptor.hasHighDynamicRange, `${path}.hasHighDynamicRange`);
  integer(descriptor.audioTrackCount, `${path}.audioTrackCount`);
}

function validatePreparation(value: unknown, path: string): void {
  const preparation = record(value, path);
  oneOf(preparation.mode, `${path}.mode`, ["pass-through", "remux", "transcode", "unsupported"]);
  oneOf(preparation.status, `${path}.status`, ["ready", "review", "preparing", "failed"]);
  string(preparation.label, `${path}.label`);
  string(preparation.detail, `${path}.detail`, true);
  oneOf(preparation.output, `${path}.output`, ["source", "mp4", "prores-422-hq", "prores-4444"]);
  array(preparation.warnings, `${path}.warnings`).forEach((warning, index) => string(warning, `${path}.warnings[${String(index)}]`, true));
}

function validateUnit(value: unknown, path: string): void {
  const unit = record(value, path);
  string(unit.id, `${path}.id`);
  string(unit.name, `${path}.name`);
  const kind = oneOf(unit.kind, `${path}.kind`, UNIT_KINDS);
  string(unit.sourceId, `${path}.sourceId`);
  pair(unit.range, `${path}.range`);
  oneOf(unit.color, `${path}.color`, UNIT_COLORS);
  if (kind === "body") {
    oneOf(unit.playback, `${path}.playback`, ["loop", "finite"]);
    array(unit.ports, `${path}.ports`).forEach((value, index) => {
      const portPath = `${path}.ports[${String(index)}]`;
      const port = record(value, portPath);
      string(port.id, `${portPath}.id`);
      if (port.entryFrame !== 0) invalid(`${portPath}.entryFrame`, "must be 0");
      array(port.portalFrames, `${portPath}.portalFrames`).forEach((frame, frameIndex) => integer(frame, `${portPath}.portalFrames[${String(frameIndex)}]`));
    });
  }
  if (kind === "reversible") {
    const residency = record(unit.residency, `${path}.residency`);
    const endpoints = array(residency.endpoints, `${path}.residency.endpoints`);
    if (endpoints.length !== 2) invalid(`${path}.residency.endpoints`, "must contain exactly two endpoints");
    endpoints.forEach((value, index) => {
      const endpointPath = `${path}.residency.endpoints[${String(index)}]`;
      const endpoint = record(value, endpointPath);
      string(endpoint.state, `${endpointPath}.state`);
      string(endpoint.port, `${endpointPath}.port`);
      integer(endpoint.frames, `${endpointPath}.frames`, 1);
    });
  }
}

function validateRoute(value: unknown, path: string): void {
  const route = record(value, path);
  string(route.id, `${path}.id`);
  string(route.name, `${path}.name`);
  string(route.from, `${path}.from`);
  string(route.to, `${path}.to`);
  if (route.trigger !== undefined) {
    const trigger = record(route.trigger, `${path}.trigger`);
    const triggerType = oneOf(trigger.type, `${path}.trigger.type`, ["event", "completion"]);
    if (triggerType === "event") string(trigger.name, `${path}.trigger.name`);
  }
  const start = record(route.start, `${path}.start`);
  const startType = oneOf(start.type, `${path}.start.type`, ["portal", "finish", "cut"]);
  if (startType === "portal") string(start.sourcePort, `${path}.start.sourcePort`);
  string(start.targetPort, `${path}.start.targetPort`);
  integer(start.maxWaitFrames, `${path}.start.maxWaitFrames`, startType === "cut" ? 1 : 0);
  if (startType === "cut" && start.maxWaitFrames !== 1) invalid(`${path}.start.maxWaitFrames`, "must be 1 for a cut");
  if (route.transition !== undefined) {
    const transition = record(route.transition, `${path}.transition`);
    const transitionKind = oneOf(transition.kind, `${path}.transition.kind`, ["locked", "reversible"]);
    string(transition.unitId, `${path}.transition.unitId`);
    if (transitionKind === "reversible") {
      oneOf(transition.direction, `${path}.transition.direction`, ["forward", "reverse"]);
      optionalString(transition.reverseOf, `${path}.transition.reverseOf`);
    }
  }
  oneOf(route.continuity, `${path}.continuity`, ["exact-authored", "exact-reverse", "cut"]);
  if (route.targetRunwayFrames !== undefined) integer(route.targetRunwayFrames, `${path}.targetRunwayFrames`);
}

/** Parse and validate an untrusted Studio JSON document before it reaches React. */
export function parseStudioProjectDocument(value: unknown): StudioProjectV3 {
  const project = record(value, "Project");
  if (project.studioVersion !== STUDIO_PROJECT_VERSION) {
    invalid("Project.studioVersion", `must be ${String(STUDIO_PROJECT_VERSION)}; older projects need an explicit migration`);
  }
  string(project.name, "Project.name");

  const sources = array(project.sources, "Project.sources");
  if (sources.length === 0) invalid("Project.sources", "must contain a source");
  sources.forEach((value, index) => {
    const path = `Project.sources[${String(index)}]`;
    const source = record(value, path);
    string(source.id, `${path}.id`);
    validateDescriptor(source.descriptor, `${path}.descriptor`);
    validatePreparation(source.preparation, `${path}.preparation`);
  });

  const canvas = record(project.canvas, "Project.canvas");
  integer(canvas.width, "Project.canvas.width", 1);
  integer(canvas.height, "Project.canvas.height", 1);
  oneOf(canvas.fit, "Project.canvas.fit", ["contain", "cover", "fill", "none"]);
  pair(canvas.pixelAspect, "Project.canvas.pixelAspect", 1);
  rational(project.frameRate, "Project.frameRate");

  array(project.units, "Project.units").forEach((unit, index) => validateUnit(unit, `Project.units[${String(index)}]`));
  const states = array(project.states, "Project.states");
  if (states.length === 0) invalid("Project.states", "must contain a state");
  states.forEach((value, index) => {
    const path = `Project.states[${String(index)}]`;
    const state = record(value, path);
    string(state.id, `${path}.id`);
    string(state.name, `${path}.name`);
    string(state.bodyUnitId, `${path}.bodyUnitId`);
    optionalString(state.initialUnitId, `${path}.initialUnitId`);
    oneOf(state.color, `${path}.color`, UNIT_COLORS);
  });
  array(project.routes, "Project.routes").forEach((route, index) => validateRoute(route, `Project.routes[${String(index)}]`));
  array(project.bindings, "Project.bindings").forEach((value, index) => {
    const path = `Project.bindings[${String(index)}]`;
    const binding = record(value, path);
    oneOf(binding.source, `${path}.source`, STUDIO_BINDING_SOURCES);
    string(binding.event, `${path}.event`);
  });
  string(project.initialState, "Project.initialState");

  const build = record(project.build, "Project.build");
  oneOf(build.profile, "Project.build.profile", ["balanced", "draft", "custom"]);
  oneOf(build.alpha, "Project.build.alpha", ["auto", "opaque", "packed"]);
  oneOf(build.opaqueTreatment, "Project.build.opaqueTreatment", ["require", "matte"]);
  string(build.matte, "Project.build.matte");
  nullableString(build.destination, "Project.build.destination");
  const codecs = record(build.codecs, "Project.build.codecs");
  ["av1", "vp9", "h265", "h264"].forEach((codec) => boolean(codecs[codec], `Project.build.codecs.${codec}`));

  const editor = record(project.editor, "Project.editor");
  const selection = record(editor.selection, "Project.editor.selection");
  oneOf(selection.kind, "Project.editor.selection.kind", ["state", "unit", "route"]);
  string(selection.id, "Project.editor.selection.id");
  oneOf(editor.previewMode, "Project.editor.previewMode", ["source", "unit", "interactive"]);

  const typedProject = project as unknown as StudioProjectV3;
  let graphErrors: readonly string[];
  try {
    graphErrors = studioGraphErrors(typedProject);
  } catch {
    invalid("Project graph", "could not be validated");
  }
  if (graphErrors.length > 0) invalid("Project graph", graphErrors[0] ?? "is invalid");

  const selectionExists = typedProject.editor.selection.kind === "state"
    ? typedProject.states.some((state) => state.id === typedProject.editor.selection.id)
    : typedProject.editor.selection.kind === "unit"
      ? typedProject.units.some((unit) => unit.id === typedProject.editor.selection.id)
      : typedProject.routes.some((route) => route.id === typedProject.editor.selection.id);
  if (!selectionExists) invalid("Project.editor.selection", "must reference an existing item");
  return typedProject;
}
