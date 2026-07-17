import type { StudioProjectV2 } from "../model/studio";
import { FilmIcon, PlusIcon } from "./Icons";

interface ProjectNavigatorProps {
  readonly project: StudioProjectV2;
  readonly activeStateId: string;
  readonly selectedStateId: string;
  readonly thumbnail: string | null;
  readonly onSelectState: (stateId: string) => void;
  readonly onTrigger: (event: string) => void;
  readonly onUnavailableAction: (message: string) => void;
}

export function ProjectNavigator({
  project,
  activeStateId,
  selectedStateId,
  thumbnail,
  onSelectState,
  onTrigger,
  onUnavailableAction
}: ProjectNavigatorProps) {
  const source = project.sources[0]!;
  const descriptor = source.descriptor;
  const eventRoutes = project.routes.filter((route) => route.trigger.type === "event");

  return (
    <aside className="project-navigator" aria-label="Project navigator">
      <section className="nav-section source-section">
        <header><span>Project</span><button type="button" aria-label="Add source" onClick={() => onUnavailableAction("Multi-source import is available from the Import Video action.")}><PlusIcon /></button></header>
        <div className="source-row">
          <div className="source-thumbnail">
            {thumbnail === null ? <FilmIcon /> : <img src={thumbnail} alt="" />}
          </div>
          <div>
            <strong>{descriptor.name}</strong>
            <span>{descriptor.width}×{descriptor.height} · {(descriptor.frameRate.numerator / descriptor.frameRate.denominator).toFixed(2)} fps</span>
          </div>
        </div>
        <div className={`prep-summary prep-${source.preparation.status}`}>
          <i aria-hidden="true" />
          <div><strong>{source.preparation.label}</strong><span>{source.preparation.mode === "pass-through" ? "Original stays untouched" : source.preparation.output.toUpperCase()}</span></div>
        </div>
      </section>

      <section className="nav-section states-section">
        <header><span>States <small>(units)</small></span><button type="button" aria-label="Add state" onClick={() => onUnavailableAction("Add State will be enabled after the first graph migration pass.")}><PlusIcon /></button></header>
        <div className="nav-list">
          {project.states.map((state) => (
            <button
              key={state.id}
              className={state.id === selectedStateId ? "nav-state is-selected" : "nav-state"}
              type="button"
              onClick={() => onSelectState(state.id)}
            >
              <i className={`state-dot color-${state.color}`} aria-hidden="true" />
              <span>{state.name}</span>
              {state.id === activeStateId ? <em>Active</em> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="nav-section interactions-section">
        <header><span>Interactions</span><button type="button" aria-label="Add interaction" onClick={() => onUnavailableAction("Select a state route to add another interaction.")}><PlusIcon /></button></header>
        <div className="interaction-list">
          {eventRoutes.map((route) => {
            const destination = project.states.find((state) => state.id === route.to);
            const label = route.trigger.type === "event" ? route.trigger.name.replace("hover.", "Pointer ") : "Complete";
            return (
              <button key={route.id} type="button" onClick={() => route.trigger.type === "event" && onTrigger(route.trigger.name)}>
                <span className="cursor-glyph" aria-hidden="true">↖</span>
                <span>{label}</span>
                <b aria-hidden="true">→</b>
                <i className={`state-dot color-${destination?.color ?? "blue"}`} aria-hidden="true" />
                <strong>{destination?.name ?? route.to}</strong>
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
