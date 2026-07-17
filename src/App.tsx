import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AddStateDialog } from "./components/AddStateDialog";
import { BuildDrawer } from "./components/BuildDrawer";
import { AddInteractionDialog, DeleteStateDialog } from "./components/GraphDialogs";
import { FilmIcon } from "./components/Icons";
import { Inspector, type StateInspectorDraft, type UnitInspectorUpdate } from "./components/Inspector";
import { ProjectNavigator } from "./components/ProjectNavigator";
import { StatusBar } from "./components/StatusBar";
import { Timeline } from "./components/Timeline";
import { TopBar } from "./components/TopBar";
import { VideoStage } from "./components/VideoStage";
import { useGraphPreview } from "./hooks/useGraphPreview";
import { useMediaSession } from "./hooks/useMediaSession";
import { useProjectHistory } from "./hooks/useProjectHistory";
import { useUpdater } from "./hooks/useUpdater";
import {
  chooseBundleDestination,
  compileAvalBundle,
  isTauriRuntime,
  openStudioProject,
  pickVideo,
  pickedVideoFromPath,
  readBuildInfo,
  saveStudioProject,
  toolchainHealth,
  type BuildInfo,
  type CompileResult,
  type PickedVideo,
  type ToolchainHealth
} from "./lib/desktop";
import {
  addDirectRoute,
  addTransitionToRoute,
  applyStateEdit,
  deleteRoute,
  deleteState,
  duplicateState,
  removeRouteTransition,
  replaceRoute,
  requireValidProject,
  selectRouteInProject,
  selectStateInProject,
  selectUnitInProject,
  setInitialState,
  StudioMutationError,
  updateBinding
} from "./model/graphOperations";
import {
  bodyUnitForState,
  createStudioProject,
  preparationPlanFor,
  selectedUnit as projectSelectedUnit,
  toAvalProject,
  updateUnit,
  validationItems,
  type AlphaPreview,
  type PreviewMode,
  type StudioBindingSource,
  type StudioBuildSettings,
  type StudioProjectV3,
  type StudioRoute
} from "./model/studio";
import { parseStudioProjectDocument } from "./model/studioDocument";
import "./styles.css";

const UNAVAILABLE_TOOLCHAIN: ToolchainHealth = {
  available: false,
  version: null,
  ffmpeg: false,
  ffprobe: false,
  encoders: [],
  message: "Build Bundle is enabled when the reviewed AVAL compiler, FFmpeg, and FFprobe are packaged with the desktop app."
};

function editableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}

