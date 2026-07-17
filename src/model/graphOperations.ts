import {
  bodyUnitForState,
  defaultPorts,
  identifierFor,
  selectedState,
  studioColor,
  studioGraphErrors,
  uniqueIdentifier,
  unitFrameCount,
  type BodyPlayback,
  type StudioBinding,
  type StudioBindingSource,
  type StudioBodyUnit,
  type StudioProjectV3,
  type StudioRoute,
  type StudioStart,
  type StudioState,
  type StudioTransition,
  type StudioUnit,
  type StudioUnitBase,
  type UnitKind
} from "./studio";

export class StudioMutationError extends Error {
  public readonly issues: readonly string[];

  public constructor(issues: readonly string[]) {
    super(issues[0] ?? "The graph change is invalid.");
    this.name = "StudioMutationError";
    this.issues = issues;
  }
}

export function requireValidProject(project: StudioProjectV3): StudioProjectV3 {
  const errors = studioGraphErrors(project);
  if (errors.length > 0) throw new StudioMutationError(errors);
  return project;
}

function stateIds(project: StudioProjectV3): readonly string[] {
  return project.states.map((state) => state.id);
}

function unitIds(project: StudioProjectV3): readonly string[] {
  return project.units.map((unit) => unit.id);
}

function routeIds(project: StudioProjectV3): readonly string[] {
  return project.routes.map((route) => route.id);
}

function sourceId(project: StudioProjectV3): string {
  const id = project.sources[0]?.id;
  if (id === undefined) throw new StudioMutationError(["Import a video source first."]);
  return id;
}

function clampRange(project: StudioProjectV3, range: readonly [number, number]): readonly [number, number] {
  const total = Math.max(1, project.sources[0]?.descriptor.totalFrames ?? 1);
  const start = Math.min(total - 1, Math.max(0, Math.round(range[0])));
  return [start, Math.min(total, Math.max(start + 1, Math.round(range[1])))];
}

function body(
  project: StudioProjectV3,
  id: string,
  name: string,
  range: readonly [number, number],
  playback: BodyPlayback,
  colorIndex: number
): StudioBodyUnit {
  const safeRange = clampRange(project, range);
  return {
    id,
    name,
    kind: "body",
    sourceId: sourceId(project),
    range: safeRange,
    playback,
    ports: defaultPorts(safeRange[1] - safeRange[0], playback),
    color: studioColor(colorIndex)
  };
}

function plainUnit(
  project: StudioProjectV3,
  kind: "bridge" | "one-shot",
  id: string,
  name: string,
  range: readonly [number, number],
  colorIndex: number
): StudioUnit {
  return {
    id,
    name,
    kind,
    sourceId: sourceId(project),
    range: clampRange(project, range),
    color: studioColor(colorIndex)
  };
}

function nextState(
  project: StudioProjectV3,
  name: string,
  range: readonly [number, number],
  playback: BodyPlayback
): { readonly project: StudioProjectV3; readonly state: StudioState; readonly unit: StudioBodyUnit } {
  const id = uniqueIdentifier(stateIds(project), name, "state");
  const unitId = uniqueIdentifier(unitIds(project), `${id}.body`, "state.body");
  const colorIndex = project.states.length;
  const unit = body(project, unitId, `${name}${playback === "loop" ? " Loop" : ""}`, range, playback, colorIndex);
  const state: StudioState = { id, name, bodyUnitId: unit.id, color: unit.color };
  return {
    state,
    unit,
    project: { ...project, units: [...project.units, unit], states: [...project.states, state] }
  };
}

function firstPort(unit: StudioBodyUnit | null): string {
  const id = unit?.ports[0]?.id;
  if (id === undefined) throw new StudioMutationError(["Add a port to each routed body unit first."]);
  return id;
}

function portalStart(project: StudioProjectV3, from: string, to: string): StudioStart {
  const source = bodyUnitForState(project, from);
  const target = bodyUnitForState(project, to);
  return {
    type: "portal",
    sourcePort: firstPort(source),
    targetPort: firstPort(target),
    maxWaitFrames: Math.max(0, (source === null ? 1 : unitFrameCount(source)) - 1)
  };
}

function finishStart(project: StudioProjectV3, from: string, to: string): StudioStart {
  const source = bodyUnitForState(project, from);
  return {
    type: "finish",
    targetPort: firstPort(bodyUnitForState(project, to)),
    maxWaitFrames: Math.max(0, (source === null ? 1 : unitFrameCount(source)) - 1)
  };
}

