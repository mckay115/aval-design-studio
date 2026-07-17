import type { UpdateStatus } from "../hooks/useUpdater";
import type { MediaDescriptor } from "../model/studio";

interface StatusBarProps {
  readonly descriptor: MediaDescriptor | null;
  readonly currentFrame: number;
  readonly mediaStatus: "idle" | "probing" | "ready" | "unsupported";
  readonly updateStatus: UpdateStatus;
  readonly onInstallUpdate: () => void;
}

export function StatusBar({ descriptor, currentFrame, mediaStatus, updateStatus, onInstallUpdate }: StatusBarProps) {
  const updateAvailable = updateStatus.state === "available" || updateStatus.state === "installing";
  return (
    <footer className="status-bar">
      <div>{descriptor === null ? "No source" : `${descriptor.totalFrames} frames · ${(descriptor.frameRate.numerator / descriptor.frameRate.denominator).toFixed(2)} fps · ${descriptor.width} × ${descriptor.height}`}</div>
      <div className="status-health"><i className={`status-dot status-${mediaStatus}`} />{mediaStatus === "probing" ? "Analyzing source" : mediaStatus === "unsupported" ? "Source prep required" : descriptor === null ? "Waiting for source" : `Source ready · frame ${currentFrame}`}</div>
      <div>{updateAvailable ? <button type="button" onClick={onInstallUpdate}>{updateStatus.state === "available" ? `Update ${updateStatus.version} available` : "Installing update…"}</button> : "MediaBunny 1.50.8"}</div>
    </footer>
  );
}
