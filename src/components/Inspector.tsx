import type { PreparationPlan, StudioUnit, UnitKind } from "../model/studio";
import { CheckIcon, ChevronDownIcon, WarningIcon } from "./Icons";
import { ScrubbableNumberField } from "./ScrubbableNumberField";

interface InspectorProps {
  readonly unit: StudioUnit;
  readonly totalFrames: number;
  readonly preparation: PreparationPlan;
  readonly onChange: (update: Partial<Pick<StudioUnit, "name" | "kind" | "playback" | "range">>) => void;
  readonly onReviewPrep: () => void;
}

export function Inspector({ unit, totalFrames, preparation, onChange, onReviewPrep }: InspectorProps) {
  const duration = unit.range[1] - unit.range[0];
  return (
    <aside className="unit-inspector" aria-label="Selected unit inspector">
      <header className="inspector-heading"><span>Selected unit</span><ChevronDownIcon /></header>
      <div className="inspector-fields">
        <label><span>Name</span><input value={unit.name} maxLength={64} onChange={(event) => onChange({ name: event.currentTarget.value })} /></label>
        <label><span>Type</span><select value={unit.kind} onChange={(event) => onChange({ kind: event.currentTarget.value as UnitKind })}>
          <option value="body">Body</option>
          <option value="bridge">Bridge</option>
          <option value="one-shot">One shot</option>
          <option value="reversible">Reversible</option>
        </select></label>
        <label><span>Playback</span><select value={unit.playback} disabled={unit.kind !== "body"} onChange={(event) => onChange({ playback: event.currentTarget.value as "loop" | "finite" })}>
          <option value="loop">Loop</option>
          <option value="finite">Play once</option>
        </select></label>
      </div>

      <section className="inspector-group">
        <header>Timing <ChevronDownIcon /></header>
        <div className="inspector-fields">
          <ScrubbableNumberField label="Start frame" min={0} max={unit.range[1] - 1} value={unit.range[0]} onChange={(value) => onChange({ range: [value, unit.range[1]] })} />
          <ScrubbableNumberField label="End frame" min={unit.range[0] + 1} max={totalFrames} value={unit.range[1]} onChange={(value) => onChange({ range: [unit.range[0], value] })} />
          <div className="field-summary"><span>Duration</span><strong>{duration}f</strong></div>
        </div>
      </section>

      <section className="inspector-group">
        <header>Options <ChevronDownIcon /></header>
        <label className="check-row"><span>Allow rewind</span><input type="checkbox" defaultChecked /><i><CheckIcon /></i></label>
        <div className="inspector-fields compact">
          <label><span>Blend in</span><select defaultValue="0"><option value="0">0f</option><option value="2">2f</option><option value="4">4f</option></select></label>
          <label><span>Blend out</span><select defaultValue="0"><option value="0">0f</option><option value="2">2f</option><option value="4">4f</option></select></label>
        </div>
      </section>

      <section className="inspector-group source-prep-group">
        <header>Source prep <ChevronDownIcon /></header>
        <button type="button" className="prep-card" onClick={onReviewPrep}>
          {preparation.status === "ready" ? <CheckIcon /> : <WarningIcon />}
          <span><strong>{preparation.label}</strong><small>{preparation.detail}</small></span>
        </button>
      </section>

      <section className="unit-validation">
        <header>Validation</header>
        <p><CheckIcon /> This unit is valid.</p>
      </section>
    </aside>
  );
}
