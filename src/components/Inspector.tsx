import { useEffect, useMemo, useState } from "react";

import {
  STUDIO_BINDING_SOURCES,
  bodyUnitForState,
  type BodyPlayback,
  type PreparationPlan,
  type StudioBindingSource,
  type StudioBodyUnit,
  type StudioPort,
  type StudioProjectV3,
  type StudioReversibleUnit,
  type StudioRoute,
  type StudioState,
  type StudioUnit
} from "../model/studio";
import { CheckIcon, ChevronDownIcon, WarningIcon } from "./Icons";
import { ScrubbableNumberField } from "./ScrubbableNumberField";

export interface StateInspectorDraft {
  readonly name: string;
  readonly id: string;
  readonly color: StudioState["color"];
  readonly playback: BodyPlayback;
  readonly range: readonly [number, number];
  readonly ports: readonly StudioPort[];
  readonly initial: boolean;
}

export interface UnitInspectorUpdate {
  readonly name: string;
  readonly range: readonly [number, number];
  readonly residency?: import("../model/studio").StudioReversibleUnit["residency"];
}

interface InspectorProps {
  readonly project: StudioProjectV3;
  readonly preparation: PreparationPlan;
  readonly onApplyState: (stateId: string, draft: StateInspectorDraft) => void;
  readonly onApplyUnit: (unitId: string, update: UnitInspectorUpdate) => void;
  readonly onApplyRoute: (route: StudioRoute, binding: StudioBindingSource | null) => void;
  readonly onDeleteRoute: (routeId: string) => void;
  readonly onAddTransition: (routeId: string, kind: "locked" | "reversible") => void;
  readonly onRemoveTransition: (routeId: string) => void;
  readonly onReviewPrep: () => void;
}

function HelpDemo({ title, copy, children }: { readonly title: string; readonly copy: string; readonly children: React.ReactNode }) {
  return (
    <details className="inspector-help">
      <summary>Show example</summary>
      <div className="help-demo"><div>{children}</div><strong>{title}</strong><p>{copy}</p></div>
    </details>
  );
}

