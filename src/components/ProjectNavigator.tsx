import { useState } from "react";

import type { StudioProjectV3 } from "../model/studio";
import { FilmIcon, PlusIcon } from "./Icons";

interface ProjectNavigatorProps {
  readonly project: StudioProjectV3;
  readonly activeStateId: string;
  readonly thumbnail: string | null;
  readonly onSelectState: (stateId: string) => void;
  readonly onPreviewState: (stateId: string) => void;
  readonly onSelectRoute: (routeId: string) => void;
  readonly onTrigger: (event: string) => void;
  readonly onAddState: () => void;
  readonly onAddInteraction: () => void;
  readonly onDuplicateState: (stateId: string) => void;
  readonly onSetInitialState: (stateId: string) => void;
  readonly onDeleteState: (stateId: string) => void;
  readonly onUnavailableAction: (message: string) => void;
}

export function ProjectNavigator({
  project,
  activeStateId,
  thumbnail,
  onSelectState,
  onPreviewState,
  onSelectRoute,
  onTrigger,
  onAddState,
  onAddInteraction,
  onDuplicateState,
  onSetInitialState,
  onDeleteState,
  onUnavailableAction
}: ProjectNavigatorProps) {
  const [stateMenu, setStateMenu] = useState<string | null>(null);
  const source = project.sources[0]!;
  const descriptor = source.descriptor;
  const selected = project.editor.selection;

  return (
    <aside className="project-navigator" aria-label="Project navigator">
      <section className="nav-section source-section">
        <header><span>Project</span><button type="button" aria-label="Add source" onClick={() => onUnavailableAction("Use Import Video to replace the current source. Multi-source projects are not part of AVAL Studio v3.")}><PlusIcon /></button></header>
        <div className="source-row">
          <div className="source-thumbnail">{thumbnail === null ? <FilmIcon /> : <img src={thumbnail} alt="" />}</div>
          <div><strong>{descriptor.name}</strong><span>{descriptor.width}×{descriptor.height} · {(descriptor.frameRate.numerator / descriptor.frameRate.denominator).toFixed(2)} fps</span></div>
        </div>
        <div className={`prep-summary prep-${source.preparation.status}`}><i aria-hidden="true" /><div><strong>{source.preparation.label}</strong><span>{source.preparation.mode === "pass-through" ? "Original stays untouched" : source.preparation.output.toUpperCase()}</span></div></div>
      </section>

      <section className="nav-section states-section">
        <header><span>States <small>({project.states.length}/32)</small></span><button type="button" aria-label="Add state" onClick={onAddState}><PlusIcon /></button></header>
        <div className="nav-list">
          {project.states.map((state) => (
            <div className="nav-state-wrap" key={state.id}>
              <button className={selected.kind === "state" && selected.id === state.id ? "nav-state is-selected" : "nav-state"} type="button" onClick={() => onSelectState(state.id)} onDoubleClick={() => onPreviewState(state.id)}>
                <i className={`state-dot color-${state.color}`} aria-hidden="true" />
                <span>{state.name}</span>
                {state.id === project.initialState ? <small title="Initial state">Initial</small> : null}
                {state.id === activeStateId ? <em>Active</em> : null}
              </button>
              <button type="button" className="state-more" aria-label={`Actions for ${state.name}`} aria-expanded={stateMenu === state.id} onClick={() => setStateMenu((current) => current === state.id ? null : state.id)}>•••</button>
              {stateMenu === state.id ? <div className="state-menu">
                <button type="button" onClick={() => { onPreviewState(state.id); setStateMenu(null); }}>Preview state</button>
                <button type="button" onClick={() => { onDuplicateState(state.id); setStateMenu(null); }}>Duplicate</button>
                <button type="button" disabled={state.id === project.initialState} onClick={() => { onSetInitialState(state.id); setStateMenu(null); }}>Set as initial</button>
                <button type="button" className="danger-link" disabled={project.states.length === 1} onClick={() => { onDeleteState(state.id); setStateMenu(null); }}>Delete…</button>
              </div> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="nav-section interactions-section">
        <header><span>Lifecycle <small>({project.routes.length}/64 routes)</small></span><button type="button" aria-label="Add route" onClick={onAddInteraction}><PlusIcon /></button></header>
        {project.routes.length === 0 ? <button type="button" className="empty-interactions" onClick={onAddInteraction}><PlusIcon /><span><strong>Add a route</strong><small>Connect states and decide what starts the change.</small></span></button> : (
          <div className="interaction-list">
            {project.routes.map((route) => {
              const destination = project.states.find((state) => state.id === route.to);
              const sourceState = project.states.find((state) => state.id === route.from);
              const label = route.trigger?.type === "event" ? route.trigger.name : route.trigger?.type === "completion" ? "On completion" : "State request";
              return (
                <button key={route.id} className={selected.kind === "route" && selected.id === route.id ? "is-selected" : ""} type="button" onClick={() => onSelectRoute(route.id)} onDoubleClick={() => route.trigger?.type === "event" && onTrigger(route.trigger.name)}>
                  <span className="cursor-glyph" aria-hidden="true">↗</span>
                  <span><small>{sourceState?.name ?? route.from} → {destination?.name ?? route.to}</small>{label}</span>
                  <i className={`state-dot color-${destination?.color ?? "blue"}`} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </aside>
  );
}
