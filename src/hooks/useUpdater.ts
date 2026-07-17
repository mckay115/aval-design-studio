import { useCallback, useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";

import { isTauriRuntime } from "../lib/desktop";

export type UpdateStatus =
  | { readonly state: "idle" | "checking" | "current" }
  | { readonly state: "available"; readonly version: string }
  | { readonly state: "installing"; readonly version: string; readonly percent: number | null }
  | { readonly state: "error" };

export function useUpdater(enabled: boolean): Readonly<{
  status: UpdateStatus;
  checkNow: () => Promise<void>;
  install: () => Promise<void>;
}> {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  const [available, setAvailable] = useState<Update | null>(null);

  const checkNow = useCallback(async (): Promise<void> => {
    if (!enabled || !isTauriRuntime()) return;
    setStatus({ state: "checking" });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      setAvailable(update);
      setStatus(update === null
        ? { state: "current" }
        : { state: "available", version: update.version });
    } catch {
      // Development builds intentionally omit a signed updater endpoint.
      setStatus({ state: "error" });
    }
  }, [enabled]);

  const install = useCallback(async (): Promise<void> => {
    if (available === null) return;
    let downloaded = 0;
    let total: number | null = null;
    setStatus({ state: "installing", version: available.version, percent: null });
    try {
      await available.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? null;
        if (event.event === "Progress") downloaded += event.data.chunkLength;
        setStatus({
          state: "installing",
          version: available.version,
          percent: total === null || total === 0
            ? null
            : Math.min(100, Math.round((downloaded / total) * 100))
        });
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      setStatus({ state: "error" });
    }
  }, [available]);

  useEffect(() => {
    if (!enabled || !isTauriRuntime()) return;
    const timeout = window.setTimeout(() => void checkNow(), 2_500);
    return () => window.clearTimeout(timeout);
  }, [checkNow, enabled]);

  return { status, checkNow, install };
}