function nextRoute(
  project: StudioProjectV3,
  from: string,
  to: string,
  trigger: StudioRoute["trigger"],
  name: string,
  transition?: StudioTransition,
  start?: StudioStart,
  continuity: StudioRoute["continuity"] = "exact-authored"
): StudioRoute {
  return {
    id: uniqueIdentifier(routeIds(project), `${from}.${to}`, "route"),
    name,
    from,
    to,
    ...(trigger === undefined ? {} : { trigger }),
    start: start ?? portalStart(project, from, to),
    ...(transition === undefined ? {} : { transition }),
    continuity
  };
}

function upsertBinding(
  bindings: readonly StudioBinding[],
  source: StudioBindingSource,
  event: string
): readonly StudioBinding[] {
  return [...bindings.filter((binding) => binding.source !== source), { source, event }];
}

function usedTransitionUnitIds(routes: readonly StudioRoute[]): ReadonlySet<string> {
  return new Set(routes.flatMap((route) => route.transition === undefined ? [] : [route.transition.unitId]));
}

function usedUnitIds(project: StudioProjectV3): ReadonlySet<string> {
  const ids = new Set<string>();
  project.states.forEach((state) => {
    ids.add(state.bodyUnitId);
    if (state.initialUnitId !== undefined) ids.add(state.initialUnitId);
  });
  project.routes.forEach((route) => {
    if (route.transition !== undefined) ids.add(route.transition.unitId);
  });
  return ids;
}

function pruneBindings(project: StudioProjectV3): StudioProjectV3 {
  const events = new Set(project.routes.flatMap((route) => route.trigger?.type === "event" ? [route.trigger.name] : []));
  return { ...project, bindings: project.bindings.filter((binding) => events.has(binding.event)) };
}

function pruneOrphanUnits(project: StudioProjectV3): StudioProjectV3 {
  const used = usedUnitIds(project);
  return { ...project, units: project.units.filter((unit) => used.has(unit.id)) };
}

function selectedAnchor(project: StudioProjectV3): StudioState {
  return selectedState(project) ?? project.states.find((state) => state.id === project.initialState) ?? project.states[0]!;
}

export function selectStateInProject(project: StudioProjectV3, stateId: string): StudioProjectV3 {
  return { ...project, editor: { ...project.editor, selection: { kind: "state", id: stateId } } };
}

export function selectUnitInProject(project: StudioProjectV3, unitId: string): StudioProjectV3 {
  return { ...project, editor: { ...project.editor, selection: { kind: "unit", id: unitId } } };
}

export function selectRouteInProject(project: StudioProjectV3, routeId: string): StudioProjectV3 {
  return { ...project, editor: { ...project.editor, selection: { kind: "route", id: routeId } } };
}

export function addState(
  project: StudioProjectV3,
  name: string,
  range: readonly [number, number],
  playback: BodyPlayback
): StudioProjectV3 {
  const created = nextState(project, name, range, playback);
  return requireValidProject(selectStateInProject(created.project, created.state.id));
}

export function duplicateState(project: StudioProjectV3, stateId: string): StudioProjectV3 {
  const state = project.states.find((candidate) => candidate.id === stateId);
  const source = bodyUnitForState(project, stateId);
  if (state === undefined || source === null) throw new StudioMutationError(["The selected state cannot be duplicated."]);
  const created = nextState(project, `${state.name} Copy`, source.range, source.playback);
  const unit = { ...created.unit, ports: source.ports.map((port) => ({ ...port, portalFrames: [...port.portalFrames] })) };
  const next = {
    ...created.project,
    units: created.project.units.map((candidate) => candidate.id === unit.id ? unit : candidate)
  };
  return requireValidProject(selectStateInProject(next, created.state.id));
}

export function updateStateMetadata(
  project: StudioProjectV3,
  stateId: string,
  update: Partial<Pick<StudioState, "name" | "color">>
): StudioProjectV3 {
  return {
    ...project,
    states: project.states.map((state) => state.id === stateId
      ? { ...state, ...update, name: update.name?.trimStart() ?? state.name }
      : state)
  };
}

export interface StateEdit {
  readonly name: string;
  readonly id: string;
  readonly color: StudioState["color"];
  readonly playback: BodyPlayback;
  readonly range: readonly [number, number];
  readonly ports: readonly import("./studio").StudioPort[];
  readonly initial: boolean;
}

