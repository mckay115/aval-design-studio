import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { timecodeForFrame, type Rational, type StudioRoute, type StudioUnit } from "../model/studio";
import { SlidersIcon } from "./Icons";

interface TimelineProps {
  readonly units: readonly StudioUnit[];
  readonly routes: readonly StudioRoute[];
  readonly selectedId: string;
  readonly currentFrame: number;
  readonly totalFrames: number;
  readonly frameRate: Rational;
  readonly thumbnails: readonly string[];
  readonly onSelect: (id: string) => void;
  readonly onSelectRoute: (id: string) => void;
  readonly onSeek: (frame: number) => void;
  readonly onResize: (id: string, edge: "start" | "end", frame: number) => void;
  readonly onResizePreview: (frame: number) => void;
  readonly onResizePreviewEnd: () => void;
}

interface ResizeDrag {
  readonly pointerId: number;
  readonly target: HTMLButtonElement;
  readonly unit: StudioUnit;
  readonly edge: "start" | "end";
  frame: number;
}

function percent(frame: number, totalFrames: number): number {
  return totalFrames <= 0 ? 0 : frame / totalFrames * 100;
}

export function frameForClientX(clientX: number, left: number, width: number, totalFrames: number): number {
  if (width <= 0 || totalFrames <= 1) return 0;
  const progress = (clientX - left) / width;
  return Math.min(totalFrames - 1, Math.max(0, Math.floor(progress * totalFrames)));
}

