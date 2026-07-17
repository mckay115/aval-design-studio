import { useLayoutEffect, useRef, type RefObject } from "react";

import { aspectRatioLabel, containMediaSize } from "../lib/mediaGeometry";
import { timecodeForFrame, type AlphaPreview, type MediaDescriptor, type PreviewMode, type StudioState } from "../model/studio";
import { ArrowLeftIcon, ArrowRightIcon, PauseIcon, PlayIcon, SlidersIcon } from "./Icons";

interface VideoStageProps {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly descriptor: MediaDescriptor;
  readonly mode: PreviewMode;
  readonly alphaPreview: AlphaPreview;
  readonly activeState: StudioState | null;
  readonly currentFrame: number;
  readonly isPlaying: boolean;
  readonly status: "idle" | "probing" | "ready" | "unsupported";
  readonly error: string | null;
  readonly onMode: (mode: PreviewMode) => void;
  readonly onAlphaPreview: (mode: AlphaPreview) => void;
  readonly onTogglePlayback: () => void;
  readonly onStep: (direction: -1 | 1) => void;
  readonly onTrigger: (eventName: string) => void;
  readonly onToggleInteraction: () => void;
}

export function VideoStage({
  canvasRef,
  descriptor,
  mode,
  alphaPreview,
  activeState,
  currentFrame,
  isPlaying,
  status,
  error,
  onMode,
  onAlphaPreview,
  onTogglePlayback,
  onStep,
  onTrigger,
  onToggleInteraction
}: VideoStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);

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
          onPointerEnter={() => mode === "interactive" && onTrigger("hover.enter")}
          onPointerLeave={() => mode === "interactive" && onTrigger("hover.leave")}
        />
        <div className="preview-state-label"><i aria-hidden="true" />{activeState?.name ?? "Source"}</div>
        <div className="preview-resolution">{descriptor.width}×{descriptor.height}<span>· {aspectRatioLabel(descriptor.width, descriptor.height)}</span></div>
        {mode === "interactive" ? <div className="interaction-guide" role="status"><i aria-hidden="true" />Live test · Move the pointer over the video</div> : null}
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
          <span>Test interactions</span>
          <input type="checkbox" checked={mode === "interactive"} onChange={onToggleInteraction} />
          <i aria-hidden="true" />
        </label>
      </div>
    </section>
  );
}