export function applyStateEdit(project: StudioProjectV3, stateId: string, edit: StateEdit): StudioProjectV3 {
  const state = project.states.find((candidate) => candidate.id === stateId);
  const currentBody = bodyUnitForState(project, stateId);
  if (state === undefined || currentBody === null) throw new StudioMutationError(["The selected state no longer exists."]);
  let next = updateStateMetadata(project, stateId, { name: edit.name, color: edit.color });
  const nextStateId = identifierFor(edit.id, stateId);
  if (nextStateId !== stateId) next = renameStateId(next, stateId, nextStateId);
  const range = clampRange(next, edit.range);
  const count = range[1] - range[0];
  const ports = edit.ports.map((port) => {
    const portalFrames = [...new Set(port.portalFrames
      .map((frame) => Math.min(count - 1, Math.max(0, Math.round(frame)))))].sort((left, right) => left - right);
    if (edit.playback === "finite" && portalFrames.at(-1) !== count - 1) portalFrames.push(count - 1);
    return { id: identifierFor(port.id, "default"), entryFrame: 0 as const, portalFrames: portalFrames.length === 0 ? [0] : portalFrames };
  });
  const safePorts = ports.length === 0 ? defaultPorts(count, edit.playback) : ports;
  const portRenames = new Map(currentBody.ports.map((port, index) => [port.id, safePorts[index]?.id ?? port.id]));
  next = {
    ...next,
    units: next.units.map((unit): StudioUnit => {
      if (unit.id === currentBody.id && unit.kind === "body") return { ...unit, range, playback: edit.playback, ports: safePorts, color: edit.color };
      if (unit.kind !== "reversible") return unit;
      const first = unit.residency.endpoints[0];
      const second = unit.residency.endpoints[1];
      return {
        ...unit,
        residency: {
          endpoints: [
            { ...first, port: first.state === nextStateId ? portRenames.get(first.port) ?? first.port : first.port },
            { ...second, port: second.state === nextStateId ? portRenames.get(second.port) ?? second.port : second.port }
          ]
        }
      };
    }),
    routes: next.routes.map((route) => {
      if (route.start.type === "portal") {
        return {
          ...route,
          start: {
            ...route.start,
            sourcePort: route.from === nextStateId ? portRenames.get(route.start.sourcePort) ?? route.start.sourcePort : route.start.sourcePort,
            targetPort: route.to === nextStateId ? portRenames.get(route.start.targetPort) ?? route.start.targetPort : route.start.targetPort
          }
        };
      }
      return {
        ...route,
        start: {
          ...route.start,
          targetPort: route.to === nextStateId ? portRenames.get(route.start.targetPort) ?? route.start.targetPort : route.start.targetPort
        }
      };
    })
  };
  if (edit.initial && next.initialState !== nextStateId) next = setInitialState(next, nextStateId);
  return requireValidProject(next);
}

export function renameStateId(project: StudioProjectV3, stateId: string, requested: string): StudioProjectV3 {
  const current = project.states.find((state) => state.id === stateId);
  if (current === undefined) throw new StudioMutationError(["The selected state no longer exists."]);
  const nextId = identifierFor(requested, stateId);
  if (nextId !== stateId && project.states.some((state) => state.id === nextId)) {
    throw new StudioMutationError([`State ID ${nextId} is already in use.`]);
  }
  const next: StudioProjectV3 = {
    ...project,
    states: project.states.map((state) => state.id === stateId ? { ...state, id: nextId } : state),
    routes: project.routes.map((route) => ({
      ...route,
      from: route.from === stateId ? nextId : route.from,
      to: route.to === stateId ? nextId : route.to
    })),
    units: project.units.map((unit) => {
      if (unit.kind !== "reversible") return unit;
      const first = unit.residency.endpoints[0];
      const second = unit.residency.endpoints[1];
      return {
        ...unit,
        residency: {
          endpoints: [
            { ...first, state: first.state === stateId ? nextId : first.state },
            { ...second, state: second.state === stateId ? nextId : second.state }
          ]
        }
      };
    }),
    initialState: project.initialState === stateId ? nextId : project.initialState,
    editor: project.editor.selection.kind === "state" && project.editor.selection.id === stateId
      ? { ...project.editor, selection: { kind: "state", id: nextId } }
      : project.editor
  };
  return requireValidProject(next);
}