function jsonPreview(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function updateResidencyEndpoint(
  residency: StudioReversibleUnit["residency"],
  index: number,
  update: Partial<StudioReversibleUnit["residency"]["endpoints"][number]>
): StudioReversibleUnit["residency"] {
  const first = residency.endpoints[0];
  const second = residency.endpoints[1];
  return { endpoints: index === 0 ? [{ ...first, ...update }, second] : [first, { ...second, ...update }] };
}

function StateInspector({
  project,
  state,
  body,
  onApply
}: {
  readonly project: StudioProjectV3;
  readonly state: StudioState;
  readonly body: StudioBodyUnit;
  readonly onApply: (draft: StateInspectorDraft) => void;
}) {
  const [draft, setDraft] = useState<StateInspectorDraft>({
    name: state.name,
    id: state.id,
    color: state.color,
    playback: body.playback,
    range: body.range,
    ports: body.ports,
    initial: state.id === project.initialState
  });
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    setDraft({
      name: state.name,
      id: state.id,
      color: state.color,
      playback: body.playback,
      range: body.range,
      ports: body.ports,
      initial: state.id === project.initialState
    });
  }, [body, project.initialState, state]);
  const dirty = draft.name !== state.name || draft.id !== state.id || draft.color !== state.color
    || draft.playback !== body.playback || draft.range[0] !== body.range[0] || draft.range[1] !== body.range[1]
    || JSON.stringify(draft.ports) !== JSON.stringify(body.ports) || draft.initial !== (state.id === project.initialState);

  return (
    <>
      <div className="inspector-context"><span>State</span><strong>{state.name}</strong><code>{state.id}</code></div>
      <div className="inspector-fields">
        <label><span>Name</span><input value={draft.name} maxLength={64} onChange={(event) => setDraft((current) => ({ ...current, name: event.currentTarget.value }))} /></label>
        <label><span>Color</span><select value={draft.color} onChange={(event) => setDraft((current) => ({ ...current, color: event.currentTarget.value as StudioState["color"] }))}>
          <option value="teal">Teal</option><option value="blue">Blue</option><option value="violet">Violet</option><option value="orange">Orange</option><option value="rose">Rose</option><option value="yellow">Yellow</option>
        </select></label>
        <label><span>Playback</span><select value={draft.playback} onChange={(event) => setDraft((current) => ({ ...current, playback: event.currentTarget.value as BodyPlayback }))}>
          <option value="loop">Loop continuously</option>
          <option value="finite">Play once, then hold</option>
        </select></label>
        <label className="check-row inline"><span>Initial state</span><input type="checkbox" checked={draft.initial} onChange={(event) => setDraft((current) => ({ ...current, initial: event.currentTarget.checked }))} /><i><CheckIcon /></i></label>
      </div>
      <HelpDemo title="Playback behavior" copy="Loop wraps to its first frame. Play once reaches its final frame and can fire a completion route.">
        <span className="demo-loop">0 1 2 3 ↻</span><span className="demo-once">0 1 2 3 ■</span>
      </HelpDemo>

      <section className="inspector-group">
        <header>Source range <ChevronDownIcon /></header>
        <p className="inspector-copy">The end is exclusive: this range contains frames {draft.range[0]}–{draft.range[1] - 1}.</p>
        <div className="inspector-fields">
          <ScrubbableNumberField label="Start frame" min={0} max={draft.range[1] - 1} value={draft.range[0]} onChange={(value) => setDraft((current) => ({ ...current, range: [value, current.range[1]] }))} />
          <ScrubbableNumberField label="End (exclusive)" min={draft.range[0] + 1} max={project.sources[0]!.descriptor.totalFrames} value={draft.range[1]} onChange={(value) => setDraft((current) => ({ ...current, range: [current.range[0], value] }))} />
          <div className="field-summary"><span>Duration</span><strong>{draft.range[1] - draft.range[0]}f</strong></div>
        </div>
      </section>

      <section className="inspector-group">
        <button type="button" className="advanced-toggle" onClick={() => setAdvanced((value) => !value)}><span>Advanced AVAL settings</span><b>{advanced ? "Hide" : "Show"}</b></button>
        {advanced ? (
          <div className="advanced-fields">
            <label><span>Published state ID</span><input value={draft.id} onChange={(event) => setDraft((current) => ({ ...current, id: event.currentTarget.value }))} /></label>
            <div className="ports-editor">
              <div className="ports-heading"><span>Body ports</span><button type="button" onClick={() => setDraft((current) => ({ ...current, ports: [...current.ports, { id: `port-${current.ports.length + 1}`, entryFrame: 0, portalFrames: [0] }] }))}>+ Add port</button></div>
              {draft.ports.length === 0 ? <p className="field-error">A routed body needs at least one port.</p> : draft.ports.map((port, portIndex) => (
                <div className="port-editor" key={`${port.id}.${portIndex}`}>
                  <label><span>Port ID</span><input value={port.id} onChange={(event) => setDraft((current) => ({ ...current, ports: current.ports.map((candidate, index) => index === portIndex ? { ...candidate, id: event.currentTarget.value } : candidate) }))} /></label>
                  <label><span>Portal frames</span><input value={port.portalFrames.join(", ")} onChange={(event) => {
                    const frames = event.currentTarget.value.split(",").map((part) => Number.parseInt(part.trim(), 10)).filter(Number.isFinite);
                    setDraft((current) => ({ ...current, ports: current.ports.map((candidate, index) => index === portIndex ? { ...candidate, portalFrames: frames } : candidate) }));
                  }} /></label>
                  <button type="button" className="danger-link" disabled={draft.ports.length === 1} onClick={() => setDraft((current) => ({ ...current, ports: current.ports.filter((_candidate, index) => index !== portIndex) }))}>Remove</button>
                </div>
              ))}
            </div>
            <div className="aval-json-preview"><span>AVAL JSON</span><pre>{jsonPreview({ id: draft.id, bodyUnit: body.id, ...(state.initialUnitId === undefined ? {} : { initialUnit: state.initialUnitId }) })}</pre></div>
          </div>
        ) : null}
      </section>
      <div className="inspector-commit"><button type="button" className="button button-primary" disabled={!dirty || draft.name.trim().length === 0} onClick={() => onApply(draft)}>Apply state changes</button></div>
    </>
  );
}

