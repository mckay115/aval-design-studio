import {
  GRAPH_IDENTIFIER_PATTERN,
  validateMotionGraphDefinition,
  type MotionGraphDefinition
} from "@pixel-point/aval-graph";

export const STUDIO_PROJECT_VERSION = 3 as const;
export const AVAL_PROJECT_VERSION = "1.0" as const;

export type PreviewMode = "source" | "unit" | "interactive";
export type AlphaMode = "auto" | "opaque" | "packed";
export type AlphaPreview = "composite" | "rgb" | "alpha" | "packed";
export type BuildProfileId = "balanced" | "draft" | "custom";
export type UnitKind = "body" | "bridge" | "one-shot" | "reversible";
export type BodyPlayback = "loop" | "finite";
export type UnitColor = "teal" | "blue" | "violet" | "orange" | "rose" | "yellow";
export type StudioBindingSource =
  | "activate"
  | "engagement.off"
  | "engagement.on"
  | "focus.in"
  | "focus.out"
  | "hidden"
  | "pointer.enter"
  | "pointer.leave"
  | "visible";

export const STUDIO_BINDING_SOURCES: readonly StudioBindingSource[] = [
  "activate",
  "engagement.off",
  "engagement.on",
  "focus.in",
  "focus.out",
  "hidden",
  "pointer.enter",
  "pointer.leave",
  "visible"
];

export interface Rational {
  readonly numerator: number;
  readonly denominator: number;
}

export interface MediaDescriptor {
  readonly name: string;
  readonly path: string | null;
  readonly container: string;
  readonly mimeType: string;
  readonly codec: string;
  readonly codecParameter: string | null;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly pixelAspect: readonly [number, number];
  readonly durationSeconds: number;
  readonly frameRate: Rational;
  readonly averageFrameRate: number;
  readonly totalFrames: number;
  readonly variableFrameRate: boolean;
  readonly canDecode: boolean;
  readonly canBeTransparent: boolean;
  readonly hasHighDynamicRange: boolean;
  readonly audioTrackCount: number;
}

export type PreparationMode = "pass-through" | "remux" | "transcode" | "unsupported";

export interface PreparationPlan {
  readonly mode: PreparationMode;
  readonly status: "ready" | "review" | "preparing" | "failed";
  readonly label: string;
  readonly detail: string;
  readonly output: "source" | "mp4" | "prores-422-hq" | "prores-4444";
  readonly warnings: readonly string[];
}

export interface StudioSource {
  readonly id: string;
  readonly descriptor: MediaDescriptor;
  readonly preparation: PreparationPlan;
}

export interface StudioUnitBase {
  readonly id: string;
  readonly name: string;
  readonly kind: UnitKind;
  readonly sourceId: string;
  readonly range: readonly [startInclusive: number, endExclusive: number];
  readonly color: UnitColor;
}

export interface StudioPort {
  readonly id: string;
  readonly entryFrame: 0;
  readonly portalFrames: readonly number[];
}

export interface StudioBodyUnit extends StudioUnitBase {
  readonly kind: "body";
  readonly playback: BodyPlayback;
  readonly ports: readonly StudioPort[];
}

export interface StudioBridgeUnit extends StudioUnitBase {
  readonly kind: "bridge";
}

export interface StudioOneShotUnit extends StudioUnitBase {
  readonly kind: "one-shot";
}

export interface StudioReversibleUnit extends StudioUnitBase {
  readonly kind: "reversible";
  readonly residency: {
    readonly endpoints: readonly [
      { readonly state: string; readonly port: string; readonly frames: number },
      { readonly state: string; readonly port: string; readonly frames: number }
    ];
  };
}

export type StudioUnit = StudioBodyUnit | StudioBridgeUnit | StudioOneShotUnit | StudioReversibleUnit;

export interface StudioState {
  readonly id: string;
  readonly name: string;
  readonly bodyUnitId: string;
  readonly initialUnitId?: string;
  readonly color: UnitColor;
}

export type StudioTrigger =
  | { readonly type: "event"; readonly name: string }
  | { readonly type: "completion" };