export function setInitialState(project: StudioProjectV3, stateId: string): StudioProjectV3 {
  const next = {
    ...project,
    initialState: stateId,
    states: project.states.map((state) => state.id === stateId
      ? state
      : state.initialUnitId === undefined ? state : { ...state, initialUnitId: undefined })
  };
  return requireValidProject(pruneOrphanUnits(next));
}

export interface DeleteStateImpact {
  readonly routeCount: number;
  readonly unitCount: number;
  readonly bindingCount: number;
  readonly needsInitialReplacement: boolean;
}

export function stateDeleteImpact(project: StudioProjectV3, stateId: string): DeleteStateImpact {
  const routes = project.routes.filter((route) => route.from === stateId || route.to === stateId);
  const transitionIds = usedTransitionUnitIds(routes);
  const state = project.states.find((candidate) => candidate.id === stateId);
  const unitIds = new Set([state?.bodyUnitId, state?.initialUnitId, ...transitionIds].filter((id): id is string => id !== undefined));
  const remainingEvents = new Set(project.routes
    .filter((route) => !routes.includes(route))
    .flatMap((route) => route.trigger?.type === "event" ? [route.trigger.name] : []));
  return {
    routeCount: routes.length,
    unitCount: unitIds.size,
    bindingCount: project.bindings.filter((binding) => !remainingEvents.has(binding.event)).length,
    needsInitialReplacement: project.initialState === stateId
  };
}

export function deleteState(
  project: StudioProjectV3,
  stateId: string,
  replacementInitialState?: string
): StudioProjectV3 {
  if (project.states.length <= 1) throw new StudioMutationError(["A project must keep at least one state."]);
  if (project.initialState === stateId && replacementInitialState === undefined) {
    throw new StudioMutationError(["Choose a replacement initial state before deleting this state."]);
  }
  const routes = project.routes.filter((route) => route.from !== stateId && route.to !== stateId);
  const states = project.states.filter((state) => state.id !== stateId);
  const initialState = project.initialState === stateId ? replacementInitialState! : project.initialState;
  let next: StudioProjectV3 = {
    ...project,
    states,
    routes,
    initialState,
    editor: { ...project.editor, selection: { kind: "state", id: initialState } }
  };
  next = pruneBindings(pruneOrphanUnits(next));
  return requireValidProject(next);
}

export function addDirectRoute(project: StudioProjectV3, from: string, to: string): StudioProjectV3 {
  if (from === to) throw new StudioMutationError(["Choose two different states for a route."]);
  if (project.routes.some((route) => route.from === from && route.to === to)) {
    throw new StudioMutationError(["That direct state route already exists."]);
  }
  const route = nextRoute(project, from, to, undefined, `${from} → ${to}`);
  return requireValidProject(selectRouteInProject({ ...project, routes: [...project.routes, route] }, route.id));
}

export function replaceRoute(project: StudioProjectV3, route: StudioRoute, originalId = route.id): StudioProjectV3 {
  const id = identifierFor(route.id, originalId);
  if (id !== originalId && project.routes.some((candidate) => candidate.id === id)) {
    throw new StudioMutationError([`Route ID ${id} is already in use.`]);
  }
  const normalized = { ...route, id };
  let next: StudioProjectV3 = {
    ...project,
    routes: project.routes.map((candidate) => {
      if (candidate.id === originalId) return normalized;
      if (candidate.transition?.kind === "reversible" && candidate.transition.reverseOf === originalId) {
        return { ...candidate, transition: { ...candidate.transition, reverseOf: id } };
      }
      return candidate;
    }),
    editor: project.editor.selection.kind === "route" && project.editor.selection.id === originalId
      ? { ...project.editor, selection: { kind: "route" as const, id } }
      : project.editor
  };
  next = pruneBindings(pruneOrphanUnits(next));
  return requireValidProject(next);
}

export function deleteRoute(project: StudioProjectV3, routeId: string): StudioProjectV3 {
  const route = project.routes.find((candidate) => candidate.id === routeId);
  if (route === undefined) return project;
  const inverseId = route.transition?.kind === "reversible"
    ? route.transition.reverseOf ?? project.routes.find((candidate) =>
      candidate.transition?.kind === "reversible" && candidate.transition.reverseOf === route.id
    )?.id
    : undefined;
  const removedIds = new Set([routeId, inverseId].filter((id): id is string => id !== undefined));
  let next: StudioProjectV3 = {
    ...project,
    routes: project.routes.filter((candidate) => !removedIds.has(candidate.id)),
    editor: { ...project.editor, selection: { kind: "state", id: route.from } }
  };
  next = pruneBindings(pruneOrphanUnits(next));
  return requireValidProject(next);
}

