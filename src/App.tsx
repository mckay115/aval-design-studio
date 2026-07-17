import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BuildDrawer } from "./components/BuildDrawer";
import { FilmIcon } from "./components/Icons";
import { Inspector } from "./components/Inspector";
import { ProjectNavigator } from "./components/ProjectNavigator";
import { StatusBar } from "./components/StatusBar";
import { Timeline } from "./components/Timeline";
import { TopBar } from "./components/TopBar";
import { VideoStage } from "./components/VideoStage";
import { useMediaSession } from "./hooks/useMediaSession";
import { useUpdater } from "./hooks/useUpdater";
import {
  chooseBundleDestination,
  compileAvalBundle,
  pickVideo,
  readBuildInfo,
  saveStudioProject,
  toolchainHealth,
  type BuildInfo,
  type CompileResult,
  type PickedVideo,
  type ToolchainHealth
} from "./lib/desktop";
import {
  createStudioProject,
  resolveStudioRoute,
  toAvalProject,
  updateUnit,
  validationItems,
  type AlphaPreview,
  type PreviewMode,
  type StudioBuildSettings,
  type StudioProjectV2,
  type StudioUnit
} from "./model/studio";
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
  const [selection, setSelection] = useState<PickedVideo | null>(null);
  const [project, setProject] = useState<StudioProjectV2 | null>(null);
  const [activeStateId, setActiveStateId] = useState("idle");
  const [alphaPreview, setAlphaPreview] = useState<AlphaPreview>("composite");
  const [drawer, setDrawer] = useState<"build" | "source" | null>(null);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildResult, setBuildResult] = useState<CompileResult | null>(null);
  const [buildInfo, setBuildInfo] = useState<BuildInfo>({
    version: "development",
    repository: "https://github.com/zlisko/aval-design-studio",
    packagedToolchain: false,
    updatesEnabled: false
  });
  const [health, setHealth] = useState<ToolchainHealth>(UNAVAILABLE_TOOLCHAIN);
  const updater = useUpdater(buildInfo.updatesEnabled);

  const selectedState = project?.states.find((state) => state.id === project.editor.selectedStateId) ?? null;
  const selectedUnit = project?.units.find((unit) => unit.id === project.editor.selectedUnitId) ?? null;
  const activeState = project?.states.find((state) => state.id === activeStateId) ?? null;
  const media = useMediaSession(
    selection,
    project?.editor.previewMode ?? "unit",
    selectedUnit,
    alphaPreview
  );

  useEffect(() => {
    void Promise.all([
      readBuildInfo().catch(() => buildInfo),
      toolchainHealth().catch(() => UNAVAILABLE_TOOLCHAIN)
    ]).then(([info, nextHealth]) => {
      setBuildInfo(info);
      setHealth(nextHealth);
    });
  }, []); // Build and toolchain facts are immutable for the lifetime of the app.

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => () => selectionRef.current?.revokeUrl?.(), []);

  useEffect(() => {
    if (toast === null) return;
    const timeout = window.setTimeout(() => setToast(null), 3_600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (media.descriptor === null || project !== null) return;
    const next = createStudioProject(media.descriptor);
    setProject(next);
    setActiveStateId(next.initialState);
    setSaved(false);
  }, [media.descriptor, project]);

  useEffect(() => {
    if (project === null) return;
    media.seekFrame(selectedUnit?.range[0] ?? 0);
  }, [project?.sources[0]?.id]); // Render the first canvas after the editor surface mounts.

  const openVideo = useCallback(async (): Promise<void> => {
    const picked = await pickVideo();
    if (picked === null) return;
    media.stop();
    selectionRef.current?.revokeUrl?.();
    selectionRef.current = picked;
    setSelection(picked);
    setProject(null);
    setDrawer(null);
    setBuildResult(null);
    setSaved(false);
  }, [media]);

  const markProject = useCallback((update: (current: StudioProjectV2) => StudioProjectV2): void => {
    setProject((current) => current === null ? null : update(current));
    setSaved(false);
    setBuildResult(null);
  }, []);

  const changePreviewMode = useCallback((mode: PreviewMode): void => {
    if (project === null) return;
    media.stop();
    const state = project.states.find((candidate) => candidate.id === activeStateId);
    const unit = project.units.find((candidate) => candidate.id === state?.unitId);
    markProject((current) => ({
      ...current,
      editor: mode === "interactive" && state !== undefined && unit !== undefined
        ? { previewMode: mode, selectedStateId: state.id, selectedUnitId: unit.id }
        : { ...current.editor, previewMode: mode }
    }));
    if (mode === "interactive" && unit !== undefined) media.seekFrame(unit.range[0]);
  }, [activeStateId, markProject, media, project]);

  const selectState = useCallback((stateId: string): void => {
    if (project === null) return;
    const state = project.states.find((candidate) => candidate.id === stateId);
    const unit = project.units.find((candidate) => candidate.id === state?.unitId);
    if (state === undefined || unit === undefined) return;
    markProject((current) => ({ ...current, editor: { ...current.editor, selectedStateId: state.id, selectedUnitId: unit.id } }));
    media.seekFrame(unit.range[0]);
  }, [markProject, media, project]);

  const selectUnit = useCallback((unitId: string): void => {
    if (project === null) return;
    const state = project.states.find((candidate) => candidate.unitId === unitId);
    markProject((current) => ({
      ...current,
      editor: { ...current.editor, selectedUnitId: unitId, selectedStateId: state?.id ?? current.editor.selectedStateId }
    }));
  }, [markProject, project]);

  const triggerInteraction = useCallback((eventName: string): void => {
    if (project === null) return;
    const target = resolveStudioRoute(project, activeStateId, { type: "event", name: eventName });
    if (target === null) {
      setToast(`No ${eventName} route leaves ${activeStateId}.`);
      return;
    }
    setActiveStateId(target.state.id);
    markProject((current) => ({ ...current, editor: { previewMode: "interactive", selectedStateId: target.state.id, selectedUnitId: target.unit.id } }));
    media.playUnit(target.unit);
  }, [activeStateId, markProject, media, project]);

  useEffect(() => {
    const completion = media.playbackCompletion;
    if (completion.serial === 0 || completion.unitId === null || project?.editor.previewMode !== "interactive") return;
    const state = project.states.find((candidate) => candidate.id === activeStateId);
    if (state?.unitId !== completion.unitId) return;
    const target = resolveStudioRoute(project, activeStateId, { type: "completion" });
    if (target === null) return;
    setActiveStateId(target.state.id);
    markProject((current) => ({ ...current, editor: { previewMode: "interactive", selectedStateId: target.state.id, selectedUnitId: target.unit.id } }));
    media.playUnit(target.unit);
  }, [activeStateId, markProject, media.playUnit, media.playbackCompletion, project]);

  const changeUnit = useCallback((update: Partial<Pick<StudioUnit, "name" | "kind" | "playback" | "range">>): void => {
    if (selectedUnit === null) return;
    markProject((current) => updateUnit(current, selectedUnit.id, update));
  }, [markProject, selectedUnit]);

  const resizeUnit = useCallback((unitId: string, edge: "start" | "end", frame: number): void => {
    if (project === null) return;
    const sorted = [...project.units].sort((a, b) => a.range[0] - b.range[0]);
    const index = sorted.findIndex((unit) => unit.id === unitId);
    const unit = sorted[index];
    if (unit === undefined) return;
    const previous = sorted[index - 1];
    const next = sorted[index + 1];
    const range: readonly [number, number] = edge === "start"
      ? [Math.max(previous?.range[1] ?? 0, Math.min(unit.range[1] - 1, frame)), unit.range[1]]
      : [unit.range[0], Math.min(next?.range[0] ?? (project.sources[0]?.descriptor.totalFrames ?? unit.range[1]), Math.max(unit.range[0] + 1, frame))];
    markProject((current) => updateUnit(current, unitId, { range }));
  }, [markProject, project]);

  const changeBuild = useCallback((update: Partial<StudioBuildSettings>): void => {
    markProject((current) => ({ ...current, build: { ...current.build, ...update } }));
  }, [markProject]);

  const renameProject = useCallback((name: string): void => {
    markProject((current) => ({ ...current, name }));
  }, [markProject]);

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
        setSaved(true);
        setToast(`Saved ${path.split(/[\\/]/u).at(-1) ?? "project"}`);
      }
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "The project could not be saved.");
    }
  }, [project]);

  const buildBundle = useCallback(async (): Promise<void> => {
    if (project === null || project.build.destination === null) return;
    setBuilding(true);
    setBuildResult(null);
    try {
      const matte = project.build.alpha === "opaque" && project.build.opaqueTreatment === "matte"
        ? project.build.matte
        : null;
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
      if (event.key === " ") {
        event.preventDefault();
        media.togglePlayback();
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        if (event.shiftKey && selectedUnit !== null) {
          media.seekFrame(direction < 0 ? selectedUnit.range[0] : selectedUnit.range[1] - 1);
        } else {
          media.stepFrame(direction);
        }
      }
      if (event.key === "Escape") media.stop();
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [media, project, selectedUnit]);

  const validation = useMemo(
    () => project === null ? [] : validationItems(project, health),
    [health, project]
  );
  const drawerVisible = drawer !== null && project !== null;

  return (
    <div className={`app-shell${drawerVisible ? " has-drawer" : ""}`}>
      <TopBar
        projectName={project?.name ?? null}
        sourceReady={project !== null}
        saved={saved}
        onImport={() => void openVideo()}
        onRename={renameProject}
        onSave={() => void saveProject()}
        onBuild={() => setDrawer("build")}
      />

      {project === null ? (
        <main className="editor-empty">
          <div className="empty-visual"><FilmIcon /><i /><i /></div>
          <h1>{media.status === "probing" ? "Reading your source…" : "Build an interactive video"}</h1>
          <p>{media.status === "probing" ? "MediaBunny is detecting the container, codec, timing, color, and alpha capabilities." : "Import any local video the desktop toolchain can decode. Define states, preview interactions, then build an efficient AVAL bundle."}</p>
          {media.error === null ? null : <div className="empty-error">{media.error}</div>}
          <button className="button button-primary" type="button" disabled={media.status === "probing"} onClick={() => void openVideo()}>Import Video</button>
          <ol><li><b>1</b><span>Import and prepare</span></li><li><b>2</b><span>Define states</span></li><li><b>3</b><span>Build bundle</span></li></ol>
        </main>
      ) : (
        <>
          <div className="editor-layout">
            <ProjectNavigator
              project={project}
              activeStateId={activeStateId}
              selectedStateId={selectedState?.id ?? project.initialState}
              thumbnail={media.thumbnails[0] ?? null}
              onSelectState={selectState}
              onTrigger={triggerInteraction}
              onUnavailableAction={setToast}
            />
            <main className="editor-center">
              <VideoStage
                canvasRef={media.canvasRef}
                descriptor={project.sources[0]!.descriptor}
                mode={project.editor.previewMode}
                alphaPreview={alphaPreview}
                activeState={activeState}
                currentFrame={media.currentFrame}
                isPlaying={media.isPlaying}
                status={media.status}
                error={media.error}
                onMode={changePreviewMode}
                onAlphaPreview={setAlphaPreview}
                onTogglePlayback={media.togglePlayback}
                onStep={media.stepFrame}
                onTrigger={triggerInteraction}
                onToggleInteraction={() => changePreviewMode(project.editor.previewMode === "interactive" ? "unit" : "interactive")}
              />
              <Timeline
                units={project.units}
                routes={project.routes}
                selectedId={selectedUnit?.id ?? project.units[0]!.id}
                currentFrame={media.currentFrame}
                totalFrames={project.sources[0]!.descriptor.totalFrames}
                frameRate={project.frameRate}
                thumbnails={media.thumbnails}
                onSelect={selectUnit}
                onSeek={media.seekFrame}
                onResize={resizeUnit}
              />
            </main>
            {selectedUnit === null ? null : <Inspector
              unit={selectedUnit}
              totalFrames={project.sources[0]!.descriptor.totalFrames}
              preparation={project.sources[0]!.preparation}
              onChange={changeUnit}
              onReviewPrep={() => setDrawer("source")}
            />}
            {drawer === null ? null : <BuildDrawer
              view={drawer}
              projectName={project.name}
              source={project.sources[0]!}
              build={project.build}
              validation={validation}
              toolchain={health}
              building={building}
              result={buildResult}
              onClose={() => setDrawer(null)}
              onChange={changeBuild}
              onDestination={() => void chooseDestination()}
              onBuild={() => void buildBundle()}
            />}
          </div>
          <StatusBar descriptor={media.descriptor} currentFrame={media.currentFrame} mediaStatus={media.status} updateStatus={updater.status} onInstallUpdate={() => void updater.install()} />
        </>
      )}

      {toast === null ? null : <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