function RouteInspector({
  project,
  route,
  onApply,
  onDelete,
  onAddTransition,
  onRemoveTransition
}: {
  readonly project: StudioProjectV3;
  readonly route: StudioRoute;
  readonly onApply: (route: StudioRoute, binding: StudioBindingSource | null) => void;
  readonly onDelete: () => void;
  readonly onAddTransition: (kind: "locked" | "reversible") => void;
  readonly onRemoveTransition: () => void;
}) {
  const [draft, setDraft] = useState(route);
  const initialBinding = project.bindings.find((binding) => binding.event === (route.trigger?.type === "event" ? route.trigger.name : ""))?.source ?? null;
  const [binding, setBinding] = useState<StudioBindingSource | null>(initialBinding);
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    setDraft(route);
    setBinding(project.bindings.find((candidate) => candidate.event === (route.trigger?.type === "event" ? route.trigger.name : ""))?.source ?? null);
  }, [project.bindings, route]);
  const sourceBody = bodyUnitForState(project, draft.from);
  const targetBody = bodyUnitForState(project, draft.to);
  const triggerKind = draft.trigger?.type ?? "direct";
  const startType = draft.start.type;
  const setStartType = (type: StudioRoute["start"]["type"]): void => {
    const targetPort = targetBody?.ports[0]?.id ?? "default";
    if (type === "cut") {
      setDraft((current) => ({ ...current, start: { type: "cut", targetPort, maxWaitFrames: 1 }, continuity: "cut", transition: undefined, targetRunwayFrames: 6 }));
      return;
    }
    if (type === "finish") {
      setDraft((current) => ({ ...current, start: { type: "finish", targetPort, maxWaitFrames: Math.max(0, (sourceBody?.range[1] ?? 1) - (sourceBody?.range[0] ?? 0) - 1) }, continuity: "exact-authored", targetRunwayFrames: undefined }));
      return;
    }
    setDraft((current) => ({ ...current, start: { type: "portal", sourcePort: sourceBody?.ports[0]?.id ?? "default", targetPort, maxWaitFrames: Math.max(0, (sourceBody?.range[1] ?? 1) - (sourceBody?.range[0] ?? 0) - 1) }, continuity: "exact-authored", targetRunwayFrames: undefined }));
  };
  const routeJson = {
    id: draft.id,
    from: draft.from,
    to: draft.to,
    ...(draft.trigger === undefined ? {} : { trigger: draft.trigger }),
    start: draft.start,
    ...(draft.transition === undefined ? {} : { transition: { ...draft.transition, unit: draft.transition.unitId } }),
    continuity: draft.continuity,
    ...(draft.start.type === "cut" ? { targetRunwayFrames: draft.targetRunwayFrames } : {})
  };

  return (
    <>
      <div className="inspector-context"><span>Route</span><strong>{route.name}</strong><code>{route.id}</code></div>
      <div className="inspector-fields">
        <label><span>Name</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.currentTarget.value }))} /></label>
        <label><span>From</span><select value={draft.from} onChange={(event) => setDraft((current) => ({ ...current, from: event.currentTarget.value }))}>{project.states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label>
        <label><span>To</span><select value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.currentTarget.value }))}>{project.states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label>
        <label><span>When</span><select value={triggerKind} onChange={(event) => {
          const type = event.currentTarget.value;
          setDraft((current) => ({ ...current, trigger: type === "direct" ? undefined : type === "completion" ? { type: "completion" } : { type: "event", name: "custom.event" } }));
          if (type !== "event") setBinding(null);
        }}><option value="direct">State is requested</option><option value="event">Event is sent</option><option value="completion">Source completes</option></select></label>
        {draft.trigger?.type === "event" ? <label><span>Event</span><input value={draft.trigger.name} onChange={(event) => setDraft((current) => ({ ...current, trigger: { type: "event", name: event.currentTarget.value } }))} /></label> : null}
        {draft.trigger?.type === "event" ? <label><span>Host binding</span><select value={binding ?? ""} onChange={(event) => setBinding(event.currentTarget.value === "" ? null : event.currentTarget.value as StudioBindingSource)}><option value="">None / app event</option>{STUDIO_BINDING_SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}</select></label> : null}
      </div>
      <HelpDemo title="What starts a route?" copy="Apps can request a state directly, send a named event, or let a finite state continue on completion.">
        <span className="demo-route">Request</span><span className="demo-route">Event</span><span className="demo-route">Complete</span>
      </HelpDemo>

      <section className="inspector-group">
        <header>Transition timing <ChevronDownIcon /></header>
        <div className="inspector-fields">
          <label><span>Start</span><select value={startType} onChange={(event) => setStartType(event.currentTarget.value as StudioRoute["start"]["type"])}><option value="portal">Wait for marker</option><option value="finish">After clip</option><option value="cut">Instant cut</option></select></label>
          {draft.start.type === "portal" ? <label><span>Source port</span><select value={draft.start.sourcePort} onChange={(event) => setDraft((current) => current.start.type === "portal" ? { ...current, start: { ...current.start, sourcePort: event.currentTarget.value } } : current)}>{sourceBody?.ports.map((port) => <option key={port.id} value={port.id}>{port.id}</option>)}</select></label> : null}
          <label><span>Target port</span><select value={draft.start.targetPort} onChange={(event) => setDraft((current) => ({ ...current, start: { ...current.start, targetPort: event.currentTarget.value } as StudioRoute["start"] }))}>{targetBody?.ports.map((port) => <option key={port.id} value={port.id}>{port.id}</option>)}</select></label>
          {draft.start.type !== "cut" ? <ScrubbableNumberField label="Max wait" min={0} value={draft.start.maxWaitFrames} onChange={(value) => setDraft((current) => ({ ...current, start: { ...current.start, maxWaitFrames: value } as StudioRoute["start"] }))} /> : null}
          {draft.start.type === "cut" ? <ScrubbableNumberField label="Runway" min={6} max={12} value={draft.targetRunwayFrames ?? 6} onChange={(value) => setDraft((current) => ({ ...current, targetRunwayFrames: value }))} /> : null}
          <div className="field-summary"><span>Motion</span><strong>{draft.transition?.kind === "locked" ? "Bridge clip" : draft.transition?.kind === "reversible" ? "Reversible clip" : draft.start.type === "cut" ? "Instant" : "Direct"}</strong></div>
        </div>
        <div className="transition-actions">
          {draft.transition === undefined && draft.start.type !== "cut" ? <><button type="button" onClick={() => onAddTransition("locked")}>+ Bridge clip</button><button type="button" onClick={() => onAddTransition("reversible")}>+ Reversible pair</button></> : null}
          {draft.transition !== undefined ? <button type="button" className="danger-link" onClick={onRemoveTransition}>Remove transition clip</button> : null}
        </div>
      </section>
      <HelpDemo title="Transition choices" copy="Portal waits for an authored exit marker, finish waits for a finite body, and cut switches immediately. Bridge clips cannot reverse; reversible pairs can.">
        <span className="demo-portal">● · · ●</span><span className="demo-bridge">A ━▶ B</span><span className="demo-reverse">A ⇆ B</span>
      </HelpDemo>

      <section className="inspector-group">
        <button type="button" className="advanced-toggle" onClick={() => setAdvanced((value) => !value)}><span>Advanced AVAL settings</span><b>{advanced ? "Hide" : "Show"}</b></button>
        {advanced ? <div className="advanced-fields">
          <label><span>Route ID</span><input value={draft.id} onChange={(event) => setDraft((current) => ({ ...current, id: event.currentTarget.value }))} /></label>
          <label><span>Continuity</span><select value={draft.continuity} disabled={draft.start.type === "cut"} onChange={(event) => setDraft((current) => ({ ...current, continuity: event.currentTarget.value as StudioRoute["continuity"] }))}><option value="exact-authored">exact-authored</option><option value="exact-reverse">exact-reverse</option><option value="cut">cut</option></select></label>
          <div className="aval-json-preview"><span>AVAL JSON</span><pre>{jsonPreview(routeJson)}</pre></div>
        </div> : null}
      </section>
      <div className="inspector-commit split"><button type="button" className="danger-button" onClick={onDelete}>Delete route</button><button type="button" className="button button-primary" onClick={() => onApply(draft, binding)}>Apply route</button></div>
    </>
  );
}