export function updateBinding(
  project: StudioProjectV3,
  source: StudioBindingSource,
  event: string | null
): StudioProjectV3 {
  const bindings = event === null
    ? project.bindings.filter((binding) => binding.source !== source)
    : upsertBinding(project.bindings, source, identifierFor(event, "event"));
  return requireValidProject({ ...project, bindings });
}

export function addTransitionToRoute(
  project: StudioProjectV3,
  routeId: string,
  kind: "locked" | "reversible",
  range: readonly [number, number]
): StudioProjectV3 {
  const route = project.routes.find((candidate) => candidate.id === routeId);
  if (route === undefined) throw new StudioMutationError(["The selected route no longer exists."]);
  if (route.start.type === "cut") throw new StudioMutationError(["Instant cuts cannot own transition clips."]);
  if (route.transition !== undefined) throw new StudioMutationError(["Remove the current transition clip first."]);
  const id = uniqueIdentifier(unitIds(project), `${route.id}.${kind}`, `${kind}.unit`);
  if (kind === "locked") {
    const unit = plainUnit(project, "bridge", id, `${route.name} Bridge`, range, project.units.length);
    const nextRouteValue: StudioRoute = { ...route, transition: { kind, unitId: id }, continuity: "exact-authored" };
    return requireValidProject({
      ...project,
      units: [...project.units, unit],
      routes: project.routes.map((candidate) => candidate.id === route.id ? nextRouteValue : candidate)
    });
  }

  const inverseExisting = project.routes.find((candidate) => candidate.from === route.to && candidate.to === route.from);
  const inverseId = inverseExisting?.id ?? uniqueIdentifier(routeIds(project), `${route.to}.${route.from}`, "inverse.route");
  const unit: StudioUnit = {
    id,
    name: `${route.name} Reversible`,
    kind: "reversible",
    sourceId: sourceId(project),
    range: clampRange(project, range),
    color: studioColor(project.units.length),
    residency: {
      endpoints: [
        { state: route.from, port: firstPort(bodyUnitForState(project, route.from)), frames: 6 },
        { state: route.to, port: firstPort(bodyUnitForState(project, route.to)), frames: 6 }
      ]
    }
  };
  const forward: StudioRoute = {
    ...route,
    transition: { kind: "reversible", unitId: id, direction: "forward" },
    continuity: "exact-authored"
  };
  const reverse: StudioRoute = {
    ...(inverseExisting ?? nextRoute(project, route.to, route.from, undefined, `${route.to} → ${route.from}`)),
    transition: { kind: "reversible", unitId: id, direction: "reverse", reverseOf: route.id },
    continuity: "exact-reverse"
  };
  const routes = inverseExisting === undefined
    ? [...project.routes.map((candidate) => candidate.id === route.id ? forward : candidate), reverse]
    : project.routes.map((candidate) => candidate.id === route.id ? forward : candidate.id === inverseId ? reverse : candidate);
  return requireValidProject({ ...project, units: [...project.units, unit], routes });
}

export function removeRouteTransition(project: StudioProjectV3, routeId: string): StudioProjectV3 {
  const route = project.routes.find((candidate) => candidate.id === routeId);
  if (route?.transition === undefined) return project;
  const unitId = route.transition.unitId;
  const routes = project.routes.map((candidate): StudioRoute => {
    if (candidate.transition?.unitId !== unitId) return candidate;
    const { transition: _transition, ...withoutTransition } = candidate;
    return { ...withoutTransition, continuity: "exact-authored" };
  });
  return requireValidProject(pruneOrphanUnits({ ...project, routes }));
}

export type StateTemplateId =
  | "loop"
  | "play-once"
  | "hold"
  | "hover"
  | "toggle"
  | "reversible-toggle"
  | "activate-return"
  | "intro"
  | "status";

export type TemplateApplyMode = "append" | "replace";

export interface StateTemplateDefinition {
  readonly id: StateTemplateId;
  readonly name: string;
  readonly category: "State" | "Workflow";
  readonly description: string;
  readonly diagram: string;
}

