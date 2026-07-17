import { useEffect, useMemo, useState } from "react";

import {
  applyStateTemplate,
  STATE_TEMPLATES,
  StudioMutationError,
  templateRangeSlots,
  type StateTemplateId,
  type TemplateApplyMode,
  type TemplateRanges
} from "../model/graphOperations";
import type { StudioProjectV3 } from "../model/studio";
import { ScrubbableNumberField } from "./ScrubbableNumberField";

interface AddStateDialogProps {
  readonly project: StudioProjectV3;
  readonly onApply: (project: StudioProjectV3) => void;
  readonly onClose: () => void;
}

function initialRanges(project: StudioProjectV3, templateId: StateTemplateId, mode: TemplateApplyMode): TemplateRanges {
  return Object.fromEntries(templateRangeSlots(project, templateId, mode).map((slot) => [slot.id, slot.range]));
}

export function AddStateDialog({ project, onApply, onClose }: AddStateDialogProps) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [templateId, setTemplateId] = useState<StateTemplateId>("loop");
  const [mode, setMode] = useState<TemplateApplyMode>("append");
  const [ranges, setRanges] = useState<TemplateRanges>(() => initialRanges(project, templateId, mode));
  const slots = useMemo(() => templateRangeSlots(project, templateId, mode), [mode, project, templateId]);

  useEffect(() => {
    setRanges(initialRanges(project, templateId, mode));
  }, [mode, project, templateId]);

  const candidate = useMemo(() => {
    try {
      return { project: applyStateTemplate(project, templateId, mode, ranges), error: null };
    } catch (reason) {
      return {
        project: null,
        error: reason instanceof StudioMutationError ? reason.issues[0] : reason instanceof Error ? reason.message : "This template cannot be applied."
      };
    }
  }, [mode, project, ranges, templateId]);
  const definition = STATE_TEMPLATES.find((template) => template.id === templateId)!;
  const stateDelta = (candidate.project?.states.length ?? project.states.length) - project.states.length;
  const routeDelta = (candidate.project?.routes.length ?? project.routes.length) - project.routes.length;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="graph-modal state-template-modal" role="dialog" aria-modal="true" aria-labelledby="add-state-title">
        <header className="graph-modal-header">
          <div>
            <span>Graph builder</span>
            <h2 id="add-state-title">Add states from a proven pattern</h2>
            <p>Choose a starting point, map its clips, then review the exact graph change.</p>
          </div>
          <button type="button" aria-label="Close Add State" onClick={onClose}>×</button>
        </header>

        <div className="wizard-steps" aria-label="Add state progress">
          {(["Template", "Ranges", "Review"] as const).map((label, index) => (
            <button key={label} type="button" className={step === index ? "is-active" : step > index ? "is-complete" : ""} onClick={() => index <= step && setStep(index as 0 | 1 | 2)}>
              <b>{index + 1}</b><span>{label}</span>
            </button>
          ))}
        </div>

        <div className="graph-modal-body">
          {step === 0 ? (
            <>
              <div className="template-mode-row">
                <div><strong>Apply as</strong><span>Preview before anything changes.</span></div>
                <div className="segmented-control">
                  <button type="button" className={mode === "append" ? "is-selected" : ""} onClick={() => setMode("append")}>Append</button>
                  <button type="button" className={mode === "replace" ? "is-selected" : ""} onClick={() => setMode("replace")}>Replace graph</button>
                </div>
              </div>
              <div className="template-grid">
                {STATE_TEMPLATES.map((template) => (
                  <button key={template.id} type="button" className={template.id === templateId ? "template-card is-selected" : "template-card"} onClick={() => setTemplateId(template.id)}>
                    <span>{template.category}</span>
                    <div className="template-diagram" aria-hidden="true">{template.diagram}</div>
                    <strong>{template.name}</strong>
                    <p>{template.description}</p>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <div className="range-mapper">
              <div className="modal-section-intro">
                <div className="template-diagram large" aria-hidden="true">{definition.diagram}</div>
                <div><h3>Map source ranges</h3><p>Ranges are zero-based and half-open. Overlap is allowed because AVAL units are independent decode boundaries.</p></div>
              </div>
              <div className="range-slot-list">
                {slots.map((slot) => {
                  const value = ranges[slot.id] ?? slot.range;
                  return (
                    <div className="range-slot" key={slot.id}>
                      <div className={`unit-role role-${slot.role}`}><i />{slot.role === "one-shot" ? "Intro" : slot.role}</div>
                      <div><strong>{slot.label}</strong><span>{value[1] - value[0]} frames · includes {value[0]}–{value[1] - 1}</span></div>
                      <ScrubbableNumberField label="Start" min={0} max={Math.max(0, project.sources[0]!.descriptor.totalFrames - 1)} value={value[0]} onChange={(start) => setRanges((current) => ({ ...current, [slot.id]: [start, slot.singleFrame === true ? start + 1 : Math.max(start + 1, value[1])] }))} />
                      <ScrubbableNumberField label="End (exclusive)" min={value[0] + 1} max={project.sources[0]!.descriptor.totalFrames} value={value[1]} onChange={(end) => setRanges((current) => ({ ...current, [slot.id]: [value[0], slot.singleFrame === true ? value[0] + 1 : end] }))} />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="template-review">
              <div className="modal-section-intro">
                <div className="template-diagram large" aria-hidden="true">{definition.diagram}</div>
                <div><h3>{definition.name}</h3><p>{definition.description}</p></div>
              </div>
              <div className="review-summary-grid">
                <div><span>Mode</span><strong>{mode === "append" ? "Append to selected state" : "Replace current graph"}</strong></div>
                <div><span>States</span><strong>{stateDelta >= 0 ? "+" : ""}{stateDelta}</strong></div>
                <div><span>Routes</span><strong>{routeDelta >= 0 ? "+" : ""}{routeDelta}</strong></div>
                <div><span>Units mapped</span><strong>{slots.length}</strong></div>
              </div>
              <div className="graph-diff-list">
                {candidate.project?.states.map((state) => (
                  <div key={state.id}><i className={`state-dot color-${state.color}`} /><strong>{state.name}</strong><code>{state.id}</code>{state.id === candidate.project?.initialState ? <span>Initial</span> : null}</div>
                ))}
              </div>
              {candidate.error === null ? <p className="valid-change">✓ This change produces a valid AVAL 1.0 graph.</p> : <p className="invalid-change">{candidate.error}</p>}
            </div>
          ) : null}
        </div>

        <footer className="graph-modal-footer">
          <button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>
          {step > 0 ? <button type="button" className="button button-secondary" onClick={() => setStep((step - 1) as 0 | 1)}>Back</button> : null}
          {step < 2
            ? <button type="button" className="button button-primary" onClick={() => setStep((step + 1) as 1 | 2)}>Continue</button>
            : <button type="button" className="button button-primary" disabled={candidate.project === null} onClick={() => candidate.project !== null && onApply(candidate.project)}>Apply template</button>}
        </footer>
      </section>
    </div>
  );
}