export type StudioStart =
  | {
      readonly type: "portal";
      readonly sourcePort: string;
      readonly targetPort: string;
      readonly maxWaitFrames: number;
    }
  | {
      readonly type: "finish";
      readonly targetPort: string;
      readonly maxWaitFrames: number;
    }
  | {
      readonly type: "cut";
      readonly targetPort: string;
      readonly maxWaitFrames: 1;
    };

export type StudioTransition =
  | { readonly kind: "locked"; readonly unitId: string }
  | {
      readonly kind: "reversible";
      readonly unitId: string;
      readonly direction: "forward" | "reverse";
      readonly reverseOf?: string;
    };

export interface StudioRoute {
  readonly id: string;
  readonly name: string;
  readonly from: string;
  readonly to: string;
  readonly trigger?: StudioTrigger;
  readonly start: StudioStart;
  readonly transition?: StudioTransition;
  readonly continuity: "exact-authored" | "exact-reverse" | "cut";
  readonly targetRunwayFrames?: number;
}

export interface ResolvedStudioRoute {
  readonly route: StudioRoute;
  readonly state: StudioState;
  readonly unit: StudioBodyUnit;
}

export interface StudioBinding {
  readonly source: StudioBindingSource;
  readonly event: string;
}

export interface CodecSelection {
  readonly av1: boolean;
  readonly vp9: boolean;
  readonly h265: boolean;
  readonly h264: boolean;
}

export interface StudioBuildSettings {
  readonly profile: BuildProfileId;
  readonly alpha: AlphaMode;
  readonly opaqueTreatment: "require" | "matte";
  readonly matte: string;
  readonly destination: string | null;
  readonly codecs: CodecSelection;
}

export type StudioSelection =
  | { readonly kind: "state"; readonly id: string }
  | { readonly kind: "unit"; readonly id: string }
  | { readonly kind: "route"; readonly id: string };

export interface StudioProjectV3 {
  readonly studioVersion: typeof STUDIO_PROJECT_VERSION;
  readonly name: string;
  readonly sources: readonly StudioSource[];
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly fit: "contain" | "cover" | "fill" | "none";
    readonly pixelAspect: readonly [number, number];
  };
  readonly frameRate: Rational;
  readonly units: readonly StudioUnit[];
  readonly states: readonly StudioState[];
  readonly routes: readonly StudioRoute[];
  readonly bindings: readonly StudioBinding[];
  readonly initialState: string;
  readonly build: StudioBuildSettings;
  readonly editor: {
    readonly selection: StudioSelection;
    readonly previewMode: PreviewMode;
  };
}

/** @deprecated Kept as a source-compatible alias while native save APIs move to v3. */
export type StudioProjectV2 = StudioProjectV3;

export interface ValidationItem {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly status: "ok" | "warning" | "error";
}

export interface ToolchainCapabilities {
  readonly available: boolean;
  readonly encoders: readonly string[];
}

const COLORS: readonly UnitColor[] = ["teal", "blue", "violet", "orange", "rose", "yellow"];

export function studioColor(index: number): UnitColor {
  return COLORS[Math.abs(index) % COLORS.length] ?? "blue";
}

export function fps(rate: Rational): number {
  return rate.denominator <= 0 ? 0 : rate.numerator / rate.denominator;
}

export function secondsForFrame(frame: number, rate: Rational): number {
  const value = fps(rate);
  return value <= 0 ? 0 : Math.max(0, frame) / value;
}

export function frameForSeconds(seconds: number, rate: Rational): number {
  return Math.max(0, Math.round(seconds * fps(rate)));
}

export function timecodeForFrame(frame: number, rate: Rational): string {
  const roundedRate = Math.max(1, Math.round(fps(rate)));
  const safeFrame = Math.max(0, Math.round(frame));
  const totalSeconds = Math.floor(safeFrame / roundedRate);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor(totalSeconds % 3_600 / 60);
  const seconds = totalSeconds % 60;
  const frameInSecond = safeFrame % roundedRate;
  return [hours, minutes, seconds, frameInSecond]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function rationalFrameRate(value: number): Rational {
  const standards: readonly [number, Rational][] = [
    [23.976, { numerator: 24_000, denominator: 1_001 }],
    [24, { numerator: 24, denominator: 1 }],
    [25, { numerator: 25, denominator: 1 }],
    [29.97, { numerator: 30_000, denominator: 1_001 }],
    [30, { numerator: 30, denominator: 1 }],
    [50, { numerator: 50, denominator: 1 }],
    [59.94, { numerator: 60_000, denominator: 1_001 }],
    [60, { numerator: 60, denominator: 1 }]
  ];
  if (!Number.isFinite(value) || value <= 0) return { numerator: 30, denominator: 1 };
  const match = standards.find(([candidate]) => Math.abs(candidate - value) < 0.025);
  if (match !== undefined) return match[1];
  return { numerator: Math.max(1, Math.round(value * 1_000)), denominator: 1_000 };
}

export function identifierFor(value: string, fallback: string): string {
  const candidate = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^[^a-z]+/u, "")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
  return candidate.length > 0 ? candidate : fallback;
}

