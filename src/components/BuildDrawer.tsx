import type { CompileResult, ToolchainHealth } from "../lib/desktop";
import type {
  BuildProfileId,
  PreparationPlan,
  StudioBuildSettings,
  StudioSource,
  ValidationItem
} from "../model/studio";
import { CheckIcon, CloseIcon, CubeIcon, FolderIcon, WarningIcon } from "./Icons";

interface BuildDrawerProps {
  readonly view: "build" | "source";
  readonly projectName: string;
  readonly source: StudioSource;
  readonly build: StudioBuildSettings;
  readonly validation: readonly ValidationItem[];
  readonly toolchain: ToolchainHealth;
  readonly building: boolean;
  readonly result: CompileResult | null;
  readonly onClose: () => void;
  readonly onChange: (update: Partial<StudioBuildSettings>) => void;
  readonly onDestination: () => void;
  readonly onBuild: () => void;
}

function outputCount(build: StudioBuildSettings): number {
  if (build.profile === "draft") return 1;
  return Object.values(build.codecs).filter(Boolean).length;
}

function SourcePrep({ source, onClose }: { readonly source: StudioSource; readonly onClose: () => void }) {
  const media = source.descriptor;
  const plan: PreparationPlan = source.preparation;
  return (
    <aside className="build-drawer source-prep-drawer" aria-label="Source preparation">
      <header className="drawer-title"><div><h2>Source Prep</h2><p>Review how this source enters the AVAL compiler.</p></div><button type="button" aria-label="Close source preparation" onClick={onClose}><CloseIcon /></button></header>
      <section className="source-overview">
        <div className="source-icon"><FolderIcon /></div>
        <div><strong>{media.name}</strong><span>{media.container} · {media.codec.toUpperCase()} · {media.width}×{media.height}</span></div>
      </section>
      <section className="drawer-section"><h3>Preparation plan</h3><div className={`plan-card plan-${plan.status}`}>
        {plan.status === "ready" ? <CheckIcon /> : <WarningIcon />}
        <div><strong>{plan.label}</strong><p>{plan.detail}</p><span>Output: {plan.output}</span></div>
      </div></section>
      <section className="drawer-section"><h3>Media analysis</h3><dl className="media-facts">
        <div><dt>Frame rate</dt><dd>{media.averageFrameRate.toFixed(3)} fps</dd></div>
        <div><dt>Pixel aspect</dt><dd>{media.pixelAspect[0]}:{media.pixelAspect[1]}</dd></div>
        <div><dt>Rotation</dt><dd>{media.rotation}°</dd></div>
        <div><dt>Alpha signal</dt><dd>{media.canBeTransparent ? "May contain alpha" : "Opaque"}</dd></div>
        <div><dt>Color</dt><dd>{media.hasHighDynamicRange ? "HDR → sRGB" : "sRGB compatible"}</dd></div>
        <div><dt>Audio</dt><dd>{media.audioTrackCount > 0 ? `${media.audioTrackCount} track${media.audioTrackCount === 1 ? "" : "s"} removed` : "None"}</dd></div>
      </dl></section>
      {plan.warnings.length === 0 ? null : <section className="drawer-section"><h3>Warnings</h3>{plan.warnings.map((warning) => <p key={warning} className="drawer-warning"><WarningIcon />{warning}</p>)}</section>}
      <section className="drawer-note"><strong>Compiler boundary</strong><p>AVAL 1.0 directly accepts MOV, MP4, M4V, or numbered RGBA PNG sequences. Other local formats are normalized without changing the original.</p></section>
      <footer className="drawer-footer"><button type="button" className="button button-primary" onClick={onClose}>Done</button></footer>
    </aside>
  );
}