export default function App() {
  const selectionRef = useRef<PickedVideo | null>(null);
  const pendingProjectOpenRef = useRef<{
    readonly project: StudioProjectV3;
    readonly picked: PickedVideo;
    readonly fileName: string;
  } | null>(null);
  const pendingStateRef = useRef<string | null>(null);
  const pendingEventRef = useRef<string | null>(null);
  const resizePreviewReturnFrameRef = useRef<number | null>(null);
  const resizePreviewSerialRef = useRef(0);
  const mediaFrameRef = useRef(0);
  const [selection, setSelection] = useState<PickedVideo | null>(null);
  const history = useProjectHistory();
  const project = history.project;
  const [alphaPreview, setAlphaPreview] = useState<AlphaPreview>("composite");
  const [drawer, setDrawer] = useState<"build" | "source" | null>(null);
  const [dialog, setDialog] = useState<"add-state" | "add-route" | null>(null);
  const [deleteStateId, setDeleteStateId] = useState<string | null>(null);
  const [resizePreviewPlayhead, setResizePreviewPlayhead] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildResult, setBuildResult] = useState<CompileResult | null>(null);
  const [buildInfo, setBuildInfo] = useState<BuildInfo>({
    version: "development",
    repository: "https://github.com/mckay115/aval-design-studio",
    packagedToolchain: false,
    updatesEnabled: false
  });
  const [health, setHealth] = useState<ToolchainHealth>(UNAVAILABLE_TOOLCHAIN);
  const updater = useUpdater(buildInfo.updatesEnabled);
  const selectedUnit = project === null ? null : projectSelectedUnit(project);
  const media = useMediaSession(selection, project?.editor.previewMode ?? "unit", selectedUnit, alphaPreview);
  mediaFrameRef.current = media.currentFrame;
  const graph = useGraphPreview(project, project?.editor.previewMode === "interactive", media.seekFrame);
  const activeStateId = project?.editor.previewMode === "interactive" ? graph.activeStateId : project?.initialState ?? "";
  const activeState = project?.states.find((state) => state.id === activeStateId) ?? null;

  useEffect(() => {
    void Promise.all([
      readBuildInfo().catch(() => buildInfo),
      toolchainHealth().catch(() => UNAVAILABLE_TOOLCHAIN)
    ]).then(([info, nextHealth]) => {
      setBuildInfo(info);
      setHealth(nextHealth);
    });
  }, []);

  useEffect(() => { selectionRef.current = selection; }, [selection]);
  useEffect(() => () => selectionRef.current?.revokeUrl?.(), []);

  useEffect(() => {
    if (toast === null) return;
    const timeout = window.setTimeout(() => setToast(null), 3_600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (media.descriptor === null) return;
    const pending = pendingProjectOpenRef.current;
    if (pending === null) {
      if (project === null) history.reset(createStudioProject(media.descriptor));
      return;
    }

    const expected = pending.project.sources[0]?.descriptor;
    const maximumAuthoredFrame = pending.project.units.reduce((maximum, unit) => Math.max(maximum, unit.range[1]), 0);
    const expectedRate = expected === undefined ? 0 : expected.frameRate.numerator / expected.frameRate.denominator;
    const actualRate = media.descriptor.frameRate.numerator / media.descriptor.frameRate.denominator;
    if (expected === undefined
      || media.descriptor.width !== expected.width
      || media.descriptor.height !== expected.height
      || media.descriptor.totalFrames < maximumAuthoredFrame
      || Math.abs(actualRate - expectedRate) > 0.05) {
      pendingProjectOpenRef.current = null;
      selectionRef.current?.revokeUrl?.();
      selectionRef.current = null;
      setSelection(null);
      history.reset(null);
      setToast(`The selected source does not match this project. Expected ${expected?.width ?? "?"}×${expected?.height ?? "?"} at ${expectedRate.toFixed(2)} fps with at least ${String(maximumAuthoredFrame)} frames.`);
      return;
    }

    const descriptor = {
      ...media.descriptor,
      name: pending.picked.name,
      path: pending.picked.path
    };
    const linkedProject: StudioProjectV3 = {
      ...pending.project,
      sources: pending.project.sources.map((source, index) => index === 0
        ? { ...source, descriptor, preparation: preparationPlanFor(descriptor) }
        : source)
    };
    pendingProjectOpenRef.current = null;
    try {
      history.reset(requireValidProject(linkedProject));
      setToast(`Opened ${pending.fileName} and relinked its source video`);
    } catch (reason) {
      history.reset(null);
      setToast(reason instanceof Error ? reason.message : "The relinked project is invalid.");
    }
  }, [history.reset, media.descriptor, project]);

  useEffect(() => {
    if (project === null) return;
    media.seekFrame(selectedUnit?.range[0] ?? 0);
  }, [project?.sources[0]?.id]);

  useEffect(() => {
    if (project?.editor.previewMode !== "interactive" || graph.snapshot === null) return;
    const pendingState = pendingStateRef.current;
    const pendingEvent = pendingEventRef.current;
    pendingStateRef.current = null;
    pendingEventRef.current = null;
    if (pendingState !== null) graph.requestState(pendingState);
    if (pendingEvent !== null) graph.sendEvent(pendingEvent);
  }, [graph.snapshot, project?.editor.previewMode]);

  const openVideo = useCallback(async (): Promise<void> => {
    try {
      const picked = await pickVideo();
      if (picked === null) return;
      pendingProjectOpenRef.current = null;
      media.stop();
      selectionRef.current?.revokeUrl?.();
      selectionRef.current = picked;
      setSelection(picked);
      history.reset(null);
      setDrawer(null);
      setDialog(null);
      setBuildResult(null);
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "The video could not be opened.");
    }
  }, [history.reset, media.stop]);

  const openProject = useCallback(async (): Promise<void> => {
    try {
      const opened = await openStudioProject();
      if (opened === null) return;
      const loaded = parseStudioProjectDocument(opened.document);
      const source = loaded.sources[0];
      if (source === undefined) throw new Error("The Studio project does not contain a source video.");
      const sourcePath = opened.sourcePaths[0] ?? source.descriptor.path;
      const sourceIsMissing = sourcePath === null || opened.missingSourcePaths.includes(sourcePath);
      let picked: PickedVideo;
      let relinking = false;
      if (isTauriRuntime() && !sourceIsMissing && sourcePath !== null) {
        picked = pickedVideoFromPath(sourcePath, source.descriptor.name);
      } else {
        setToast(sourceIsMissing
          ? "Locate the source video used by this project."
          : "Choose the source video to open this project in the browser.");
        const replacement = await pickVideo();
        if (replacement === null) return;
        picked = replacement;
        relinking = true;
      }

      const openedFileName = opened.path?.split(/[\\/]/u).at(-1) ?? `${loaded.name}.avalstudio`;
      media.stop();
      selectionRef.current?.revokeUrl?.();
      selectionRef.current = picked;
      setSelection(picked);
      setDrawer(null);
      setDialog(null);
      setBuildResult(null);
      if (relinking) {
        pendingProjectOpenRef.current = { project: loaded, picked, fileName: openedFileName };
        history.reset(null);
      } else {
        pendingProjectOpenRef.current = null;
        history.reset(loaded, true);
        setToast(`Opened ${openedFileName}`);
      }
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "The Studio project could not be opened.");
    }
  }, [history.reset, media.stop]);

  const commitProject = useCallback((update: (current: StudioProjectV3) => StudioProjectV3, success?: string): void => {
    if (project === null) return;
    try {
      const next = update(project);
      history.commit(() => next);
      setBuildResult(null);
      if (success !== undefined) setToast(success);
    } catch (reason) {
      const message = reason instanceof StudioMutationError ? reason.issues[0] ?? reason.message : reason instanceof Error ? reason.message : "The graph change could not be applied.";
      setToast(message);
    }
  }, [history.commit, project]);

  const replaceTransient = useCallback((update: (current: StudioProjectV3) => StudioProjectV3): void => {
    history.replaceTransient(update);
  }, [history.replaceTransient]);

  const changePreviewMode = useCallback((mode: PreviewMode): void => {
    media.stop();
    replaceTransient((current) => ({ ...current, editor: { ...current.editor, previewMode: mode } }));
  }, [media.stop, replaceTransient]);

  const selectState = useCallback((stateId: string): void => {
    if (project === null) return;
    const unit = bodyUnitForState(project, stateId);
    if (unit === null) return;
    replaceTransient((current) => selectStateInProject(current, stateId));
    media.seekFrame(unit.range[0]);
  }, [media.seekFrame, project, replaceTransient]);

  const selectUnit = useCallback((unitId: string): void => {
    replaceTransient((current) => selectUnitInProject(current, unitId));
  }, [replaceTransient]);

  const selectRoute = useCallback((routeId: string): void => {
    replaceTransient((current) => selectRouteInProject(current, routeId));
  }, [replaceTransient]);

  const previewState = useCallback((stateId: string): void => {
    if (project?.editor.previewMode === "interactive" && graph.snapshot !== null) {
      graph.requestState(stateId);
      return;
    }
    pendingStateRef.current = stateId;
    changePreviewMode("interactive");
  }, [changePreviewMode, graph.requestState, graph.snapshot, project?.editor.previewMode]);

  const triggerInteraction = useCallback((eventName: string): void => {
    if (project?.editor.previewMode === "interactive" && graph.snapshot !== null) {
      graph.sendEvent(eventName);
      return;
    }
    pendingEventRef.current = eventName;
    changePreviewMode("interactive");
  }, [changePreviewMode, graph.sendEvent, graph.snapshot, project?.editor.previewMode]);

  const resizeUnit = useCallback((unitId: string, edge: "start" | "end", frame: number): void => {
    if (project === null) return;
    const unit = project.units.find((candidate) => candidate.id === unitId);
    if (unit === undefined) return;
    const range: readonly [number, number] = edge === "start"
      ? [Math.min(unit.range[1] - 1, Math.max(0, frame)), unit.range[1]]
      : [unit.range[0], Math.max(unit.range[0] + 1, frame)];
    commitProject((current) => requireValidProject(updateUnit(current, unitId, { range })));
  }, [commitProject, project]);

  const previewUnitResize = useCallback((frame: number): void => {
    if (resizePreviewReturnFrameRef.current === null) {
      const playheadFrame = mediaFrameRef.current;
      resizePreviewReturnFrameRef.current = playheadFrame;
      resizePreviewSerialRef.current += 1;
      setResizePreviewPlayhead(playheadFrame);
    }
    void media.seekFrame(frame);
  }, [media.seekFrame]);

  const endUnitResizePreview = useCallback((): void => {
    const returnFrame = resizePreviewReturnFrameRef.current;
    resizePreviewReturnFrameRef.current = null;
    if (returnFrame === null) return;
    const serial = ++resizePreviewSerialRef.current;
    void media.seekFrame(returnFrame).finally(() => {
      if (resizePreviewSerialRef.current === serial) setResizePreviewPlayhead(null);
    });
  }, [media.seekFrame]);

  const applyStateChanges = useCallback((stateId: string, draft: StateInspectorDraft): void => {
    commitProject((current) => applyStateEdit(current, stateId, draft), "State updated");
  }, [commitProject]);

  const applyUnitChanges = useCallback((unitId: string, update: UnitInspectorUpdate): void => {
    commitProject((current) => {
      let next = updateUnit(current, unitId, update);
      if (update.residency !== undefined) {
        next = {
          ...next,
          units: next.units.map((unit) => unit.id === unitId && unit.kind === "reversible" ? { ...unit, residency: update.residency! } : unit)
        };
      }
      return requireValidProject(next);
    }, "Unit updated");
  }, [commitProject]);

  const applyRouteChanges = useCallback((route: StudioRoute, binding: StudioBindingSource | null): void => {
    if (project?.editor.selection.kind !== "route") return;
    const originalId = project.editor.selection.id;
    commitProject((current) => {
      let next = replaceRoute(current, route, originalId);
      const previous = current.routes.find((candidate) => candidate.id === originalId);
      const previousEvent = previous?.trigger?.type === "event" ? previous.trigger.name : null;
      const previousSources = previousEvent === null ? [] : current.bindings.filter((candidate) => candidate.event === previousEvent).map((candidate) => candidate.source);
      for (const source of previousSources) {
        if (source !== binding) next = updateBinding(next, source, null);
      }
      if (route.trigger?.type === "event" && binding !== null) next = updateBinding(next, binding, route.trigger.name);
      return next;
    }, "Route updated");
  }, [commitProject, project?.editor.selection]);

  const addTransition = useCallback((routeId: string, kind: "locked" | "reversible"): void => {
    if (project === null) return;
    const total = project.sources[0]?.descriptor.totalFrames ?? 1;
    const start = Math.min(total - 1, Math.max(0, media.currentFrame));
    const end = Math.min(total, Math.max(start + 1, start + Math.round(project.frameRate.numerator / project.frameRate.denominator * 0.4)));
    commitProject((current) => addTransitionToRoute(current, routeId, kind, [start, end]), `${kind === "locked" ? "Bridge" : "Reversible"} transition added`);
  }, [commitProject, media.currentFrame, project]);

  const removeTransition = useCallback((routeId: string): void => {
    commitProject((current) => removeRouteTransition(current, routeId), "Transition removed");
  }, [commitProject]);

  const changeBuild = useCallback((update: Partial<StudioBuildSettings>): void => {
    commitProject((current) => ({ ...current, build: { ...current.build, ...update } }));
  }, [commitProject]);

  const renameProject = useCallback((name: string): void => {
    commitProject((current) => ({ ...current, name }));
  }, [commitProject]);

  const chooseDestination = useCallback(async (): Promise<void> => {
    if (project === null) return;
    const destination = await chooseBundleDestination(project.name);
    if (destination !== null) changeBuild({ destination });
    else if (!buildInfo.packagedToolchain) setToast("Choose a destination in the packaged desktop app.");
  }, [buildInfo.packagedToolchain, changeBuild, project]);

  const saveProject = useCallback(async (): Promise<void> => {
    if (project === null) return;
    try {
      const path = await saveStudioProject(project);
      if (path !== null) {
        history.markSaved();
        setToast(`Saved ${path.split(/[\\/]/u).at(-1) ?? "project"}`);
      }
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "The project could not be saved.");
    }
  }, [history.markSaved, project]);

  const buildBundle = useCallback(async (): Promise<void> => {
    if (project === null || project.build.destination === null) return;
    setBuilding(true);
    setBuildResult(null);
    try {
      const matte = project.build.alpha === "opaque" && project.build.opaqueTreatment === "matte" ? project.build.matte : null;
      const result = await compileAvalBundle(toAvalProject(project), project.build.destination, false, matte);
      setBuildResult(result);
      setToast(`Built ${result.assets.length} AVAL assets`);
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "The AVAL bundle could not be built.");
    } finally {
      setBuilding(false);
    }
  }, [project]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent): void => {
      if (editableTarget(event.target) || project === null) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) history.redo(); else history.undo();
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        history.redo();
        return;
      }
      if (event.key === " ") { event.preventDefault(); media.togglePlayback(); }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        if (event.shiftKey && selectedUnit !== null) media.seekFrame(direction < 0 ? selectedUnit.range[0] : selectedUnit.range[1] - 1);
        else media.stepFrame(direction);
      }
      if (event.key === "Escape") media.stop();
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [history.redo, history.undo, media.seekFrame, media.stepFrame, media.stop, media.togglePlayback, project, selectedUnit]);

  const validation = useMemo(() => project === null ? [] : validationItems(project, health), [health, project]);
  const drawerVisible = drawer !== null && project !== null;
  const timelineSelectedId = project?.editor.selection.kind === "state"
    ? bodyUnitForState(project, project.editor.selection.id)?.id ?? ""
    : project?.editor.selection.id ?? "";

  return (
    <div className={`app-shell${drawerVisible ? " has-drawer" : ""}`}>
      <TopBar projectName={project?.name ?? null} sourceReady={project !== null} saved={history.saved} canUndo={history.canUndo} canRedo={history.canRedo} onOpenProject={() => void openProject()} onImport={() => void openVideo()} onRename={renameProject} onSave={() => void saveProject()} onBuild={() => setDrawer("build")} onUndo={history.undo} onRedo={history.redo} />

      {project === null ? (
        <main className="editor-empty">
          <div className="empty-visual"><FilmIcon /><i /><i /></div>
          <h1>{media.status === "probing" ? "Reading your source…" : "Build an interactive video"}</h1>
          <p>{media.status === "probing" ? "MediaBunny is detecting the container, codec, timing, color, and alpha capabilities." : "Import any local video the desktop toolchain can decode. Define states, preview interactions, then build an efficient AVAL bundle."}</p>
          {media.error === null ? null : <div className="empty-error">{media.error}</div>}
          <div className="empty-actions">
            <button className="button button-secondary" type="button" disabled={media.status === "probing"} onClick={() => void openProject()}>Open Project</button>
            <button className="button button-primary" type="button" disabled={media.status === "probing"} onClick={() => void openVideo()}>Import Video</button>
          </div>
          <ol><li><b>1</b><span>Import and prepare</span></li><li><b>2</b><span>Define states</span></li><li><b>3</b><span>Build bundle</span></li></ol>
        </main>
      ) : (
        <>
          <div className="editor-layout">
            <ProjectNavigator project={project} activeStateId={activeStateId} thumbnail={media.thumbnails[0] ?? null} onSelectState={selectState} onPreviewState={previewState} onSelectRoute={selectRoute} onTrigger={triggerInteraction} onAddState={() => setDialog("add-state")} onAddInteraction={() => setDialog("add-route")} onDuplicateState={(stateId) => commitProject((current) => duplicateState(current, stateId), "State duplicated")} onSetInitialState={(stateId) => commitProject((current) => setInitialState(current, stateId), "Initial state updated")} onDeleteState={setDeleteStateId} onUnavailableAction={setToast} />
            <main className="editor-center">
              <VideoStage canvasRef={media.canvasRef} descriptor={project.sources[0]!.descriptor} mode={project.editor.previewMode} alphaPreview={alphaPreview} activeState={activeState} states={project.states} bindings={project.bindings} graphSnapshot={graph.snapshot} graphError={graph.error} currentFrame={media.currentFrame} isPlaying={media.isPlaying} status={media.status} error={media.error} onMode={changePreviewMode} onAlphaPreview={setAlphaPreview} onTogglePlayback={media.togglePlayback} onStep={media.stepFrame} onRequestState={previewState} onSendEvent={triggerInteraction} onSendBinding={graph.sendBinding} onRestartGraph={graph.restart} onToggleInteraction={() => changePreviewMode(project.editor.previewMode === "interactive" ? "unit" : "interactive")} />
              <Timeline units={project.units} routes={project.routes} selectedId={timelineSelectedId} currentFrame={resizePreviewPlayhead ?? media.currentFrame} totalFrames={project.sources[0]!.descriptor.totalFrames} frameRate={project.frameRate} thumbnails={media.thumbnails} onSelect={selectUnit} onSelectRoute={selectRoute} onSeek={media.seekFrame} onResize={resizeUnit} onResizePreview={previewUnitResize} onResizePreviewEnd={endUnitResizePreview} />
            </main>
            <Inspector project={project} preparation={project.sources[0]!.preparation} onApplyState={applyStateChanges} onApplyUnit={applyUnitChanges} onApplyRoute={applyRouteChanges} onDeleteRoute={(routeId) => commitProject((current) => deleteRoute(current, routeId), "Route deleted")} onAddTransition={addTransition} onRemoveTransition={removeTransition} onReviewPrep={() => setDrawer("source")} />
            {drawer === null ? null : <BuildDrawer view={drawer} projectName={project.name} source={project.sources[0]!} build={project.build} validation={validation} toolchain={health} building={building} result={buildResult} onClose={() => setDrawer(null)} onChange={changeBuild} onDestination={() => void chooseDestination()} onBuild={() => void buildBundle()} />}
          </div>
          <StatusBar descriptor={media.descriptor} currentFrame={media.currentFrame} mediaStatus={media.status} updateStatus={updater.status} onInstallUpdate={() => void updater.install()} />
        </>
      )}

      {project !== null && dialog === "add-state" ? <AddStateDialog project={project} onClose={() => setDialog(null)} onApply={(next) => { history.commit(() => next); setDialog(null); setBuildResult(null); setToast("Template added"); }} /> : null}
      {project !== null && dialog === "add-route" ? <AddInteractionDialog project={project} onClose={() => setDialog(null)} onApply={(from, to) => { commitProject((current) => addDirectRoute(current, from, to), "Route created"); setDialog(null); }} /> : null}
      {project !== null && deleteStateId !== null ? <DeleteStateDialog project={project} stateId={deleteStateId} onClose={() => setDeleteStateId(null)} onApply={(replacement) => { commitProject((current) => deleteState(current, deleteStateId, replacement), "State deleted"); setDeleteStateId(null); }} /> : null}
      {toast === null ? null : <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
