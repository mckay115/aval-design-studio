import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { MotionGraphSnapshot } from "@pixel-point/aval-graph";

import { aspectRatioLabel, containMediaSize } from "../lib/mediaGeometry";
import { STUDIO_BINDING_SOURCES, timecodeForFrame, type AlphaPreview, type MediaDescriptor, type PreviewMode, type StudioBinding, type StudioBindingSource, type StudioState } from "../model/studio";
import { ArrowLeftIcon, ArrowRightIcon, PauseIcon, PlayIcon, SlidersIcon } from "./Icons";

interface VideoStageProps {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly descriptor: MediaDescriptor;
  readonly mode: PreviewMode;
  readonly alphaPreview: AlphaPreview;
  readonly activeState: StudioState | null;
  readonly states: readonly StudioState[];
  readonly bindings: readonly StudioBinding[];
  readonly graphSnapshot: MotionGraphSnapshot | null;
  readonly graphError: string | null;
  readonly currentFrame: number;
  readonly isPlaying: boolean;
  readonly status: "idle" | "probing" | "ready" | "unsupported";
  readonly error: string | null;
  readonly onMode: (mode: PreviewMode) => void;
  readonly onAlphaPreview: (mode: AlphaPreview) => void;
  readonly onTogglePlayback: () => void;
  readonly onStep: (direction: -1 | 1) => void;
  readonly onRequestState: (stateId: string) => void;
  readonly onSendEvent: (eventName: string) => void;
  readonly onSendBinding: (source: StudioBindingSource) => void;
  readonly onRestartGraph: () => void;
  readonly onToggleInteraction: () => void;
}

export function VideoStage({
  canvasRef,
  descriptor,
  mode,
  alphaPreview,
  activeState,
  states,
  bindings,
  graphSnapshot,
  graphError,
  currentFrame,
  isPlaying,
  status,
  error,
  onMode,
  onAlphaPreview,
  onTogglePlayback,
  onStep,
  onRequestState,
  onSendEvent,
  onSendBinding,
  onRestartGraph,
  onToggleInteraction
}: VideoStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [customEvent, setCustomEvent] = useState("");

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (stage === null || canvas === null) return;
    const fitCanvas = (): void => {
      const size = containMediaSize(descriptor.width, descriptor.height, stage.clientWidth, stage.clientHeight);
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;
    };
    fitCanvas();
    const observer = new ResizeObserver(fitCanvas);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [canvasRef, descriptor.height, descriptor.width]);

  return (
    <section className="preview-panel" aria-label="Media preview">
      <div className="preview-tabs" role="tablist" aria-label="Preview mode">
        {(["source", "unit", "interactive"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={mode === item}
            className={mode === item ? "is-selected" : ""}
            onClick={() => onMode(item)}
          >
            {item[0]!.toUpperCase()}{item.slice(1)}
          </button>
        ))}
      </div>
      <div ref={stageRef} className={`canvas-stage alpha-${alphaPreview}${mode === "interactive" ? " is-interactive" : ""}`}>
        <canvas
          ref={canvasRef}
          aria-label={`${descriptor.name} preview`}
          onPointerEnter={() => mode === "interactive" && onSendBinding("pointer.enter")}
          onPointerLeave={() => mode === "interactive" && onSendBinding("pointer.leave")}
        />
        <div className="preview-state-label"><i aria-hidden="true" />{activeState?.name ?? "Source"}</div>
        <div className="preview-resolution">{descriptor.width}×{descriptor.height}<span>· {aspectRatioLabel(descriptor.width, descriptor.height)}</span></div>
        {mode === "interactive" ? <div className="interaction-guide" role="status"><i aria-hidden="true" />Live graph · {graphSnapshot?.phase ?? "starting"}</div> : null}
        {mode === "interactive" ? <aside className="interaction-console" aria-label="Lifecycle demo tester">
          <header><div><strong>Lifecycle tester</strong><span>{graphSnapshot?.visualState ?? activeState?.id ?? "starting"} · {graphSnapshot?.phase ?? "preparing"}</span></div><button type="button" onClick={onRestartGraph}>Restart</button></header>
          <div className="interaction-test-section"><span>Request a state</span><div>{states.map((state) => <button key={state.id} type="button" className={state.id === graphSnapshot?.requestedState ? "is-active" : ""} onClick={() => onRequestState(state.id)}>{state.name}</button>)}</div></div>
          <div className="interaction-test-section"><span>Host controls</span><div>{STUDIO_BINDING_SOURCES.filter((source) => bindings.some((binding) => binding.source === source)).map((source) => <button key={source} type="button" onClick={() => onSendBinding(source)}>{source}</button>)}</div></div>
          <form onSubmit={(event) => { event.preventDefault(); if (customEvent.trim().length > 0) onSendEvent(customEvent.trim()); }}><input aria-label="Custom graph event" value={customEvent} placeholder="custom.event" onChange={(event) => setCustomEvent(event.currentTarget.value)} /><button type="submit">Send</button></form>
          {graphSnapshot?.activeEdgeId === null || graphSnapshot?.activeEdgeId === undefined ? null : <p>Route: <code>{graphSnapshot.activeEdgeId}</code></p>}
          {graphError === null ? null : <p className="interaction-error">{graphError}</p>}
        </aside> : null}
        {status === "probing" ? <div className="preview-message"><span className="spinner" />Analyzing source with MediaBunny…</div> : null}
        {error === null ? null : <div className="preview-message preview-error">{error}</div>}
      </div>
      <div className="preview-transport">
        <button type="button" aria-label="Previous frame" onClick={() => onStep(-1)}><ArrowLeftIcon /></button>
        <button className="play-control" type="button" aria-label={isPlaying ? "Pause" : "Play"} onClick={onTogglePlayback}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" aria-label="Next frame" onClick={() => onStep(1)}><ArrowRightIcon /></button>
        <div className="transport-time"><strong>{timecodeForFrame(currentFrame, descriptor.frameRate)}</strong><span>({currentFrame}f)</span></div>
        <div className="alpha-preview-control">
          <SlidersIcon />
          <select value={alphaPreview} aria-label="Alpha preview" onChange={(event) => onAlphaPreview(event.currentTarget.value as AlphaPreview)}>
            <option value="composite">Composite</option>
            <option value="rgb">RGB</option>
            <option value="alpha">Alpha</option>
            <option value="packed">Packed preview</option>
          </select>
        </div>
        <label className="interaction-toggle">
          <span>Test lifecycle</span>
          <input type="checkbox" checked={mode === "interactive"} onChange={onToggleInteraction} />
          <i aria-hidden="true" />
        </label>
      </div>
    </section>
  );
}
