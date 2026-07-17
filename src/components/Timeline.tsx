import { useCallback, useMemo, useRef, useState } from "react";

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
}

function percent(frame: number, totalFrames: number): number {
  return totalFrames <= 0 ? 0 : frame / totalFrames * 100;
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
  onResize
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"units" | "routes">("units");
  const [zoom, setZoom] = useState(100);
  const packed = useMemo(() => packUnitLanes(units), [units]);
  const laneCount = Math.max(1, ...packed.map(({ lane }) => lane + 1));
  const frameFromX = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width <= 0) return 0;
    return Math.min(totalFrames - 1, Math.max(0, Math.round((clientX - rect.left) / rect.width * totalFrames)));
  }, [totalFrames]);

  const startScrub = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    onSeek(frameFromX(event.clientX));
    const move = (moveEvent: PointerEvent): void => onSeek(frameFromX(moveEvent.clientX));
    const done = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", done);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done, { once: true });
  };

  const startResize = (event: React.PointerEvent<HTMLButtonElement>, unit: StudioUnit, edge: "start" | "end"): void => {
    event.preventDefault();
    event.stopPropagation();
    const move = (moveEvent: PointerEvent): void => onResize(unit.id, edge, frameFromX(moveEvent.clientX));
    const done = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", done);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done, { once: true });
  };

  const markers = Array.from({ length: 9 }, (_, index) => Math.round(totalFrames * index / 8));

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
        <div className="unit-track stacked" ref={trackRef} style={{ minHeight: `${Math.max(52, laneCount * 38 + 10)}px` }} onPointerDown={startScrub}>
          {packed.map(({ unit, lane }) => {
            const selected = unit.id === selectedId;
            return (
              <div
                key={unit.id}
                className={`timeline-unit color-${unit.color}${selected ? " is-selected" : ""}`}
                style={{ left: `${percent(unit.range[0], totalFrames)}%`, width: `${percent(unit.range[1] - unit.range[0], totalFrames)}%`, top: `${5 + lane * 38}px` }}
              >
                <button type="button" className="unit-select" onPointerDown={(event) => event.stopPropagation()} onClick={() => { onSelect(unit.id); onSeek(unit.range[0]); }}><small>{unit.kind === "one-shot" ? "intro" : unit.kind}</small>{unit.name}</button>
                {selected ? <>
                  <button type="button" className="resize-handle start" aria-label={`Resize start of ${unit.name}`} onPointerDown={(event) => startResize(event, unit, "start")}>Ⅱ</button>
                  <button type="button" className="resize-handle end" aria-label={`Resize end of ${unit.name}`} onPointerDown={(event) => startResize(event, unit, "end")}>Ⅱ</button>
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
        className="filmstrip"
        role="slider"
        aria-label="Video playhead"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, totalFrames - 1)}
        aria-valuenow={currentFrame}
        tabIndex={0}
        onPointerDown={startScrub}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            onSeek(currentFrame + (event.key === "ArrowLeft" ? -1 : 1));
          }
        }}
      >
        <div className="thumbnail-row" aria-hidden="true">
          {thumbnails.length > 0
            ? thumbnails.map((thumbnail, index) => <img key={index} src={thumbnail} alt="" />)
            : Array.from({ length: 14 }, (_, index) => <span key={index} />)}
        </div>
        <div className="playhead" style={{ left: `${percent(currentFrame, totalFrames)}%` }} aria-hidden="true"><i /><b>{currentFrame}f</b></div>
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
