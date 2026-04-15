// ─── useFullscreen — Tauri v2 desktop window fullscreen toggle ───────────────
// Root cause of original failure: `core:window:allow-set-fullscreen` was not
// in capabilities/default.json (only allow-is-fullscreen is in core:window:default).
// Fixed by adding the permission explicitly.
//
// API: @tauri-apps/api/window getCurrentWindow() — stable top-level import,
// no dynamic import needed in Tauri v2 because the module ships in the bundle.

import { useEffect, useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Detect Tauri runtime (not available in plain browser preview)
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync initial state from the window
  useEffect(() => {
    if (!isTauri()) return;
    getCurrentWindow()
      .isFullscreen()
      .then(setIsFullscreen)
      .catch(() => {});
  }, []);

  // Keep local state in sync if fullscreen changes from outside (e.g. OS-level)
  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    win
      .listen("tauri://resize", async () => {
        try {
          const fs = await win.isFullscreen();
          setIsFullscreen(fs);
        } catch {}
      })
      .then((fn) => { unlisten = fn; })
      .catch(() => {});
    return () => { unlisten?.(); };
  }, []);

  const toggle = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const win = getCurrentWindow();
      const current = await win.isFullscreen();
      await win.setFullscreen(!current);
      setIsFullscreen(!current);
    } catch (err) {
      console.warn("[useFullscreen] toggle failed:", err);
    }
  }, []);

  // F11 key — attached on the document so it fires even when no interactive
  // element is focused (Tauri webview receives all keydown events)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggle]);

  return { isFullscreen, toggle };
}