export function Timeline({
  units,
  routes,
  selectedId,
  currentFrame,
  totalFrames,
  frameRate,
  thumbnails,
  onSelect,
  onSelectRoute,
  onSeek,
  onResize,
  onResizePreview,
  onResizePreviewEnd
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubPointerRef = useRef<number | null>(null);
  const scrubTargetRef = useRef<HTMLDivElement | null>(null);
  const resizeDragRef = useRef<ResizeDrag | null>(null);
  const resizePreviewEndRef = useRef(onResizePreviewEnd);
  const [scrubFrame, setScrubFrame] = useState<number | null>(null);
  const [view, setView] = useState<"units" | "routes">("units");
  const [zoom, setZoom] = useState(100);
  const [scrubbing, setScrubbing] = useState(false);
  const [resizeDraft, setResizeDraft] = useState<{ readonly unitId: string; readonly range: readonly [number, number] } | null>(null);
  resizePreviewEndRef.current = onResizePreviewEnd;
  const packed = useMemo(() => packUnitLanes(units), [units]);
  const laneCount = Math.max(1, ...packed.map(({ lane }) => lane + 1));
  const boundaryFrameFromX = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width <= 0) return 0;
    const progress = (clientX - rect.left) / rect.width;
    return Math.min(totalFrames, Math.max(0, Math.round(progress * totalFrames)));
  }, [totalFrames]);

  const seekOnSurface = useCallback((surface: HTMLDivElement, clientX: number): void => {
    const rect = surface.getBoundingClientRect();
    const frame = frameForClientX(clientX, rect.left, rect.width, totalFrames);
    setScrubFrame(frame);
    onSeek(frame);
  }, [onSeek, totalFrames]);

  useEffect(() => {
    if (!scrubbing && scrubFrame === currentFrame) setScrubFrame(null);
  }, [currentFrame, scrubFrame, scrubbing]);

  const clearScrub = useCallback((): void => {
    scrubPointerRef.current = null;
    scrubTargetRef.current = null;
    document.body.classList.remove("is-timeline-scrubbing");
    setScrubbing(false);
  }, []);

  useEffect(() => () => {
    document.body.classList.remove("is-timeline-scrubbing", "is-timeline-resizing");
    if (resizeDragRef.current !== null) resizePreviewEndRef.current();
  }, []);

  const startScrub = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || scrubPointerRef.current !== null) return;
    event.preventDefault();
    const surface = event.currentTarget;
    scrubPointerRef.current = event.pointerId;
    scrubTargetRef.current = surface;
    surface.setPointerCapture(event.pointerId);
    document.body.classList.add("is-timeline-scrubbing");
    setScrubbing(true);
    seekOnSurface(surface, event.clientX);
  }, [seekOnSurface]);

  const moveScrub = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (scrubPointerRef.current !== event.pointerId || scrubTargetRef.current !== event.currentTarget) return;
    event.preventDefault();
    seekOnSurface(event.currentTarget, event.clientX);
  }, [seekOnSurface]);

  const endScrub = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (scrubPointerRef.current !== event.pointerId || scrubTargetRef.current !== event.currentTarget) return;
    event.preventDefault();
    seekOnSurface(event.currentTarget, event.clientX);
    const surface = event.currentTarget;
    clearScrub();
    if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
  }, [clearScrub, seekOnSurface]);

  const cancelScrub = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (scrubPointerRef.current !== event.pointerId) return;
    clearScrub();
    setScrubFrame(null);
  }, [clearScrub]);

  const previewResizeFrame = useCallback((drag: ResizeDrag, frame: number): void => {
    const clamped = drag.edge === "start"
      ? Math.min(drag.unit.range[1] - 1, Math.max(0, frame))
      : Math.min(totalFrames, Math.max(drag.unit.range[0] + 1, frame));
    drag.frame = clamped;
    const range: readonly [number, number] = drag.edge === "start"
      ? [clamped, drag.unit.range[1]]
      : [drag.unit.range[0], clamped];
    setResizeDraft({ unitId: drag.unit.id, range });
    onResizePreview(drag.edge === "start" ? clamped : clamped - 1);
  }, [onResizePreview, totalFrames]);

  const clearResize = useCallback((): void => {
    resizeDragRef.current = null;
    setResizeDraft(null);
    document.body.classList.remove("is-timeline-resizing");
    onResizePreviewEnd();
  }, [onResizePreviewEnd]);

  const startResize = useCallback((event: React.PointerEvent<HTMLButtonElement>, unit: StudioUnit, edge: "start" | "end"): void => {
    if (event.button !== 0 || resizeDragRef.current !== null) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    const frame = edge === "start" ? unit.range[0] : unit.range[1];
    const drag: ResizeDrag = { pointerId: event.pointerId, target, unit, edge, frame };
    resizeDragRef.current = drag;
    target.setPointerCapture(event.pointerId);
    document.body.classList.add("is-timeline-resizing");
    previewResizeFrame(drag, frame);
  }, [previewResizeFrame]);

  const moveResize = useCallback((event: React.PointerEvent<HTMLButtonElement>): void => {
    const drag = resizeDragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId || drag.target !== event.currentTarget) return;
    event.preventDefault();
    event.stopPropagation();
    previewResizeFrame(drag, boundaryFrameFromX(event.clientX));
  }, [boundaryFrameFromX, previewResizeFrame]);

  const endResize = useCallback((event: React.PointerEvent<HTMLButtonElement>): void => {
    const drag = resizeDragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId || drag.target !== event.currentTarget) return;
    event.preventDefault();
    event.stopPropagation();
    previewResizeFrame(drag, boundaryFrameFromX(event.clientX));
    const frame = drag.frame;
    const target = event.currentTarget;
    onResize(drag.unit.id, drag.edge, frame);
    clearResize();
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  }, [boundaryFrameFromX, clearResize, onResize, previewResizeFrame]);

  const cancelResize = useCallback((event: React.PointerEvent<HTMLButtonElement>): void => {
    const drag = resizeDragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    clearResize();
  }, [clearResize]);

  const markers = Array.from({ length: 9 }, (_, index) => Math.round(totalFrames * index / 8));
  const displayedFrame = scrubFrame ?? currentFrame;

  return (
    <section className="timeline-panel" aria-label="Unit timeline">
      <div className="timeline-toolbar">
        <div className="mini-tabs">
          <button type="button" className={view === "units" ? "is-selected" : ""} onClick={() => setView("units")}>Units</button>
          <button type="button" className={view === "routes" ? "is-selected" : ""} onClick={() => setView("routes")}>Routes</button>
        </div>
        <div className="timeline-tools">
          <select aria-label="Timeline snapping" defaultValue="frame"><option value="frame">Snap: frame</option><option value="unit">Snap: unit</option><option value="off">Snap: off</option></select>
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(50, value - 10))}>−</button>
          <span>{zoom}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(200, value + 10))}>+</button>
          <button type="button" aria-label="Timeline settings"><SlidersIcon /></button>
        </div>
      </div>

      <div className="timeline-ruler" aria-hidden="true">
        {markers.map((frame) => <span key={frame} style={{ left: `${percent(frame, totalFrames)}%` }}>{frame}</span>)}
      </div>

      {view === "units" ? (
        <div className="unit-track stacked" ref={trackRef} style={{ minHeight: `${Math.max(52, laneCount * 38 + 10)}px` }} onPointerDown={startScrub} onPointerMove={moveScrub} onPointerUp={endScrub} onPointerCancel={cancelScrub} onLostPointerCapture={cancelScrub}>
          {packed.map(({ unit, lane }) => {
            const selected = unit.id === selectedId;
            const range = resizeDraft?.unitId === unit.id ? resizeDraft.range : unit.range;
            return (
              <div
                key={unit.id}
                className={`timeline-unit color-${unit.color}${selected ? " is-selected" : ""}`}
                style={{ left: `${percent(range[0], totalFrames)}%`, width: `${percent(range[1] - range[0], totalFrames)}%`, top: `${5 + lane * 38}px` }}
              >
                <button type="button" className="unit-select" onPointerDown={(event) => event.stopPropagation()} onClick={() => { onSelect(unit.id); onSeek(unit.range[0]); }}><small>{unit.kind === "one-shot" ? "intro" : unit.kind}</small>{unit.name}</button>
                {selected ? <>
                  <button type="button" className="resize-handle start" aria-label={`Resize start of ${unit.name}`} onPointerDown={(event) => startResize(event, unit, "start")} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={cancelResize} onLostPointerCapture={cancelResize}>Ⅱ</button>
                  <button type="button" className="resize-handle end" aria-label={`Resize end of ${unit.name}`} onPointerDown={(event) => startResize(event, unit, "end")} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={cancelResize} onLostPointerCapture={cancelResize}>Ⅱ</button>
                </> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="route-track">
          {routes.length === 0 ? <p>No routes yet. Use + next to Interactions to connect states.</p> : routes.map((route) => <button type="button" className={route.id === selectedId ? "is-selected" : ""} key={route.id} onClick={() => onSelectRoute(route.id)}><span>{route.from}</span><b>→</b><span>{route.to}</span><em>{route.trigger?.type === "event" ? route.trigger.name : route.trigger?.type === "completion" ? "completion" : "direct request"}</em></button>)}
        </div>
      )}

      <div
        className={`filmstrip${scrubbing ? " is-scrubbing" : ""}`}
        role="slider"
        aria-label="Video playhead"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, totalFrames - 1)}
        aria-valuenow={displayedFrame}
        tabIndex={0}
        onPointerDown={startScrub}
        onPointerMove={moveScrub}
        onPointerUp={endScrub}
        onPointerCancel={cancelScrub}
        onLostPointerCapture={cancelScrub}
        onDragStart={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            onSeek(currentFrame + (event.key === "ArrowLeft" ? -1 : 1));
          }
        }}
      >
        <div className="thumbnail-row" aria-hidden="true">
          {thumbnails.length > 0
            ? thumbnails.map((thumbnail, index) => <img key={index} src={thumbnail} alt="" draggable={false} />)
            : Array.from({ length: 14 }, (_, index) => <span key={index} />)}
        </div>
        <div className="playhead" style={{ left: `${percent(displayedFrame, totalFrames)}%` }} aria-hidden="true"><i /><b>{displayedFrame}f</b></div>
      </div>

      <div className="time-ruler" aria-hidden="true">
        {markers.slice(0, -1).map((frame) => <span key={frame} style={{ left: `${percent(frame, totalFrames)}%` }}>{timecodeForFrame(frame, frameRate)}</span>)}
      </div>
    </section>
  );
}

export function packUnitLanes(units: readonly StudioUnit[]): readonly { readonly unit: StudioUnit; readonly lane: number }[] {
  const sorted = [...units].sort((left, right) => left.range[0] - right.range[0] || left.range[1] - right.range[1] || left.id.localeCompare(right.id));
  const laneEnds: number[] = [];
  return sorted.map((unit) => {
    let lane = laneEnds.findIndex((end) => end <= unit.range[0]);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(unit.range[1]);
    } else {
      laneEnds[lane] = unit.range[1];
    }
    return { unit, lane };
  });
}
