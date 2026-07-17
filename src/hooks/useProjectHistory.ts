import { useCallback, useState } from "react";

import type { StudioProjectV3 } from "../model/studio";

const HISTORY_LIMIT = 100;

interface HistoryState {
  readonly past: readonly StudioProjectV3[];
  readonly present: StudioProjectV3 | null;
  readonly future: readonly StudioProjectV3[];
  readonly revision: number;
  readonly savedRevision: number | null;
}

export interface ProjectHistory {
  readonly project: StudioProjectV3 | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly saved: boolean;
  readonly reset: (project: StudioProjectV3 | null) => void;
  readonly commit: (update: (project: StudioProjectV3) => StudioProjectV3) => void;
  readonly replaceTransient: (update: (project: StudioProjectV3) => StudioProjectV3) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly markSaved: () => void;
}

export function useProjectHistory(): ProjectHistory {
  const [state, setState] = useState<HistoryState>({ past: [], present: null, future: [], revision: 0, savedRevision: null });

  const reset = useCallback((project: StudioProjectV3 | null): void => {
    setState({ past: [], present: project, future: [], revision: 0, savedRevision: null });
  }, []);

  const commit = useCallback((update: (project: StudioProjectV3) => StudioProjectV3): void => {
    setState((current) => {
      if (current.present === null) return current;
      const next = update(current.present);
      if (next === current.present) return current;
      return {
        past: [...current.past.slice(-(HISTORY_LIMIT - 1)), current.present],
        present: next,
        future: [],
        revision: current.revision + 1,
        savedRevision: current.savedRevision
      };
    });
  }, []);

  const replaceTransient = useCallback((update: (project: StudioProjectV3) => StudioProjectV3): void => {
    setState((current) => current.present === null ? current : { ...current, present: update(current.present) });
  }, []);

  const undo = useCallback((): void => {
    setState((current) => {
      const previous = current.past.at(-1);
      if (previous === undefined || current.present === null) return current;
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
        revision: current.revision - 1,
        savedRevision: current.savedRevision
      };
    });
  }, []);

  const redo = useCallback((): void => {
    setState((current) => {
      const next = current.future[0];
      if (next === undefined || current.present === null) return current;
      return {
        past: [...current.past, current.present].slice(-HISTORY_LIMIT),
        present: next,
        future: current.future.slice(1),
        revision: current.revision + 1,
        savedRevision: current.savedRevision
      };
    });
  }, []);

  const markSaved = useCallback((): void => {
    setState((current) => ({ ...current, savedRevision: current.revision }));
  }, []);

  return {
    project: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    saved: state.savedRevision !== null && state.savedRevision === state.revision,
    reset,
    commit,
    replaceTransient,
    undo,
    redo,
    markSaved
  };
}