export function uniqueIdentifier(existing: Iterable<string>, preferred: string, fallback = "item"): string {
  const used = new Set(existing);
  const base = identifierFor(preferred, fallback);
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base.slice(0, Math.max(1, 63 - String(suffix).length))}-${String(suffix)}`)) suffix += 1;
  return `${base.slice(0, Math.max(1, 63 - String(suffix).length))}-${String(suffix)}`;
}

export function unitFrameCount(unit: Pick<StudioUnit, "range">): number {
  return unit.range[1] - unit.range[0];
}

export function bodyUnitForState(project: StudioProjectV3, stateId: string): StudioBodyUnit | null {
  const state = project.states.find((candidate) => candidate.id === stateId);
  const unit = project.units.find((candidate) => candidate.id === state?.bodyUnitId);
  return unit?.kind === "body" ? unit : null;
}

export function selectedState(project: StudioProjectV3): StudioState | null {
  const id = project.editor.selection.kind === "state"
    ? project.editor.selection.id
    : project.editor.selection.kind === "unit"
      ? project.states.find((state) => state.bodyUnitId === project.editor.selection.id)?.id
      : project.routes.find((route) => route.id === project.editor.selection.id)?.from;
  return project.states.find((state) => state.id === id) ?? null;
}

export function selectedUnit(project: StudioProjectV3): StudioUnit | null {
  if (project.editor.selection.kind === "unit") {
    return project.units.find((unit) => unit.id === project.editor.selection.id) ?? null;
  }
  if (project.editor.selection.kind === "state") return bodyUnitForState(project, project.editor.selection.id);
  const route = project.routes.find((candidate) => candidate.id === project.editor.selection.id);
  const transitionId = route?.transition?.unitId;
  return transitionId === undefined ? bodyUnitForState(project, route?.from ?? "")
    : project.units.find((unit) => unit.id === transitionId) ?? null;
}

export function defaultPorts(frameCount: number, playback: BodyPlayback): readonly StudioPort[] {
  const finalFrame = Math.max(0, frameCount - 1);
  return [{ id: "default", entryFrame: 0, portalFrames: [playback === "finite" ? finalFrame : 0] }];
}

export function createStudioProject(descriptor: MediaDescriptor): StudioProjectV3 {
  const sourceId = identifierFor(descriptor.name.replace(/\.[^.]+$/u, ""), "source");
  const projectName = descriptor.name.replace(/\.[^.]+$/u, "") || "Untitled motion";
  const body: StudioBodyUnit = {
    id: "idle.body",
    name: "Idle Loop",
    kind: "body",
    sourceId,
    range: [0, Math.max(1, descriptor.totalFrames)],
    playback: "loop",
    ports: defaultPorts(Math.max(1, descriptor.totalFrames), "loop"),
    color: "teal"
  };
  return {
    studioVersion: STUDIO_PROJECT_VERSION,
    name: projectName,
    sources: [{ id: sourceId, descriptor, preparation: preparationPlanFor(descriptor) }],
    canvas: {
      width: descriptor.width,
      height: descriptor.height,
      fit: "contain",
      pixelAspect: descriptor.pixelAspect
    },
    frameRate: descriptor.frameRate,
    units: [body],
    states: [{ id: "idle", name: "Idle", bodyUnitId: body.id, color: "teal" }],
    routes: [],
    bindings: [],
    initialState: "idle",
    build: {
      profile: "balanced",
      alpha: "auto",
      opaqueTreatment: "require",
      matte: "#000000",
      destination: null,
      codecs: { av1: true, vp9: true, h265: true, h264: true }
    },
    editor: { selection: { kind: "state", id: "idle" }, previewMode: "unit" }
  };
}

export function preparationPlanFor(media: MediaDescriptor): PreparationPlan {
  const extension = media.name.split(".").at(-1)?.toLowerCase() ?? "";
  const compilerContainer = ["mov", "mp4", "m4v"].includes(extension);
  const warnings: string[] = [];
  if (media.audioTrackCount > 0) warnings.push("Audio will be removed from the AVAL source.");
  if (media.hasHighDynamicRange) warnings.push("HDR will be tone-mapped to sRGB for AVAL 1.0.");
  if (!media.canDecode) {
    return {
      mode: "transcode",
      status: "review",
      label: "Desktop normalization required",
      detail: "The browser cannot decode this track. The packaged FFmpeg toolchain will create an edit-friendly MOV proxy.",
      output: media.canBeTransparent ? "prores-4444" : "prores-422-hq",
      warnings
    };
  }
  if (compilerContainer && !media.hasHighDynamicRange && media.rotation === 0 && media.pixelAspect[0] === media.pixelAspect[1]) {
    return {
      mode: "pass-through",
      status: "ready",
      label: "Compiler-ready source",
      detail: "No conversion is required. The original file remains untouched.",
      output: "source",
      warnings
    };
  }
  if (!compilerContainer && !media.hasHighDynamicRange && media.rotation === 0 && media.pixelAspect[0] === media.pixelAspect[1]) {
    return {
      mode: "remux",
      status: "review",
      label: "Lossless container optimization",
      detail: "MediaBunny can copy compatible packets into a compiler-ready MP4 without re-encoding.",
      output: "mp4",
      warnings
    };
  }
  return {
    mode: "transcode",
    status: "review",
    label: "Source normalization",
    detail: "Rotation, pixels, color, timing, or alpha need a canonical edit-friendly MOV.",
    output: media.canBeTransparent ? "prores-4444" : "prores-422-hq",
    warnings
  };
}

function normalizeBodyPorts(
  ports: readonly StudioPort[],
  frameCount: number,
  playback: BodyPlayback
): readonly StudioPort[] {
  const safeCount = Math.max(1, frameCount);
  const normalized = (ports.length === 0 ? defaultPorts(safeCount, playback) : ports).map((port) => {
    const frames = [...new Set(port.portalFrames.map((frame) =>
      Math.min(safeCount - 1, Math.max(0, Math.round(frame)))
    ))].sort((left, right) => left - right);
    if (playback === "finite" && frames.at(-1) !== safeCount - 1) frames.push(safeCount - 1);
    return { ...port, entryFrame: 0 as const, portalFrames: frames.length === 0 ? [0] : frames };
  });
  return normalized;
}

function repairRouteWaits(project: StudioProjectV3): StudioProjectV3 {
  return {
    ...project,
    routes: project.routes.map((route) => {
      if (route.start.type === "cut") return route;
      const body = bodyUnitForState(project, route.from);
      const minimum = Math.max(0, (body === null ? 1 : unitFrameCount(body)) - 1);
      return { ...route, start: { ...route.start, maxWaitFrames: Math.max(route.start.maxWaitFrames, minimum) } };
    })
  };
}

export function updateUnit(
  project: StudioProjectV3,
  unitId: string,
  update: Partial<Pick<StudioUnitBase, "name" | "range">> & { readonly playback?: BodyPlayback }
): StudioProjectV3 {
  const totalFrames = project.sources[0]?.descriptor.totalFrames ?? 1;
  const next = {
    ...project,
    units: project.units.map((unit): StudioUnit => {
      if (unit.id !== unitId) return unit;
      const nextRange = update.range ?? unit.range;
      const start = Math.min(totalFrames - 1, Math.max(0, Math.round(nextRange[0])));
      const end = Math.min(totalFrames, Math.max(start + 1, Math.round(nextRange[1])));
      const base = { ...unit, name: update.name?.trimStart() ?? unit.name, range: [start, end] as const };
      if (unit.kind !== "body") return base;
      const playback = update.playback ?? unit.playback;
      return {
        ...base,
        kind: "body",
        playback,
        ports: normalizeBodyPorts(unit.ports, end - start, playback)
      };
    })
  };
  return repairRouteWaits(next);
}

export function resolveStudioRoute(
  project: StudioProjectV3,
  fromStateId: string,
  trigger: StudioTrigger
): ResolvedStudioRoute | null {
  const route = project.routes.find((candidate) => {
    if (candidate.from !== fromStateId || candidate.trigger?.type !== trigger.type) return false;
    return trigger.type === "completion"
      || (candidate.trigger?.type === "event" && candidate.trigger.name === trigger.name);
  });
  if (route === undefined) return null;
  const state = project.states.find((candidate) => candidate.id === route.to);
  const unit = project.units.find((candidate) => candidate.id === state?.bodyUnitId);
  return state === undefined || unit?.kind !== "body" ? null : { route, state, unit };
}

export function motionGraphDefinition(project: StudioProjectV3): MotionGraphDefinition {
  const units = new Map(project.units.map((unit) => [unit.id, unit]));
  return {
    initialState: project.initialState,
    states: project.states.map((state) => {
      const body = units.get(state.bodyUnitId);
      if (body?.kind !== "body") throw new Error(`State ${state.id} does not reference a body unit.`);
      const initial = state.initialUnitId === undefined ? undefined : units.get(state.initialUnitId);
      return {
        id: state.id,
        body: {
          unitId: body.id,
          kind: body.playback,
          frameCount: unitFrameCount(body),
          ports: body.ports
        },
        ...(initial?.kind === "one-shot"
          ? { initialUnit: { unitId: initial.id, frameCount: unitFrameCount(initial) } }
          : {})
      };
    }),
    edges: project.routes.map((route) => {
      const transitionUnit = route.transition === undefined ? undefined : units.get(route.transition.unitId);
      const transition = route.transition === undefined || transitionUnit === undefined
        ? undefined
        : route.transition.kind === "locked"
          ? { kind: "locked" as const, unitId: transitionUnit.id, frameCount: unitFrameCount(transitionUnit) }
          : {
              kind: "reversible" as const,
              unitId: transitionUnit.id,
              frameCount: unitFrameCount(transitionUnit),
              direction: route.transition.direction,
              ...(route.transition.reverseOf === undefined ? {} : { reverseOf: route.transition.reverseOf })
            };
      return {
        id: route.id,
        from: route.from,
        to: route.to,
        ...(route.trigger === undefined ? {} : { trigger: route.trigger }),
        start: route.start,
        ...(transition === undefined ? {} : { transition }),
        continuity: route.continuity
      };
    })
  };
}

function identifierErrors(project: StudioProjectV3): string[] {
  const errors: string[] = [];
  const check = (value: string, label: string): void => {
    if (!GRAPH_IDENTIFIER_PATTERN.test(value)) errors.push(`${label} must be a lowercase AVAL identifier.`);
  };
  project.sources.forEach((source) => check(source.id, `Source ${source.id}`));
  project.units.forEach((unit) => {
    check(unit.id, `Unit ${unit.id}`);
    if (unit.kind === "body") unit.ports.forEach((port) => check(port.id, `Port ${port.id}`));
  });
  project.states.forEach((state) => check(state.id, `State ${state.name}`));
  project.routes.forEach((route) => {
    check(route.id, `Route ${route.name}`);
    if (route.trigger?.type === "event") check(route.trigger.name, `Event ${route.trigger.name}`);
  });
  project.bindings.forEach((binding) => check(binding.event, `Binding event ${binding.event}`));
  return errors;
}

export function studioGraphErrors(project: StudioProjectV3): readonly string[] {
  const errors = identifierErrors(project);
  const source = project.sources[0];
  const unitById = new Map(project.units.map((unit) => [unit.id, unit]));
  const stateById = new Map(project.states.map((state) => [state.id, state]));
  const unitUse = new Map(project.units.map((unit) => [unit.id, 0]));
  const useUnit = (id: string): void => {
    unitUse.set(id, (unitUse.get(id) ?? 0) + 1);
  };

  if (!stateById.has(project.initialState)) errors.push("The initial state does not exist.");
  for (const unit of project.units) {
    if (unit.range[0] < 0 || unit.range[1] <= unit.range[0] || unit.range[1] > (source?.descriptor.totalFrames ?? 0)) {
      errors.push(`Unit ${unit.name} has an invalid source range.`);
    }
  }
  for (const state of project.states) {
    const body = unitById.get(state.bodyUnitId);
    if (body?.kind !== "body") errors.push(`State ${state.name} must reference one body unit.`);
    else useUnit(body.id);
    if (state.initialUnitId !== undefined) {
      const initial = unitById.get(state.initialUnitId);
      if (state.id !== project.initialState) errors.push(`Only the initial state can own an intro unit.`);
      if (initial?.kind !== "one-shot") errors.push(`State ${state.name} intro must reference a one-shot unit.`);
      else useUnit(initial.id);
    }
  }
  for (const route of project.routes) {
    if (!stateById.has(route.from) || !stateById.has(route.to)) errors.push(`Route ${route.name} has a missing endpoint.`);
    if (route.start.type === "cut") {
      if (route.continuity !== "cut" || route.transition !== undefined) errors.push(`Cut route ${route.name} cannot own a transition.`);
      if ((route.targetRunwayFrames ?? 0) < 6 || (route.targetRunwayFrames ?? 0) > 12) errors.push(`Cut route ${route.name} needs 6–12 runway frames.`);
    } else if (route.continuity === "cut") {
      errors.push(`Route ${route.name} can use cut continuity only with an instant cut.`);
    }
    if (route.transition !== undefined) {
      const transition = unitById.get(route.transition.unitId);
      const expected = route.transition.kind === "locked" ? "bridge" : "reversible";
      if (transition?.kind !== expected) errors.push(`Route ${route.name} must reference a ${expected} unit.`);
      else useUnit(transition.id);
    }
  }
  for (const [unitId, uses] of unitUse) {
    const unit = unitById.get(unitId);
    const expected = unit?.kind === "reversible" ? 2 : 1;
    if (uses !== expected) errors.push(`Unit ${unit?.name ?? unitId} is referenced ${String(uses)} time${uses === 1 ? "" : "s"}; expected ${String(expected)}.`);
  }
  const usedEvents = new Set(project.routes.flatMap((route) => route.trigger?.type === "event" ? [route.trigger.name] : []));
  const bindingSources = new Set<StudioBindingSource>();
  for (const binding of project.bindings) {
    if (bindingSources.has(binding.source)) errors.push(`Binding source ${binding.source} is duplicated.`);
    bindingSources.add(binding.source);
    if (!usedEvents.has(binding.event)) errors.push(`Binding ${binding.source} points to an unused event.`);
  }
  try {
    validateMotionGraphDefinition(motionGraphDefinition(project));
  } catch (reason) {
    errors.push(reason instanceof Error ? reason.message : "The AVAL graph is invalid.");
  }
  return [...new Set(errors)];
}

function requestedEncoderNames(project: StudioProjectV3): readonly string[] {
  const codecs = encodingProfile(project).map((encoding) => encoding.codec);
  const executableByCodec: Readonly<Record<string, string>> = {
    av1: "libaom-av1",
    vp9: "libvpx-vp9",
    h265: "libx265",
    h264: "libx264"
  };
  return codecs.map((codec) => executableByCodec[codec]!);
}

export function validationItems(
  project: StudioProjectV3,
  toolchain: ToolchainCapabilities
): readonly ValidationItem[] {
  const source = project.sources[0];
  const sourceReady = source !== undefined && source.preparation.mode !== "unsupported";
  const graphErrors = studioGraphErrors(project);
  const timingErrors = graphErrors.filter((error) => error.includes("range"));
  const requestedEncoders = requestedEncoderNames(project);
  const missingEncoders = requestedEncoders.filter((encoder) => !toolchain.encoders.includes(encoder));
  const outputsReady = requestedEncoders.length > 0;
  const toolchainStatus = !toolchain.available ? "warning" : missingEncoders.length > 0 ? "error" : "ok";
  return [
    { id: "source", label: "Source", detail: sourceReady ? `${source.descriptor.codec.toUpperCase()} · ${source.descriptor.width}×${source.descriptor.height}` : "Import a readable video source", status: sourceReady ? "ok" : "error" },
    { id: "timing", label: "Timing", detail: timingErrors.length === 0 ? "All unit ranges are within the source" : timingErrors[0]!, status: timingErrors.length === 0 ? "ok" : "error" },
    { id: "routes", label: "State graph", detail: graphErrors.length === 0 ? "States, routes, transitions, and bindings are valid" : graphErrors[0]!, status: graphErrors.length === 0 ? "ok" : "error" },
    { id: "outputs", label: "Outputs", detail: outputsReady ? `${requestedEncoders.length} codec output${requestedEncoders.length === 1 ? "" : "s"} selected` : "Select at least one codec", status: outputsReady ? "ok" : "error" },
    {
      id: "toolchain",
      label: "Toolchain",
      detail: !toolchain.available
        ? "This app build is missing its bundled toolchain"
        : missingEncoders.length > 0
          ? `Missing ${missingEncoders.join(", ")}`
          : "Compiler and selected codec encoders are ready",
      status: toolchainStatus
    }
  ];
}

function rendition(width: number, crf: number) {
  return [{ id: "video.1x", width, height: "auto" as const, crf }];
}

export function encodingProfile(project: StudioProjectV3) {
  const width = Math.max(2, project.canvas.width - (project.canvas.width % 2));
  const selected = project.build.profile === "draft"
    ? { av1: false, vp9: false, h265: false, h264: true }
    : project.build.codecs;
  return [
    selected.av1 ? { codec: "av1", bitDepth: 8, cpuUsed: 6, tiles: { columns: 2, rows: 2 }, rowMt: true, threads: 8, renditions: rendition(width, 36) } : null,
    selected.vp9 ? { codec: "vp9", deadline: "good", cpuUsed: 4, threads: 8, renditions: rendition(width, 38) } : null,
    selected.h265 ? { codec: "h265", preset: "medium", threads: 8, renditions: rendition(width, 30) } : null,
    selected.h264 ? { codec: "h264", preset: "medium", renditions: rendition(width, 26) } : null
  ].filter((value) => value !== null);
}

export function toAvalProject(project: StudioProjectV3) {
  const source = project.sources[0];
  if (source === undefined) throw new Error("The project has no media source.");
  const errors = studioGraphErrors(project);
  if (errors.length > 0) throw new Error(errors[0]);
  return {
    projectVersion: AVAL_PROJECT_VERSION,
    alpha: project.build.alpha,
    canvas: {
      width: project.canvas.width,
      height: project.canvas.height,
      fit: project.canvas.fit,
      pixelAspect: project.canvas.pixelAspect,
      colorSpace: "srgb"
    },
    frameRate: project.frameRate,
    sources: [{
      id: source.id,
      type: "video",
      path: source.descriptor.path ?? source.descriptor.name,
      timing: { mode: source.descriptor.variableFrameRate ? "normalize-hold" : "exact" }
    }],
    encodings: encodingProfile(project),
    units: project.units.map((unit) => {
      const base = { id: unit.id, kind: unit.kind, source: unit.sourceId, range: unit.range };
      if (unit.kind === "body") return { ...base, playback: unit.playback, ports: unit.ports };
      if (unit.kind === "reversible") return { ...base, residency: unit.residency };
      return base;
    }),
    initialState: project.initialState,
    states: project.states.map((state) => ({
      id: state.id,
      bodyUnit: state.bodyUnitId,
      ...(state.initialUnitId === undefined ? {} : { initialUnit: state.initialUnitId })
    })),
    edges: project.routes.map((route) => ({
      id: route.id,
      from: route.from,
      to: route.to,
      ...(route.trigger === undefined ? {} : { trigger: route.trigger }),
      start: route.start,
      ...(route.transition === undefined
        ? {}
        : { transition: { ...route.transition, unit: route.transition.unitId, unitId: undefined } }),
      continuity: route.continuity,
      ...(route.start.type === "cut" ? { targetRunwayFrames: route.targetRunwayFrames } : {})
    })).map((route) => {
      if (!("transition" in route) || route.transition === undefined) return route;
      const { unitId: _unitId, ...transition } = route.transition;
      return { ...route, transition };
    }),
    bindings: project.bindings
  };
}

export function studioDocument(project: StudioProjectV3): StudioProjectV3 {
  return project;
}
