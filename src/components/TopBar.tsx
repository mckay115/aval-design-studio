import { useCallback, useEffect, useRef, useState } from "react";

import { CubeIcon, FolderIcon, SaveIcon } from "./Icons";

interface TopBarProps {
  readonly projectName: string | null;
  readonly sourceReady: boolean;
  readonly saved: boolean;
  readonly onImport: () => void;
  readonly onRename: (name: string) => void;
  readonly onSave: () => void;
  readonly onBuild: () => void;
}

export function TopBar({
  projectName,
  sourceReady,
  saved,
  onImport,
  onRename,
  onSave,
  onBuild
}: TopBarProps) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const currentName = projectName ?? "Untitled project";

  useEffect(() => {
    if (!renaming) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [renaming]);

  const openRename = useCallback((): void => {
    if (!sourceReady) return;
    setDraftName(projectName ?? "");
    setRenaming(true);
  }, [projectName, sourceReady]);

  const cancelRename = useCallback((): void => {
    setDraftName(projectName ?? "");
    setRenaming(false);
  }, [projectName]);

  const commitRename = useCallback((): void => {
    const name = draftName.trim();
    if (name.length > 0 && name !== projectName) onRename(name);
    setRenaming(false);
  }, [draftName, onRename, projectName]);

  return (
    <header className="top-bar">
      <div className="traffic-lights" aria-hidden="true"><i /><i /><i /></div>
      <div className="wordmark" aria-label="AVAL Design Studio">AVAL</div>
      <span className="toolbar-divider" aria-hidden="true" />
      <div
        className="project-title-control"
        onBlurCapture={(event) => {
          if (renaming && !event.currentTarget.contains(event.relatedTarget)) commitRename();
        }}
      >
        <button
          className="project-menu"
          type="button"
          disabled={!sourceReady}
          aria-haspopup="dialog"
          aria-expanded={renaming}
          aria-controls={renaming ? "project-name-popover" : undefined}
          onClick={renaming ? cancelRename : openRename}
        >
          <span className="project-menu-name">{currentName}</span>
          <span className={`project-menu-chevron${renaming ? " is-open" : ""}`} aria-hidden="true">⌄</span>
        </button>
        {renaming ? (
          <div id="project-name-popover" className="project-name-popover" role="dialog" aria-label="Rename project">
            <label htmlFor="project-name-input">Project name</label>
            <input
              id="project-name-input"
              ref={inputRef}
              value={draftName}
              maxLength={120}
              autoComplete="off"
              onChange={(event) => setDraftName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitRename();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelRename();
                }
              }}
            />
            <div className="project-name-actions">
              <button type="button" onClick={cancelRename}>Cancel</button>
              <button type="button" disabled={draftName.trim().length === 0} onClick={commitRename}>Rename</button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="save-indicator" aria-live="polite">
        <i className={saved ? "is-saved" : "is-dirty"} aria-hidden="true" />
        {sourceReady ? (saved ? "Saved" : "Unsaved changes") : "Ready to import"}
      </div>
      <div className="top-actions">
        <button className="button button-secondary" type="button" onClick={onImport}>
          <FolderIcon /> Import Video
        </button>
        <button className="button button-secondary" type="button" disabled={!sourceReady} onClick={onSave}>
          <SaveIcon /> Save
        </button>
        <button className="button button-primary" type="button" disabled={!sourceReady} onClick={onBuild}>
          <CubeIcon /> Build Bundle
        </button>
      </div>
    </header>
  );
}
