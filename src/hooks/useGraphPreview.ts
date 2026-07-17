import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MotionGraphEngine,
  type GraphPresentation,
  type MotionGraphSnapshot
} from "@pixel-point/aval-graph";

import {
  fps,
  motionGraphDefinition,
  type StudioBindingSource,
  type StudioProjectV3
} from "../model/studio";

interface GraphPreview {
  readonly snapshot: MotionGraphSnapshot | null;
  readonly activeStateId: string;
  readonly error: string | null;
  readonly requestState: (stateId: string) => void;
  readonly sendEvent: (eventName: string) => void;
  readonly sendBinding: (source: StudioBindingSource) => void;
  readonly restart: () => void;
}

function absoluteFrame(project: StudioProjectV3, presentation: GraphPresentation | null): number | null {
  if (presentation === null || presentation.kind === "static") return null;
  const unit = project.units.find((candidate) => candidate.id === presentation.unitId);
  if (unit === undefined) return null;
  return Math.min(unit.range[1] - 1, unit.range[0] + presentation.frameIndex);
}

export function useGraphPreview(
  project: StudioProjectV3 | null,
  enabled: boolean,
  onPresentFrame: (frame: number) => void
): GraphPreview {
  const engineRef = useRef<MotionGraphEngine | null>(null);
  const projectRef = useRef(project);
  const presentRef = useRef(onPresentFrame);
  const ordinalRef = useRef(0n);
  const restartRef = useRef(0);
  const [restartSerial, setRestartSerial] = useState(0);
  const [snapshot, setSnapshot] = useState<MotionGraphSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  projectRef.current = project;
  presentRef.current = onPresentFrame;

  const graph = useMemo(() => project === null ? null : motionGraphDefinition(project), [
    project?.initialState,
    project?.states,
    project?.routes,
    project?.units
  ]);

  const publish = useCallback((presentation: GraphPresentation | null, nextSnapshot: MotionGraphSnapshot): void => {
    const currentProject = projectRef.current;
    if (currentProject !== null) {
      const frame = absoluteFrame(currentProject, presentation);
      if (frame !== null) presentRef.current(frame);
    }
    setSnapshot(nextSnapshot);
  }, []);

  useEffect(() => {
    if (!enabled || project === null || graph === null) {
      engineRef.current = null;
      ordinalRef.current = 0n;
      setSnapshot(null);
      return;
    }
    let cancelled = false;
    let timeout = 0;
    const engine = new MotionGraphEngine();
    engineRef.current = engine;
    ordinalRef.current = 0n;
    try {
      engine.install(graph);
      const started = engine.beginAnimated();
      publish(started.presentation, started.snapshot);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The interaction graph could not start.");
      return;
    }

    const frameDuration = Math.max(8, 1_000 / Math.max(1, fps(project.frameRate)));
    const tick = (): void => {
      if (cancelled || engineRef.current !== engine) return;
      try {
        const result = engine.tick({ contentOrdinal: ordinalRef.current });
        ordinalRef.current += 1n;
        publish(result.presentation, result.snapshot);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Interaction playback stopped.");
        return;
      }
      timeout = window.setTimeout(tick, frameDuration);
    };
    timeout = window.setTimeout(tick, frameDuration);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [enabled, graph, project?.frameRate, publish, restartSerial]);

  const operate = useCallback((operation: (engine: MotionGraphEngine) => ReturnType<MotionGraphEngine["tick"]>): void => {
    const engine = engineRef.current;
    if (engine === null) {
      setError("Turn on Test lifecycle to run this graph.");
      return;
    }
    try {
      const result = operation(engine);
      publish(result.presentation, result.snapshot);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The lifecycle event was rejected.");
    }
  }, [publish]);

  const requestState = useCallback((stateId: string): void => {
    operate((engine) => engine.request(stateId));
  }, [operate]);

  const sendEvent = useCallback((eventName: string): void => {
    operate((engine) => engine.send(eventName));
  }, [operate]);

  const sendBinding = useCallback((source: StudioBindingSource): void => {
    const binding = projectRef.current?.bindings.find((candidate) => candidate.source === source);
    if (binding === undefined) {
      setError(`No event is bound to ${source}.`);
      return;
    }
    sendEvent(binding.event);
  }, [sendEvent]);

  const restart = useCallback((): void => {
    restartRef.current += 1;
    setRestartSerial(restartRef.current);
  }, []);

  return {
    snapshot,
    activeStateId: snapshot?.visualState ?? project?.initialState ?? "",
    error,
    requestState,
    sendEvent,
    sendBinding,
    restart
  };
}