function UnitInspector({ project, unit, onApply }: { readonly project: StudioProjectV3; readonly unit: StudioUnit; readonly onApply: (update: UnitInspectorUpdate) => void }) {
  const [name, setName] = useState(unit.name);
  const [range, setRange] = useState(unit.range);
  const [residency, setResidency] = useState(unit.kind === "reversible" ? unit.residency : null);
  useEffect(() => { setName(unit.name); setRange(unit.range); setResidency(unit.kind === "reversible" ? unit.residency : null); }, [unit]);
  return (
    <>
      <div className="inspector-context"><span>{unit.kind} unit</span><strong>{unit.name}</strong><code>{unit.id}</code></div>
      <p className="inspector-copy">This clip is owned by the graph role shown above. Change its source range without breaking those references.</p>
      <div className="inspector-fields">
        <label><span>Name</span><input value={name} onChange={(event) => setName(event.currentTarget.value)} /></label>
        <ScrubbableNumberField label="Start frame" min={0} max={range[1] - 1} value={range[0]} onChange={(value) => setRange([value, range[1]])} />
        <ScrubbableNumberField label="End (exclusive)" min={range[0] + 1} max={project.sources[0]!.descriptor.totalFrames} value={range[1]} onChange={(value) => setRange([range[0], value])} />
      </div>
      {unit.kind === "reversible" && residency !== null ? <div className="residency-editor"><strong>Reversal residency</strong><p>Keep 6–12 decoded frames at both endpoints so a reversal can start without a visual jump.</p>{residency.endpoints.map((endpoint, endpointIndex) => {
        const stateBody = bodyUnitForState(project, endpoint.state);
        return <div key={endpointIndex}>
          <label><span>State</span><select value={endpoint.state} onChange={(event) => {
            const stateId = event.currentTarget.value;
            const port = bodyUnitForState(project, stateId)?.ports[0]?.id ?? "default";
            setResidency((current) => current === null ? current : updateResidencyEndpoint(current, endpointIndex, { state: stateId, port }));
          }}>{project.states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label>
          <label><span>Port</span><select value={endpoint.port} onChange={(event) => setResidency((current) => current === null ? current : updateResidencyEndpoint(current, endpointIndex, { port: event.currentTarget.value }))}>{stateBody?.ports.map((port) => <option key={port.id} value={port.id}>{port.id}</option>)}</select></label>
          <ScrubbableNumberField label="Frames" min={6} max={12} value={endpoint.frames} onChange={(frames) => setResidency((current) => current === null ? current : updateResidencyEndpoint(current, endpointIndex, { frames }))} />
        </div>;
      })}</div> : null}
      <div className="advanced-fields"><div className="aval-json-preview"><span>AVAL unit JSON</span><pre>{jsonPreview(unit)}</pre></div></div>
      <div className="inspector-commit"><button type="button" className="button button-primary" onClick={() => onApply({ name, range, ...(residency === null ? {} : { residency }) })}>Apply unit changes</button></div>
    </>
  );
}

export function Inspector({
  project,
  preparation,
  onApplyState,
  onApplyUnit,
  onApplyRoute,
  onDeleteRoute,
  onAddTransition,
  onRemoveTransition,
  onReviewPrep
}: InspectorProps) {
  const selection = project.editor.selection;
  const state = selection.kind === "state" ? project.states.find((candidate) => candidate.id === selection.id) : undefined;
  const body = state === undefined ? null : bodyUnitForState(project, state.id);
  const route = selection.kind === "route" ? project.routes.find((candidate) => candidate.id === selection.id) : undefined;
  const unit = selection.kind === "unit" ? project.units.find((candidate) => candidate.id === selection.id) : undefined;
  const title = selection.kind === "state" ? "Selected state" : selection.kind === "route" ? "Selected route" : "Selected unit";
  const selectionErrors = useMemo(() => [], [selection]);

  return (
    <aside className="unit-inspector" aria-label="Graph inspector">
      <header className="inspector-heading"><span>{title}</span><ChevronDownIcon /></header>
      {state !== undefined && body !== null ? <StateInspector project={project} state={state} body={body} onApply={(draft) => onApplyState(state.id, draft)} /> : null}
      {route !== undefined ? <RouteInspector project={project} route={route} onApply={onApplyRoute} onDelete={() => onDeleteRoute(route.id)} onAddTransition={(kind) => onAddTransition(route.id, kind)} onRemoveTransition={() => onRemoveTransition(route.id)} /> : null}
      {unit !== undefined ? <UnitInspector project={project} unit={unit} onApply={(update) => onApplyUnit(unit.id, update)} /> : null}

      <section className="inspector-group source-prep-group">
        <header>Source prep <ChevronDownIcon /></header>
        <button type="button" className="prep-card" onClick={onReviewPrep}>
          {preparation.status === "ready" ? <CheckIcon /> : <WarningIcon />}
          <span><strong>{preparation.label}</strong><small>{preparation.detail}</small></span>
        </button>
      </section>
      <section className="unit-validation"><header>Validation</header><p>{selectionErrors.length === 0 ? <><CheckIcon /> This committed graph is valid.</> : <><WarningIcon /> {selectionErrors[0]}</>}</p></section>
    </aside>
  );
}
