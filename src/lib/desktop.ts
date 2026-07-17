import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type { StudioProjectV3 } from "../model/studio";

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

export interface OpenedStudioProject {
  readonly document: unknown;
  readonly path: string | null;
  readonly sourcePaths: readonly (string | null)[];
  readonly missingSourcePaths: readonly string[];
}

export const ACCEPTED_VIDEO_EXTENSIONS = [
  "mp4",
  "m4v",
  "mov",
  "webm",
  "mkv",
  "ogv",
  "ogg",
  "ts",
  "mts",
  "m2ts",
  "3gp",
  "3g2"
] as const;

const ACCEPTED_VIDEO_EXTENSION_SET = new Set<string>(ACCEPTED_VIDEO_EXTENSIONS);
const ACCEPTED_VIDEO_ACCEPT = ACCEPTED_VIDEO_EXTENSIONS.map((extension) => `.${extension}`).join(",");

export function isAcceptedVideoFileName(name: string): boolean {
  const extension = name.split(".").at(-1)?.toLowerCase();
  return extension !== undefined && extension !== name.toLowerCase() && ACCEPTED_VIDEO_EXTENSION_SET.has(extension);
}

function unsupportedVideoMessage(name: string): string {
  return `${name} is not a supported video file. Choose MP4, M4V, MOV, WebM, MKV, OGV, MPEG-TS, MTS, M2TS, 3GP, or 3G2.`;
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;
}

function fileName(path: string): string {
  return path.split(/[\\/]/u).at(-1) || "Untitled video";
}

export function isStudioProjectFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".avalstudio") || lower.endsWith(".avalstudio.json");
}

export function pickedVideoFromPath(path: string, preferredName?: string): PickedVideo {
  return {
    name: preferredName?.trim() || fileName(path),
    path,
    url: convertFileSrc(path),
    file: null,
    revokeUrl: null
  };
}

async function pickBrowserVideo(): Promise<PickedVideo | null> {
  return await new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPTED_VIDEO_ACCEPT;
    input.hidden = true;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.remove();
      if (file === undefined) {
        resolve(null);
        return;
      }
      if (!isAcceptedVideoFileName(file.name)) {
        reject(new Error(unsupportedVideoMessage(file.name)));
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
    title: "Open video",
    filters: [{
      name: "Supported video",
      extensions: [...ACCEPTED_VIDEO_EXTENSIONS]
    }]
  });
  if (selected === null || Array.isArray(selected)) return null;
  if (!isAcceptedVideoFileName(selected)) throw new Error(unsupportedVideoMessage(fileName(selected)));
  return {
    name: fileName(selected),
    path: selected,
    url: convertFileSrc(selected),
    file: null,
    revokeUrl: null
  };
}

async function openBrowserStudioProject(): Promise<OpenedStudioProject | null> {
  return await new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".avalstudio,.json,application/json";
    input.hidden = true;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.remove();
      if (file === undefined) {
        resolve(null);
        return;
      }
      if (!isStudioProjectFileName(file.name)) {
        reject(new Error(`${file.name} is not an AVAL Studio project. Choose an .avalstudio file.`));
        return;
      }
      void file.text().then((contents) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(contents) as unknown;
        } catch {
          throw new Error(`${file.name} does not contain valid Studio JSON.`);
        }
        resolve({ document: parsed, path: null, sourcePaths: [], missingSourcePaths: [] });
      }).catch(reject);
    }, { once: true });
    input.addEventListener("cancel", () => {
      input.remove();
      resolve(null);
    }, { once: true });
    document.body.append(input);
    input.click();
  });
}

export async function openStudioProject(): Promise<OpenedStudioProject | null> {
  if (!isTauriRuntime()) return await openBrowserStudioProject();
  return await invoke<OpenedStudioProject | null>("open_studio_project");
}

export async function readBuildInfo(): Promise<BuildInfo> {
  if (!isTauriRuntime()) {
    return {
      version: "development",
      repository: "https://github.com/mckay115/aval-design-studio",
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

function projectFileName(document: StudioProjectV3): string {
  const safe = document.name
    .trim()
    .replace(/[^a-z0-9._-]+/giu, "-")
    .replace(/^-+|-+$/gu, "") || "motion";
  return `${safe}.avalstudio`;
}

export async function saveStudioProject(
  document: StudioProjectV3
): Promise<string | null> {
  const contents = `${JSON.stringify(document, null, 2)}\n`;
  const name = projectFileName(document);
  if (isTauriRuntime()) {
    return await invoke<string | null>("save_studio_project", {
      document,
      suggestedName: name
    });
  }

  const blob = new Blob([contents], { type: "application/vnd.aval-studio+json" });
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
