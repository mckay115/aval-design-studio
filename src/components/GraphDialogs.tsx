import { useState } from "react";

import { stateDeleteImpact } from "../model/graphOperations";
import type { StudioProjectV3 } from "../model/studio";

interface AddInteractionDialogProps {
  readonly project: StudioProjectV3;
  readonly onApply: (from: string, to: string) => void;
  readonly onClose: () => void;
}

export function AddInteractionDialog({ project, onApply, onClose }: AddInteractionDialogProps) {
  const selectedStateId = project.editor.selection.kind === "state" ? project.editor.selection.id : project.initialState;
  const [from, setFrom] = useState(selectedStateId);
  const [to, setTo] = useState(project.states.find((state) => state.id !== selectedStateId)?.id ?? selectedStateId);
  const duplicate = project.routes.some((route) => route.from === from && route.to === to);
  const valid = from !== to && !duplicate;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="graph-modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="add-route-title">
        <header className="graph-modal-header"><div><span>State route</span><h2 id="add-route-title">Connect two states</h2><p>Create a direct route, then configure its event, timing, and transition in the inspector.</p></div><button type="button" aria-label="Close Add Interaction" onClick={onClose}>×</button></header>
        <div className="graph-modal-body route-builder">
          <label><span>From</span><select value={from} onChange={(event) => setFrom(event.currentTarget.value)}>{project.states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label>
          <b aria-hidden="true">→</b>
          <label><span>To</span><select value={to} onChange={(event) => setTo(event.currentTarget.value)}>{project.states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label>
          {duplicate ? <p>That route already exists. AVAL permits only one direct route between the same state pair.</p> : null}
          {project.states.length < 2 ? <p>Add a second state before creating an interaction.</p> : null}
        </div>
        <footer className="graph-modal-footer"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="button" className="button button-primary" disabled={!valid || project.states.length < 2} onClick={() => onApply(from, to)}>Create route</button></footer>
      </section>
    </div>
  );
}

interface DeleteStateDialogProps {
  readonly project: StudioProjectV3;
  readonly stateId: string;
  readonly onApply: (replacementInitialState?: string) => void;
  readonly onClose: () => void;
}

export function DeleteStateDialog({ project, stateId, onApply, onClose }: DeleteStateDialogProps) {
  const state = project.states.find((candidate) => candidate.id === stateId)!;
  const impact = stateDeleteImpact(project, stateId);
  const candidates = project.states.filter((candidate) => candidate.id !== stateId);
  const [replacement, setReplacement] = useState(candidates[0]?.id ?? "");
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="graph-modal compact-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-state-title">
        <header className="graph-modal-header"><div><span>Dependency review</span><h2 id="delete-state-title">Delete {state.name}?</h2><p>This is one undoable graph edit. Dependent references are removed together.</p></div><button type="button" aria-label="Close Delete State" onClick={onClose}>×</button></header>
        <div className="graph-modal-body delete-impact">
          <div><span>Routes removed</span><strong>{impact.routeCount}</strong></div>
          <div><span>Units removed</span><strong>{impact.unitCount}</strong></div>
          <div><span>Bindings removed</span><strong>{impact.bindingCount}</strong></div>
          {impact.needsInitialReplacement ? <label><span>New initial state</span><select value={replacement} onChange={(event) => setReplacement(event.currentTarget.value)}>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label> : null}
        </div>
        <footer className="graph-modal-footer"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="button" className="danger-button solid" onClick={() => onApply(impact.needsInitialReplacement ? replacement : undefined)}>Delete state</button></footer>
      </section>
    </div>
  );
}