export const STATE_TEMPLATES: readonly StateTemplateDefinition[] = [
  { id: "loop", name: "Loop", category: "State", description: "A state that repeats continuously.", diagram: "State ↻" },
  { id: "play-once", name: "Play once", category: "State", description: "Plays once, then holds its final frame.", diagram: "▶ State ■" },
  { id: "hold", name: "Hold", category: "State", description: "A single-frame stable state.", diagram: "●" },
  { id: "hover", name: "Hover", category: "Workflow", description: "Pointer enter and leave with authored bridge clips.", diagram: "Idle ⇄ Hover" },
  { id: "toggle", name: "Toggle", category: "Workflow", description: "Activate repeatedly to switch between two states.", diagram: "Off ⇄ On" },
  { id: "reversible-toggle", name: "Reversible toggle", category: "Workflow", description: "A transition that reverses cleanly while it is running.", diagram: "Off ⇆ On" },
  { id: "activate-return", name: "Activate + return", category: "Workflow", description: "Play a reaction and return when it completes.", diagram: "Idle → React → Idle" },
  { id: "intro", name: "Intro", category: "Workflow", description: "Play a one-shot intro before the initial body.", diagram: "Intro → Initial" },
  { id: "status", name: "Status flow", category: "Workflow", description: "Idle, loading, success, and error states driven by events.", diagram: "Idle → Loading ↗" }
];

export interface TemplateRangeSlot {
  readonly id: string;
  readonly label: string;
  readonly role: UnitKind;
  readonly range: readonly [number, number];
  readonly singleFrame?: boolean;
}

function shortRange(project: StudioProjectV3, base: readonly [number, number]): readonly [number, number] {
  const preferred = Math.max(1, Math.round(fpsForProject(project) * 0.4));
  return [base[0], Math.min(base[1], base[0] + preferred)];
}

function fpsForProject(project: StudioProjectV3): number {
  return project.frameRate.numerator / Math.max(1, project.frameRate.denominator);
}

export function templateRangeSlots(
  project: StudioProjectV3,
  templateId: StateTemplateId,
  mode: TemplateApplyMode
): readonly TemplateRangeSlot[] {
  const anchor = selectedAnchor(project);
  const anchorBody = bodyUnitForState(project, anchor.id);
  const base = anchorBody?.range ?? [0, Math.max(1, project.sources[0]?.descriptor.totalFrames ?? 1)];
  const bodySlot = (id: string, label: string): TemplateRangeSlot => ({ id, label, role: "body", range: base });
  const clipSlot = (id: string, label: string, role: "bridge" | "one-shot" | "reversible"): TemplateRangeSlot => ({ id, label, role, range: shortRange(project, base) });
  const replaceAnchor = mode === "replace" ? [bodySlot("anchor", templateId === "toggle" || templateId === "reversible-toggle" ? "Off body" : "Idle body")] : [];
  switch (templateId) {
    case "loop": return [bodySlot("body", "Loop body")];
    case "play-once": return [bodySlot("body", "Play-once body")];
    case "hold": return [{ ...bodySlot("body", "Held frame"), range: [base[0], base[0] + 1], singleFrame: true }];
    case "hover": return [...replaceAnchor, bodySlot("hover", "Hover body"), clipSlot("enter", "Enter bridge", "bridge"), clipSlot("exit", "Exit bridge", "bridge")];
    case "toggle": return [...replaceAnchor, bodySlot("on", "On body")];
    case "reversible-toggle": return [...replaceAnchor, bodySlot("on", "On body"), clipSlot("transition", "Reversible transition", "reversible")];
    case "activate-return": return [...replaceAnchor, bodySlot("reaction", "Reaction body")];
    case "intro": return [...replaceAnchor, clipSlot("intro", "Intro clip", "one-shot")];
    case "status": return [...replaceAnchor, bodySlot("loading", "Loading body"), bodySlot("success", "Success body"), bodySlot("error", "Error body")];
  }
}

export type TemplateRanges = Readonly<Record<string, readonly [number, number]>>;

function rangeValue(slots: readonly TemplateRangeSlot[], ranges: TemplateRanges, id: string): readonly [number, number] {
  const fallback = slots.find((slot) => slot.id === id)?.range ?? [0, 1];
  const range = ranges[id] ?? fallback;
  const slot = slots.find((candidate) => candidate.id === id);
  return slot?.singleFrame === true ? [range[0], range[0] + 1] : range;
}

