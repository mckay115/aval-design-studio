import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type { StudioProjectV2 } from "../model/studio";

export interface PickedVideo {
  readonly name: string;
  readonly path: string | null;
  readonly url: string;
  readonly file: File | null;
  readonly revokeUrl: (() => void) | null;
}

export interface BuildInfo {
  readonly version: string;
  readonly repository: string;
  readonly packagedToolchain: boolean;
  readonly updatesEnabled: boolean;
  readonly toolchain?: ToolchainHealth;
}

export interface ToolchainHealth {
  readonly available: boolean;
  readonly version: string | null;
  readonly ffmpeg: boolean;
  readonly ffprobe: boolean;
  readonly encoders: readonly string[];
  readonly message: string;
}

export interface CompileResult {
  readonly outputPath: string;
  readonly reportPath: string | null;
  readonly assets: readonly { readonly name: string; readonly size: number; readonly sha256?: string }[];
  readonly sourceMarkup: string | null;
  readonly warnings: readonly string[];
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;
}

function fileName(path: string): string {
  return path.split(/[\\/]/u).at(-1) || "Untitled video";
}

async function pickBrowserVideo(): Promise<PickedVideo | null> {
  return await new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.hidden = true;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.remove();
      if (file === undefined) {
        resolve(null);
        return;
      }
      const url = URL.createObjectURL(file);
      resolve({
        name: file.name,
        path: null,
        url,
        file,
        revokeUrl: () => URL.revokeObjectURL(url)
      });
    }, { once: true });
    input.addEventListener("cancel", () => {
      input.remove();
      resolve(null);
    }, { once: true });
    document.body.append(input);
    input.click();
  });
}

export async function pickVideo(): Promise<PickedVideo | null> {
  if (!isTauriRuntime()) return await pickBrowserVideo();

  const selected = await open({
    multiple: false,
    directory: false,
    title: "Open video"
  });
  if (selected === null || Array.isArray(selected)) return null;
  return {
    name: fileName(selected),
    path: selected,
    url: convertFileSrc(selected),
    file: null,
    revokeUrl: null
  };
}

export async function readBuildInfo(): Promise<BuildInfo> {
  if (!isTauriRuntime()) {
    return {
      version: "development",
      repository: "https://github.com/zlisko/aval-design-studio",
      packagedToolchain: false,
      updatesEnabled: false,
      toolchain: {
        available: false,
        version: null,
        ffmpeg: false,
        ffprobe: false,
        encoders: [],
        message: "Bundle compilation requires the packaged desktop toolchain."
      }
    };
  }
  return await invoke<BuildInfo>("build_info");
}

function projectFileName(document: StudioProjectV2): string {
  const safe = document.name
    .trim()
    .replace(/[^a-z0-9._-]+/giu, "-")
    .replace(/^-+|-+$/gu, "") || "motion";
  return `${safe}.avalstudio.json`;
}

export async function saveStudioProject(
  document: StudioProjectV2
): Promise<string | null> {
  const contents = `${JSON.stringify(document, null, 2)}\n`;
  const name = projectFileName(document);
  if (isTauriRuntime()) {
    return await invoke<string | null>("save_studio_project", {
      document,
      suggestedName: name
    });
  }

  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = documentElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return name;
}

export async function chooseBundleDestination(projectName: string): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const selected = await open({
    directory: true,
    multiple: false,
    title: `Choose destination for ${projectName}`
  });
  return typeof selected === "string" ? selected : null;
}

export async function toolchainHealth(): Promise<ToolchainHealth> {
  if (!isTauriRuntime()) {
    return {
      available: false,
      version: null,
      ffmpeg: false,
      ffprobe: false,
      encoders: [],
      message: "Build Bundle is available in a packaged desktop build."
    };
  }
  return await invoke<ToolchainHealth>("toolchain_health");
}

export async function compileAvalBundle(
  project: unknown,
  destination: string,
  force = false,
  matte: string | null = null
): Promise<CompileResult> {
  if (!isTauriRuntime()) {
    throw new Error("Bundle compilation requires the desktop app.");
  }
  return await invoke<CompileResult>("compile_bundle", { project, destination, force, matte });
}

function documentElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K
): HTMLElementTagNameMap[K] {
  return window.document.createElement(tagName);
}