export function BuildDrawer({
  view,
  projectName,
  source,
  build,
  validation,
  toolchain,
  building,
  result,
  onClose,
  onChange,
  onDestination,
  onBuild
}: BuildDrawerProps) {
  if (view === "source") return <SourcePrep source={source} onClose={onClose} />;
  const count = outputCount(build);
  const ready = validation.every((item) => item.status !== "error") && toolchain.available && build.destination !== null;
  return (
    <aside className="build-drawer" aria-label="Build AVAL bundle">
      <header className="drawer-title"><div><h2>Build AVAL Bundle</h2><p>Creates an interactive bundle for web delivery.</p></div><button type="button" aria-label="Close build drawer" onClick={onClose}><CloseIcon /></button></header>
      <div className="output-summary"><CubeIcon /><strong>{count} codec file{count === 1 ? "" : "s"} + build.json</strong></div>

      <section className="drawer-section"><h3>Destination</h3><button className="destination-picker" type="button" onClick={onDestination}><FolderIcon /><span>{build.destination ?? `Choose a folder for ${projectName}`}</span><b>Change…</b></button></section>

      <section className="drawer-section"><h3>Export settings</h3><label className="drawer-field"><span>Profile</span><select value={build.profile} onChange={(event) => onChange({ profile: event.currentTarget.value as BuildProfileId })}>
        <option value="balanced">Balanced Web</option><option value="draft">Fast Draft</option><option value="custom">Custom</option>
      </select></label>
      <label className="drawer-field"><span>Canvas</span><select defaultValue="source"><option value="source">Source · {source.descriptor.width}×{source.descriptor.height}</option></select></label>
      <label className="drawer-field"><span>Alpha</span><select value={build.alpha} onChange={(event) => onChange({ alpha: event.currentTarget.value as StudioBuildSettings["alpha"] })}>
        <option value="auto">Auto · recommended</option><option value="packed">Packed</option><option value="opaque">Opaque</option>
      </select></label>
      {build.alpha === "opaque" ? <div className="opaque-options"><label><input type="radio" checked={build.opaqueTreatment === "require"} onChange={() => onChange({ opaqueTreatment: "require" })} />Require opaque</label><label><input type="radio" checked={build.opaqueTreatment === "matte"} onChange={() => onChange({ opaqueTreatment: "matte" })} />Flatten to matte <input type="color" value={build.matte} aria-label="Matte color" onChange={(event) => onChange({ matte: event.currentTarget.value })} /></label></div> : null}
      <details className="codec-details" open={build.profile === "custom"}><summary>Advanced codecs</summary><div className="codec-grid">
        {(Object.keys(build.codecs) as (keyof StudioBuildSettings["codecs"])[]).map((codec) => <label key={codec}><input type="checkbox" disabled={build.profile !== "custom"} checked={build.profile === "draft" ? codec === "h264" : build.codecs[codec]} onChange={(event) => onChange({ codecs: { ...build.codecs, [codec]: event.currentTarget.checked } })} /><span>{codec.toUpperCase()}</span></label>)}
      </div></details></section>

      <section className="drawer-section validation-section"><h3>Validation</h3>{validation.map((item) => <div key={item.id} className={`validation-row validation-${item.status}`}>
        {item.status === "ok" ? <CheckIcon /> : <WarningIcon />}<div><strong>{item.label}</strong><span>{item.detail}</span></div><b>{item.status === "ok" ? "OK" : item.status === "warning" ? "Review" : "Fix"}</b>
      </div>)}</section>

      {result === null ? null : <section className="drawer-section build-result"><h3>Built assets</h3>{result.assets.map((asset) => <div key={asset.name}><span>{asset.name}</span><strong>{(asset.size / 1_048_576).toFixed(2)} MB</strong></div>)}</section>}

      <section className={`toolchain-callout${toolchain.available ? " is-ready" : ""}`}>
        {toolchain.available ? <CheckIcon /> : <WarningIcon />}<div><strong>{toolchain.available ? "Core toolchain ready" : "Desktop toolchain required"}</strong><p>{toolchain.message}</p></div>
      </section>
      <footer className="drawer-footer"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="button" className="button button-primary" disabled={!ready || building} onClick={onBuild}><CubeIcon />{building ? "Building…" : "Build Bundle"}</button></footer>
    </aside>
  );
}