function clearedProject(project: StudioProjectV3): StudioProjectV3 {
  return { ...project, units: [], states: [], routes: [], bindings: [] };
}

function uniqueEvent(project: StudioProjectV3, from: string, preferred: string): string {
  const events = project.routes.flatMap((route) =>
    route.from === from && route.trigger?.type === "event" ? [route.trigger.name] : []
  );
  return uniqueIdentifier(events, preferred, "event");
}

function createAnchor(
  project: StudioProjectV3,
  templateId: StateTemplateId,
  slots: readonly TemplateRangeSlot[],
  ranges: TemplateRanges
): { readonly project: StudioProjectV3; readonly state: StudioState } {
  const name = templateId === "toggle" || templateId === "reversible-toggle" ? "Off" : "Idle";
  const created = nextState(project, name, rangeValue(slots, ranges, "anchor"), "loop");
  return { project: created.project, state: created.state };
}

export function applyStateTemplate(
  original: StudioProjectV3,
  templateId: StateTemplateId,
  mode: TemplateApplyMode,
  ranges: TemplateRanges
): StudioProjectV3 {
  const slots = templateRangeSlots(original, templateId, mode);
  let project = mode === "replace" ? clearedProject(original) : original;
  let anchor = mode === "replace" ? createAnchor(project, templateId, slots, ranges) : { project, state: selectedAnchor(project) };
  project = anchor.project;

  if (templateId === "loop" || templateId === "play-once" || templateId === "hold") {
    const playback = templateId === "loop" ? "loop" : "finite";
    const name = templateId === "loop" ? "Loop" : templateId === "hold" ? "Hold" : "Play Once";
    if (mode === "replace") project = clearedProject(original);
    const created = nextState(project, name, rangeValue(slots, ranges, "body"), playback);
    const next = { ...created.project, initialState: mode === "replace" ? created.state.id : original.initialState };
    return requireValidProject(selectStateInProject(next, created.state.id));
  }

  if (templateId === "intro") {
    const target = mode === "replace" ? anchor.state : project.states.find((state) => state.id === project.initialState)!;
    const oldIntroId = target.initialUnitId;
    const introId = uniqueIdentifier(unitIds(project), `${target.id}.intro`, "intro");
    const intro = plainUnit(project, "one-shot", introId, `${target.name} Intro`, rangeValue(slots, ranges, "intro"), project.units.length);
    const states = project.states.map((state) => state.id === target.id ? { ...state, initialUnitId: intro.id } : state);
    let next: StudioProjectV3 = {
      ...project,
      initialState: target.id,
      states,
      units: [...project.units.filter((unit) => unit.id !== oldIntroId), intro]
    };
    next = selectStateInProject(next, target.id);
    return requireValidProject(next);
  }

  if (templateId === "hover") {
    const created = nextState(project, "Hover", rangeValue(slots, ranges, "hover"), "loop");
    project = created.project;
    const enterId = uniqueIdentifier(unitIds(project), `${anchor.state.id}.hover.enter`, "enter.bridge");
    const enter = plainUnit(project, "bridge", enterId, "Hover Enter", rangeValue(slots, ranges, "enter"), project.units.length);
    const exitId = uniqueIdentifier([...unitIds(project), enter.id], `${anchor.state.id}.hover.exit`, "exit.bridge");
    const exit = plainUnit(project, "bridge", exitId, "Hover Exit", rangeValue(slots, ranges, "exit"), project.units.length + 1);
    project = { ...project, units: [...project.units, enter, exit] };
    const enterEvent = uniqueEvent(project, anchor.state.id, "hover.enter");
    const leaveEvent = uniqueEvent(project, created.state.id, "hover.leave");
    const enterRoute = nextRoute(project, anchor.state.id, created.state.id, { type: "event", name: enterEvent }, "Pointer enter", { kind: "locked", unitId: enter.id });
    project = { ...project, routes: [...project.routes, enterRoute] };
    const exitRoute = nextRoute(project, created.state.id, anchor.state.id, { type: "event", name: leaveEvent }, "Pointer leave", { kind: "locked", unitId: exit.id });
    project = {
      ...project,
      routes: [...project.routes, exitRoute],
      bindings: upsertBinding(upsertBinding(project.bindings, "pointer.enter", enterEvent), "pointer.leave", leaveEvent)
    };
    return requireValidProject(selectStateInProject({ ...project, initialState: mode === "replace" ? anchor.state.id : project.initialState }, created.state.id));
  }

  if (templateId === "toggle" || templateId === "reversible-toggle") {
    const created = nextState(project, "On", rangeValue(slots, ranges, "on"), "loop");
    project = created.project;
    const event = uniqueEvent(project, anchor.state.id, "control.toggle");
    let forward = nextRoute(project, anchor.state.id, created.state.id, { type: "event", name: event }, "Toggle on");
    project = { ...project, routes: [...project.routes, forward] };
    let reverse = nextRoute(project, created.state.id, anchor.state.id, { type: "event", name: event }, "Toggle off");
    if (templateId === "reversible-toggle") {
      const unitId = uniqueIdentifier(unitIds(project), `${anchor.state.id}.toggle`, "toggle.transition");
      const unit: StudioUnit = {
        id: unitId,
        name: "Toggle Reversible",
        kind: "reversible",
        sourceId: sourceId(project),
        range: clampRange(project, rangeValue(slots, ranges, "transition")),
        color: studioColor(project.units.length),
        residency: {
          endpoints: [
            { state: anchor.state.id, port: firstPort(bodyUnitForState(project, anchor.state.id)), frames: 6 },
            { state: created.state.id, port: firstPort(bodyUnitForState(project, created.state.id)), frames: 6 }
          ]
        }
      };
      forward = { ...forward, transition: { kind: "reversible", unitId, direction: "forward" } };
      reverse = { ...reverse, transition: { kind: "reversible", unitId, direction: "reverse", reverseOf: forward.id }, continuity: "exact-reverse" };
      project = { ...project, units: [...project.units, unit], routes: project.routes.map((route) => route.id === forward.id ? forward : route) };
    }
    project = {
      ...project,
      routes: [...project.routes, reverse],
      bindings: upsertBinding(project.bindings, "activate", event)
    };
    return requireValidProject(selectStateInProject({ ...project, initialState: mode === "replace" ? anchor.state.id : project.initialState }, created.state.id));
  }

  if (templateId === "activate-return") {
    const created = nextState(project, "Reaction", rangeValue(slots, ranges, "reaction"), "finite");
    project = created.project;
    const event = uniqueEvent(project, anchor.state.id, "control.activate");
    const activate = nextRoute(project, anchor.state.id, created.state.id, { type: "event", name: event }, "Activate");
    project = { ...project, routes: [...project.routes, activate] };
    const complete = nextRoute(project, created.state.id, anchor.state.id, { type: "completion" }, "Return on completion", undefined, finishStart(project, created.state.id, anchor.state.id));
    project = {
      ...project,
      routes: [...project.routes, complete],
      bindings: upsertBinding(project.bindings, "activate", event)
    };
    return requireValidProject(selectStateInProject({ ...project, initialState: mode === "replace" ? anchor.state.id : project.initialState }, created.state.id));
  }

  const loading = nextState(project, "Loading", rangeValue(slots, ranges, "loading"), "loop");
  project = loading.project;
  const success = nextState(project, "Success", rangeValue(slots, ranges, "success"), "finite");
  project = success.project;
  const error = nextState(project, "Error", rangeValue(slots, ranges, "error"), "finite");
  project = error.project;
  const routes: StudioRoute[] = [];
  const add = (from: string, to: string, event: string, name: string): void => {
    const route = nextRoute({ ...project, routes: [...project.routes, ...routes] }, from, to, { type: "event", name: event }, name);
    routes.push(route);
  };
  add(anchor.state.id, loading.state.id, "status.loading", "Start loading");
  add(loading.state.id, success.state.id, "status.success", "Loading succeeded");
  add(loading.state.id, error.state.id, "status.error", "Loading failed");
  add(success.state.id, anchor.state.id, "status.reset", "Reset success");
  add(error.state.id, anchor.state.id, "status.reset", "Reset error");
  project = { ...project, routes: [...project.routes, ...routes], initialState: mode === "replace" ? anchor.state.id : project.initialState };
  return requireValidProject(selectStateInProject(project, loading.state.id));
}

/** Narrow shared base shape used by advanced inspector updates. */
export type EditableUnitBase = Pick<StudioUnitBase, "name" | "range">;
